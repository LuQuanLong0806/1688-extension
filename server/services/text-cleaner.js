/**
 * 文字清理服务 — 检测图片中的中文文字并自动消除
 *
 * 流水线: PaddleOCR检测 → 视觉模型精确定位(可选) → sharp生成mask → LaMa inpaint修复
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

// ========== 视觉模型精确定位（替代简单膨胀） ==========
// 视觉区域比例外扩：确保完全覆盖徽章/标签边缘
function expandVisionRegions(regions, imgW, imgH, ratio) {
  if (!regions || !regions.length) return regions;
  var r = ratio || 0.15;
  return regions.map(function (reg) {
    var padX = Math.round(Math.max(reg.width * r, 5));
    var padY = Math.round(Math.max(reg.height * r, 5));
    return {
      x: Math.max(0, reg.x - padX),
      y: Math.max(0, reg.y - padY),
      width: Math.min(imgW - Math.max(0, reg.x - padX), reg.width + padX * 2),
      height: Math.min(imgH - Math.max(0, reg.y - padY), reg.height + padY * 2)
    };
  });
}

// ========== 第二遍：视觉模型检测残留徽章/色块 ==========
// 在文字去除后调用，检测残留的纯色背景块（如"包邮""特价"标签底色）
async function detectBadgesWithVision(imageBuffer, imgW, imgH, textRegions) {
  var providers;
  try { providers = require('../routes/ai/providers'); } catch (e) { return null; }

  var prompt = '任务：这张电商商品主图（尺寸' + imgW + 'x' + imgH + '）已经过文字去除处理，但可能残留一些空白的营销标签底色块。' +
    '\n请找出所有残留的营销标签/徽章/色块区域。' +
    '\n\n目标特征（满足任一即框选）：' +
    '\n- 纯色或渐变色块：看起来像被涂抹过的矩形/圆角矩形区域，和周围背景不协调。' +
    '\n- 营销标签底色：曾经印有"包邮""特价""新品"等文字的纯色背景块。' +
    '\n- 气泡形状：类似聊天气泡、对话框的圆角形状，带有小三角尾巴的色块。' +
    '\n- 品牌角标/水印底色：角落或边缘的半透明/不透明色块。' +
    '\n\n排除规则（绝对不能框选）：' +
    '\n- 商品本身的包装、标签、说明书上的内容。' +
    '\n- 商品的自然纹理、反光、阴影。' +
    '\n- 看起来和商品融为一体的区域。' +
    '\n- 如果不确定，宁可漏选也不要误选。' +
    '\n\n输出要求：' +
    '\n- 用矩形框完整覆盖整个色块。' +
    '\n- 如果图片没有残留色块，返回空数组[]。' +
    '\n只输出JSON数组，不要输出其他文字说明: [{"x":左上角x,"y":左上角y,"width":宽,"height":高}]';

  // 压缩图片
  var fullBase64;
  try {
    var maxDim = 800;
    var meta = await sharp(imageBuffer).metadata();
    if (meta.width > maxDim || meta.height > maxDim) {
      var resized = await sharp(imageBuffer).resize(maxDim, maxDim, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
      fullBase64 = 'data:image/jpeg;base64,' + resized.toString('base64');
    } else {
      fullBase64 = 'data:image/png;base64,' + imageBuffer.toString('base64');
    }
  } catch (e) {
    fullBase64 = 'data:image/png;base64,' + imageBuffer.toString('base64');
  }

  try {
    var result = await providers.visionLLMRequest('/chat/completions', {
      _vlImageContent: fullBase64,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 512
    });

    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return null;

    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var regions = JSON.parse(jsonStr);
    if (!Array.isArray(regions) || regions.length === 0) return null;

    // 过滤：排除和文字区域重叠太多的（已经被处理过的）以及面积太大的
    var imgArea = imgW * imgH;
    var valid = regions.filter(function (r) {
      if (typeof r.x !== 'number' || typeof r.y !== 'number' ||
          typeof r.width !== 'number' || typeof r.height !== 'number') return false;
      var area = r.width * r.height;
      if (area > imgArea * 0.15) return false; // 太大，可能误判
      // 检查是否和已处理的文字区域高度重叠
      var overlapCount = 0;
      for (var i = 0; i < textRegions.length; i++) {
        var tr = getRegionBBox(textRegions[i]);
        var ox = Math.max(r.x, tr.x);
        var oy = Math.max(r.y, tr.y);
        var ow = Math.min(r.x + r.width, tr.x + tr.w) - ox;
        var oh = Math.min(r.y + r.height, tr.y + tr.h) - oy;
        if (ow > 0 && oh > 0 && (ow * oh) / area > 0.7) {
          overlapCount++;
        }
      }
      // 如果和超过一半的文字区域高度重叠，说明已经处理过了
      if (textRegions.length > 0 && overlapCount > textRegions.length * 0.5) return false;
      return true;
    }).map(function (r) {
      return {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width),
        height: Math.round(r.height),
        _badgeVision: true
      };
    });

    if (valid.length === 0) return null;
    console.log('[徽章视觉] 检测到 ' + valid.length + ' 个残留徽章区域');
    return valid;
  } catch (e) {
    console.warn('[徽章视觉] 检测失败:', e.message);
    return null;
  }
}

// ========== 视觉模型兜底检测淡色水印（OCR 未检出时调用） ==========
async function detectFaintWatermarkWithVision(base64Data, imgW, imgH) {
  var providers;
  try { providers = require('../routes/ai/providers'); } catch (e) { return null; }

  var prompt = '任务：在这张电商商品主图（尺寸' + imgW + 'x' + imgH + '）中，找出所有非商品本身自带的后期叠加元素并框选。' +
    'OCR未检测到明显文字，请仔细观察图片中是否有低对比度的叠加元素。' +
    '\n\n定义规则：' +
    '\n1. 商品本身自带的部分绝对不能框选。' +
    '\n2. 所有后期添加的营销元素，无论有没有文字，都必须框选：' +
    '\n   - 淡淡的半透明水印、浅色叠加文字。' +
    '\n   - 纯色/半透明色块：圆角矩形、方块、条带，即使上面没有文字。' +
    '\n   - 徽章/图标类元素：只剩纯色底/轮廓的营销徽章也必须框选。' +
    '\n   - 小icon图标、logo、低对比度品牌标识。' +
    '\n\n判断标准（满足任一即框选）：' +
    '\n- 元素边缘清晰、和商品结构无连接，像是贴上去的。' +
    '\n- 颜色均匀、和商品的纹理/材质明显不同。' +
    '\n- 带有明显的品牌、营销特征，和商品本身的功能无关。' +
    '\n\n输出要求：' +
    '\n- 用矩形框完整覆盖整个元素，包括色块边缘、圆角和所有延伸部分。' +
    '\n- 如果图片确实干净，返回空数组[]。' +
    '\n只输出JSON数组，不要输出其他文字说明: [{"x":左上角x,"y":左上角y,"width":宽,"height":高}]';

  // 压缩图片减少传输和推理时间
  var fullBase64 = base64Data;
  if (!fullBase64.startsWith('data:')) fullBase64 = 'data:image/png;base64,' + fullBase64;
  try {
    var rawBuf = Buffer.from(fullBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    var fMeta = await sharp(rawBuf).metadata();
    var maxDim = 800;
    if (fMeta.width > maxDim || fMeta.height > maxDim) {
      var resized = await sharp(rawBuf).resize(maxDim, maxDim, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
      fullBase64 = 'data:image/jpeg;base64,' + resized.toString('base64');
    }
  } catch (e) { /* 保持原图 */ }

  try {
    var result = await providers.visionLLMRequest('/chat/completions', {
      _vlImageContent: fullBase64,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024
    });

    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return null;
    console.log('[淡色水印检测] 模型返回 ' + text.length + ' 字符, tokens: ' + (result.totalTokens || '?'));

    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var regions = JSON.parse(jsonStr);
    if (!Array.isArray(regions) || regions.length === 0) return null;

    var valid = regions.filter(function (r) {
      return typeof r.x === 'number' && typeof r.y === 'number' &&
             typeof r.width === 'number' && typeof r.height === 'number' &&
             r.width > 0 && r.height > 0;
    }).map(function (r) {
      return {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    });

    if (valid.length === 0) return null;
    console.log('[淡色水印检测] 视觉模型检测到 ' + valid.length + ' 个区域（OCR未检出）');
    return valid;
  } catch (e) {
    console.warn('[淡色水印检测] 失败:', e.message);
    return null;
  }
}

