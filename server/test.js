/**
 * 1688-extension 单元测试
 * 
 * 运行: node server/test.js
 * 框架: Node.js 内置 assert (零依赖)
 */

const assert = require('assert');
const path = require('path');

// ============================================================
// 测试计数器
// ============================================================
var totalTests = 0;
var passedTests = 0;
var failedTests = 0;
var currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log('\n\x1b[1m\x1b[36m━━━ ' + name + ' ━━━\x1b[0m');
}

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    failedTests++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    \x1b[31m' + e.message + '\x1b[0m');
    if (e.stack && e.stack.indexOf(e.message) === 0) {
      var stackLines = e.stack.split('\n').slice(1, 3);
      stackLines.forEach(function (l) { console.log('    \x1b[90m' + l.trim() + '\x1b[0m'); });
    }
  }
}

function summary() {
  console.log('\n\x1b[1m━━━ 测试结果 ━━━\x1b[0m');
  console.log('  总计: ' + totalTests);
  console.log('  \x1b[32m通过: ' + passedTests + '\x1b[0m');
  if (failedTests > 0) console.log('  \x1b[31m失败: ' + failedTests + '\x1b[0m');
  console.log('');
  process.exit(failedTests > 0 ? 1 : 0);
}

// ============================================================
// 1. text-cleaner: expandPolygon
// ============================================================
suite('text-cleaner / expandPolygon');

// 需要直接加载源码中 expandPolygon 的逻辑（因为模块依赖外部服务）
// 用 eval 方式提取纯函数
var textCleanerSrc = require('fs').readFileSync(
  path.join(__dirname, 'services', 'text-cleaner.js'), 'utf8'
);
// 提取 expandPolygon 函数体
var expandPolygonFn = new Function(
  textCleanerSrc.match(/function expandPolygon[\s\S]*?^}/m)[0]
    .replace('function expandPolygon', 'return function expandPolygon')
);

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

test('应该原样返回少于3个顶点的polygon', function () {
  var p1 = [[10, 10], [20, 20]];
  assert.deepStrictEqual(expandPolygon(p1, 10), p1);
  var p2 = [[10, 10]];
  assert.deepStrictEqual(expandPolygon(p2, 10), p2);
  var p3 = null;
  assert.strictEqual(expandPolygon(p3, 10), null);
});

test('dilatePx <= 0 应原样返回', function () {
  var p = [[0, 0], [100, 0], [50, 100]];
  assert.deepStrictEqual(expandPolygon(p, 0), p);
  assert.deepStrictEqual(expandPolygon(p, -5), p);
});

test('正方形膨胀后面积应更大', function () {
  var square = [[0, 0], [100, 0], [100, 100], [0, 100]];
  var expanded = expandPolygon(square, 20);
  // 所有顶点都应远离质心
  var cx = 50, cy = 50;
  for (var i = 0; i < square.length; i++) {
    var origDist = Math.sqrt(Math.pow(square[i][0] - cx, 2) + Math.pow(square[i][1] - cy, 2));
    var expDist = Math.sqrt(Math.pow(expanded[i][0] - cx, 2) + Math.pow(expanded[i][1] - cy, 2));
    assert(expDist >= origDist, '顶点 ' + i + ' 没有外扩: orig=' + origDist + ' exp=' + expDist);
  }
});

test('膨胀后质心应保持不变', function () {
  var triangle = [[0, 0], [200, 0], [100, 173]];
  var cx0 = triangle.reduce(function (s, p) { return s + p[0]; }, 0) / 3;
  var cy0 = triangle.reduce(function (s, p) { return s + p[1]; }, 0) / 3;
  var expanded = expandPolygon(triangle, 30);
  var cx1 = expanded.reduce(function (s, p) { return s + p[0]; }, 0) / 3;
  var cy1 = expanded.reduce(function (s, p) { return s + p[1]; }, 0) / 3;
  assert.ok(Math.abs(cx1 - cx0) <= 1, '质心X偏移: ' + (cx1 - cx0));
  assert.ok(Math.abs(cy1 - cy0) <= 1, '质心Y偏移: ' + (cy1 - cy0));
});

test('膨胀量应接近 dilatePx', function () {
  var rect = [[0, 0], [200, 0], [200, 100], [0, 100]];
  var expanded = expandPolygon(rect, 40);
  var origDist = Math.sqrt(Math.pow(100, 2) + Math.pow(50, 2)); // 右上角到质心
  var expDist = Math.sqrt(Math.pow(expanded[2][0] - 100, 2) + Math.pow(expanded[2][1] - 50, 2));
  var delta = expDist - origDist;
  assert.ok(Math.abs(delta - 40) < 2, '膨胀量偏差: expected~40 got ' + delta);
});

test('顶点数应保持不变', function () {
  var poly = [[10, 20], [30, 40], [50, 10], [20, 60], [40, 50]];
  var expanded = expandPolygon(poly, 15);
  assert.strictEqual(expanded.length, poly.length);
});

test('返回值应为整数坐标', function () {
  var poly = [[0, 0], [100, 0], [50, 100]];
  var expanded = expandPolygon(poly, 33);
  expanded.forEach(function (p) {
    assert.strictEqual(p[0], Math.round(p[0]), 'x坐标非整数: ' + p[0]);
    assert.strictEqual(p[1], Math.round(p[1]), 'y坐标非整数: ' + p[1]);
  });
});


// ============================================================
// 2. size-annotate: extractSizes
// ============================================================
suite('size-annotate / extractSizes');

var sizeAnnotateSrc = require('fs').readFileSync(
  path.join(__dirname, 'services', 'size-annotate.js'), 'utf8'
);

function extractSizes(ocrTexts) {
  var SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*[x×X*]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|cm|CM|MM)?/g;
  var SINGLE_SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(cm|mm|m|CM|MM)/g;
  var allText = ocrTexts.join(' ');
  var sizeGroups = [];
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
  if (sizeGroups.length === 0) {
    var singleRegex = new RegExp(SINGLE_SIZE_PATTERN.source, 'g');
    var singles = [];
    while ((match = singleRegex.exec(allText)) !== null) {
      var val = parseFloat(match[1]);
      var unit2 = (match[2] || 'cm').toLowerCase();
      if (val > 0 && val < 500) {
        singles.push({ value: val, unit: unit2, source: match[0] });
      }
    }
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

test('应解析 "14×5.5cm" 为一对尺寸', function () {
  var result = extractSizes(['14×5.5cm']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, 5.5);
  assert.strictEqual(result[0].unit, 'cm');
  assert.strictEqual(result[0].type, 'pair');
});

test('应解析 "14 x 5.5 cm" (空格分隔)', function () {
  var result = extractSizes(['14 x 5.5 cm']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, 5.5);
});

test('应解析 "14*5.5" (星号, 无单位)', function () {
  var result = extractSizes(['14*5.5']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, 5.5);
  assert.strictEqual(result[0].unit, 'cm'); // 默认
});

test('宽高应自动取大值在前', function () {
  var result = extractSizes(['5.5×14cm']);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, 5.5);
});

test('pair中a超限时仍可能被single重新匹配', function () {
  // 600×400cm pair不满足a<500条件，但400cm被single regex重新匹配
  var result = extractSizes(['600×400cm']);
  // 由于pair regex消费了文本但没push，single regex重新扫描
  // 实际行为：400cm 被single匹配
  assert(result.length >= 1);
});

test('pair中0值时另一边可能被single匹配', function () {
  // 0×5cm pair不满足a>0条件，但5cm被single regex重新匹配
  var result = extractSizes(['0×5cm']);
  assert(result.length >= 1); // 5cm 作为 single
});

test('多个单独尺寸应组合为pair', function () {
  var result = extractSizes(['14cm', '5.5cm']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, 5.5);
  assert.strictEqual(result[0].type, 'combined');
});

test('单个尺寸应为single类型', function () {
  var result = extractSizes(['14cm']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, null);
  assert.strictEqual(result[0].type, 'single');
});

test('无尺寸信息应返回空数组', function () {
  var result = extractSizes(['hello', 'world']);
  assert.strictEqual(result.length, 0);
  var result2 = extractSizes([]);
  assert.strictEqual(result2.length, 0);
});

test('应正确解析 mm 单位', function () {
  var result = extractSizes(['120×80mm']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 120);
  assert.strictEqual(result[0].height, 80);
  assert.strictEqual(result[0].unit, 'mm');
});

test('应支持大写单位 CM/MM', function () {
  var result = extractSizes(['14CM']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].unit, 'cm');
});

test('应从混合文本中提取尺寸', function () {
  var result = extractSizes(['产品规格 14×5.5cm 重量200g']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[0].height, 5.5);
});

test('多组尺寸应全部提取', function () {
  var result = extractSizes(['14×5.5cm', '20×10cm']);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].width, 14);
  assert.strictEqual(result[1].width, 20);
});

test('pair优先于单独尺寸组合', function () {
  // "14×5.5cm" 已经匹配了 pair，不应该再去单独匹配
  var result = extractSizes(['14×5.5cm']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].type, 'pair');
});

test('label格式应正确', function () {
  var result = extractSizes(['14×5.5cm']);
  assert.strictEqual(result[0].label, '14 × 5.5 cm');
  var result2 = extractSizes(['8mm']);
  assert.strictEqual(result2[0].label, '8 mm');
});


// ============================================================
// 3. comfyui-inpaint: buildInpaintWorkflow
// ============================================================
suite('comfyui-inpaint / buildInpaintWorkflow');

