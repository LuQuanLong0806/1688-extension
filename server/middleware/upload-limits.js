// 上传限制中间件
//   preCheck          — 同步预检：MIME 白名单 + 字节上限（早失败）
//   transformHandler  — 异步深度校验：像素上限 + sharp 转码

var config = require('../services/upload-config');
var transform = require('../services/upload-transform');

function parseMime(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  var m = dataUrl.match(/^data:(image\/[\w.+-]+);/i);
  if (m) return m[1].toLowerCase();
  // 兼容裸 base64（无 data URL 头），按 png 处理
  if (/^[A-Za-z0-9+/=\s]+$/.test(dataUrl)) return 'image/png';
  return null;
}

function estimateBytes(dataUrl) {
  if (!dataUrl) return 0;
  var commaIdx = dataUrl.indexOf(',');
  var b64 = commaIdx >= 0 ? dataUrl.substring(commaIdx + 1) : dataUrl;
  // base64 解码后约 = 长度 * 3/4（去掉 padding）
  return Math.floor(b64.replace(/\s/g, '').length * 0.75);
}

// 同步预检：MIME 白名单 + 字节上限
function preCheck(req, res, next) {
  var cfg = config.get();
  var dataUrl = req.body && req.body.image_base64;

  if (!dataUrl) return res.status(400).json({ error: '请先加载图片' });

  var mime = parseMime(dataUrl);
  if (!mime) return res.status(400).json({ error: '无法识别的图片格式' });

  var whitelist = (cfg.upload_mime_whitelist || '')
    .split(',')
    .map(function (s) { return ('image/' + s.trim()).toLowerCase(); })
    .filter(Boolean);

  if (whitelist.length && whitelist.indexOf(mime) === -1) {
    return res.status(400).json({ error: '不支持的图片格式: ' + mime });
  }

  var bytes = estimateBytes(dataUrl);
  if (bytes > cfg.upload_max_bytes) {
    var mb = (cfg.upload_max_bytes / 1048576).toFixed(1);
    return res.status(413).json({ error: '图片超过最大尺寸 ' + mb + 'M（当前约 ' + (bytes / 1048576).toFixed(1) + 'M）' });
  }

  next();
}

// 异步：像素上限 + sharp 转码。失败不阻塞上传（回退原图），仅像素超限拒绝
function transformHandler(req, res, next) {
  var cfg = config.get();
  var dataUrl = req.body.image_base64;

  transform.maybeTransform(dataUrl, cfg).then(function (result) {
    if (result.converted) {
      console.log('[上传] 转码 webp:', result.originalSize + 'B →', result.convertedSize + 'B');
    } else if (result.skipReason && result.skipReason !== 'convert_off') {
      console.log('[上传] 跳过转码:', result.skipReason);
    }
    req._uploadTransformed = result;
    next();
  }).catch(function (err) {
    var msg = err.message || '';
    if (msg.indexOf('像素超过上限') !== -1) {
      return res.status(413).json({ error: msg });
    }
    // 转码失败 → 回退原图，不阻塞上传
    console.warn('[上传] 转码失败，使用原图:', msg);
    req._uploadTransformed = null;
    next();
  });
}

module.exports = {
  preCheck: preCheck,
  transformHandler: transformHandler,
  _parseMime: parseMime,
  _estimateBytes: estimateBytes
};