// ========== 视觉模型精确定位（替代简单膨胀） ==========
async function detectRegionsWithVision(base64Data, imgW, imgH, ocrRegions) {
  var providers;
  try { providers = require('../routes/ai/providers'); } catch (e) {
    console.warn('[视觉定位] providers 加载失败:', e.message);
    return null;
  }

  var ocrDesc = ocrRegions.map(function (r, i) {
    var bbox = getRegionBBox(r);
    return '#' + (i + 1) + '(' + bbox.x + ',' + bbox.y + ',' + bbox.w + 'x' + bbox.h + ')';
  }).join(' ');

  var prompt = '任务：在这张电商商品主图（尺寸' + imgW + 'x' + imgH + '）中，找出所有非商品本身自带的后期叠加元素并框选。' +
    'OCR已检测到文字区域: ' + ocrDesc + '，这些文字位置可作为参考。' +
    '\n\n定义规则：' +
    '\n1. 商品本身自带的部分（如包装上的文字、结构件、纹理、材质）是商品的一部分，绝对不能框选。' +
    '\n2. 所有后期添加的营销元素，无论有没有文字，都必须框选：' +
    '\n   - 纯色/半透明色块：圆角矩形、方块、条带，即使上面没有文字，只要是后期叠加的营销/品牌标识底色，就属于目标。' +
    '\n   - 徽章/图标类元素：带有品牌logo、装饰性图形、营销标签的独立图形，即使文字被去除只剩纯色底/轮廓，也必须框选。' +
    '\n   - icon图标：卡车、火焰、皇冠、星星等装饰性小图标。' +
    '\n   - 水印、店铺logo、低对比度叠加文字、品牌标识。' +
    '\n\n判断标准（满足任一即框选）：' +
    '\n- 元素边缘清晰、和商品结构无连接，像是贴上去的。' +
    '\n- 颜色均匀、和商品的纹理/材质明显不同。' +
    '\n- 带有明显的品牌、营销特征，和商品本身的功能无关。' +
    '\n\n输出要求：' +
    '\n- 用矩形框完整覆盖整个元素，包括色块边缘、圆角和所有延伸部分，不要只框文字或中心图标。' +
    '\n- 文字+背景色块必须作为一个整体框选。' +
    '\n- 相邻的多个元素如果在同一个背景块上，合并为一个区域。' +
    '\n- 如果图片已经是干净的，返回空数组[]。' +
    '\n只输出JSON数组，不要输出其他文字说明: [{"x":左上角x,"y":左上角y,"width":宽,"height":高}]';

  // 压缩图片减少传输和推理时间
  var fullBase64 = base64Data;
  if (!fullBase64.startsWith('data:')) fullBase64 = 'data:image/png;base64,' + fullBase64;
  try {
    var rawBuf = Buffer.from(fullBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    var vMeta = await sharp(rawBuf).metadata();
    var maxDim = 800;
    if (vMeta.width > maxDim || vMeta.height > maxDim) {
      var resized = await sharp(rawBuf).resize(maxDim, maxDim, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
      fullBase64 = 'data:image/jpeg;base64,' + resized.toString('base64');
      console.log('[视觉定位] 图片压缩: ' + vMeta.width + 'x' + vMeta.height + ' → ' + maxDim + 'px以内');
    }
  } catch (e) { /* 保持原图 */ }

  try {
    var result = await providers.visionLLMRequest('/chat/completions', {
      _vlImageContent: fullBase64,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024
    });

    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return null;
    console.log('[视觉定位] 模型返回 ' + text.length + ' 字符, tokens: ' + (result.totalTokens || '?'));

    var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var regions = JSON.parse(jsonStr);
    if (!Array.isArray(regions) || regions.length === 0) return null;

    // 验证并规范化区域
    var valid = regions.filter(function (r) {
      return typeof r.x === 'number' && typeof r.y === 'number' &&
             typeof r.width === 'number' && typeof r.height === 'number' &&
             r.width > 0 && r.height > 0;
    }).map(function (r) {
      return {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.round(r.width),
        height: Math.round(r.height)
      };
    });

    if (valid.length === 0) return null;
    console.log('[视觉定位] 检测到 ' + valid.length + ' 个精确区域 (OCR: ' + ocrRegions.length + ')');
    return valid;
  } catch (e) {
    console.warn('[视觉定位] 失败，使用OCR区域:', e.message);
    return null;
  }
}

// ========== 完整清理流水线 ==========
async function cleanImage(imageBuffer, options) {
  options = options || {};
  var chineseOnly = options.chineseOnly !== false;
  var minConfidence = options.minConfidence || 0.5;
  var dilatePx = options.dilatePx || 40;
  var useVision = options.enableVision === true;
  var useBadgeVision = options.enableBadgeVision === true;

  // Step 1: 转base64
  var base64Data = imageBuffer.toString('base64');

  // Step 2: OCR 检测
  var detectResult = await callOcrService(base64Data, chineseOnly, minConfidence);

  // Step 2.5: OCR 未检出时，用对比度增强图重试（针对淡色水印）
  var enhancedBuf = null;
  var imgArea = 0;
  if (!detectResult.ok || !detectResult.regions || detectResult.regions.length === 0) {
    try {
      var meta = await sharp(imageBuffer).metadata();
      imgArea = meta.width * meta.height;
      // 多级增强：从轻到重，任何一级检出即停止
      var enhanceLevels = [
        { label: '轻度', linear: 1.8, offset: 0.8, sigma: 1.5, conf: 0.4 },
        { label: '中度', linear: 3.0, offset: 1.0, sigma: 2.0, conf: 0.3 },
        { label: '重度', linear: 5.0, offset: 1.2, sigma: 3.0, conf: 0.2 }
      ];
      for (var ei = 0; ei < enhanceLevels.length; ei++) {
        var lv = enhanceLevels[ei];
        enhancedBuf = await sharp(imageBuffer)
          .normalize()
          .linear(lv.linear, -(128 * lv.offset))
          .sharpen({ sigma: lv.sigma, m1: 2.0, m2: 0.5 })
          .toBuffer();
        var enhancedBase64 = enhancedBuf.toString('base64');
        var retryResult = await callOcrService(enhancedBase64, chineseOnly, Math.max(minConfidence - (0.5 - lv.conf), 0.15));
        if (retryResult.ok && retryResult.regions && retryResult.regions.length > 0) {
          var safeRegions = retryResult.regions.filter(function (r) {
            var bw = Math.abs((r[2] || r.x2 || 0) - (r[0] || r.x1 || 0));
            var bh = Math.abs((r[3] || r.y2 || 0) - (r[1] || r.y1 || 0));
            if (!bw || !bh) { bw = r.width || 1; bh = r.height || 1; }
            return (bw * bh) / imgArea < 0.05;
          });
          if (safeRegions.length > 0) {
            console.log('[文字清理] ' + lv.label + '增强检出 ' + retryResult.regions.length + ' 个区域，保留 ' + safeRegions.length + ' 个（面积<5%）');
            retryResult.regions = safeRegions;
            detectResult = retryResult;
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[文字清理] 增强预处理失败:', e.message);
    }
  }

  if (!detectResult.ok || !detectResult.regions || detectResult.regions.length === 0) {
    // chineseOnly 模式下 OCR 未检出 → 直接返回，不浪费视觉模型调用
    if (chineseOnly) {
      return {
        ok: true,
        cleaned: false,
        regions: [],
        ocrRegions: [],
        visionRegions: [],
        message: 'No chinese text detected'
      };
    }

    // OCR + 增强OCR 都未检出 → 视觉模型兜底检测淡色水印
    try {
      var meta = await sharp(imageBuffer).metadata();
      // 局部差异放大：原图减去模糊背景，水印叠加纹理会暴露
      var blurred = await sharp(imageBuffer).blur(15).toBuffer();
      var diffBuf = await sharp(imageBuffer)
        .composite([{ input: blurred, blend: 'difference' }])
        .linear(8, 0)
        .normalize()
        .toBuffer();
      var visionBase64 = diffBuf.toString('base64');
      var faintResult = await detectFaintWatermarkWithVision(visionBase64, meta.width, meta.height);
      if (faintResult && faintResult.length > 0) {
        console.log('[文字清理] 局部差异图+视觉模型检测到 ' + faintResult.length + ' 个淡色水印');
        var faintMask = await generateMask(meta.width, meta.height, faintResult, { dilatePx: 5 });
        var lamaOk = false;
        try { lamaOk = lamaService.isModelAvailable(); } catch (e) {}
        if (lamaOk) {
          var faintInpainted = await doInpaint(imageBuffer, faintMask);
          return {
            ok: true, cleaned: true,
            regions: faintResult, ocrRegions: [], visionRegions: faintResult,
            regionCount: faintResult.length,
            imageBuffer: faintInpainted, imageWidth: meta.width, imageHeight: meta.height
          };
        }
        return {
          ok: true, cleaned: false,
          regions: faintResult, ocrRegions: [], visionRegions: faintResult,
          message: 'Inpaint model not available, vision detection only'
        };
      }
    } catch (e) {
      console.warn('[文字清理] 视觉模型检测失败:', e.message);
    }
    return {
      ok: true,
      cleaned: false,
      regions: [],
      ocrRegions: [],
      visionRegions: [],
      message: detectResult.regions && detectResult.regions.length === 0
        ? 'No text detected'
        : 'Detection completed'
    };
  }

  var ocrRegions = detectResult.regions.slice();
  var regions = detectResult.regions;
  var imgW = detectResult.image_width;
  var imgH = detectResult.image_height;
  var visionRegions = [];

  // Step 2.5: OCR 为基础 + 视觉补充
  // 徽章扩展默认关闭（detectBadges 需显式开启）
  if (options.detectBadges === true) {
    try {
      regions = await expandRegionsForBadges(imageBuffer, regions);
    } catch (e) {
      console.warn('[Badge] 扩展失败，使用原始区域:', e.message);
    }
  }

  // 2. 视觉模型补充：找 OCR 没检出的非文字叠加元素（纯色块、icon、淡水印）
  if (useVision) {
    var visionResult = await detectRegionsWithVision(base64Data, imgW, imgH, ocrRegions);
    if (visionResult && visionResult.length > 0) {
      // 合并：只添加 OCR+徽章扩展 没覆盖到的视觉区域
      var added = 0;
      for (var vi = 0; vi < visionResult.length; vi++) {
        var vr = visionResult[vi];
        var vBox = { x: vr.x, y: vr.y, w: vr.width, h: vr.height };
        // 检查是否已被现有区域覆盖（中心点落在已有区域内则跳过）
        var covered = false;
        for (var ri = 0; ri < regions.length; ri++) {
          var rr = getRegionBBox(regions[ri]);
          var cx = vBox.x + vBox.w / 2, cy = vBox.y + vBox.h / 2;
          if (cx >= rr.x && cx <= rr.x + rr.w && cy >= rr.y && cy <= rr.y + rr.h) {
            // 视觉区域中心在已有区域内 → 用更大的那个
            if (vBox.w * vBox.h > rr.w * rr.h) {
              regions[ri] = { x: vBox.x, y: vBox.y, width: vBox.w, height: vBox.h, _visionExpanded: true };
            }
            covered = true;
            break;
          }
        }
        if (!covered) {
          regions.push(vr);
          added++;
        }
      }
      visionRegions = visionResult;
      console.log('[文字清理] OCR:' + ocrRegions.length + ' + 徽章扩展 → 视觉补充新增 ' + added + ' 个区域, 总计 ' + regions.length);
    } else {
      console.log('[文字清理] 视觉模型无额外结果，使用 OCR + 徽章扩展');
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
    var maskBuf = await generateMask(imgW, imgH, regions, { dilatePx: dilatePx });
    return {
      ok: true,
      cleaned: false,
      detected: true,
      regions: regions,
      ocrRegions: ocrRegions,
      visionRegions: visionRegions,
      regionCount: regions.length,
      maskBase64: maskBuf.toString('base64'),
      message: 'Inpaint model not available, detection only'
    };
  }

  // Step 4: 生成 mask
  var maskBuffer = await generateMask(imgW, imgH, regions, { dilatePx: dilatePx });

  // Step 5: Inpaint（去除文字）
  var resultBuffer = await doInpaint(imageBuffer, maskBuffer);

  // Step 6: 第二遍 — 视觉模型检测残留徽章/色块，再次 inpaint
  var badgeVisionRegions = [];
  console.log('[文字清理] useBadgeVision=' + useBadgeVision);
  if (useBadgeVision) {
    try {
      var badgeRegions = await detectBadgesWithVision(resultBuffer, imgW, imgH, regions);
      if (badgeRegions && badgeRegions.length > 0) {
        var badgeMask = await generateMask(imgW, imgH, badgeRegions, { dilatePx: 5 });
        resultBuffer = await doInpaint(resultBuffer, badgeMask);
        badgeVisionRegions = badgeRegions;
        console.log('[文字清理] 第二遍徽章去除: ' + badgeRegions.length + ' 个区域');
      } else {
        console.log('[文字清理] 视觉模型未检测到残留徽章');
      }
    } catch (e) {
      console.warn('[文字清理] 第二遍徽章检测失败:', e.message);
    }
  }

  return {
    ok: true,
    cleaned: true,
    regions: regions,
    ocrRegions: ocrRegions,
    visionRegions: visionRegions,
    badgeVisionRegions: badgeVisionRegions,
    regionCount: regions.length,
    imageBuffer: resultBuffer,
    imageWidth: imgW,
    imageHeight: imgH
  };
}

// ========== 上传到图床（走统一 ImgBB 服务） ==========
function uploadToSmms(imageBuffer) {
  var imgbb = require('./imgbb-upload');
  return imgbb.uploadToImgBB(imageBuffer);
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
  detectRegionsWithVision: detectRegionsWithVision,
  generateMask: generateMask,
  cleanImage: cleanImage,
  saveCleanedImage: saveCleanedImage,
  uploadToSmms: uploadToSmms
};