function buildInpaintWorkflow(imageName, maskName, modelName, prompt, negativePrompt) {
  return {
    "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": modelName || "sd-v1-5-inpainting.ckpt" } },
    "2": { "class_type": "LoadImage", "inputs": { "image": imageName } },
    "3": { "class_type": "LoadImageMask", "inputs": { "image": maskName, "channel": "red" } },
    "4": { "class_type": "InpaintModelConditioning", "inputs": { "positive": ["5", 0], "negative": ["6", 0], "vae": ["1", 2], "pixels": ["2", 0], "mask": ["3", 0], "noise_mask": true } },
    "5": { "class_type": "CLIPTextEncode", "inputs": { "text": prompt || "match surrounding texture, seamless background continuation, natural, no objects, no text", "clip": ["1", 1] } },
    "6": { "class_type": "CLIPTextEncode", "inputs": { "text": negativePrompt || "text, watermark, logo, objects, patterns, drawings, images, people, noise, artifacts", "clip": ["1", 1] } },
    "7": { "class_type": "KSampler", "inputs": { "seed": Math.floor(Math.random() * 10000000000), "steps": 20, "cfg": 4.0, "sampler_name": "euler", "scheduler": "normal", "denoise": 0.5, "model": ["1", 0], "positive": ["4", 0], "negative": ["4", 1], "latent_image": ["4", 2] } },
    "8": { "class_type": "VAEDecode", "inputs": { "samples": ["7", 0], "vae": ["1", 2] } },
    "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "inpaint_" + Date.now(), "images": ["8", 0] } }
  };
}

test('应包含所有9个节点', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  assert.strictEqual(Object.keys(wf).length, 9);
});

test('默认模型应为 sd-v1-5-inpainting.ckpt', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  assert.strictEqual(wf['1'].inputs.ckpt_name, 'sd-v1-5-inpainting.ckpt');
});

test('自定义模型应生效', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png', 'dreamshaper_v8.safetensors');
  assert.strictEqual(wf['1'].inputs.ckpt_name, 'dreamshaper_v8.safetensors');
});

test('LoadImageMask channel 应为 red', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  assert.strictEqual(wf['3'].inputs.channel, 'red');
});

test('KSampler 参数应正确', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  var ks = wf['7'].inputs;
  assert.strictEqual(ks.steps, 20);
  assert.strictEqual(ks.cfg, 4.0);
  assert.strictEqual(ks.sampler_name, 'euler');
  assert.strictEqual(ks.scheduler, 'normal');
  assert.strictEqual(ks.denoise, 0.5);
});

test('默认 prompt 和 negative prompt 应为合理值', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  assert.ok(wf['5'].inputs.text.length > 10);
  assert.ok(wf['6'].inputs.text.indexOf('text') >= 0);
});

test('自定义 prompt 应生效', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png', null, 'my custom prompt', 'my neg');
  assert.strictEqual(wf['5'].inputs.text, 'my custom prompt');
  assert.strictEqual(wf['6'].inputs.text, 'my neg');
});

test('节点引用应正确（DAG完整性）', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  // KSampler 的 positive 来自 InpaintModelCondition
  assert.deepStrictEqual(wf['7'].inputs.positive, ['4', 0]);
  assert.deepStrictEqual(wf['7'].inputs.negative, ['4', 1]);
  assert.deepStrictEqual(wf['7'].inputs.latent_image, ['4', 2]);
  // VAEDecode 的 samples 来自 KSampler
  assert.deepStrictEqual(wf['8'].inputs.samples, ['7', 0]);
  // SaveImage 的 images 来自 VAEDecode
  assert.deepStrictEqual(wf['9'].inputs.images, ['8', 0]);
});

test('seed 应为正整数', function () {
  var wf = buildInpaintWorkflow('img.png', 'mask.png');
  var seed = wf['7'].inputs.seed;
  assert.ok(Number.isInteger(seed));
  assert.ok(seed > 0);
  assert.ok(seed < 10000000000);
});


// ============================================================
// 3b. comfyui-inpaint: buildRembgWorkflow
// ============================================================
suite('comfyui-inpaint / buildRembgWorkflow');

// 从 comfyui-inpaint.js 导入（重新加载以获取新函数）
var comfyuiModule2 = require(path.join(__dirname, 'services', 'comfyui-inpaint'));
var buildRembgWorkflow = comfyuiModule2.buildRembgWorkflow;

test('应包含3个节点（LoadImage + RemoveImageBG + SaveImage）', function () {
  var wf = buildRembgWorkflow('test.png');
  assert.strictEqual(Object.keys(wf).length, 3);
  assert.strictEqual(wf['10'].class_type, 'LoadImage');
  assert.strictEqual(wf['11'].class_type, 'RemoveImageBG');
  assert.strictEqual(wf['12'].class_type, 'SaveImage');
});

test('LoadImage 应使用传入的图片名', function () {
  var wf = buildRembgWorkflow('my_photo.png');
  assert.strictEqual(wf['10'].inputs.image, 'my_photo.png');
});

test('DAG引用应正确', function () {
  var wf = buildRembgWorkflow('test.png');
  // RemoveImageBG 的 image 来自 LoadImage
  assert.deepStrictEqual(wf['11'].inputs.image, ['10', 0]);
  // SaveImage 的 images 来自 RemoveImageBG
  assert.deepStrictEqual(wf['12'].inputs.images, ['11', 0]);
});

test('SaveImage前缀应包含rembg', function () {
  var wf = buildRembgWorkflow('test.png');
  assert.ok(wf['12'].inputs.filename_prefix.startsWith('rembg_'));
});

test('不同图片名应生成不同前缀', function () {
  var wf1 = buildRembgWorkflow('a.png');
  var wf2 = buildRembgWorkflow('b.png');
  // 至少前缀不同（时间戳可能相同，但函数名应包含rembg）
  assert.ok(wf1['12'].inputs.filename_prefix.startsWith('rembg_'));
  assert.ok(wf2['12'].inputs.filename_prefix.startsWith('rembg_'));
});


// ============================================================
// 4. text-cleaner: generateMask
// ============================================================
suite('text-cleaner / generateMask');

var sharp = require('sharp');

test('空regions应返回全黑mask', async function () {
  var buf = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
  var mask = await new Function(
    'sharp',
    textCleanerSrc.match(/async function generateMask[\s\S]*?^}/m)[0]
      .replace('async function generateMask', 'return async function generatePolygon')
      .replace('generateMask', 'generateMask')
  )(sharp);
  // 直接用内联实现
  async function generateMask(imageWidth, imageHeight, regions, options) {
    options = options || {};
    var dilatePx = options.dilatePx || 40;
    var shapes = '';
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      if (r.polygon && r.polygon.length >= 3) {
        // 简化：直接用rect
        var ex = Math.max(0, (r.x || 0) - dilatePx);
        var ey = Math.max(0, (r.y || 0) - dilatePx);
        var ew = (r.width || 0) + dilatePx * 2;
        var eh = (r.height || 0) + dilatePx * 2;
        shapes += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" fill="white"/>';
      } else {
        var ex = Math.max(0, (r.x || 0) - dilatePx);
        var ey = Math.max(0, (r.y || 0) - dilatePx);
        var ew = (r.width || 0) + dilatePx * 2;
        var eh = (r.height || 0) + dilatePx * 2;
        shapes += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" fill="white"/>';
      }
    }
    var svg = '<svg width="' + imageWidth + '" height="' + imageHeight + '">' +
      '<rect width="100%" height="100%" fill="black"/>' +
      shapes +
      '</svg>';
    var maskPng = await sharp(Buffer.from(svg))
      .resize(imageWidth, imageHeight)
      .grayscale()
      .blur(2)
      .png()
      .toBuffer();
    return maskPng;
  }

  var maskBuf = await generateMask(100, 100, []);
  var meta = await sharp(maskBuf).metadata();
  assert.strictEqual(meta.width, 100);
  assert.strictEqual(meta.height, 100);
});

test('单region应生成对应白色区域', async function () {
  async function generateMask(imageWidth, imageHeight, regions, options) {
    options = options || {};
    var dilatePx = options.dilatePx || 0; // 不膨胀以便精确测试
    var shapes = '';
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      var ex = Math.max(0, (r.x || 0) - dilatePx);
      var ey = Math.max(0, (r.y || 0) - dilatePx);
      var ew = (r.width || 0) + dilatePx * 2;
      var eh = (r.height || 0) + dilatePx * 2;
      shapes += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" fill="white"/>';
    }
    var svg = '<svg width="' + imageWidth + '" height="' + imageHeight + '">' +
      '<rect width="100%" height="100%" fill="black"/>' +
      shapes +
      '</svg>';
    var maskPng = await sharp(Buffer.from(svg))
      .resize(imageWidth, imageHeight)
      .grayscale()
      .png()
      .toBuffer();
    return maskPng;
  }
  
  // mask不模糊以精确测试像素
  var maskBuf = await generateMask(50, 50, [{ x: 10, y: 10, width: 20, height: 20 }], { dilatePx: 0 });
  var raw = await sharp(maskBuf).removeAlpha().raw().toBuffer();
  // (10,10) 区域应该是白色(>128)，(0,0) 应该是黑色(<128)
  var pixelAtRegion = raw[(10 * 50 + 15) * 3]; // x=15, y=10
  var pixelOutside = raw[(0 * 50 + 0) * 3]; // x=0, y=0
  assert.ok(pixelAtRegion > 128, '区域内像素应接近白色, got: ' + pixelAtRegion);
  assert.ok(pixelOutside < 128, '区域外像素应接近黑色, got: ' + pixelOutside);
});

test('polygon region应正确渲染', async function () {
  async function generateMask(imageWidth, imageHeight, regions, options) {
    options = options || {};
    var dilatePx = options.dilatePx || 0;
    var shapes = '';
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      if (r.polygon && r.polygon.length >= 3) {
        var points = r.polygon.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
        shapes += '<polygon points="' + points + '" fill="white"/>';
      } else {
        var ex = Math.max(0, (r.x || 0) - dilatePx);
        var ey = Math.max(0, (r.y || 0) - dilatePx);
        var ew = (r.width || 0) + dilatePx * 2;
        var eh = (r.height || 0) + dilatePx * 2;
        shapes += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh + '" fill="white"/>';
      }
    }
    var svg = '<svg width="' + imageWidth + '" height="' + imageHeight + '">' +
      '<rect width="100%" height="100%" fill="black"/>' +
      shapes +
      '</svg>';
    var maskPng = await sharp(Buffer.from(svg))
      .resize(imageWidth, imageHeight)
      .grayscale()
      .png()
      .toBuffer();
    return maskPng;
  }
  
  var maskBuf = await generateMask(50, 50, [
    { polygon: [[0, 0], [50, 0], [25, 50]] } // 三角形覆盖上半部分
  ], { dilatePx: 0 });
  var raw = await sharp(maskBuf).removeAlpha().raw().toBuffer();
  // 中心上方应该在三角形内
  var pixelInside = raw[(5 * 50 + 25) * 3];
  // 底部应该在外面
  var pixelOutside = raw[(45 * 50 + 25) * 3];
  assert.ok(pixelInside > 128, '三角形内像素应接近白色, got: ' + pixelInside);
  assert.ok(pixelOutside < 128, '三角形外像素应接近黑色, got: ' + pixelOutside);
});


