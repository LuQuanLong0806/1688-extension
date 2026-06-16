// 上传图片转码服务 — 双阈值触发 + 智能跳过 + sharp 转 webp
//
// 流程：
//   1. 解析 base64 头 → mime/buffer
//   2. sharp 读 metadata → 校验像素上限
//   3. 智能跳过：GIF / 已是 webp / 带 alpha 的 PNG
//   4. 双阈值：字节 ≥ 1M 或像素 ≥ 400万 → 触发转码
//   5. 分格式策略（电商场景保护设计稿画质）：
//      - PNG → webp lossless（无损，保留文字/色块/锐利边缘）
//      - JPEG/BMP/TIFF → webp 有损（quality=85，压缩率高）
//   6. 转换后比原图大则回退原图
//   7. EXIF：strip_exif=off 时 withMetadata() 保留

var sharp = require('sharp');

function parseBase64(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  var m = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/i);
  if (m) {
    var mime = m[1].toLowerCase();
    var ext = mime.split('/')[1];
    return { mime: mime, ext: ext, buffer: Buffer.from(m[2], 'base64') };
  }
  // 兼容裸 base64（无 data URL 头）
  if (/^[A-Za-z0-9+/=\s]+$/.test(dataUrl)) {
    return { mime: 'image/png', ext: 'png', buffer: Buffer.from(dataUrl, 'base64') };
  }
  return null;
}

function checkSkip(parsed, meta) {
  if (parsed.mime === 'image/gif') return 'gif_preserved';
  if (parsed.mime === 'image/webp') return 'already_webp';
  if (parsed.mime === 'image/png' && meta.hasAlpha) return 'png_alpha_preserved';
  return null;
}

function maybeTransform(dataUrl, cfg) {
  return new Promise(function (resolve, reject) {
    var parsed = parseBase64(dataUrl);
    if (!parsed) return reject(new Error('无效的图片数据'));

    sharp(parsed.buffer).metadata().then(function (meta) {
      // 像素上限检查（无论是否转码都查）
      var pixels = (meta.width || 0) * (meta.height || 0);
      if (pixels > cfg.upload_max_pixels) {
        return reject(new Error('像素超过上限：' + pixels + ' > ' + cfg.upload_max_pixels));
      }

      // 转码关闭 → 直接返回原图
      if (cfg.upload_format_convert === 'off') {
        return resolve({ buffer: parsed.buffer, mime: parsed.mime, ext: parsed.ext, converted: false, skipReason: 'convert_off' });
      }

      // 智能跳过
      var skipReason = checkSkip(parsed, meta);
      if (skipReason) {
        return resolve({ buffer: parsed.buffer, mime: parsed.mime, ext: parsed.ext, converted: false, skipReason: skipReason });
      }

      // 双阈值（字节 OR 像素）
      var bytesOver = parsed.buffer.length >= cfg.upload_convert_threshold_bytes;
      var pixelsOver = pixels >= cfg.upload_convert_threshold_pixels;
      if (!bytesOver && !pixelsOver) {
        return resolve({ buffer: parsed.buffer, mime: parsed.mime, ext: parsed.ext, converted: false, skipReason: 'below_threshold' });
      }

      // 执行转码 — 分格式策略
      // PNG 走无损 webp（电商设计稿常见，不能降画质）
      // JPEG/BMP/TIFF 走有损 webp（按用户配置 quality，原格式本就有损）
      var t = sharp(parsed.buffer);
      if (cfg.upload_strip_exif === 'off') t = t.withMetadata();
      if (parsed.mime === 'image/png') {
        t = t.webp({ lossless: true });
      } else {
        t = t.webp({ quality: cfg.upload_webp_quality });
      }

      t.toBuffer(function (err, output) {
        if (err) return reject(new Error('转码失败: ' + err.message));
        // 转换后比原图还大 → 回退原图
        if (output.length >= parsed.buffer.length) {
          return resolve({
            buffer: parsed.buffer, mime: parsed.mime, ext: parsed.ext, converted: false,
            skipReason: 'larger_after_convert'
          });
        }
        resolve({
          buffer: output, mime: 'image/webp', ext: 'webp', converted: true,
          originalSize: parsed.buffer.length, convertedSize: output.length
        });
      });
    }).catch(function (err) {
      reject(new Error('图片解析失败: ' + err.message));
    });
  });
}

module.exports = {
  parseBase64: parseBase64,
  checkSkip: checkSkip,
  maybeTransform: maybeTransform
};
