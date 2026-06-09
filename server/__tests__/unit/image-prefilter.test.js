// image-prefilter.test.js — 图片本地预筛模块测试
const prefilter = require('../../services/image-prefilter');
const sharp = require('sharp');

async function makeImageBuffer(opts) {
  var w = opts.width || 800;
  var h = opts.height || 800;
  // Create noisy image to ensure file > 5KB and non-uniform
  var raw = Buffer.alloc(w * h * 3);
  for (var i = 0; i < raw.length; i++) {
    raw[i] = (i * 37 + opts.seed * 13) & 0xFF;
  }
  return await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 80 }).toBuffer();
}

describe('Image Prefilter', () => {
  test('passes normal images through', async () => {
    var buf = await makeImageBuffer({ width: 800, height: 800, seed: 1 });
    var result = await prefilter.prefilterImages([{ url: 'a.jpg', buffer: buf }]);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('a.jpg');
  });

  test('filters out images smaller than 300px wide', async () => {
    var buf = await makeImageBuffer({ width: 200, height: 800, seed: 2 });
    var result = await prefilter.prefilterImages([{ url: 'small.jpg', buffer: buf }]);
    expect(result).toHaveLength(0);
  });

  test('filters out images smaller than 300px tall', async () => {
    var buf = await makeImageBuffer({ width: 800, height: 200, seed: 3 });
    var result = await prefilter.prefilterImages([{ url: 'short.jpg', buffer: buf }]);
    expect(result).toHaveLength(0);
  });

  test('filters out extreme aspect ratio (banner)', async () => {
    var buf = await makeImageBuffer({ width: 1200, height: 200, seed: 4 });
    var result = await prefilter.prefilterImages([{ url: 'banner.jpg', buffer: buf }]);
    expect(result).toHaveLength(0);
  });

  test('filters out tiny file size (< 5KB)', async () => {
    var result = await prefilter.prefilterImages([{ url: 'tiny.jpg', buffer: Buffer.alloc(100) }]);
    expect(result).toHaveLength(0);
  });

  test('filters null entries', async () => {
    var result = await prefilter.prefilterImages([null, undefined, { url: 'x', buffer: null }]);
    expect(result).toHaveLength(0);
  });

  test('removes duplicate images via dhash', async () => {
    var buf = await makeImageBuffer({ width: 400, height: 400, seed: 5 });
    var result = await prefilter.prefilterImages([
      { url: 'dup1.jpg', buffer: buf },
      { url: 'dup2.jpg', buffer: Buffer.from(buf) }
    ]);
    expect(result).toHaveLength(1);
  });

  test('keeps visually different images', async () => {
    var buf1 = await makeImageBuffer({ width: 400, height: 400, seed: 10 });
    var buf2 = await makeImageBuffer({ width: 400, height: 400, seed: 20 });
    var result = await prefilter.prefilterImages([
      { url: 'img1.jpg', buffer: buf1 },
      { url: 'img2.jpg', buffer: buf2 }
    ]);
    expect(result).toHaveLength(2);
  });

  test('returns empty array for empty input', async () => {
    var result = await prefilter.prefilterImages([]);
    expect(result).toHaveLength(0);
  });
});
