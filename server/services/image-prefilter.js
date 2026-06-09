/**
 * 图片本地预筛模块
 *
 * 在调 AI 之前用 sharp 快速过滤低质量图片，零 API 成本：
 * - 尺寸 < 300px → 排除（缩略图/icon）
 * - 宽高比 > 3:1 → 排除（横幅/侧栏）
 * - 文件 < 5KB → 排除（占位图）
 * - dhash 感知哈希去重（9×8灰度 → 64bit hash → Hamming距离 < 5 视为重复）
 */
var sharp = require('sharp');

var MIN_DIM = 300;
var MAX_RATIO = 3;
var MIN_SIZE = 5120; // 5KB
var DHASH_THRESHOLD = 5;

async function computeDhash(buffer) {
  var gray = await sharp(buffer)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  var hash = new Array(64);
  for (var row = 0; row < 8; row++) {
    for (var col = 0; col < 8; col++) {
      hash[row * 8 + col] = gray[row * 9 + col] > gray[row * 9 + col + 1] ? 1 : 0;
    }
  }
  return hash;
}

function hammingDistance(h1, h2) {
  var dist = 0;
  for (var i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) dist++;
  }
  return dist;
}

/**
 * 预筛图片数组
 * @param {Array<{url:string, buffer:Buffer}>} images
 * @returns {Promise<Array<{url:string, buffer:Buffer}>>}
 */
async function prefilterImages(images) {
  var kept = [];
  for (var i = 0; i < images.length; i++) {
    var item = images[i];
    if (!item) continue;
    var buf = item.buffer;
    if (!buf || buf.length < MIN_SIZE) continue;
    try {
      var meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) continue;
      if (meta.width < MIN_DIM || meta.height < MIN_DIM) continue;
      var ratio = meta.width / meta.height;
      if (ratio > MAX_RATIO || ratio < 1 / MAX_RATIO) continue;
      kept.push(item);
    } catch (e) {
      // 无法读取元数据，跳过
    }
  }

  // dhash 去重
  if (kept.length <= 1) return kept;
  var hashes = [];
  for (var j = 0; j < kept.length; j++) {
    try {
      hashes.push(await computeDhash(kept[j].buffer));
    } catch (e) {
      hashes.push(null);
    }
  }
  var excluded = {};
  for (var a = 0; a < kept.length; a++) {
    if (excluded[a]) continue;
    for (var b = a + 1; b < kept.length; b++) {
      if (excluded[b] || !hashes[a] || !hashes[b]) continue;
      if (hammingDistance(hashes[a], hashes[b]) < DHASH_THRESHOLD) {
        excluded[b] = true;
      }
    }
  }
  return kept.filter(function (_, idx) { return !excluded[idx]; });
}

module.exports = { prefilterImages: prefilterImages };
