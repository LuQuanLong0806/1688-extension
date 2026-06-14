// AI 图片生成 — 文生图/图生图/白底图/画质增强 + ImgBB图床
const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

var auth = require('../../middleware/auth');
var providers = require('./providers');

// 全局守卫：图片生成端点至少 operator+
router.use(auth.requireRole('operator', 'admin'));

var UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');

// 下载图片到本地uploads
function downloadToUploads(imageUrl, cropWatermark) {
  return new Promise(function (resolve, reject) {
    var filename = 'ai_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
    var filepath = path.join(UPLOADS_DIR, filename);
    var ws = fs.createWriteStream(filepath);

    var proto = imageUrl.startsWith('https') ? https : http;
    proto.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadToUploads(res.headers.location, cropWatermark).then(resolve).catch(reject);
        return;
      }
      if (!cropWatermark) {
        res.pipe(ws);
        ws.on('finish', function () { resolve('/uploads/' + filename); });
        ws.on('error', reject);
        return;
      }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var buf = Buffer.concat(chunks);
        fs.writeFile(filepath, buf, function (err) {
          if (err) return reject(err);
          resolve('/uploads/' + filename);
        });
      });
    }).on('error', function (e) {
      fs.unlink(filepath, function () {});
      reject(e);
    });
  });
}

// ===== 文生图 =====
router.post('/text-to-image', function (req, res) {
  var prompt = req.body.prompt;
  var size = req.body.size || '1024x1024';
  var model = req.body.model || 'cogview-3-flash';

  if (!prompt || !prompt.trim()) return res.status(400).json({ error: '请输入图片描述' });

  providers.imageGenLLMRequest('/images/generations', {
    model: model,
    prompt: prompt.trim(),
    size: size
  }).then(function (result) {
    var url = result.data && result.data[0] && result.data[0].url;
    if (!url) return res.status(502).json({ error: '未返回图片URL' });
    return downloadToUploads(url).then(function (localUrl) {
      res.json({ ok: true, url: localUrl });
    });
  }).catch(function (err) {
    console.error('[AI文生图失败]', err.message);
    res.status(502).json({ error: err.message });
  });
});

// ===== 图生图 =====
router.post('/image-to-image', function (req, res) {
  var prompt = req.body.prompt;
  var imageBase64 = req.body.image_base64;
  var size = req.body.size || '1024x1024';

  if (!prompt || !prompt.trim()) return res.status(400).json({ error: '请输入图片描述' });
  if (!imageBase64) return res.status(400).json({ error: '请先上传参考图' });

  providers.imageGenLLMRequest('/images/generations', {
    model: 'cogview-4',
    prompt: prompt.trim(),
    image: imageBase64,
    size: size
  }).then(function (result) {
    var url = result.data && result.data[0] && result.data[0].url;
    if (!url) return res.status(502).json({ error: '未返回图片URL' });
    return downloadToUploads(url).then(function (localUrl) {
      res.json({ ok: true, url: localUrl });
    });
  }).catch(function (err) {
    console.error('[AI图生图失败]', err.message);
    res.status(502).json({ error: err.message });
  });
});

// ===== AI白底图（CogView-4 图生图）=====
router.post('/white-bg', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  console.log('[AI白底] 开始生成...');
  var t0 = Date.now();

  providers.imageGenLLMRequest('/images/generations', {
    model: 'cogview-4',
    prompt: 'A high quality e-commerce product photo on a pure white background. The product is exactly the same as in the reference image, centered, well-lit, professional studio photography, clean and crisp white background.',
    image: imageBase64,
    size: '1024x1024'
  }).then(function (result) {
    var url = result.data && result.data[0] && result.data[0].url;
    if (!url) return res.status(502).json({ error: '未返回图片' });
    return downloadToUploads(url).then(function (localUrl) {
      console.log('[AI白底] 完成, 耗时:', Date.now() - t0, 'ms');
      res.json({ ok: true, url: localUrl });
    });
  }).catch(function (err) {
    console.error('[AI白底失败]', err.message);
    res.status(502).json({ error: err.message });
  });
});

// ===== AI画质增强（CogView-4 图生图）=====
router.post('/enhance', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  console.log('[AI增强] 开始...');
  var t0 = Date.now();

  providers.imageGenLLMRequest('/images/generations', {
    model: 'cogview-4',
    prompt: 'Enhance this image to higher quality: sharper details, better lighting, more vivid colors, professional photography quality. Keep all content and composition exactly the same.',
    image: imageBase64,
    size: '1024x1024'
  }).then(function (result) {
    var url = result.data && result.data[0] && result.data[0].url;
    if (!url) return res.status(502).json({ error: '未返回图片' });
    return downloadToUploads(url).then(function (localUrl) {
      console.log('[AI增强] 完成, 耗时:', Date.now() - t0, 'ms');
      res.json({ ok: true, url: localUrl });
    });
  }).catch(function (err) {
    console.error('[AI增强失败]', err.message);
    res.status(502).json({ error: err.message });
  });
});

