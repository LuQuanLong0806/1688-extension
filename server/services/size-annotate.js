/**
 * 尺寸标注服务 — OCR提取尺寸 + 智能标注图生成
 * 
 * 功能:
 *   1. 通过 PaddleOCR 从图片中提取尺寸文字（如 "14cm", "5.5cm"）
 *   2. 根据 图片宽高比 + 尺寸数值 自动判断标注方向
 *   3. 生成专业标注图（SVG标注线 + 尺寸文字）
 */

const sharp = require('sharp');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const OCR_SERVICE_URL = 'http://127.0.0.1:3001';

// ========== 从OCR结果中提取尺寸 ==========
// 匹配模式: "14cm", "14×5.5cm", "14x5.5 cm", "14*5.5", "14 x 5.5cm" 等
var SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*[x×X*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|cm|CM|MM)?/g;
var SINGLE_SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(cm|mm|m|CM|MM)/g;

function extractSizes(ocrTexts) {
  // 合并所有检测到的文字
  var allText = ocrTexts.join(' ');
  var sizeGroups = [];

  // 先尝试匹配 "A×B cm" 格式
  var match;
  var multiRegex = new RegExp(SIZE_PATTERN.source, 'g');
  while ((match = multiRegex.exec(allText)) !== null) {
    var a = parseFloat(match[1]);
    var b = parseFloat(match[2]);
    var unit = (match[3] || 'cm').toLowerCase();
    if (a > 0 && b > 0 && a < 500 && b < 500) {
      sizeGroups.push({
        width: Math.max(a, b),
        height: Math.min(a, b),
        unit: unit,
        label: Math.max(a, b) + ' × ' + Math.min(a, b) + ' ' + unit,
        source: match[0],
        type: 'pair'
      });
    }
  }

  // 如果没找到成对尺寸，尝试单独尺寸
  if (sizeGroups.length === 0) {
    var singleRegex = new RegExp(SINGLE_SIZE_PATTERN.source, 'g');
    var singles = [];
    while ((match = singleRegex.exec(allText)) !== null) {
      var val = parseFloat(match[1]);
      var unit = (match[2] || 'cm').toLowerCase();
      if (val > 0 && val < 500) {
        singles.push({ value: val, unit: unit, source: match[0] });
      }
    }
    // 如果恰好有2个，组成一对
    if (singles.length >= 2) {
      var sorted = singles.sort(function (a, b) { return b.value - a.value; });
      sizeGroups.push({
        width: sorted[0].value,
        height: sorted[1].value,
        unit: sorted[0].unit,
        label: sorted[0].value + ' × ' + sorted[1].value + ' ' + sorted[0].unit,
        source: sorted.map(function (s) { return s.source; }).join(', '),
        type: 'combined'
      });
    } else if (singles.length === 1) {
      sizeGroups.push({
        width: singles[0].value,
        height: null,
        unit: singles[0].unit,
        label: singles[0].value + ' ' + singles[0].unit,
        source: singles[0].source,
        type: 'single'
      });
    }
  }

  return sizeGroups;
}

// ========== 调用OCR服务提取所有文字 ==========
function callOcrForText(imageBase64) {
  return new Promise(function (resolve, reject) {
    var postData = JSON.stringify({
      image_base64: imageBase64,
      chinese_only: false,  // 需要检测所有文字，包括数字
      min_confidence: 0.3,  // 降低阈值，不漏掉小字
      expand_px: 0
    });

    var options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: '/detect',
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
          reject(new Error('OCR response parse failed'));
        }
      });
    });
    req.on('error', function () { resolve({ ok: true, regions: [] }); });
    req.on('timeout', function () { req.destroy(); resolve({ ok: true, regions: [] }); });
    req.write(postData);
    req.end();
  });
}

// ========== 检测图片中的尺寸 ==========
async function detectSizes(imageBuffer) {
  var base64 = imageBuffer.toString('base64');
  var ocrResult = await callOcrForText(base64);
  
  if (!ocrResult.ok || !ocrResult.regions || ocrResult.regions.length === 0) {
    return {
      ok: true,
      sizeGroups: [],
      allTexts: [],
      imageWidth: ocrResult.image_width || 0,
      imageHeight: ocrResult.image_height || 0,
      message: '未检测到文字'
    };
  }

  var texts = ocrResult.regions.map(function (r) { return r.text; });
  var sizeGroups = extractSizes(texts);

  return {
    ok: true,
    sizeGroups: sizeGroups,
    allTexts: texts,
    imageWidth: ocrResult.image_width,
    imageHeight: ocrResult.image_height,
    ocrRegions: ocrResult.regions
  };
}

