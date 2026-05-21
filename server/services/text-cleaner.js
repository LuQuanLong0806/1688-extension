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

// ========== 生成 Mask（白色=需修复区域）==========
async function generateMask(imageWidth, imageHeight, regions, options) {
  options = options || {};
  var dilatePx = options.dilatePx || 20;

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

  // Step 2: SVG → grayscale PNG（纯二值 mask，不模糊）
  var maskPng = await sharp(Buffer.from(svg))
    .resize(imageWidth, imageHeight)
    .grayscale()
    .png()
    .toBuffer();

  return maskPng;
}

// ========== 完整清理流水线 ==========
async function cleanImage(imageBuffer, options) {
  options = options || {};
  var chineseOnly = options.chineseOnly !== false;
  var minConfidence = options.minConfidence || 0.5;
  var dilatePx = options.dilatePx || 20;

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
      message: 'LaMa model not available, detection only'
    };
  }

  // Step 4: 生成 mask（优化版：polygon精确绘制 + 膨胀 + 边缘模糊）
  var maskBuffer = await generateMask(imgW, imgH, regions, {
    dilatePx: dilatePx
  });

  // Step 5: LaMa inpaint
  var resultBuffer = await lamaService.inpaint(imageBuffer, maskBuffer);

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
  generateMask: generateMask,
  cleanImage: cleanImage,
  saveCleanedImage: saveCleanedImage
};