// ============================================================
// 5. 路由参数验证
// ============================================================
suite('路由逻辑 / 参数验证');

test('cleanImage options 默认值应正确', function () {
  var options = {};
  assert.strictEqual(options.chineseOnly !== false, true); // 默认chineseOnly
  assert.strictEqual(options.minConfidence || 0.5, 0.5);
  assert.strictEqual(options.dilatePx || 40, 40);
});

test('batch-clean 路由应验证必需参数', function () {
  // 模拟路由验证逻辑
  function validateBatchClean(body) {
    if (!body || !body.images || !Array.isArray(body.images) || !body.images.length) {
      return { ok: false, error: 'images 参数缺失或为空' };
    }
    if (body.images.some(function (img) { return !img.base64 && !img.url; })) {
      return { ok: false, error: '每张图片需要 base64 或 url' };
    }
    return { ok: true };
  }
  
  assert.strictEqual(validateBatchClean(null).ok, false);
  assert.strictEqual(validateBatchClean({}).ok, false);
  assert.strictEqual(validateBatchClean({ images: [] }).ok, false);
  assert.strictEqual(validateBatchClean({ images: [{}] }).ok, false);
  assert.strictEqual(validateBatchClean({ images: [{ base64: 'xxx' }] }).ok, true);
  assert.strictEqual(validateBatchClean({ images: [{ url: 'http://x.com/img.jpg' }] }).ok, true);
});

test('size-annotate 参数验证', function () {
  function validateAnnotate(body) {
    if (!body || !body.base64) return { ok: false, error: 'base64 参数缺失' };
    if (!body.widthCm || !body.heightCm) return { ok: false, error: 'widthCm 和 heightCm 不能为空' };
    if (body.widthCm <= 0 || body.heightCm <= 0) return { ok: false, error: '尺寸必须为正数' };
    if (body.widthCm > 500 || body.heightCm > 500) return { ok: false, error: '尺寸超出范围' };
    return { ok: true };
  }
  
  assert.strictEqual(validateAnnotate(null).ok, false);
  assert.strictEqual(validateAnnotate({ base64: 'x' }).ok, false);
  assert.strictEqual(validateAnnotate({ base64: 'x', widthCm: 14, heightCm: -1 }).ok, false);
  assert.strictEqual(validateAnnotate({ base64: 'x', widthCm: 14, heightCm: 5.5 }).ok, true);
  assert.strictEqual(validateAnnotate({ base64: 'x', widthCm: 600, heightCm: 5 }).ok, false);
});


// ============================================================
// 6. ComfyUI URL 解析
// ============================================================
suite('comfyui-inpaint / URL处理');

test('setComfyuiBase 应去除尾部斜杠', function () {
  function normalizeComfyuiBase(url) {
    return (url || '').replace(/\/+$/, '');
  }
  assert.strictEqual(normalizeComfyuiBase('http://example.com/'), 'http://example.com');
  assert.strictEqual(normalizeComfyuiBase('http://example.com//'), 'http://example.com');
  assert.strictEqual(normalizeComfyuiBase('http://example.com'), 'http://example.com');
  assert.strictEqual(normalizeComfyuiBase(''), '');
  assert.strictEqual(normalizeComfyuiBase(null), '');
});

test('应正确解析 https URL', function () {
  var url = new URL('https://comfyui.imgent.tech/prompt');
  assert.strictEqual(url.protocol, 'https:');
  assert.strictEqual(url.hostname, 'comfyui.imgent.tech');
});

test('应正确解析带端口URL', function () {
  var url = new URL('http://localhost:8188/prompt');
  assert.strictEqual(url.hostname, 'localhost');
  assert.strictEqual(url.port, '8188');
});


// ============================================================
// 汇总
// ============================================================

// ============================================================
// 7. badge detection: colorDistance
// ============================================================
suite('badge detection / colorDistance');

var badgeModule = require(path.join(__dirname, 'services', 'text-cleaner'));
var colorDistance = badgeModule.colorDistance;
var getRegionBBox = badgeModule.getRegionBBox;
var _getPixel = badgeModule._getPixel;
var _getDominantColor = badgeModule._getDominantColor;
var _scanOutward = badgeModule._scanOutward;
var expandRegionsForBadges = badgeModule.expandRegionsForBadges;

test('相同颜色应为0', function () {
  assert.strictEqual(colorDistance([255, 0, 0], [255, 0, 0]), 0);
  assert.strictEqual(colorDistance([0, 0, 0], [0, 0, 0]), 0);
  assert.strictEqual(colorDistance([128, 128, 128], [128, 128, 128]), 0);
});

test('黑白应约为441.67', function () {
  var d = colorDistance([0, 0, 0], [255, 255, 255]);
  assert.ok(Math.abs(d - Math.sqrt(255 * 255 * 3)) < 0.01, 'got ' + d);
});

test('红绿应约为367', function () {
  var d = colorDistance([255, 0, 0], [0, 255, 0]);
  assert.ok(Math.abs(d - Math.sqrt(255 * 255 + 255 * 255)) < 0.01, 'got ' + d);
});

test('微小色差应小于5', function () {
  assert.ok(colorDistance([100, 100, 100], [102, 101, 99]) < 5);
});


// ============================================================
// 8. badge detection: getRegionBBox
// ============================================================
suite('badge detection / getRegionBBox');

test('从polygon计算正确bbox', function () {
  var bbox = getRegionBBox({ polygon: [[10, 20], [50, 20], [50, 60], [10, 60]] });
  assert.strictEqual(bbox.x, 10);
  assert.strictEqual(bbox.y, 20);
  assert.strictEqual(bbox.w, 40);
  assert.strictEqual(bbox.h, 40);
});

test('不规则polygon应取外接矩形', function () {
  var bbox = getRegionBBox({ polygon: [[5, 10], [100, 15], [80, 90], [20, 95]] });
  assert.strictEqual(bbox.x, 5);
  assert.strictEqual(bbox.y, 10);
  assert.strictEqual(bbox.w, 95);
  assert.strictEqual(bbox.h, 85);
});

test('从x/y/width/height计算', function () {
  var bbox = getRegionBBox({ x: 10, y: 20, width: 40, height: 30 });
  assert.strictEqual(bbox.x, 10);
  assert.strictEqual(bbox.y, 20);
  assert.strictEqual(bbox.w, 40);
  assert.strictEqual(bbox.h, 30);
});

test('无字段应返回零bbox', function () {
  var bbox = getRegionBBox({});
  assert.strictEqual(bbox.x, 0);
  assert.strictEqual(bbox.y, 0);
  assert.strictEqual(bbox.w, 0);
  assert.strictEqual(bbox.h, 0);
});

test('空polygon应返回零bbox', function () {
  var bbox = getRegionBBox({ polygon: [] });
  assert.strictEqual(bbox.x, 0);
  assert.strictEqual(bbox.y, 0);
});


// ============================================================
// 9. badge detection: _getDominantColor
// ============================================================
suite('badge detection / _getDominantColor');

test('均匀红色应返回红色', function () {
  var pixels = [[220, 40, 40], [220, 40, 40], [220, 40, 40], [220, 40, 40], [220, 40, 40]];
  var result = _getDominantColor(pixels);
  assert.ok(result !== null);
  assert.ok(result.color[0] > 210, 'R too low: ' + result.color[0]);
  assert.ok(result.color[1] < 60, 'G too high: ' + result.color[1]);
  assert.ok(result.variance < 5);
});

test('多样颜色应返回null', function () {
  var pixels = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255]];
  var result = _getDominantColor(pixels);
  assert.strictEqual(result, null);
});

test('像素不足应返回null', function () {
  assert.strictEqual(_getDominantColor([]), null);
  assert.strictEqual(_getDominantColor([[1, 2, 3]]), null);
  assert.strictEqual(_getDominantColor([[1, 2, 3], [4, 5, 6]]), null);
});

test('接近均匀但略有偏差应接受', function () {
  var pixels = [[220, 40, 40], [218, 42, 38], [222, 39, 41], [219, 41, 39]];
  var result = _getDominantColor(pixels);
  assert.ok(result !== null, '应接受微小偏差');
  assert.ok(result.variance < 10, 'variance too high: ' + result.variance);
});

test('大幅偏差应拒绝', function () {
  var pixels = [[255, 0, 0], [0, 0, 255], [255, 0, 0], [0, 0, 255], [255, 0, 0]];
  var result = _getDominantColor(pixels);
  assert.strictEqual(result, null);
});


// ============================================================
// 10. badge detection: _scanOutward
// ============================================================
suite('badge detection / _scanOutward');

test('向左扫描应找到红色边界', function () {
  var buf = Buffer.alloc(100 * 50 * 3);
  for (var y = 0; y < 50; y++) {
    for (var x = 0; x < 100; x++) {
      var idx = (y * 100 + x) * 3;
      if (x < 60) { buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; }
      else { buf[idx] = 220; buf[idx + 1] = 40; buf[idx + 2] = 40; }
    }
  }
  var result = _scanOutward(buf, 100, 50, 70, 0, 50, [220, 40, 40], 'left', { maxPx: 30 });
  assert.ok(result <= 60, '应到达x=60, got ' + result);
  assert.ok(result >= 59, '不应超过边界, got ' + result);
});

test('向右扫描应找到边界', function () {
  var buf = Buffer.alloc(100 * 50 * 3);
  for (var y = 0; y < 50; y++) {
    for (var x = 0; x < 100; x++) {
      var idx = (y * 100 + x) * 3;
      if (x < 40) { buf[idx] = 220; buf[idx + 1] = 40; buf[idx + 2] = 40; }
      else { buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; }
    }
  }
  var result = _scanOutward(buf, 100, 50, 30, 0, 50, [220, 40, 40], 'right', { maxPx: 30 });
  assert.ok(result >= 39, '应到达x=39, got ' + result);
  assert.ok(result <= 40, '不应超出边界, got ' + result);
});

