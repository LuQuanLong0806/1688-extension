// 最小验证：VLM 检测徽章/水印 + 自动 mask + inpaint 全流程
// 用法：node scripts/verify-badge-remove.js <图片路径...>
// 输出：scripts/out/<原文件名>.{original,cleaned,overlay}.png + .regions.json
var fs = require('fs');
var path = require('path');
var sharp = require('sharp');

var files = process.argv.slice(2);
if (!files.length) {
  console.error('用法: node verify-badge-remove.js <图片路径...>');
  process.exit(1);
}

var OUT_DIR = path.join(__dirname, 'out');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

var DILATE_PX = 20;  // 和 API 调用保持一致

// 把检测区域 + 外扩可视化叠在原图上（红色半透明 + 框线）
async function drawOverlay(origBuf, regions, dilatePx) {
  var img = sharp(origBuf);
  var meta = await img.metadata();
  var W = meta.width, H = meta.height;
  var shapes = '';
  for (var i = 0; i < regions.length; i++) {
    var r = regions[i];
    var ex = Math.max(0, (r.x || 0) - dilatePx);
    var ey = Math.max(0, (r.y || 0) - dilatePx);
    var ew = (r.width || 0) + dilatePx * 2;
    var eh = (r.height || 0) + dilatePx * 2;
    // 半透明红填充（模拟实际 mask 覆盖范围）
    shapes += '<rect x="' + ex + '" y="' + ey + '" width="' + ew + '" height="' + eh +
      '" fill="rgba(255,0,0,0.45)" stroke="red" stroke-width="2" />';
    // 标注序号
    shapes += '<text x="' + (ex + 4) + '" y="' + (ey + 16) +
      '" font-size="14" fill="yellow" font-weight="bold">' + i + '</text>';
  }
  var svg = '<svg width="' + W + '" height="' + H + '">' + shapes + '</svg>';
  return await sharp(origBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0, blend: 'over' }])
    .png()
    .toBuffer();
}

function runOne(file) {
  return new Promise(function (resolve) {
    var buf = fs.readFileSync(file);
    var b64 = 'data:image/png;base64,' + buf.toString('base64');
    var body = JSON.stringify({
      image_base64: b64,
      chinese_only: true,  // 对齐生产：只去中文，保留尺寸数字字母（24cm 等）
      enable_vision: true,
      enable_badge_vision: true,
      dilate_px: DILATE_PX
    });
    var t0 = Date.now();
    fetch('http://localhost:3000/api/ai/auto-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-call': '1' },
      body: body
    }).then(function (r) { return r.json(); }).then(function (d) {
      var elapsed = Date.now() - t0;
      if (d.error) { console.log('[FAIL]', file, d.error); return resolve(null); }
      var base = path.basename(file, path.extname(file));
      fs.copyFileSync(file, path.join(OUT_DIR, base + '.original.png'));
      if (d.cleaned && d.image_base64) {
        fs.writeFileSync(path.join(OUT_DIR, base + '.cleaned.png'),
          Buffer.from(d.image_base64, 'base64'));
      }
      var regions = d.regions || [];
      // 渲染 mask 叠加图（直观看到 mask 覆盖到哪了）
      drawOverlay(buf, regions, DILATE_PX).then(function (overlayBuf) {
        fs.writeFileSync(path.join(OUT_DIR, base + '.overlay.png'), overlayBuf);
        var summary = {
          file: base,
          cleaned: !!d.cleaned,
          elapsed_ms: elapsed,
          ocr_regions: d.ocrCount,
          vision_regions: d.visionCount,
          badge_vision_regions: (d.badgeVisionRegions || []).length,
          total_regions: d.regionCount,
          region_details: regions.map(function (r, i) {
            return { idx: i, x: r.x, y: r.y, w: r.width, h: r.height,
              source: r._visionExpanded ? 'vision-expanded' : (r._badgeExpanded ? 'badge-expanded' : 'ocr/raw') };
          })
        };
        fs.writeFileSync(path.join(OUT_DIR, base + '.regions.json'),
          JSON.stringify(summary, null, 2));
        console.log('[OK]', base, 'regions:', regions.length, 'elapsed:', elapsed + 'ms');
        resolve(summary);
      });
    }).catch(function (e) { console.log('[ERR]', file, e.message); resolve(null); });
  });
}

(async function () {
  for (var i = 0; i < files.length; i++) {
    await runOne(files[i]);
  }
  console.log('---');
  console.log('输出目录:', OUT_DIR);
})();