// ========== 生成标注图 ==========
async function annotateImage(imageBuffer, widthCm, heightCm, options) {
  options = options || {};
  var unit = options.unit || 'cm';
  var imgMeta = await sharp(imageBuffer).metadata();
  var W = imgMeta.width, H = imgMeta.height;

  // 自动判断标注方向：大尺寸放长边
  var longDim = widthCm;
  var shortDim = heightCm;
  var imgIsLandscape = W >= H;

  // 标注参数自适应
  var fSize = Math.round(Math.min(W, H) / 25);
  var gap = Math.round(fSize * 1.2);
  var tick = Math.round(fSize * 0.6);
  var lineW = Math.max(2, Math.round(Math.min(W, H) / 400));

  // 标注区域：商品占图片中心区域
  var margin = Math.round(Math.min(W, H) * 0.08);
  var x1 = margin;
  var y1 = margin;
  var x2 = W - margin;
  var y2 = H - margin;

  var dimColor = '#E53935';
  var font = 'bold ' + fSize + 'px Arial, Helvetica, sans-serif';

  // 根据图片方向决定标注位置
  var svgParts = [];

  // --- 长边标注 ---
  if (imgIsLandscape) {
    // 横图：长边标底部
    svgParts.push(buildHorizontalAnnotation(x1, y2, x2, y2, gap, tick, lineW, fSize, dimColor, longDim, unit, W));
    if (shortDim != null) {
      // 短边标右侧
      svgParts.push(buildVerticalAnnotation(x2, y1, x2, y2, gap, tick, lineW, fSize, dimColor, shortDim, unit, H));
    }
  } else {
    // 竖图：长边标右侧
    svgParts.push(buildVerticalAnnotation(x2, y1, x2, y2, gap, tick, lineW, fSize, dimColor, longDim, unit, H));
    if (shortDim != null) {
      // 短边标底部
      svgParts.push(buildHorizontalAnnotation(x1, y2, x2, y2, gap, tick, lineW, fSize, dimColor, shortDim, unit, W));
    }
  }

  var svgDefs = `
    <defs>
      <marker id="aS" markerWidth="10" markerHeight="10" refX="1" refY="5" orient="auto" markerUnits="strokeWidth">
        <path d="M1,1 L9,5 L1,9" fill="none" stroke="${dimColor}" stroke-width="1.5" stroke-linejoin="round"/>
      </marker>
      <marker id="aE" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
        <path d="M1,1 L9,5 L1,9" fill="none" stroke="${dimColor}" stroke-width="1.5" stroke-linejoin="round"/>
      </marker>
    </defs>`;

  var svg = '<svg width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    svgDefs + svgParts.join('\n') + '</svg>';

  var resultBuf = await sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();

  return {
    ok: true,
    imageBuffer: resultBuf,
    imageWidth: W,
    imageHeight: H
  };
}

// 水平标注（底部）
function buildHorizontalAnnotation(x1, baseY, x2, y2, gap, tick, lineW, fSize, dimColor, value, unit, totalW) {
  var y = y2 + gap;
  var text = value + ' ' + unit;
  var textX = (x1 + x2) / 2;

  return '\n    <!-- 宽度标注（底部）-->' +
    '\n    <line x1="' + x1 + '" y1="' + (y2 + 4) + '" x2="' + x1 + '" y2="' + (y - tick) + '" stroke="' + dimColor + '" stroke-width="' + lineW + '"/>' +
    '\n    <line x1="' + x2 + '" y1="' + (y2 + 4) + '" x2="' + x2 + '" y2="' + (y - tick) + '" stroke="' + dimColor + '" stroke-width="' + lineW + '"/>' +
    '\n    <line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="' + dimColor + '" stroke-width="' + lineW + '" marker-start="url(#aS)" marker-end="url(#aE)"/>' +
    '\n    <rect x="' + (textX - fSize * 2.5) + '" y="' + (y - fSize * 0.65) + '" width="' + (fSize * 5) + '" height="' + (fSize * 1.1) + '" rx="3" fill="white" fill-opacity="0.9"/>' +
    '\n    <text x="' + textX + '" y="' + (y + fSize * 0.3) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="' + fSize + '" font-weight="bold" fill="' + dimColor + '">' + text + '</text>';
}

// 垂直标注（右侧）
function buildVerticalAnnotation(baseX, y1, x2, y2, gap, tick, lineW, fSize, dimColor, value, unit, totalH) {
  var x = x2 + gap;
  var text = value + ' ' + unit;
  var midY = (y1 + y2) / 2;

  return '\n    <!-- 高度标注（右侧）-->' +
    '\n    <line x1="' + (x2 + 4) + '" y1="' + y1 + '" x2="' + (x - tick) + '" y2="' + y1 + '" stroke="' + dimColor + '" stroke-width="' + lineW + '"/>' +
    '\n    <line x1="' + (x2 + 4) + '" y1="' + y2 + '" x2="' + (x - tick) + '" y2="' + y2 + '" stroke="' + dimColor + '" stroke-width="' + lineW + '"/>' +
    '\n    <line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + dimColor + '" stroke-width="' + lineW + '" marker-start="url(#aS)" marker-end="url(#aE)"/>' +
    '\n    <rect x="' + (x - fSize * 0.55) + '" y="' + (midY - fSize * 2.5) + '" width="' + (fSize * 1.1) + '" height="' + (fSize * 5) + '" rx="3" fill="white" fill-opacity="0.9"/>' +
    '\n    <text x="' + x + '" y="' + (midY + fSize * 0.4) + '" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="' + fSize + '" font-weight="bold" fill="' + dimColor + '" transform="rotate(90,' + x + ',' + midY + ')">' + text + '</text>';
}

// ========== 保存标注图 ==========
function saveAnnotatedImage(imageBuffer) {
  var UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  var filename = 'annotated_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
  var filepath = path.join(UPLOADS_DIR, filename);

  return new Promise(function (resolve, reject) {
    fs.writeFile(filepath, imageBuffer, function (err) {
      if (err) return reject(err);
      resolve('/uploads/' + filename);
    });
  });
}

module.exports = {
  detectSizes: detectSizes,
  extractSizes: extractSizes,
  annotateImage: annotateImage,
  saveAnnotatedImage: saveAnnotatedImage
};