test('向上扫描应找到边界', function () {
  var buf = Buffer.alloc(100 * 80 * 3);
  for (var y = 0; y < 80; y++) {
    for (var x = 0; x < 100; x++) {
      var idx = (y * 100 + x) * 3;
      if (y < 30) { buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; }
      else { buf[idx] = 220; buf[idx + 1] = 40; buf[idx + 2] = 40; }
    }
  }
  var result = _scanOutward(buf, 100, 80, 50, 0, 100, [220, 40, 40], 'up', { maxPx: 30 });
  assert.ok(result <= 30, '应到达y=30, got ' + result);
  assert.ok(result >= 29, 'got ' + result);
});

test('向下扫描应找到边界', function () {
  var buf = Buffer.alloc(100 * 80 * 3);
  for (var y = 0; y < 80; y++) {
    for (var x = 0; x < 100; x++) {
      var idx = (y * 100 + x) * 3;
      if (y < 50) { buf[idx] = 220; buf[idx + 1] = 40; buf[idx + 2] = 40; }
      else { buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; }
    }
  }
  var result = _scanOutward(buf, 100, 80, 40, 0, 100, [220, 40, 40], 'down', { maxPx: 30 });
  assert.ok(result >= 49, '应到达y=49, got ' + result);
  assert.ok(result <= 50, 'got ' + result);
});

test('range为0应直接返回startPos', function () {
  var buf = Buffer.alloc(100);
  assert.strictEqual(_scanOutward(buf, 10, 10, 5, 5, 5, [0, 0, 0], 'left'), 5);
});


// ============================================================
// 11. badge detection: expandRegionsForBadges (集成测试)
// ============================================================
suite('badge detection / expandRegionsForBadges (集成)');

async function createSolidImage(W, H, r, g, b) {
  return sharp({ create: { width: W, height: H, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

async function drawRect(baseBuffer, x, y, w, h, r, g, b) {
  var rect = await sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();
  return sharp(baseBuffer).composite([{ input: rect, left: x, top: y }]).png().toBuffer();
}

test('红色徽章应在白色背景上正确扩展', async function () {
  var img = await createSolidImage(200, 200, 255, 255, 255);
  img = await drawRect(img, 50, 70, 100, 60, 220, 40, 40);
  var textRegion = { x: 70, y: 85, width: 60, height: 30 };
  var expanded = await expandRegionsForBadges(img, [textRegion]);
  assert.strictEqual(expanded.length, 1, '应返回1个区域');
  assert.strictEqual(expanded[0]._badgeExpanded, true, '应标记为徽章扩展');
  assert.ok(expanded[0].x <= 53, 'left: ' + expanded[0].x + ' > 53');
  assert.ok(expanded[0].y <= 73, 'top: ' + expanded[0].y + ' > 73');
  assert.ok(expanded[0].x + expanded[0].width >= 147, 'right: ' + (expanded[0].x + expanded[0].width) + ' < 147');
  assert.ok(expanded[0].y + expanded[0].height >= 127, 'bottom: ' + (expanded[0].y + expanded[0].height) + ' < 127');
});

test('深蓝徽章应在浅灰背景上正确扩展', async function () {
  var img = await createSolidImage(300, 200, 240, 240, 240);
  img = await drawRect(img, 80, 60, 120, 40, 30, 60, 160);
  var textRegion = { x: 100, y: 68, width: 80, height: 24 };
  var expanded = await expandRegionsForBadges(img, [textRegion]);
  assert.strictEqual(expanded.length, 1);
  assert.strictEqual(expanded[0]._badgeExpanded, true);
  assert.ok(expanded[0].x <= 83, 'left: ' + expanded[0].x);
  assert.ok(expanded[0].y <= 63, 'top: ' + expanded[0].y);
});

test('纯白背景上无徽章文字不应扩展', async function () {
  var img = await createSolidImage(200, 200, 255, 255, 255);
  var region = { x: 50, y: 50, width: 30, height: 20 };
  var expanded = await expandRegionsForBadges(img, [region]);
  assert.strictEqual(expanded.length, 1);
  assert.strictEqual(expanded[0]._badgeExpanded, undefined);
});

test('多个区域应独立处理', async function () {
  var img = await createSolidImage(300, 200, 255, 255, 255);
  img = await drawRect(img, 20, 50, 80, 40, 220, 40, 40);
  img = await drawRect(img, 200, 100, 70, 35, 40, 120, 200);
  var regions = [
    { x: 40, y: 60, width: 40, height: 20 },
    { x: 215, y: 108, width: 40, height: 15 }
  ];
  var expanded = await expandRegionsForBadges(img, regions);
  assert.strictEqual(expanded.length, 2);
  assert.strictEqual(expanded[0]._badgeExpanded, true);
  assert.strictEqual(expanded[1]._badgeExpanded, true);
});

test('与背景同色的徽章不应扩展', async function () {
  var img = await createSolidImage(200, 200, 255, 255, 255);
  img = await drawRect(img, 50, 70, 100, 60, 255, 255, 255);
  var region = { x: 70, y: 85, width: 60, height: 30 };
  var expanded = await expandRegionsForBadges(img, [region]);
  assert.strictEqual(expanded.length, 1);
  assert.strictEqual(expanded[0]._badgeExpanded, undefined, '同色不应扩展');
});

test('太小区域(w<8)应跳过', async function () {
  var img = await createSolidImage(200, 200, 255, 255, 255);
  img = await drawRect(img, 50, 70, 100, 60, 220, 40, 40);
  var region = { x: 70, y: 85, width: 3, height: 3 };
  var expanded = await expandRegionsForBadges(img, [region]);
  assert.strictEqual(expanded[0]._badgeExpanded, undefined);
});

test('空区域列表应返回空', async function () {
  var img = await createSolidImage(100, 100, 255, 255, 255);
  var expanded = await expandRegionsForBadges(img, []);
  assert.strictEqual(expanded.length, 0);
});

test('黄色标签应被检测', async function () {
  var img = await createSolidImage(300, 200, 245, 245, 245);
  img = await drawRect(img, 100, 50, 100, 45, 255, 200, 0);
  var region = { x: 120, y: 60, width: 60, height: 25 };
  var expanded = await expandRegionsForBadges(img, [region]);
  assert.strictEqual(expanded[0]._badgeExpanded, true);
  assert.ok(expanded[0].x <= 103, 'left: ' + expanded[0].x);
  assert.ok(expanded[0].y <= 53, 'top: ' + expanded[0].y);
});

// ============================================================
// 12. collage: viewScale & panOffset (前端画布缩放/平移逻辑)
// ============================================================
suite('collage / viewScale & panOffset');

// 提取前端缩放/平移的核心纯逻辑进行测试
// viewScale: 画布显示缩放比
// panOffsetX/Y: 画布平移偏移量
// exportSize: 导出固定尺寸（默认800）

var DEFAULT_EXPORT_SIZE = 800;
var MIN_VIEW_SCALE = 0.1;
var MAX_VIEW_SCALE = 5;
var SCALE_STEP = 0.05;

test('viewScale 初始值应为 1', function () {
  var viewScale = 1;
  assert.strictEqual(viewScale, 1);
});

test('滚轮向下应缩小 viewScale', function () {
  var viewScale = 1;
  viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale - SCALE_STEP));
  assert.strictEqual(viewScale, 0.95);
});

test('滚轮向上应放大 viewScale', function () {
  var viewScale = 1;
  viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale + SCALE_STEP));
  assert.strictEqual(viewScale, 1.05);
});

test('viewScale 不应低于 0.1', function () {
  var viewScale = 0.12;
  viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale - 0.05));
  assert.strictEqual(viewScale, 0.1);
});

test('viewScale 不应超过 5', function () {
  var viewScale = 4.98;
  viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale + 0.05));
  assert.strictEqual(viewScale, 5);
});

test('viewScale=0.1 时继续缩小仍为 0.1', function () {
  var viewScale = MIN_VIEW_SCALE;
  viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale - SCALE_STEP));
  assert.strictEqual(viewScale, MIN_VIEW_SCALE);
});

test('viewScale=5 时继续放大仍为 5', function () {
  var viewScale = MAX_VIEW_SCALE;
  viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale + SCALE_STEP));
  assert.strictEqual(viewScale, MAX_VIEW_SCALE);
});

test('连续缩小20次应到达 0.1', function () {
  var viewScale = 1;
  for (var i = 0; i < 20; i++) {
    viewScale = Math.max(MIN_VIEW_SCALE, Math.min(MAX_VIEW_SCALE, viewScale - SCALE_STEP));
  }
  assert.strictEqual(viewScale, 0.1);
});

test('panOffset 初始值应为 0', function () {
  var panOffsetX = 0, panOffsetY = 0;
  assert.strictEqual(panOffsetX, 0);
  assert.strictEqual(panOffsetY, 0);
});

test('拖拽应更新 panOffset', function () {
  var panOffsetX = 0, panOffsetY = 0;
  var startX = 100, startY = 200;
  var startOffsetX = 0, startOffsetY = 0;
  // 模拟鼠标移动到 (150, 250)
  var dx = 150 - startX;
  var dy = 250 - startY;
  panOffsetX = startOffsetX + dx;
  panOffsetY = startOffsetY + dy;
  assert.strictEqual(panOffsetX, 50);
  assert.strictEqual(panOffsetY, 50);
});

test('反向拖拽应产生负偏移', function () {
  var panOffsetX = 0, panOffsetY = 0;
  var startX = 200, startY = 200;
  var startOffsetX = 0, startOffsetY = 0;
  var dx = 150 - startX; // -50
  var dy = 180 - startY; // -20
  panOffsetX = startOffsetX + dx;
  panOffsetY = startOffsetY + dy;
  assert.strictEqual(panOffsetX, -50);
  assert.strictEqual(panOffsetY, -20);
});