// ===== 图片上传（统一入口: OSS 优先 > ImgBB 兜底）=====
var sec = require('../../crypto');
var imgbbUpload = require('../../services/imgbb-upload');

function getImgbbKey() {
  return imgbbUpload.getImgbbKey();
}

// 统一上传接口
router.post('/image-upload', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  imgbbUpload.uploadToImgBB(imageBase64, {
    name: req.body.name || ''
  }).then(function (result) {
    res.json(result);
  }).catch(function (err) {
    res.status(502).json({ error: err.message });
  });
});

// 旧接口兼容: 直接复用上传逻辑
router.post('/smms-upload', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });
  imgbbUpload.uploadToImgBB(imageBase64, { name: req.body.name || '' })
    .then(function (result) { res.json(result); })
    .catch(function (err) { res.status(502).json({ error: err.message }); });
});

router.get('/smms-token', function (req, res) {
  var key = getImgbbKey();
  if (!key) return res.json({ configured: false, masked: '', label: '' });
  var masked = key.length > 8 ? key.substring(0, 4) + '****' + key.substring(key.length - 4) : '****';
  var db = require('../../db');
  var row = db.getOne('SELECT value FROM settings WHERE key = ?', ['imgbb_api_key_label']);
  var label = (row && row.value) || '';
  res.json({ configured: true, masked: masked, label: label });
});

router.post('/smms-token', function (req, res) {
  var key = (req.body.token || '').trim();
  var label = (req.body.label || '').trim();
  var labelOnly = req.body.labelOnly === true;
  if (!key && !labelOnly) return res.status(400).json({ error: 'API Key 不能为空' });
  try {
    var db = require('../../db');
    if (key && !labelOnly) {
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('imgbb_api_key', ?)", [sec.encrypt(key)]);
    }
    if (req.body.label !== undefined) {
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('imgbb_api_key_label', ?)", [label]);
    }
    db.scheduleSave();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

router.post('/smms-token-delete', function (req, res) {
  try {
    var db = require('../../db');
    db.run("DELETE FROM settings WHERE key = 'imgbb_api_key'");
    db.run("DELETE FROM settings WHERE key = 'imgbb_api_key_label'");
    db.scheduleSave();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ===== 阿里云 OSS 配置 =====
router.get('/oss-config', function (req, res) {
  var oss = require('../../services/oss-upload');
  var config = oss.getOssConfig();
  if (!config) return res.json({ configured: false, masked: '', label: '' });
  var masked = config.accessKeyId.substring(0, 4) + '****' + config.accessKeyId.substring(config.accessKeyId.length - 4);
  res.json({
    configured: true,
    masked: masked,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint || '',
    label: config.label || ''
  });
});

router.post('/oss-config', function (req, res) {
  var db = require('../../db');
  var label = (req.body.label || '').trim();
  var labelOnly = req.body.labelOnly === true;

  if (labelOnly) {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_config_label', ?)", [label]);
    db.scheduleSave();
    return res.json({ ok: true });
  }

  var ak = (req.body.accessKeyId || '').trim();
  var sk = (req.body.accessKeySecret || '').trim();
  var bucket = (req.body.bucket || '').trim();
  var region = (req.body.region || '').trim();
  var endpoint = (req.body.endpoint || '').trim();

  if (!ak || !sk || !bucket || !region) {
    return res.status(400).json({ error: '请填写完整的 OSS 配置' });
  }

  try {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_access_key_id', ?)", [sec.encrypt(ak)]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_access_key_secret', ?)", [sec.encrypt(sk)]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_bucket', ?)", [sec.encrypt(bucket)]);
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_region', ?)", [sec.encrypt(region)]);
    if (endpoint) {
      db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_endpoint', ?)", [sec.encrypt(endpoint)]);
    } else {
      db.run("DELETE FROM settings WHERE key = 'oss_endpoint'");
    }
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('oss_config_label', ?)", [label]);
    db.scheduleSave();
    console.log('[OSS] Config saved, bucket:', bucket, 'region:', region);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

router.post('/oss-config-delete', function (req, res) {
  try {
    var db = require('../../db');
    ['oss_access_key_id', 'oss_access_key_secret', 'oss_bucket', 'oss_region', 'oss_endpoint', 'oss_config_label'].forEach(function (k) {
      db.run("DELETE FROM settings WHERE key = ?", [k]);
    });
    db.scheduleSave();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
