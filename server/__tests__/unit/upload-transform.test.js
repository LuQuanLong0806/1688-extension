// upload-transform.test.js — sharp 转码服务测试
const sharp = require('sharp');
const transform = require('../../services/upload-transform');

// 生成测试用 PNG buffer
async function makePng(width, height, opts) {
  opts = opts || {};
  var channels = opts.alpha ? 4 : 3;
  var background = opts.background || { r: 255, g: 100, b: 50 };
  var buf = await sharp({
    create: { width: width, height: height, channels: channels, background: background }
  }).png().toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
}

async function makeJpeg(width, height) {
  var buf = await sharp({
    create: { width: width, height: height, channels: 3, background: { r: 50, g: 100, b: 200 } }
  }).jpeg().toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

async function makeGif() {
  // sharp 不直接生成 GIF，用 1x1 gif magic bytes
  var gif = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');
  return 'data:image/gif;base64,' + gif.toString('base64');
}

function baseCfg(overrides) {
  return Object.assign({
    upload_max_bytes: 10485760,
    upload_max_pixels: 64000000,
    upload_format_convert: 'auto',
    upload_convert_threshold_bytes: 1048576,
    upload_convert_threshold_pixels: 4000000,
    upload_webp_quality: 85,
    upload_mime_whitelist: 'png,jpeg,webp,gif,bmp',
    upload_strip_exif: 'off'
  }, overrides || {});
}

describe('upload-transform 服务', () => {
  describe('parseBase64', () => {
    test('解析 data URL 头', () => {
      var r = transform.parseBase64('data:image/png;base64,AAAA');
      expect(r.mime).toBe('image/png');
      expect(r.ext).toBe('png');
      expect(Buffer.isBuffer(r.buffer)).toBe(true);
    });

    test('解析 jpeg MIME', () => {
      var r = transform.parseBase64('data:image/jpeg;base64,AAAA');
      expect(r.mime).toBe('image/jpeg');
      expect(r.ext).toBe('jpeg');
    });

    test('裸 base64 按 png 处理', () => {
      var r = transform.parseBase64('AAAA');
      expect(r.mime).toBe('image/png');
    });

    test('无效输入返回 null', () => {
      expect(transform.parseBase64('')).toBeNull();
      expect(transform.parseBase64(null)).toBeNull();
      expect(transform.parseBase64(undefined)).toBeNull();
      expect(transform.parseBase64('!@#$%')).toBeNull();
    });
  });

  describe('checkSkip', () => {
    test('GIF 保留', () => {
      expect(transform.checkSkip({ mime: 'image/gif' }, {})).toBe('gif_preserved');
    });

    test('已是 webp 不再转', () => {
      expect(transform.checkSkip({ mime: 'image/webp' }, {})).toBe('already_webp');
    });

    test('PNG 有 alpha 通道保留', () => {
      expect(transform.checkSkip({ mime: 'image/png' }, { hasAlpha: true })).toBe('png_alpha_preserved');
    });

    test('PNG 无 alpha 不跳过', () => {
      expect(transform.checkSkip({ mime: 'image/png' }, { hasAlpha: false })).toBeNull();
    });

    test('JPEG 不跳过', () => {
      expect(transform.checkSkip({ mime: 'image/jpeg' }, { hasAlpha: false })).toBeNull();
    });
  });

  describe('maybeTransform', () => {
    test('关闭转码 → 返回原图', async () => {
      var png = await makePng(5000, 5000);
      var r = await transform.maybeTransform(png, baseCfg({ upload_format_convert: 'off' }));
      expect(r.converted).toBe(false);
      expect(r.skipReason).toBe('convert_off');
      expect(r.mime).toBe('image/png');
    });

    test('像素超限 → reject', async () => {
      var png = await makePng(9000, 9000); // 8100 万 > 6400 万
      await expect(transform.maybeTransform(png, baseCfg({ upload_max_pixels: 64000000 })))
        .rejects.toThrow(/像素超过上限/);
    });

    test('低于阈值 → 不转', async () => {
      var png = await makePng(100, 100);
      var r = await transform.maybeTransform(png, baseCfg());
      expect(r.converted).toBe(false);
      expect(r.skipReason).toBe('below_threshold');
    });

    test('GIF 即使超阈值也保留', async () => {
      var gif = await makeGif();
      var r = await transform.maybeTransform(gif, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1
      }));
      expect(r.converted).toBe(false);
      expect(r.skipReason).toBe('gif_preserved');
      expect(r.mime).toBe('image/gif');
    });

    test('PNG 有 alpha 即使超阈值也保留', async () => {
      var png = await makePng(3000, 3000, { alpha: true });
      var r = await transform.maybeTransform(png, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1
      }));
      expect(r.converted).toBe(false);
      expect(r.skipReason).toBe('png_alpha_preserved');
    });

    test('PNG 无 alpha 超阈值 → 转 webp', async () => {
      var png = await makePng(3000, 3000);
      var r = await transform.maybeTransform(png, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1,
        upload_webp_quality: 85
      }));
      expect(r.converted).toBe(true);
      expect(r.mime).toBe('image/webp');
      expect(r.ext).toBe('webp');

      // 验证走的是 lossless 路径（PNG 不降画质）
      var meta = await sharp(r.buffer).metadata();
      expect(meta.format).toBe('webp');
      // sharp 不直接暴露 webp 是否 lossless，但可以验证转换后能解码出原始尺寸
      expect(meta.width).toBe(3000);
      expect(meta.height).toBe(3000);
    });

    test('PNG 转 webp 是无损的（解码后像素与原图一致）', async () => {
      // 用伪随机像素直接构造 RGB buffer（确保 channels=3 无 alpha，跳过 png_alpha_preserved）
      // 高熵内容 PNG 压缩率差，webp lossless 必然更小（避免触发"转换后变大回退"）
      var W = 256, H = 256;
      var raw = Buffer.alloc(W * H * 3);
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var idx = (y * W + x) * 3;
          // 简单 LCG 伪随机：种子依赖坐标，生成难以压缩的高熵像素
          var s = (x * 2654435761 + y * 40503 + x * y * 17) >>> 0;
          raw[idx] = (s ^ (s >>> 8)) & 0xff;
          raw[idx + 1] = (s ^ (s >>> 16)) & 0xff;
          raw[idx + 2] = (s ^ (s >>> 24)) & 0xff;
        }
      }
      var rawBuf = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
      var png = 'data:image/png;base64,' + rawBuf.toString('base64');

      var r = await transform.maybeTransform(png, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1
      }));
      expect(r.converted).toBe(true);

      // 像素级对比：lossless 解码后每个像素必须与原图完全一致
      var origRaw = await sharp(rawBuf).raw().toBuffer();
      var newRaw = await sharp(r.buffer).raw().toBuffer();
      expect(newRaw.length).toBe(origRaw.length);
      var mismatches = 0;
      for (var i = 0; i < origRaw.length; i++) {
        if (origRaw[i] !== newRaw[i]) mismatches++;
      }
      expect(mismatches).toBe(0);
    });

    test('JPEG 超阈值 → 转 webp', async () => {
      var jpg = await makeJpeg(3000, 3000);
      var r = await transform.maybeTransform(jpg, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1
      }));
      expect(r.converted).toBe(true);
      expect(r.mime).toBe('image/webp');
    });

    test('转换后比原图大 → 回退原图', async () => {
      // 极小图，sharp 转 webp 后元数据开销可能比 PNG 大
      var png = await makePng(2, 2);
      var r = await transform.maybeTransform(png, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1
      }));
      // 极小图转码后通常会更大，触发回退
      expect(r.converted).toBe(false);
      expect(['larger_after_convert', 'below_threshold']).toContain(r.skipReason);
    });

    test('strip_exif=off 时保留 metadata', async () => {
      // 构造带 EXIF 的 JPEG
      var buf = await sharp({
        create: { width: 1000, height: 1000, channels: 3, background: 'red' }
      }).jpeg().withMetadata({
        exif: {
          IFD0: { Make: 'TestCamera', Model: 'TestModel' }
        }
      }).toBuffer();
      var jpg = 'data:image/jpeg;base64,' + buf.toString('base64');

      // strip_exif=off → 转 webp 时 withMetadata 保留
      var r = await transform.maybeTransform(jpg, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1,
        upload_strip_exif: 'off'
      }));
      if (r.converted) {
        var meta = await sharp(r.buffer).metadata();
        expect(meta.exif).toBeTruthy(); // 有 EXIF 字节
      }
    });

    test('strip_exif=on 时丢 EXIF', async () => {
      var buf = await sharp({
        create: { width: 1000, height: 1000, channels: 3, background: 'red' }
      }).jpeg().withMetadata({
        exif: { IFD0: { Make: 'TestCamera' } }
      }).toBuffer();
      var jpg = 'data:image/jpeg;base64,' + buf.toString('base64');

      var r = await transform.maybeTransform(jpg, baseCfg({
        upload_convert_threshold_bytes: 1,
        upload_convert_threshold_pixels: 1,
        upload_strip_exif: 'on'
      }));
      if (r.converted) {
        var meta = await sharp(r.buffer).metadata();
        expect(meta.exif).toBeFalsy();
      }
    });
  });
});