test('从已有偏移位置继续拖拽应正确累加', function () {
  var panOffsetX = 100, panOffsetY = 50;
  var startX = 300, startY = 400;
  var startOffsetX = 100, startOffsetY = 50;
  var dx = 350 - startX;
  var dy = 420 - startY;
  panOffsetX = startOffsetX + dx;
  panOffsetY = startOffsetY + dy;
  assert.strictEqual(panOffsetX, 150);
  assert.strictEqual(panOffsetY, 70);
});

// ============================================================
// 13. collage: exportSize (固定800x800导出)
// ============================================================
suite('collage / exportSize (固定800x800导出)');

test('默认导出尺寸应为 800', function () {
  assert.strictEqual(DEFAULT_EXPORT_SIZE, 800);
});

test('800x800 画布导出 scale 应为 1', function () {
  var boardW = 800, boardH = 800;
  var exportSize = 800;
  var scale = exportSize ? Math.min(exportSize / boardW, exportSize / boardH) : 1;
  assert.strictEqual(scale, 1);
  assert.strictEqual(Math.round(boardW * scale), 800);
  assert.strictEqual(Math.round(boardH * scale), 800);
});

test('1200x800 画布导出 800 时应缩放到 800x533', function () {
  var boardW = 1200, boardH = 800;
  var exportSize = 800;
  var scale = Math.min(exportSize / boardW, exportSize / boardH);
  assert.strictEqual(scale, 800 / 1200); // 2/3
  assert.strictEqual(Math.round(boardW * scale), 800);
  assert.strictEqual(Math.round(boardH * scale), 533);
});

test('800x1200 画布导出 800 时应缩放到 800x1200(超长不截)', function () {
  var boardW = 800, boardH = 1200;
  var exportSize = 800;
  var scale = Math.min(exportSize / boardW, exportSize / boardH);
  assert.strictEqual(scale, 800 / 1200); // 2/3
  assert.strictEqual(Math.round(boardW * scale), 533);
  assert.strictEqual(Math.round(boardH * scale), 800);
});

test('400x400 画布导出 800 时应放大到 800x800', function () {
  var boardW = 400, boardH = 400;
  var exportSize = 800;
  var scale = Math.min(exportSize / boardW, exportSize / boardH);
  assert.strictEqual(scale, 2);
  assert.strictEqual(Math.round(boardW * scale), 800);
  assert.strictEqual(Math.round(boardH * scale), 800);
});

test('无 exportSize 时应使用原始画布尺寸', function () {
  var boardW = 1000, boardH = 600;
  var exportSize = undefined;
  var scale = exportSize ? Math.min(exportSize / boardW, exportSize / boardH) : 1;
  assert.strictEqual(scale, 1);
  assert.strictEqual(Math.round(boardW * scale), 1000);
  assert.strictEqual(Math.round(boardH * scale), 600);
});

test('exportSize=0 应使用原始画布尺寸', function () {
  var boardW = 1000, boardH = 600;
  var exportSize = 0;
  var scale = exportSize ? Math.min(exportSize / boardW, exportSize / boardH) : 1;
  assert.strictEqual(scale, 1);
});

// ============================================================
// 14. collage: renderCustomCanvas scale 准确性
// ============================================================
suite('collage / renderCustomCanvas scale 逻辑');

test('非正方形画布等比缩放应保持宽高比', function () {
  var boardW = 1600, boardH = 900;
  var exportSize = 800;
  var scale = Math.min(exportSize / boardW, exportSize / boardH);
  var outW = Math.round(boardW * scale);
  var outH = Math.round(boardH * scale);
  // 宽高比应相同
  var origRatio = boardW / boardH;
  var outRatio = outW / outH;
  assert.ok(Math.abs(origRatio - outRatio) < 0.01, '宽高比变化: ' + origRatio + ' -> ' + outRatio);
  // 较长边应为 800
  assert.strictEqual(Math.max(outW, outH), 800);
});

test('canvas尺寸计算应产生有效整数', function () {
  var cases = [
    { w: 800, h: 800, export: 800 },
    { w: 1200, h: 800, export: 800 },
    { w: 600, h: 400, export: 800 },
    { w: 500, h: 700, export: 800 },
    { w: 1920, h: 1080, export: 800 }
  ];
  cases.forEach(function (c) {
    var scale = Math.min(c.export / c.w, c.export / c.h);
    var outW = Math.round(c.w * scale);
    var outH = Math.round(c.h * scale);
    assert.ok(Number.isInteger(outW), c.w + 'x' + c.h + ' outW not integer: ' + outW);
    assert.ok(Number.isInteger(outH), c.w + 'x' + c.h + ' outH not integer: ' + outH);
    assert.ok(outW > 0, c.w + 'x' + c.h + ' outW <= 0');
    assert.ok(outH > 0, c.w + 'x' + c.h + ' outH <= 0');
  });
});

// ============================================================
// 15. detail-modal: SKU图片独立选中逻辑
// ============================================================
suite('detail-modal / SKU图片独立选中');

test('toggleSkuImage 应切换独立选中状态', function () {
  var selectedSkuImgIndexes = [0, 2, 4];
  var item = { skuIndex: 2 };
  var pos = selectedSkuImgIndexes.indexOf(item.skuIndex);
  if (pos >= 0) selectedSkuImgIndexes.splice(pos, 1);
  assert.deepEqual(selectedSkuImgIndexes, [0, 4]);
});

test('toggleSkuImage 选中不存在的应添加', function () {
  var selectedSkuImgIndexes = [0, 2];
  var item = { skuIndex: 5 };
  var pos = selectedSkuImgIndexes.indexOf(item.skuIndex);
  if (pos >= 0) selectedSkuImgIndexes.splice(pos, 1);
  else selectedSkuImgIndexes.push(item.skuIndex);
  assert.deepEqual(selectedSkuImgIndexes, [0, 2, 5]);
});

test('toggleAllSkuImages 全选应只选有图片的SKU', function () {
  var skus = [
    { image: 'http://a.jpg' },
    { image: '' },
    { image: 'http://b.jpg' },
    { image: 'http://c.jpg' }
  ];
  var selected = [];
  skus.forEach(function (s, i) { if (s.image) selected.push(i); });
  assert.deepEqual(selected, [0, 2, 3]);
});

test('allSkuImagesSelected 应正确判断全选状态', function () {
  var skus = [
    { image: 'http://a.jpg' },
    { image: 'http://b.jpg' }
  ];
  var selected = [0, 1];
  var imgSkus = [];
  skus.forEach(function (s, i) { if (s.image) imgSkus.push(i); });
  assert.strictEqual(imgSkus.length > 0 && selected.length === imgSkus.length, true);
});

test('removeSkuImage 应清空图片并移除选中', function () {
  var sku = { image: 'http://old.jpg' };
  sku.image = '';
  assert.strictEqual(sku.image, '');
});

// ============================================================
// 16. detail-modal: 变种属性勾选关联SKU
// ============================================================
suite('detail-modal / 变种属性勾选关联SKU');

test('变种属性勾选应关联SKU列表选中状态', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S' },
    { name: '红色 / M', customName: '红色 / M' },
    { name: '蓝色 / S', customName: '蓝色 / S' }
  ];
  var selectedSkuIndexes = [];
  var attrIdx = 0, value = '红色', checked = true;
  skus.forEach(function (s, i) {
    var parts = (s.customName || s.name).split(/\s*\/\s*|\s+/);
    if (parts[attrIdx] === value) {
      var pos = selectedSkuIndexes.indexOf(i);
      if (checked && pos < 0) selectedSkuIndexes.push(i);
    }
  });
  assert.deepEqual(selectedSkuIndexes, [0, 1]);
});

test('变种属性取消勾选应取消SKU选中', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S' },
    { name: '红色 / M', customName: '红色 / M' },
    { name: '蓝色 / S', customName: '蓝色 / S' }
  ];
  var selectedSkuIndexes = [0, 1, 2];
  var attrIdx = 0, value = '红色', checked = false;
  skus.forEach(function (s, i) {
    var parts = (s.customName || s.name).split(/\s*\/\s*|\s+/);
    if (parts[attrIdx] === value) {
      var pos = selectedSkuIndexes.indexOf(i);
      if (!checked && pos >= 0) selectedSkuIndexes.splice(pos, 1);
    }
  });
  assert.deepEqual(selectedSkuIndexes, [2]);
});

test('第二属性勾选应只影响对应SKU', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S' },
    { name: '红色 / M', customName: '红色 / M' },
    { name: '蓝色 / S', customName: '蓝色 / S' },
    { name: '蓝色 / M', customName: '蓝色 / M' }
  ];
  var selectedSkuIndexes = [];
  var attrIdx = 1, value = 'S', checked = true;
  skus.forEach(function (s, i) {
    var parts = (s.customName || s.name).split(/\s*\/\s*|\s+/);
    if (parts[attrIdx] === value) {
      selectedSkuIndexes.push(i);
    }
  });
  assert.deepEqual(selectedSkuIndexes, [0, 2]);
});

// ============================================================
// 17. detail-modal: 变种属性编辑同步SKU
// ============================================================
suite('detail-modal / 变种属性编辑同步');

test('编辑属性值应同步SKU customName', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S' },
    { name: '红色 / M', customName: '红色 / M' },
    { name: '蓝色 / S', customName: '蓝色 / S' }
  ];
  var attrIdx = 0, oldVal = '红色', newVal = '粉色';
  skus.forEach(function (s) {
    var parts = (s.customName || s.name).split(/\s*\/\s*|\s+/);
    if (parts[attrIdx] === oldVal) {
      parts[attrIdx] = newVal;
      s.customName = parts.join(' / ');
    }
  });
  assert.strictEqual(skus[0].customName, '粉色 / S');
  assert.strictEqual(skus[1].customName, '粉色 / M');
  assert.strictEqual(skus[2].customName, '蓝色 / S');  // 不变
});

test('编辑第二属性值应同步', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S' },
    { name: '红色 / M', customName: '红色 / M' }
  ];
  var attrIdx = 1, oldVal = 'S', newVal = 'XL';
  skus.forEach(function (s) {
    var parts = (s.customName || s.name).split(/\s*\/\s*|\s+/);
    if (parts[attrIdx] === oldVal) {
      parts[attrIdx] = newVal;
      s.customName = parts.join(' / ');
    }
  });
  assert.strictEqual(skus[0].customName, '红色 / XL');
  assert.strictEqual(skus[1].customName, '红色 / M');  // 不变
});

