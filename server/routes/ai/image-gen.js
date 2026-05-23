// AI 图片生成 — 文生图/图生图/白底图/画质增强 + ImgBB图床
const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

var providers = require('./providers');

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

  providers.imageLLMRequest('/images/generations', {
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

  providers.imageLLMRequest('/images/generations', {
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

  providers.imageLLMRequest('/images/generations', {
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

  providers.imageLLMRequest('/images/generations', {
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

// ===== ImgBB 图床（免费） =====
function getImgbbKey() {
  try {
    var row = require('../../db').getOne("SELECT value FROM settings WHERE key = 'imgbb_api_key'");
    return row ? row.value : '';
  } catch (e) {
    return '';
  }
}

router.post('/smms-upload', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  var apiKey = getImgbbKey();
  if (!apiKey) return res.status(400).json({ error: '未配置 ImgBB API Key，请在管理端设置' });

  var base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  var postData = 'key=' + encodeURIComponent(apiKey) + '&image=' + encodeURIComponent(base64Data);

  var options = {
    hostname: 'api.imgbb.com',
    port: 443,
    path: '/1/upload',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var uploadReq = https.request(options, function (uploadRes) {
    var chunks = [];
    uploadRes.on('data', function (c) { chunks.push(c); });
    uploadRes.on('end', function () {
      var raw = Buffer.concat(chunks).toString();
      try {
        var json = JSON.parse(raw);
        if (json.success && json.data && json.data.url) {
          console.log('[ImgBB] Upload success:', json.data.url);
          var buf = Buffer.from(base64Data, 'base64');
          var localName = 'imgbb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
          fs.writeFile(path.join(UPLOADS_DIR, localName), buf, function () {});
          res.json({ ok: true, url: json.data.url, delete: json.data.delete_url });
        } else {
          var errMsg = (json.error && json.error.message) || JSON.stringify(json);
          console.error('[ImgBB] Upload failed:', errMsg);
          res.status(502).json({ error: 'ImgBB 上传失败: ' + errMsg });
        }
      } catch (e) {
        res.status(502).json({ error: 'ImgBB 响应解析失败' });
      }
    });
  });
  uploadReq.on('error', function (e) {
    console.error('[ImgBB] Request error:', e.message);
    res.status(502).json({ error: 'ImgBB 请求失败: ' + e.message });
  });
  uploadReq.write(postData);
  uploadReq.end();
});

router.get('/smms-token', function (req, res) {
  var key = getImgbbKey();
  if (!key) return res.json({ configured: false, masked: '' });
  var masked = key.length > 8 ? key.substring(0, 4) + '****' + key.substring(key.length - 4) : '****';
  res.json({ configured: true, masked: masked });
});

router.post('/smms-token', function (req, res) {
  var key = (req.body.token || '').trim();
  if (!key) return res.status(400).json({ error: 'API Key 不能为空' });
  try {
    var db = require('../../db');
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('imgbb_api_key', ?)", [key]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

router.post('/smms-token-delete', function (req, res) {
  try {
    var db = require('../../db');
    db.run("DELETE FROM settings WHERE key = 'imgbb_api_key'");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
