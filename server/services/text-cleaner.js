/**
 * 文字清理服务 — 检测图片中的中文文字并自动消除
 * 
 * 流水线: PaddleOCR检测中文区域 → sharp生成mask → LaMa inpaint修复
 * 依赖: ocr_service.py (端口3001), lama.onnx
 */

const http = require('http');
const https = require('https');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const lamaService = require('./inpaint');
var comfyuiService = null;

function doInpaint(imageBuffer, maskBuffer) {
  // LaMa 优先（本地、无延迟），ComfyUI 备用
  try {
    if (lamaService.isModelAvailable()) return lamaService.inpaint(imageBuffer, maskBuffer);
  } catch (e) {}
  try {
    if (!comfyuiService) comfyuiService = require('./comfyui-inpaint');
    if (comfyuiService.isAvailable()) return comfyuiService.inpaint(imageBuffer, maskBuffer);
  } catch (e) {}
  return lamaService.inpaint(imageBuffer, maskBuffer);
}

function isInpaintAvailable() {
  return lamaService.isModelAvailable() || (comfyuiService && comfyuiService.isAvailable());
}

const OCR_SERVICE_URL = 'http://127.0.0.1:3001';

// ========== 调用 OCR 服务 ==========
function callOcrService(imageBase64, chineseOnly, minConfidence) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify({
      image_base64: imageBase64,
      chinese_only: chineseOnly !== false,
      min_confidence: minConfidence || 0.5,
      expand_px: 8
    });

    var options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: chineseOnly !== false ? '/detect-chinese' : '/detect',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };

    var req = http.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          var json = JSON.parse(Buffer.concat(chunks).toString());
          resolve(json);
        } catch (e) {
          reject(new Error('OCR response parse failed: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy();
      reject(new Error('OCR service timeout'));
    });
    req.write(postData);
    req.end();
  });
}

// ========== 检查 OCR 服务状态 ==========
function checkOcrHealth() {
  return new Promise(function (resolve) {
    var req = http.get(OCR_SERVICE_URL + '/health', function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          resolve({ status: 'error', error: e.message });
        }
      });
    });
    req.on('error', function () {
      resolve({ status: 'offline', error: 'OCR service not running' });
    });
    req.setTimeout(3000, function () {
      req.destroy();
      resolve({ status: 'offline', error: 'OCR service timeout' });
    });
  });
}