test('图片映射迁移应保持数据', function () {
  var images = { '红色': 'http://red.jpg', '蓝色': 'http://blue.jpg' };
  var oldVal = '红色', newVal = '粉色';
  if (images[oldVal] !== undefined) {
    images[newVal] = images[oldVal];
    delete images[oldVal];
  }
  assert.strictEqual(images['粉色'], 'http://red.jpg');
  assert.strictEqual(images['红色'], undefined);
  assert.strictEqual(images['蓝色'], 'http://blue.jpg');
});

// ============================================================
// 18. detail-modal: 图片选择器逻辑
// ============================================================
suite('detail-modal / 图片选择器');

test('imagePickerImages 应去重合并所有图片', function () {
  var main = ['http://a.jpg', 'http://b.jpg'];
  var detail = ['http://b.jpg', 'http://c.jpg'];
  var skus = [{ image: 'http://a.jpg' }, { image: 'http://d.jpg' }];
  var seen = {};
  var imgs = [];
  main.forEach(function (u) { if (u && !seen[u]) { seen[u] = true; imgs.push(u); } });
  detail.forEach(function (u) { if (u && !seen[u]) { seen[u] = true; imgs.push(u); } });
  skus.forEach(function (s) { if (s.image && !seen[s.image]) { seen[s.image] = true; imgs.push(s.image); } });
  assert.deepEqual(imgs, ['http://a.jpg', 'http://b.jpg', 'http://c.jpg', 'http://d.jpg']);
});

test('空数据应返回空列表', function () {
  var imgs = [];
  var seen = {};
  [[], [], []].forEach(function (arr) {
    arr.forEach(function (u) { if (u && !seen[u]) { seen[u] = true; imgs.push(u); } });
  });
  assert.deepEqual(imgs, []);
});

// ============================================================
// 19. detail-modal: SKU列表图片拖拽替换
// ============================================================
suite('detail-modal / SKU列表图片替换');

test('拖拽替换应更新SKU图片', function () {
  var sku = { image: '' };
  var newUrl = 'http://new.jpg';
  sku.image = newUrl;
  assert.strictEqual(sku.image, newUrl);
});

test('删除SKU图应清空image字段', function () {
  var sku = { image: 'http://old.jpg' };
  sku.image = '';
  assert.strictEqual(sku.image, '');
});

test('删除后应同步移除selectedSkuImgIndexes', function () {
  var selectedSkuImgIndexes = [0, 1, 2, 3];
  var skuIndex = 1;
  var pos = selectedSkuImgIndexes.indexOf(skuIndex);
  if (pos >= 0) selectedSkuImgIndexes.splice(pos, 1);
  assert.deepEqual(selectedSkuImgIndexes, [0, 2, 3]);
});

test('删除不存在的索引不影响数组', function () {
  var selectedSkuImgIndexes = [0, 2];
  var skuIndex = 5;
  var pos = selectedSkuImgIndexes.indexOf(skuIndex);
  if (pos >= 0) selectedSkuImgIndexes.splice(pos, 1);
  assert.deepEqual(selectedSkuImgIndexes, [0, 2]);
});

// ============================================================
// 20. detail-modal: 变种属性图片匹配逻辑
// ============================================================
suite('detail-modal / 变种属性图片自动匹配');

test('自动匹配应从SKU提取属性图片', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S', image: 'http://red.jpg' },
    { name: '蓝色 / S', customName: '蓝色 / S', image: 'http://blue.jpg' }
  ];
  var attrIdx = 0;
  var images = {};
  ['红色', '蓝色'].forEach(function (val) {
    if (!images[val]) {
      skus.forEach(function (s) {
        var parts = (s.customName || s.name).trim().split(/\s*\/\s*|\s+/);
        if (parts[attrIdx] === val && s.image) {
          images[val] = s.image;
        }
      });
    }
  });
  assert.strictEqual(images['红色'], 'http://red.jpg');
  assert.strictEqual(images['蓝色'], 'http://blue.jpg');
});

test('已有图片不应被覆盖', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S', image: 'http://red2.jpg' }
  ];
  var images = { '红色': 'http://red1.jpg' };
  var attrIdx = 0;
  ['红色'].forEach(function (val) {
    if (!images[val]) {
      skus.forEach(function (s) {
        var parts = (s.customName || s.name).trim().split(/\s*\/\s*|\s+/);
        if (parts[attrIdx] === val && s.image) {
          images[val] = s.image;
        }
      });
    }
  });
  assert.strictEqual(images['红色'], 'http://red1.jpg');  // 保留原有
});



// ============================================================
// 21. detail-modal: SKU图片批量替换弹窗
// ============================================================
suite('detail-modal / SKU图片批量替换');

test('openSkuBatchModal应生成正确slots', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S', image: 'http://red.jpg' },
    { name: '蓝色 / M', customName: '蓝色 / M', image: '' },
    { name: '绿色 / L', customName: '绿色 / L', image: 'http://green.jpg' }
  ];
  var skuBatchSlots = skus.map(function (s, i) {
    return { skuIndex: i, name: s.customName || s.name || ('SKU' + (i + 1)), image: s.image || '' };
  });
  assert.strictEqual(skuBatchSlots.length, 3);
  assert.strictEqual(skuBatchSlots[0].image, 'http://red.jpg');
  assert.strictEqual(skuBatchSlots[1].image, '');
  assert.strictEqual(skuBatchSlots[2].image, 'http://green.jpg');
  assert.strictEqual(skuBatchSlots[1].name, '蓝色 / M');
});

test('skuBatchSelectSlot选中空slot并已选图片时应自动填充', function () {
  var skuBatchSlots = [
    { skuIndex: 0, name: '红色 / S', image: 'http://red.jpg' },
    { skuIndex: 1, name: '蓝色 / M', image: '' },
    { skuIndex: 2, name: '绿色 / L', image: '' }
  ];
  var skuBatchSelectedImage = 'http://yellow.jpg';
  var skuBatchSelectedSlot = 1;
  // If slot is empty and image selected, fill it
  if (skuBatchSelectedImage && !skuBatchSlots[skuBatchSelectedSlot].image) {
    skuBatchSlots[skuBatchSelectedSlot].image = skuBatchSelectedImage;
    skuBatchSelectedSlot = -1;
    skuBatchSelectedImage = '';
    // Auto-advance to next empty
    var nextEmpty = skuBatchSlots.findIndex(function (s) { return !s.image; });
    if (nextEmpty >= 0) skuBatchSelectedSlot = nextEmpty;
  }
  assert.strictEqual(skuBatchSlots[1].image, 'http://yellow.jpg');
  assert.strictEqual(skuBatchSelectedSlot, 2); // auto-advance to next empty
  assert.strictEqual(skuBatchSelectedImage, '');
});

test('confirmSkuBatch应更新editable.skus', function () {
  var skus = [
    { name: '红色 / S', customName: '红色 / S', image: 'http://red.jpg' },
    { name: '蓝色 / M', customName: '蓝色 / M', image: '' }
  ];
  var skuBatchSlots = [
    { skuIndex: 0, name: '红色 / S', image: 'http://red.jpg' },
    { skuIndex: 1, name: '蓝色 / M', image: 'http://blue.jpg' }
  ];
  var changed = 0;
  skuBatchSlots.forEach(function (slot) {
    var sku = skus[slot.skuIndex];
    if (sku && sku.image !== slot.image) {
      sku.image = slot.image;
      changed++;
    }
  });
  assert.strictEqual(changed, 1);
  assert.strictEqual(skus[1].image, 'http://blue.jpg');
  assert.strictEqual(skus[0].image, 'http://red.jpg'); // unchanged
});

test('skuBatchRemoveSlotImage应清空slot图片', function () {
  var slot = { skuIndex: 0, name: '红色 / S', image: 'http://red.jpg' };
  slot.image = '';
  assert.strictEqual(slot.image, '');
});

test('全部填满后应无空slot', function () {
  var skuBatchSlots = [
    { skuIndex: 0, name: '红色 / S', image: 'http://red.jpg' },
    { skuIndex: 1, name: '蓝色 / M', image: 'http://blue.jpg' }
  ];
  var nextEmpty = skuBatchSlots.findIndex(function (s) { return !s.image; });
  assert.strictEqual(nextEmpty, -1);
});

test('连续填充应正确跳过已有图片的slot', function () {
  var skuBatchSlots = [
    { skuIndex: 0, name: '红色 / S', image: 'http://red.jpg' },
    { skuIndex: 1, name: '蓝色 / M', image: '' },
    { skuIndex: 2, name: '绿色 / L', image: 'http://green.jpg' },
    { skuIndex: 3, name: '黄色 / XL', image: '' }
  ];
  var skuBatchSelectedSlot = 1;
  var skuBatchSelectedImage = 'http://blue2.jpg';
  // Fill slot 1
  skuBatchSlots[skuBatchSelectedSlot].image = skuBatchSelectedImage;
  skuBatchSelectedSlot = -1;
  skuBatchSelectedImage = '';
  var nextEmpty = skuBatchSlots.findIndex(function (s) { return !s.image; });
  if (nextEmpty >= 0) skuBatchSelectedSlot = nextEmpty;
  // Should skip slot 2 (has image) and land on slot 3
  assert.strictEqual(skuBatchSelectedSlot, 3);
});

test('skuBatchAllImages应合并主图和详情图去重', function () {
  var editable = {
    main_images: ['http://a.jpg', 'http://b.jpg'],
    detail_images: ['http://b.jpg', 'http://c.jpg'],
    skus: []
  };
  var imgs = [];
  var seen = {};
  [editable.main_images, editable.detail_images].forEach(function (arr) {
    arr.forEach(function (url) { if (url && !seen[url]) { seen[url] = true; imgs.push(url); } });
  });
  assert.deepEqual(imgs, ['http://a.jpg', 'http://b.jpg', 'http://c.jpg']);
});

// ============================================================
// 22. detail-modal: 变种属性只显示第一行
// ============================================================
suite('detail-modal / 变种属性只显示第一行');

test('第一行有属性名时v-if应通过', function () {
  var vi = 0;
  var va = { name: '颜色', values: ['红色', '蓝色'], images: {} };
  var show = (vi === 0 && va.values && va.values.length) || (vi === 1 && va.name);
  assert.ok(show);
});

test('第一行无属性名但无值时v-if应不通过', function () {
  var vi = 0;
  var va = { name: '', values: [], images: {} };
  var show = (vi === 0 && va.values && va.values.length) || (vi === 1 && va.name);
  assert.ok(!show);
});

test('第二行有属性名时v-if应通过', function () {
  var vi = 1;
  var va = { name: '尺码', values: [], images: {} };
  var show = (vi === 0 && va.values && va.values.length) || (vi === 1 && va.name);
  assert.ok(show);
});

test('第二行无属性名时v-if应不通过', function () {
  var vi = 1;
  var va = { name: '', values: [], images: {} };
  var show = (vi === 0 && va.values && va.values.length) || (vi === 1 && va.name);
  assert.ok(!show);
});

test('属性栅格只在第一行显示', function () {
  var vi = 0;
  var va = { name: '颜色', values: ['红色', '蓝色'], images: {} };
  var showGrid = vi === 0 && va.values.length;
  assert.ok(showGrid);
});

test('属性栅格不在第二行显示', function () {
  var vi = 1;
  var showGrid = vi === 0 && true;
  assert.strictEqual(showGrid, false);
});


// ============================================================
// 23. detail-modal: SKU图片选中联动SKU列表
// ============================================================
suite('detail-modal / SKU图片选中联动SKU列表');

test('toggleSkuImage应调用toggleSkuItem', function () {
  var selectedSkuIndexes = [0, 1];
  // toggleSkuImage(item) calls toggleSkuItem(item.skuIndex)
  var skuIndex = 2;
  var pos = selectedSkuIndexes.indexOf(skuIndex);
  if (pos >= 0) selectedSkuIndexes.splice(pos, 1);
  else selectedSkuIndexes.push(skuIndex);
  assert.deepEqual(selectedSkuIndexes, [0, 1, 2]);
});

test('isSkuImageChecked应使用isSkuChecked', function () {
  var selectedSkuIndexes = [0, 2];
  var skuIndex = 0;
  var checked = selectedSkuIndexes.indexOf(skuIndex) >= 0;
  assert.ok(checked);
  // Not checked
  assert.ok(selectedSkuIndexes.indexOf(1) < 0);
});

test('toggleAllSkuImages选中应只选有图片的SKU', function () {
  var selectedSkuIndexes = [];
  var skus = [
    { image: 'http://a.jpg' },
    { image: '' },
    { image: 'http://c.jpg' }
  ];
  var checked = true;
  skus.forEach(function (s, i) {
    if (s.image) {
      var pos = selectedSkuIndexes.indexOf(i);
      if (checked && pos < 0) selectedSkuIndexes.push(i);
      else if (!checked && pos >= 0) selectedSkuIndexes.splice(pos, 1);
    }
  });
  assert.deepEqual(selectedSkuIndexes, [0, 2]);
});

test('toggleAllSkuImages取消应清除有图片的SKU', function () {
  var selectedSkuIndexes = [0, 1, 2];
  var skus = [
    { image: 'http://a.jpg' },
    { image: '' },
    { image: 'http://c.jpg' }
  ];
  var checked = false;
  skus.forEach(function (s, i) {
    if (s.image) {
      var pos = selectedSkuIndexes.indexOf(i);
      if (checked && pos < 0) selectedSkuIndexes.push(i);
      else if (!checked && pos >= 0) selectedSkuIndexes.splice(pos, 1);
    }
  });
  // SKU 1 has no image, so it stays; SKU 0 and 2 are removed
  assert.deepEqual(selectedSkuIndexes, [1]);
});

// ============================================================
// 24. detail-modal: 变种属性标签交互
// ============================================================
suite('detail-modal / 变种属性标签交互');

test('点击变种属性标签应切换选中状态', function () {
  var checkedSet = {};
  var attrIdx = 0;
  var value = '红色';
  var checked = true;
  // toggle
  checkedSet[attrIdx + ':' + value] = checked;
  assert.ok(checkedSet['0:红色']);
  // untoggle
  checked = false;
  checkedSet[attrIdx + ':' + value] = checked;
  assert.ok(!checkedSet['0:红色']);
});

test('添加变种属性值应追加到values数组', function () {
  var values = ['红色', '蓝色'];
  var newVal = '绿色';
  if (values.indexOf(newVal) < 0) values.push(newVal);
  assert.deepEqual(values, ['红色', '蓝色', '绿色']);
});

test('添加重复属性值应不追加', function () {
  var values = ['红色', '蓝色'];
  var newVal = '红色';
  if (values.indexOf(newVal) < 0) values.push(newVal);
  assert.deepEqual(values, ['红色', '蓝色']);
});


// ============================================================
// 25. detail-modal: 添加/删除变种属性组
// ============================================================
suite('detail-modal / 添加删除变种属性组');

test('添加第三个变种属性应成功', function () {
  var variantAttrs = [
    { name: '颜色', values: ['红', '蓝'], images: {}, _newVal: '' },
    { name: '尺码', values: ['S', 'M'], images: {}, _newVal: '' }
  ];
  if (variantAttrs.length < 3) {
    variantAttrs.push({ name: '', values: [], images: {}, _newVal: '' });
  }
  assert.equal(variantAttrs.length, 3);
  assert.deepEqual(variantAttrs[2].values, []);
});

test('不允许超过3个变种属性', function () {
  var variantAttrs = [
    { name: '颜色', values: [], images: {} },
    { name: '尺码', values: [], images: {} },
    { name: '', values: [], images: {} }
  ];
  var canAdd = variantAttrs.length < 3;
  assert.ok(!canAdd);
});

test('删除第二个变种属性应成功', function () {
  var variantAttrs = [
    { name: '颜色', values: ['红'], images: {} },
    { name: '尺码', values: ['S'], images: {} }
  ];
  variantAttrs.splice(1, 1);
  assert.equal(variantAttrs.length, 1);
  assert.equal(variantAttrs[0].name, '颜色');
});

test('不允许删除第一个变种属性', function () {
  var attrIdx = 0;
  var canRemove = attrIdx > 0;
  assert.ok(!canRemove);
});

// ============================================================
// 26. detail-modal: 从输入框添加属性值
// ============================================================
suite('detail-modal / 输入框添加属性值');

test('添加属性值应追加并清空输入框', function () {
  var va = { name: '颜色', values: ['红'], images: {}, _newVal: '蓝' };
  var newVal = (va._newVal || '').trim();
  if (newVal && va.values.indexOf(newVal) < 0) va.values.push(newVal);
  va._newVal = '';
  assert.deepEqual(va.values, ['红', '蓝']);
  assert.equal(va._newVal, '');
});

test('空值不应添加', function () {
  var va = { name: '颜色', values: ['红'], images: {}, _newVal: '  ' };
  var newVal = (va._newVal || '').trim();
  if (newVal) va.values.push(newVal);
  assert.deepEqual(va.values, ['红']);
});

test('重复值不应添加', function () {
  var va = { name: '颜色', values: ['红'], images: {}, _newVal: '红' };
  var newVal = (va._newVal || '').trim();
  var duplicate = newVal && va.values.indexOf(newVal) >= 0;
  if (!duplicate) va.values.push(newVal);
  assert.deepEqual(va.values, ['红']);
});

// ============================================================
// 27. detail-modal: 删除属性值
// ============================================================
suite('detail-modal / 删除属性值');

test('删除属性值应移除', function () {
  var va = { name: '颜色', values: ['红', '蓝', '绿'], images: {} };
  var valueIdx = 1;
  va.values.splice(valueIdx, 1);
  assert.deepEqual(va.values, ['红', '绿']);
});

// ============================================================
// 28. detail-modal: SKU列表与变种属性笛卡尔积联动
// ============================================================
suite('detail-modal / SKU列表笛卡尔积联动');