// ========== 从URL下载图片为Buffer ==========
function downloadImage(url) {
  return new Promise(function (resolve, reject) {
    var proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

// ========== 多边形膨胀：每个顶点沿质心方向外扩 ==========
function expandPolygon(polygon, dilatePx) {
  if (!polygon || polygon.length < 3 || dilatePx <= 0) return polygon;
  var cx = 0, cy = 0;
  for (var i = 0; i < polygon.length; i++) { cx += polygon[i][0]; cy += polygon[i][1]; }
  cx /= polygon.length;
  cy /= polygon.length;
  return polygon.map(function (p) {
    var dx = p[0] - cx;
    var dy = p[1] - cy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return p;
    var scale = (dist + dilatePx) / dist;
    return [Math.round(cx + dx * scale), Math.round(cy + dy * scale)];
  });
}

// ========== 徽章检测（Badge Detection）==========
// 处理"文字印在纯色背景块"场景（如"包邮""特价"标签），将mask扩展覆盖整个背景块

var BADGE_SCAN_MAX_PX = 80;      // 最大向外扫描像素
var BADGE_MAX_AREA_RATIO = 0.25;  // 徽章最大占图面积比
var BADGE_COLOR_THRESHOLD = 50;  // 颜色相似判定阈值
var BADGE_VOTE_RATIO = 0.55;     // 列/行匹配像素最小占比
var BADGE_MAX_CONSEC_FAIL = 3;   // 连续不匹配容忍列/行数

function colorDistance(c1, c2) {
  var dr = c1[0] - c2[0], dg = c1[1] - c2[1], db = c1[2] - c2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function getRegionBBox(region) {
  if (region.polygon && region.polygon.length >= 3) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < region.polygon.length; i++) {
      var px = region.polygon[i][0], py = region.polygon[i][1];
      if (px < minX) minX = px; if (py < minY) minY = py;
      if (px > maxX) maxX = px; if (py > maxY) maxY = py;
    }
    return { x: Math.round(minX), y: Math.round(minY), w: Math.round(maxX - minX), h: Math.round(maxY - minY) };
  }
  return { x: Math.round(region.x || 0), y: Math.round(region.y || 0), w: Math.round(region.width || 0), h: Math.round(region.height || 0) };
}

function _getPixel(raw, W, x, y) {
  var idx = (y * W + x) * 3;
  return [raw[idx], raw[idx + 1], raw[idx + 2]];
}

function _getDominantColor(pixels, maxVariance) {
  if (!pixels || pixels.length < 4) return null;
  var r = 0, g = 0, b = 0;
  for (var i = 0; i < pixels.length; i++) { r += pixels[i][0]; g += pixels[i][1]; b += pixels[i][2]; }
  var n = pixels.length;
  var avg = [r / n, g / n, b / n];
  var totalDist = 0;
  for (var i = 0; i < n; i++) totalDist += colorDistance(pixels[i], avg);
  if (totalDist / n > (maxVariance || 35)) return null;
  return { color: avg, variance: totalDist / n };
}

function _scanOutward(raw, W, H, startPos, rangeMin, rangeMax, bgColor, direction, opts) {
  opts = opts || {};
  var threshold = opts.threshold || BADGE_COLOR_THRESHOLD;
  var maxPx = opts.maxPx || BADGE_SCAN_MAX_PX;
  var voteRatio = opts.voteRatio || BADGE_VOTE_RATIO;
  var maxFail = opts.maxFail || BADGE_MAX_CONSEC_FAIL;
  var step = opts.step || 3;
  var range = rangeMax - rangeMin;
  if (range <= 0) return startPos;
  var requiredVotes = Math.ceil(Math.ceil(range / step) * voteRatio);
  var furthest = startPos;
  var consecutiveFail = 0;

  var isNeg = (direction === 'left' || direction === 'up');
  var posLimit = isNeg ? Math.max(0, startPos - maxPx) : Math.min(direction === 'right' ? W : H, startPos + maxPx);

  for (var pos = startPos; isNeg ? pos >= posLimit : pos < posLimit; pos += isNeg ? -1 : 1) {
    var votes = 0;
    for (var s = rangeMin; s <= rangeMax; s += step) {
      var px = (direction === 'left' || direction === 'right')
        ? _getPixel(raw, W, pos, s)
        : _getPixel(raw, W, s, pos);
      if (colorDistance(px, bgColor) <= threshold) votes++;
    }
    if (votes >= requiredVotes) {
      furthest = pos;
      consecutiveFail = 0;
    } else {
      consecutiveFail++;
      if (consecutiveFail >= maxFail) break;
    }
  }
  return furthest;
}

function _sampleBadgeEdgePixels(raw, W, H, bbox) {
  var pad = Math.max(2, Math.round(Math.min(bbox.w, bbox.h) * 0.08));
  var pixels = [];
  for (var x = bbox.x; x <= bbox.x + bbox.w && x < W; x += 2) {
    if (bbox.y - pad >= 0) pixels.push(_getPixel(raw, W, x, bbox.y - pad));
    if (bbox.y + bbox.h + pad < H) pixels.push(_getPixel(raw, W, x, bbox.y + bbox.h + pad));
  }
  for (var y = bbox.y; y <= bbox.y + bbox.h && y < H; y += 2) {
    if (bbox.x - pad >= 0) pixels.push(_getPixel(raw, W, bbox.x - pad, y));
    if (bbox.x + bbox.w + pad < W) pixels.push(_getPixel(raw, W, bbox.x + bbox.w + pad, y));
  }
  return pixels;
}

function _badgeColorDiffersFromSurrounding(raw, W, H, bbox, bgColor) {
  var dist = BADGE_SCAN_MAX_PX + 15;
  var pts = [
    [bbox.x + bbox.w / 2, bbox.y - dist],
    [bbox.x + bbox.w / 2, bbox.y + bbox.h + dist],
    [bbox.x - dist, bbox.y + bbox.h / 2],
    [bbox.x + bbox.w + dist, bbox.y + bbox.h / 2]
  ];
  var samples = [];
  for (var i = 0; i < pts.length; i++) {
    var sx = Math.max(0, Math.min(W - 1, Math.round(pts[i][0])));
    var sy = Math.max(0, Math.min(H - 1, Math.round(pts[i][1])));
    samples.push(_getPixel(raw, W, sx, sy));
  }
  var surround = _getDominantColor(samples);
  if (!surround) return true;
  return colorDistance(bgColor, surround.color) >= BADGE_COLOR_THRESHOLD;
}

async function expandRegionsForBadges(imageBuffer, regions) {
  var meta = await sharp(imageBuffer).metadata();
  var W = meta.width, H = meta.height;
  var raw = await sharp(imageBuffer).removeAlpha().raw().toBuffer();
  var imgArea = W * H;
  var expanded = [];
  var badgeCount = 0;

  for (var ri = 0; ri < regions.length; ri++) {
    var region = regions[ri];
    var bbox = getRegionBBox(region);
    if (bbox.w < 8 || bbox.h < 8 || bbox.w * bbox.h > imgArea * 0.4) {
      expanded.push(region); continue;
    }
    var edgePixels = _sampleBadgeEdgePixels(raw, W, H, bbox);
    var dominant = _getDominantColor(edgePixels);
    if (!dominant) { expanded.push(region); continue; }
    if (!_badgeColorDiffersFromSurrounding(raw, W, H, bbox, dominant.color)) {
      expanded.push(region); continue;
    }
    var leftBound   = _scanOutward(raw, W, H, bbox.x,         bbox.y, bbox.y + bbox.h, dominant.color, 'left');
    var rightBound  = _scanOutward(raw, W, H, bbox.x + bbox.w, bbox.y, bbox.y + bbox.h, dominant.color, 'right');
    var topBound    = _scanOutward(raw, W, H, bbox.y,         bbox.x, bbox.x + bbox.w, dominant.color, 'up');
    var bottomBound = _scanOutward(raw, W, H, bbox.y + bbox.h, bbox.x, bbox.x + bbox.w, dominant.color, 'down');
    var newW = rightBound - leftBound + 1;
    var newH = bottomBound - topBound + 1;
    if ((newW - bbox.w) < 3 && (newH - bbox.h) < 3) {
      expanded.push(region); continue;
    }
    if (newW * newH > imgArea * BADGE_MAX_AREA_RATIO) {
      expanded.push(region); continue;
    }
    badgeCount++;
    expanded.push({ x: leftBound, y: topBound, width: newW, height: newH, _badgeExpanded: true });
  }
  console.log('[Badge] 检测到 ' + badgeCount + '/' + regions.length + ' 个徽章区域');
  return expanded;
}

// ========== 生成 Mask（白色=需修复区域）==========
async function generateMask(imageWidth, imageHeight, regions, options) {
  options = options || {};
  var dilatePx = options.dilatePx || 40;

  // Step 1: 绘制膨胀后的形状（直接外扩坐标）
  var shapes = '';
  for (var i = 0; i < regions.length; i++) {
    var r = regions[i];
    if (r.polygon && r.polygon.length >= 3) {
      var expanded = expandPolygon(r.polygon, dilatePx);
      var points = expanded.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
      shapes += '<polygon points="' + points + '" fill="white" />';
    } else {
      var ex = Math.max(0, (r.x || 0) - dilatePx);
      var ey = Math.max(0, (r.y || 0) - dilatePx);
      var ew = (r.width || 0) + dilatePx * 2;
      var eh = (r.height || 0) + dilatePx * 2;
      shapes += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" fill="white" />';
    }
  }

  var svg = '<svg width="' + imageWidth + '" height="' + imageHeight + '">' +
    '<rect width="100%" height="100%" fill="black"/>' +
    shapes +
    '</svg>';

  // Step 2: SVG → grayscale PNG → 边缘羽化（轻微模糊消除硬边）
  var maskPng = await sharp(Buffer.from(svg))
    .resize(imageWidth, imageHeight)
    .grayscale()
    .blur(2)
    .png()
    .toBuffer();

  return maskPng;
}

// ========== 完整清理流水线 ==========
async function cleanImage(imageBuffer, options) {
  options = options || {};
  var chineseOnly = options.chineseOnly !== false;
  var minConfidence = options.minConfidence || 0.5;
  var dilatePx = options.dilatePx || 40;

  // Step 1: 转base64
  var base64Data = imageBuffer.toString('base64');

  // Step 2: OCR 检测
  var detectResult = await callOcrService(base64Data, chineseOnly, minConfidence);

  if (!detectResult.ok || !detectResult.regions || detectResult.regions.length === 0) {
    return {
      ok: true,
      cleaned: false,
      regions: [],
      message: detectResult.regions && detectResult.regions.length === 0
        ? 'No text detected'
        : 'Detection completed'
    };
  }

  var regions = detectResult.regions;
  var imgW = detectResult.image_width;
  var imgH = detectResult.image_height;

  // Step 2.5: 徽章扩展（检测文字在纯色背景块上的场景）
  if (options.detectBadges !== false) {
    try {
      regions = await expandRegionsForBadges(imageBuffer, regions);
    } catch (e) {
      console.warn('[Badge] 扩展失败，使用原始区域:', e.message);
    }
  }

  // Step 3: 检查 LaMa 模型可用性
  var lamaAvailable = false;
  try {
    lamaAvailable = lamaService.isModelAvailable();
  } catch (e) {
    lamaAvailable = false;
  }

  if (!lamaAvailable) {
    // LaMa 模型不可用，返回检测结果和mask（不修复）
    var maskBuf = await generateMask(imgW, imgH, regions);
    return {
      ok: true,
      cleaned: false,
      detected: true,
      regions: regions,
      regionCount: regions.length,
      maskBase64: maskBuf.toString('base64'),
      message: 'Inpaint model not available, detection only'
    };
  }

  // Step 4: 生成 mask（优化版：polygon精确绘制 + 膨胀 + 边缘模糊）
  var maskBuffer = await generateMask(imgW, imgH, regions, {
    dilatePx: dilatePx
  });

  // Step 5: Inpaint（LaMa 优先，ComfyUI 备用）
  var resultBuffer = await doInpaint(imageBuffer, maskBuffer);

  return {
    ok: true,
    cleaned: true,
    regions: regions,
    regionCount: regions.length,
    imageBuffer: resultBuffer,
    imageWidth: imgW,
    imageHeight: imgH
  };
}

// ========== 保存清理后的图片 ==========
function saveCleanedImage(imageBuffer) {
  var UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  var filename = 'cleaned_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
  var filepath = path.join(UPLOADS_DIR, filename);

  return new Promise(function (resolve, reject) {
    fs.writeFile(filepath, imageBuffer, function (err) {
      if (err) return reject(err);
      resolve('/uploads/' + filename);
    });
  });
}

module.exports = {
  callOcrService: callOcrService,
  checkOcrHealth: checkOcrHealth,
  downloadImage: downloadImage,
  colorDistance: colorDistance,
  getRegionBBox: getRegionBBox,
  _getPixel: _getPixel,
  _getDominantColor: _getDominantColor,
  _scanOutward: _scanOutward,
  _sampleBadgeEdgePixels: _sampleBadgeEdgePixels,
  _badgeColorDiffersFromSurrounding: _badgeColorDiffersFromSurrounding,
  expandRegionsForBadges: expandRegionsForBadges,
  generateMask: generateMask,
  cleanImage: cleanImage,
  saveCleanedImage: saveCleanedImage
};