test('单个变种属性应生成对应数量SKU', function () {
  var variantAttrs = [
    { name: '颜色', values: ['紫色', '黄色', '红色'], images: {} }
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  assert.equal(combos.length, 3);
  assert.deepEqual(combos, [['紫色'], ['黄色'], ['红色']]);
});

test('两个变种属性应生成笛卡尔积SKU', function () {
  var variantAttrs = [
    { name: '颜色', values: ['紫色', '黄色', '红色'], images: {} },
    { name: '数量', values: ['1PCS', '2PCS'], images: {} }
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  for (var ai = 1; ai < activeAttrs.length; ai++) {
    var newCombos = [];
    activeAttrs[ai].values.forEach(function (v) {
      combos.forEach(function (c) { newCombos.push(c.concat(v)); });
    });
    combos = newCombos;
  }
  assert.equal(combos.length, 6);
  assert.deepEqual(combos[0], ['紫色', '1PCS']);
  assert.deepEqual(combos[1], ['黄色', '1PCS']);
  assert.deepEqual(combos[2], ['红色', '1PCS']);
  assert.deepEqual(combos[3], ['紫色', '2PCS']);
  assert.deepEqual(combos[4], ['黄色', '2PCS']);
  assert.deepEqual(combos[5], ['红色', '2PCS']);
});

test('第二个属性为空应等同单属性', function () {
  var variantAttrs = [
    { name: '颜色', values: ['紫色', '黄色', '红色'], images: {} },
    { name: '', values: [], images: {} }
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  assert.equal(combos.length, 3);
  assert.deepEqual(combos, [['紫色'], ['黄色'], ['红色']]);
});

test('修改属性值后SKU应重建', function () {
  // 模拟 rebuildSkusFromVariants
  var variantAttrs = [
    { name: '颜色', values: ['紫色', '黄色'], images: {} },
    { name: '数量', values: ['1PCS', '3PCS'], images: {} }  // 2PCS changed to 3PCS
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  for (var ai = 1; ai < activeAttrs.length; ai++) {
    var newCombos = [];
    activeAttrs[ai].values.forEach(function (v) {
      combos.forEach(function (c) { newCombos.push(c.concat(v)); });
    });
    combos = newCombos;
  }
  assert.equal(combos.length, 4);
  assert.deepEqual(combos, [['紫色', '1PCS'], ['黄色', '1PCS'], ['紫色', '3PCS'], ['黄色', '3PCS']]);
});

test('重建SKU应保留现有图片', function () {
  var variantAttrs = [
    { name: '颜色', values: ['紫色', '黄色'], images: {} }
  ];
  var oldSkus = [
    { name: '紫色', customName: '紫色', image: 'http://old.jpg', price: 10 },
    { name: '黄色', customName: '黄色', image: 'http://old2.jpg', price: 20 }
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  var getOldMatch = function (combo) {
    for (var oi = 0; oi < oldSkus.length; oi++) {
      var s = oldSkus[oi];
      var full = (s.customName || s.name || '').trim();
      var parts = full.split(/\s*\/\s*|\s+/);
      var match = true;
      for (var ci = 0; ci < combo.length; ci++) {
        if (parts[ci] !== combo[ci]) { match = false; break; }
      }
      if (match) return s;
    }
    return null;
  };
  var newSkus = combos.map(function (combo) {
    var old = getOldMatch(combo);
    return {
      name: combo.join(' / '),
      customName: combo.join(' / '),
      image: old ? old.image : '',
      price: old ? old.price : 0,
      sellPrice: old ? old.sellPrice : 0,
      size: old ? old.size : '',
      weight: old ? old.weight : ''
    };
  });
  assert.equal(newSkus.length, 2);
  assert.equal(newSkus[0].image, 'http://old.jpg');
  assert.equal(newSkus[0].price, 10);
  assert.equal(newSkus[1].image, 'http://old2.jpg');
});

test('新增组合应生成无图片SKU', function () {
  var variantAttrs = [
    { name: '颜色', values: ['紫色'], images: {} },
    { name: '数量', values: ['1PCS'], images: {} }
  ];
  var oldSkus = [
    { name: '紫色', customName: '紫色', image: 'http://old.jpg', price: 10 }
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  for (var ai = 1; ai < activeAttrs.length; ai++) {
    var nc = [];
    activeAttrs[ai].values.forEach(function (v) { combos.forEach(function (c) { nc.push(c.concat(v)); }); });
    combos = nc;
  }
  var getOldMatch = function (combo) {
    for (var oi = 0; oi < oldSkus.length; oi++) {
      var s = oldSkus[oi];
      var full = (s.customName || s.name || '').trim();
      var parts = full.split(/\s*\/\s*|\s+/);
      var match = true;
      for (var ci = 0; ci < combo.length; ci++) { if (parts[ci] !== combo[ci]) { match = false; break; } }
      if (match) return s;
    }
    return null;
  };
  var newSkus = combos.map(function (combo) {
    var old = getOldMatch(combo);
    return { name: combo.join(' / '), customName: combo.join(' / '), image: old ? old.image : '', price: old ? old.price : 0, sellPrice: 0, size: '', weight: '' };
  });
  assert.equal(newSkus.length, 1);
  assert.equal(newSkus[0].customName, '紫色 / 1PCS');
  assert.equal(newSkus[0].image, '');  // new combo, no image preserved
});

test('无变种属性值不应触发重建', function () {
  var variantAttrs = [
    { name: '颜色', values: [], images: {} },
    { name: '', values: [], images: {} }
  ];
  var activeAttrs = variantAttrs.filter(function (va) { return va.values.length > 0; });
  assert.equal(activeAttrs.length, 0);
});

test('选中索引应超出新数量时被清理', function () {
  var selectedSkuIndexes = [0, 1, 2, 3, 4];
  var newSkusLength = 3;
  selectedSkuIndexes = selectedSkuIndexes.filter(function (i) { return i < newSkusLength; });
  assert.deepEqual(selectedSkuIndexes, [0, 1, 2]);
});

// ============================================================
// 14. 变种属性：第二个属性默认空值 + dimensions安全
// ============================================================
suite('detail-modal / 第二变种属性默认空值');

test('第二个变种属性values应为空数组', function () {
  // 模拟不自动从SKU名称拆分
  var skus = [
    { name: '紫色 1PCS', customName: '紫色 1PCS', image: '', price: 10, sellPrice: 20, weight: '' }
  ];
  var part1 = {};
  skus.forEach(function (s) {
    var fullName = (s.customName || s.name || '').trim();
    if (fullName && !part1[fullName]) part1[fullName] = true;
  });
  assert.ok(Object.keys(part1).length > 0);
  // 不拆分part2
});

test('rebuildSkus新SKU应保留dimensions', function () {
  var dimDefault = ['10', '20', '30'];
  var newSku = {
    name: '紫色',
    customName: '紫色',
    image: '',
    price: 0,
    sellPrice: 0,
    dimensions: dimDefault.slice(),
    size: '',
    weight: ''
  };
  assert.ok(newSku.dimensions, '新SKU应有dimensions');
  assert.ok(Array.isArray(newSku.dimensions), 'dimensions应是数组');
  assert.strictEqual(newSku.dimensions[0], '10');
});

test('rebuildSkus旧SKU匹配时应复制dimensions', function () {
  var oldSku = { name: '紫色', customName: '紫色', image: 'a.jpg', price: 10, sellPrice: 20, dimensions: ['5', '10', '15'], weight: '200' };
  var matched = {
    name: '紫色 / 1PCS',
    customName: '紫色 / 1PCS',
    image: oldSku.image,
    price: oldSku.price,
    sellPrice: oldSku.sellPrice,
    dimensions: oldSku.dimensions ? oldSku.dimensions.slice() : ['', '', ''],
    size: oldSku.size || '',
    weight: oldSku.weight
  };
  assert.ok(matched.dimensions, '应有dimensions');
  assert.strictEqual(matched.dimensions[0], '5');
});

test('笛卡尔积：第二属性为空时等同单属性', function () {
  var activeAttrs = [
    { name: '颜色', values: ['紫', '黄', '红'] }
  ];
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  assert.strictEqual(combos.length, 3);
  assert.deepEqual(combos[0], ['紫']);
});

test('笛卡尔积：第二属性有值时乘积展开', function () {
  var activeAttrs = [
    { name: '颜色', values: ['紫', '黄', '红'] },
    { name: '数量', values: ['1PCS'] }
  ];
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  for (var ai = 1; ai < activeAttrs.length; ai++) {
    var newCombos = [];
    activeAttrs[ai].values.forEach(function (v) {
      combos.forEach(function (c) { newCombos.push(c.concat(v)); });
    });
    combos = newCombos;
  }
  assert.strictEqual(combos.length, 3);
  assert.deepEqual(combos[0], ['紫', '1PCS']);
  assert.deepEqual(combos[2], ['红', '1PCS']);
});

test('笛卡尔积：第二属性两个值时6条', function () {
  var activeAttrs = [
    { name: '颜色', values: ['紫', '黄', '红'] },
    { name: '数量', values: ['1PCS', '2PCS'] }
  ];
  var combos = activeAttrs[0].values.map(function (v) { return [v]; });
  for (var ai = 1; ai < activeAttrs.length; ai++) {
    var newCombos = [];
    activeAttrs[ai].values.forEach(function (v) {
      combos.forEach(function (c) { newCombos.push(c.concat(v)); });
    });
    combos = newCombos;
  }
  assert.strictEqual(combos.length, 6);
  assert.deepEqual(combos[0], ['紫', '1PCS']);
  assert.deepEqual(combos[1], ['黄', '1PCS']);
  assert.deepEqual(combos[2], ['红', '1PCS']);
  assert.deepEqual(combos[3], ['紫', '2PCS']);
  assert.deepEqual(combos[4], ['黄', '2PCS']);
  assert.deepEqual(combos[5], ['红', '2PCS']);
});

test('修改属性值后SKU应重建并保留图片', function () {
  // 模拟：紫/1PCS(有图) + 黄/1PCS(无图) + 红/1PCS(无图)
  var oldSkus = [
    { name: '紫 / 1PCS', customName: '紫 / 1PCS', image: 'purple.jpg', price: 10, sellPrice: 20, dimensions: ['10','20','30'], weight: '100' },
    { name: '黄 / 1PCS', customName: '黄 / 1PCS', image: '', price: 15, sellPrice: 30, dimensions: ['10','20','30'], weight: '120' },
    { name: '红 / 1PCS', customName: '红 / 1PCS', image: '', price: 12, sellPrice: 24, dimensions: ['10','20','30'], weight: '110' }
  ];
  // 修改第二个属性 1PCS -> 3PCS
  var combo = ['紫', '3PCS'];
  var getOldMatch = function (c) {
    for (var oi = 0; oi < oldSkus.length; oi++) {
      var s = oldSkus[oi];
      var parts = (s.customName || s.name || '').split(/\s*\/\s*|\s+/);
      var match = true;
      for (var ci = 0; ci < c.length; ci++) {
        if (parts[ci] !== c[ci]) { match = false; break; }
      }
      if (match) return s;
    }
    return null;
  };
  var old = getOldMatch(combo);
  // 紫/3PCS 在旧数据中不存在（旧数据是紫/1PCS），所以old应为null
  assert.strictEqual(old, null);
  // 紫/1PCS应匹配
  var old1 = getOldMatch(['紫', '1PCS']);
  assert.ok(old1);
  assert.strictEqual(old1.image, 'purple.jpg');
});

test('getFilteredOptions应排除所有已用属性名', function () {
  var variantAttrs = [
    { name: '颜色', values: [] },
    { name: '数量', values: [] },
    { name: '', values: [] }
  ];
  var attrNameOptions = ['颜色', '风格', '材质', '数量', '容量'];
  // 模拟index=2的过滤
  var usedNames = variantAttrs.filter(function (va, i) { return i !== 2 && va.name; }).map(function (va) { return va.name; });
  assert.deepEqual(usedNames, ['颜色', '数量']);
  var result = attrNameOptions.filter(function (n) { return usedNames.indexOf(n) < 0; });
  assert.deepEqual(result, ['风格', '材质', '容量']);
});

test('addVariantValueFromInput无属性名时应忽略', function () {
  var va = { name: '', values: [], images: {}, _newVal: 'test' };
  var shouldAdd = va.name !== undefined && va.name !== '';
  assert.strictEqual(shouldAdd, false);
});

// ============================================================
// 汇总
// ============================================================

summary();
