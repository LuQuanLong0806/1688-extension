// 智谱AI代理路由 — 文生图/图生图/抠图/修复
const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
const lamaService = require('../services/inpaint');

// 智谱API基础配置
var API_BASE = 'https://open.bigmodel.cn/api/paas/v4';

// 从settings表读API密钥（延迟获取，避免循环依赖）
function getApiKey() {
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'zhipu_api_key'");
    return row ? row.value : '';
  } catch (e) {
    return '';
  }
}

// 通用请求函数（不用axios，用原生http/https避免新增依赖）
function zhipuRequest(path, body) {
  return new Promise(function (resolve, reject) {
    var apiKey = getApiKey();
    if (!apiKey) return reject(new Error('未配置智谱API密钥，请在设置中配置'));

    var data = JSON.stringify(body);
    var url = new URL(API_BASE + path);
    var options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    var req = https.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var raw = Buffer.concat(chunks).toString();
        try {
          var json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(json.error && json.error.message ? json.error.message : 'API错误 ' + res.statusCode));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('解析响应失败: ' + raw.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

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
      // 裁剪智谱水印
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

  zhipuRequest('/images/generations', {
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

  zhipuRequest('/images/generations', {
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

// ===== 检查API密钥 =====
router.get('/check-key', function (req, res) {
  var key = getApiKey();
  res.json({ configured: !!key });
});

// ===== 获取API密钥（脱敏） =====
router.get('/get-key', function (req, res) {
  var key = getApiKey();
  if (!key) return res.json({ configured: false, masked: '' });
  var masked = key.length > 8 ? key.substring(0, 4) + '****' + key.substring(key.length - 4) : '****';
  res.json({ configured: true, masked: masked });
});

// ===== 保存API密钥 =====
router.post('/save-key', function (req, res) {
  var key = (req.body.key || '').trim();
  if (!key) return res.status(400).json({ error: '密钥不能为空' });
  try {
    var db = require('../db');
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', ?)", [key]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

// ===== 删除API密钥 =====
router.post('/delete-key', function (req, res) {
  try {
    var db = require('../db');
    db.run("DELETE FROM settings WHERE key = 'zhipu_api_key'");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ===== AI消除/修复（本地LaMa ONNX推理）=====
// 智谱CogView-4是图像生成模型，不是修复模型，无法保留原图内容做局部修复
router.post('/inpaint', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var maskBase64 = req.body.mask_base64;

  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });
  if (!maskBase64) return res.status(400).json({ error: '请先用画笔/框选标记要消除的区域' });

  if (!lamaService.isModelAvailable()) {
    return res.status(503).json({ error: '修复模型未安装' });
  }

  var imgBuf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  var maskBuf = Buffer.from(maskBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

  console.log('[AI消除] LaMa推理中...');
  var t0 = Date.now();

  lamaService.inpaint(imgBuf, maskBuf).then(function (resultBuf) {
    console.log('[AI消除] 完成, 耗时:', Date.now() - t0, 'ms');
    var filename = 'inpaint_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
    fs.writeFile(path.join(UPLOADS_DIR, filename), resultBuf, function (err) {
      if (err) return res.status(500).json({ error: '保存失败' });
      res.json({ ok: true, url: '/uploads/' + filename });
    });
  }).catch(function (err) {
    console.error('[AI消除失败]', err.message);
    res.status(502).json({ error: 'AI消除失败: ' + err.message });
  });
});

// ===== 智能检测（智谱GLM多模态 — 返回水印/文字/LOGO坐标）=====
router.post('/smart-detect', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var detectType = req.body.type || 'watermark'; // watermark | text | logo | all

  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  var prompt = '';
  if (detectType === 'watermark') {
    prompt = '请分析这张图片，找出所有水印的位置。以JSON数组格式返回每个水印的矩形坐标，格式为: [{"x":左上角x,"y":左上角y,"width":宽,"height":高,"type":"watermark"}]。如果没有水印返回空数组[]。只返回JSON，不要其他文字。';
  } else if (detectType === 'text') {
    prompt = '请分析这张图片，找出所有叠加在图片上的文字(非产品本身的文字)。以JSON数组格式返回每个文字区域的矩形坐标，格式为: [{"x":左上角x,"y":左上角y,"width":宽,"height":高,"type":"text","content":"识别的文字内容"}]。如果没有叠加文字返回空数组[]。只返回JSON，不要其他文字。';
  } else if (detectType === 'logo') {
    prompt = '请分析这张图片，找出所有LOGO/品牌标志的位置。以JSON数组格式返回每个LOGO的矩形坐标，格式为: [{"x":左上角x,"y":左上角y,"width":宽,"height":高,"type":"logo"}]。如果没有LOGO返回空数组[]。只返回JSON，不要其他文字。';
  } else {
    prompt = '请分析这张图片，找出所有水印、叠加文字、LOGO标志的位置。以JSON数组格式返回每个区域的矩形坐标，格式为: [{"x":左上角x,"y":左上角y,"width":宽,"height":高,"type":"watermark/text/logo"}]。如果没有发现任何上述元素返回空数组[]。只返回JSON，不要其他文字。';
  }

  // 如果base64没有data前缀，添加之
  var fullBase64 = imageBase64;
  if (!fullBase64.startsWith('data:')) {
    fullBase64 = 'data:image/png;base64,' + fullBase64;
  }

  zhipuRequest('/chat/completions', {
    model: 'glm-4v-flash',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: fullBase64 } }
      ]
    }],
    temperature: 0.1,
    max_tokens: 1024
  }).then(function (result) {
    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return res.status(502).json({ error: 'AI未返回检测结果' });

    // 尝试从返回文本中提取JSON
    try {
      // 去掉可能的markdown代码块包裹
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var regions = JSON.parse(jsonStr);
      if (!Array.isArray(regions)) regions = [];
      console.log('[智能检测] 检测到', regions.length, '个区域, type:', detectType);
      res.json({ ok: true, regions: regions, raw: text });
    } catch (e) {
      // JSON解析失败，返回原文让前端处理
      console.warn('[智能检测] JSON解析失败，返回原文:', text.substring(0, 200));
      res.json({ ok: true, regions: [], raw: text });
    }
  }).catch(function (err) {
    console.error('[智能检测失败]', err.message);
    res.status(502).json({ error: err.message });
  });
});

// ===== 检查LaMa模型状态 =====
router.get('/model-status', function (req, res) {
  res.json({
    available: lamaService.isModelAvailable(),
    model: 'LaMa (Local ONNX)'
  });
});

// ===== AI白底图（CogView-4 图生图）=====
router.post('/white-bg', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  console.log('[AI白底] 开始生成...');
  var t0 = Date.now();

  zhipuRequest('/images/generations', {
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

  zhipuRequest('/images/generations', {
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

// ===== AI抠图 — 原始端点（保留兼容，客户端CDN调用）=====
var bgRemovalLib = null;
function getBgRemovalLib() {
  if (bgRemovalLib) return Promise.resolve(bgRemovalLib);
  return import('@imgly/background-removal').then(function (mod) {
    bgRemovalLib = mod.removeBackground;
    return bgRemovalLib;
  });
}

router.post('/remove-bg', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  console.log('[AI抠图] 开始...');
  var t0 = Date.now();

  var base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  var buf = Buffer.from(base64Data, 'base64');

  getBgRemovalLib().then(function (removeBg) {
    var uint8 = new Uint8Array(buf);
    return removeBg(uint8);
  }).then(function (resultBlob) {
    return resultBlob.arrayBuffer().then(function (ab) {
      var resultBuf = Buffer.from(ab);
      var filename = 'removebg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
      var filepath = path.join(UPLOADS_DIR, filename);
      return new Promise(function (resolve, reject) {
        fs.writeFile(filepath, resultBuf, function (err) {
          if (err) return reject(err);
          resolve('/uploads/' + filename);
        });
      });
    });
  }).then(function (localUrl) {
    console.log('[AI抠图] 完成, 耗时:', Date.now() - t0, 'ms');
    res.json({ ok: true, url: localUrl });
  }).catch(function (err) {
    console.error('[AI抠图失败]', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  });
});

// ===== AI抠图（onnxruntime-node + ISNet 本地推理 — 供扩展页面使用）=====
var removeBgService = require('../services/remove-bg');

router.post('/remove-bg-local', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  console.log('[AI抠图-本地] 开始...');
  var t0 = Date.now();

  var base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  var buf = Buffer.from(base64Data, 'base64');

  removeBgService.removeBackground(buf).then(function (resultBuf) {
    var filename = 'removebg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
    var filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFile(filepath, resultBuf, function (err) {
      if (err) return res.status(500).json({ error: '保存失败' });
      console.log('[AI抠图-本地] 完成, 耗时:', Date.now() - t0, 'ms');
      res.json({ ok: true, url: '/uploads/' + filename });
    });
  }).catch(function (err) {
    console.error('[AI抠图-本地失败]', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  });
});

// ===== ImgBB 图床（免费） =====
function getImgbbKey() {
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'imgbb_api_key'");
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

  // ImgBB API — 直接发 base64，无需拼 multipart
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
          // Also save locally
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
    var db = require('../db');
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('imgbb_api_key', ?)", [key]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

router.post('/smms-token-delete', function (req, res) {
  try {
    var db = require('../db');
    db.run("DELETE FROM settings WHERE key = 'imgbb_api_key'");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ===== PaddleOCR 文字检测（替代 GLM-4V，坐标更精准）=====
var textCleaner = require('../services/text-cleaner');

router.post('/detect-text', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var imageUrl = req.body.image_url;
  var chineseOnly = req.body.chinese_only !== false;

  if (!imageBase64 && !imageUrl) return res.status(400).json({ error: '请提供 image_base64 或 image_url' });

  var detectPromise;
  if (imageBase64) {
    detectPromise = textCleaner.callOcrService(imageBase64, chineseOnly);
  } else {
    // 先下载图片转 base64
    detectPromise = textCleaner.downloadImage(imageUrl).then(function (buf) {
      return textCleaner.callOcrService(buf.toString('base64'), chineseOnly);
    });
  }

  detectPromise.then(function (result) {
    res.json(result);
  }).catch(function (err) {
    console.error('[文字检测失败]', err.message);
    res.status(502).json({ error: '文字检测失败: ' + err.message });
  });
});

// ===== 自动清理图片中的中文文字（一键去中文）=====
router.post('/auto-clean-chinese', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var imageUrl = req.body.image_url;

  if (!imageBase64 && !imageUrl) return res.status(400).json({ error: '请提供 image_base64 或 image_url' });

  console.log('[自动去中文] 开始处理...');
  var t0 = Date.now();

  var imagePromise;
  if (imageBase64) {
    imagePromise = Promise.resolve(Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
  } else {
    imagePromise = textCleaner.downloadImage(imageUrl);
  }

  imagePromise.then(function (imgBuf) {
    return textCleaner.cleanImage(imgBuf, {
      chineseOnly: req.body.chinese_only !== false,
      minConfidence: req.body.min_confidence || 0.5,
      dilatePx: req.body.dilate_px || 20
    });
  }).then(function (result) {
    if (!result.cleaned) {
      // 无需清理或模型不可用
      res.json({
        ok: true,
        cleaned: false,
        regions: result.regions || [],
        regionCount: (result.regions || []).length,
        message: result.message
      });
      return;
    }

    // 保存清理后的图片
    return textCleaner.saveCleanedImage(result.imageBuffer).then(function (url) {
      var elapsed = Date.now() - t0;
      console.log('[自动去中文] 完成, 消除 ' + result.regionCount + ' 个区域, 耗时: ' + elapsed + 'ms');
      res.json({
        ok: true,
        cleaned: true,
        url: url,
        regions: result.regions,
        regionCount: result.regionCount,
        elapsed_ms: elapsed
      });
    });
  }).catch(function (err) {
    console.error('[自动去中文失败]', err.message);
    res.status(502).json({ error: '自动去中文失败: ' + err.message });
  });
});

// ===== 批量清理图片中文（多图并行）=====
router.post('/batch-clean-chinese', function (req, res) {
  var images = req.body.images; // [{ url: '...', base64: '...' }, ...]
  if (!Array.isArray(images) || !images.length) {
    return res.status(400).json({ error: '请提供 images 数组' });
  }

  console.log('[批量去中文] 处理 ' + images.length + ' 张图片...');
  var t0 = Date.now();

  var promises = images.map(function (img, idx) {
    var imagePromise;
    if (img.base64) {
      imagePromise = Promise.resolve(Buffer.from(img.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    } else if (img.url) {
      imagePromise = textCleaner.downloadImage(img.url);
    } else {
      return Promise.resolve({ ok: true, cleaned: false, message: 'No image data' });
    }

    return imagePromise.then(function (buf) {
      return textCleaner.cleanImage(buf, { chineseOnly: true });
    }).then(function (result) {
      if (!result.cleaned) {
        return { ok: true, cleaned: false, regions: result.regions || [] };
      }
      return textCleaner.saveCleanedImage(result.imageBuffer).then(function (url) {
        return { ok: true, cleaned: true, url: url, regionCount: result.regionCount };
      });
    }).catch(function (err) {
      return { ok: false, error: err.message };
    });
  });

  Promise.all(promises).then(function (results) {
    var elapsed = Date.now() - t0;
    var cleaned = results.filter(function (r) { return r.cleaned; }).length;
    console.log('[批量去中文] 完成, ' + cleaned + '/' + images.length + ' 张被清理, 耗时: ' + elapsed + 'ms');
    res.json({ ok: true, results: results, total: images.length, cleaned: cleaned, elapsed_ms: elapsed });
  });
});

// ===== OCR 服务状态检查 =====
router.get('/ocr-status', function (req, res) {
  textCleaner.checkOcrHealth().then(function (status) {
    var lamaAvailable = false;
    try {
      lamaAvailable = lamaService.isModelAvailable();
    } catch (e) {
      lamaAvailable = false;
    }
    res.json({
      ocr: status,
      lama: { available: lamaAvailable, model: 'LaMa (Local ONNX)' },
      pipeline: status.status === 'ok' && lamaAvailable ? 'ready' : 'partial'
    });
  });
});

// ===== AI 分类推荐（LLM + dxm_tree.db）=====
var dbModule = require('../db');

router.post('/suggest-category', function (req, res) {
  var title = (req.body.title || '').trim();
  var aliCategory = (req.body.ali_category || '').trim();
  var imageUrl = (req.body.image_url || '').trim();

  if (!title && !aliCategory) {
    return res.status(400).json({ error: '请提供 title 或 ali_category' });
  }

  console.log('[分类推荐] 标题:', title, '1688类目:', aliCategory);

  // Step 1: 先查映射表
  if (aliCategory) {
    var mappings = dbModule.getAll(
      'SELECT custom_category FROM category_mappings WHERE category_name = ? ORDER BY id',
      [aliCategory]
    );
    if (mappings.length > 0) {
      var mappedCategory = mappings[0].custom_category;
      // 查完整路径
      var pathRow = dbModule.treeGetOne(
        'SELECT path FROM dxm_category_tree WHERE cat_name = ? AND is_leaf = 1 LIMIT 1',
        [mappedCategory]
      );
      console.log('[分类推荐] 映射表命中:', mappedCategory);
      return res.json({
        ok: true,
        source: 'mapping',
        category: mappedCategory,
        path: pathRow ? pathRow.path : '',
        confidence: 1.0
      });
    }
  }

  // Step 2: 搜索候选分类（同时搜 cat_name 和 path）
  var searchTerms = [title, aliCategory].filter(Boolean).join(' ');
  var keywords = searchTerms.split(/[\s\/,|]+/).filter(function (w) { return w.length > 1; });

  var candidates = [];
  var seenPaths = {};
  var MAX_CANDIDATES = 30;
  for (var k = 0; k < keywords.length && candidates.length < MAX_CANDIDATES; k++) {
    var rows = dbModule.treeGetAll(
      'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND (cat_name LIKE ? OR path LIKE ?) LIMIT 15',
      ['%' + keywords[k] + '%', '%' + keywords[k] + '%']
    );
    for (var r = 0; r < rows.length && candidates.length < MAX_CANDIDATES; r++) {
      if (!seenPaths[rows[r].path]) {
        seenPaths[rows[r].path] = true;
        candidates.push({ name: rows[r].cat_name, path: rows[r].path });
      }
    }
  }

  // 如果关键词搜索无结果，用LLM
  if (candidates.length === 0) {
    // 尝试智谱LLM
    suggestCategoryWithLLM(title, aliCategory).then(function (suggestion) {
      if (suggestion) {
        res.json({
          ok: true,
          source: 'llm',
          category: suggestion.category,
          path: suggestion.path,
          confidence: suggestion.confidence || 0.6,
          alternatives: suggestion.alternatives || []
        });
      } else {
        res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
      }
    }).catch(function () {
      res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
    });
    return;
  }

  // 有候选，用LLM从候选中选择最佳
  if (candidates.length > 1) {
    suggestCategoryFromCandidates(title, aliCategory, candidates).then(function (choice) {
      res.json({
        ok: true,
        source: 'llm_search',
        category: choice.category,
        path: choice.path,
        confidence: choice.confidence || 0.7,
        alternatives: candidates.slice(0, 5)
      });
    }).catch(function () {
      // LLM失败，返回第一个候选
      res.json({
        ok: true,
        source: 'search',
        category: candidates[0].name,
        path: candidates[0].path,
        confidence: 0.5,
        alternatives: candidates.slice(0, 5)
      });
    });
    return;
  }

  // 只有1个候选，直接返回
  res.json({
    ok: true,
    source: 'search',
    category: candidates[0].name,
    path: candidates[0].path,
    confidence: 0.8,
    alternatives: candidates
  });
});

// LLM 推荐分类（无候选时）— 两阶段：先选分支，再选叶子
function suggestCategoryWithLLM(title, aliCategory) {
  var apiKey = getApiKey();
  if (!apiKey) return Promise.resolve(null);

  // 阶段1：取所有二级分支，让LLM选择最相关的分支
  var branches = dbModule.treeGetAll(
    'SELECT DISTINCT path FROM dxm_category_tree WHERE is_leaf = 0 AND cat_level <= 2 AND path LIKE "%/%" ORDER BY path'
  );
  if (!branches.length) return Promise.resolve(null);

  var branchList = branches.map(function (b, i) {
    return (i + 1) + '. ' + b.path;
  }).join('\n');

  var stage1Prompt = '你是一个跨境电商分类专家。根据产品信息，从以下分类分支中选择最可能包含该产品的分支。\n\n';
  if (title) stage1Prompt += '产品标题: ' + title + '\n';
  if (aliCategory) stage1Prompt += '来源平台类目: ' + aliCategory + '\n';
  stage1Prompt += '\n可选分类分支:\n' + branchList;
  stage1Prompt += '\n\n请选择最相关的分支序号。返回JSON: {"choice": 序号}\n只返回JSON。';

  return zhipuRequest('/chat/completions', {
    model: 'glm-4-flash',
    messages: [{ role: 'user', content: stage1Prompt }],
    temperature: 0.1,
    max_tokens: 50
  }).then(function (result) {
    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return null;
    var parsed;
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }

    var branchIdx = (parsed.choice || 1) - 1;
    if (branchIdx < 0 || branchIdx >= branches.length) return null;

    // 阶段2：在选中分支内取叶子分类，让LLM选最终结果
    var selectedBranch = branches[branchIdx].path;
    var leaves = dbModule.treeGetAll(
      'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND path LIKE ? LIMIT 50',
      [selectedBranch + '/%']
    );
    if (!leaves.length) {
      // 分支下无叶子，尝试取下一级子分支的叶子
      leaves = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND path LIKE ? LIMIT 50',
        [selectedBranch.substring(0, selectedBranch.indexOf('/') + 1) + '%']
      );
    }
    if (!leaves.length) return null;

    if (leaves.length <= 3) {
      // 叶子很少时直接返回第一个，置信度 0.6 刚好达到异步保存阈值
      return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.6 };
    }

    var leafList = leaves.slice(0, 30).map(function (l, i) {
      return (i + 1) + '. ' + l.path;
    }).join('\n');

    var stage2Prompt = '你是一个跨境电商分类专家。根据产品信息，从以下分类中选择最匹配的叶子分类。\n\n';
    if (title) stage2Prompt += '产品标题: ' + title + '\n';
    if (aliCategory) stage2Prompt += '来源平台类目: ' + aliCategory + '\n';
    stage2Prompt += '\n候选分类:\n' + leafList;
    stage2Prompt += '\n\n请选择最匹配的分类序号。返回JSON: {"choice": 序号, "confidence": 0.0到1.0}\n只返回JSON。';

    return zhipuRequest('/chat/completions', {
      model: 'glm-4-flash',
      messages: [{ role: 'user', content: stage2Prompt }],
      temperature: 0.1,
      max_tokens: 50
    }).then(function (result2) {
      var text2 = result2.choices && result2.choices[0] && result2.choices[0].message && result2.choices[0].message.content;
      if (!text2) return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.5 };
      try {
        var jsonStr2 = text2.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        var parsed2 = JSON.parse(jsonStr2);
        var leafIdx = (parsed2.choice || 1) - 1;
        if (leafIdx >= 0 && leafIdx < leaves.length) {
          return { category: leaves[leafIdx].cat_name, path: leaves[leafIdx].path, confidence: parsed2.confidence || 0.5 };
        }
      } catch (e) {}
      return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.5 };
    });
  }).catch(function () { return null; });
}

// LLM 从候选中选择最佳（传完整路径让LLM利用层级语义）
function suggestCategoryFromCandidates(title, aliCategory, candidates) {
  var apiKey = getApiKey();
  if (!apiKey) return Promise.resolve({ category: candidates[0].name, path: candidates[0].path, confidence: 0.5 });

  var candidateList = candidates.slice(0, 15).map(function (c, i) {
    return (i + 1) + '. ' + c.path;
  }).join('\n');

  var prompt = '你是一个跨境电商分类匹配专家。请根据产品信息，从候选分类路径中选择最匹配的一个。\n\n';
  if (title) prompt += '产品标题: ' + title + '\n';
  if (aliCategory) prompt += '来源平台类目: ' + aliCategory + '\n';
  prompt += '\n候选分类路径:\n' + candidateList;
  prompt += '\n\n请分析每个候选路径的层级语义，选择与产品最匹配的分类。\n';
  prompt += '返回JSON格式: {"choice": 序号, "confidence": 0.0到1.0之间的数值}\n';
  prompt += '只返回JSON，不要其他文字。';

  return zhipuRequest('/chat/completions', {
    model: 'glm-4-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 100
  }).then(function (result) {
    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(jsonStr);
      var idx = (parsed.choice || 1) - 1;
      if (idx >= 0 && idx < candidates.length) {
        return { category: candidates[idx].name, path: candidates[idx].path, confidence: parsed.confidence || 0.7 };
      }
    } catch (e) {}
    return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
  }).catch(function () {
    return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
  });
}

// 自动保存分类映射
router.post('/save-category-mapping', function (req, res) {
  var aliCategory = (req.body.ali_category || '').trim();
  var temuCategory = (req.body.temu_category || '').trim();

  if (!aliCategory || !temuCategory) {
    return res.status(400).json({ error: '请提供 ali_category 和 temu_category' });
  }

  // 检查是否已有映射
  var existing = dbModule.getAll(
    'SELECT id FROM category_mappings WHERE category_name = ?',
    [aliCategory]
  );

  if (existing.length > 0) {
    // 更新已有映射
    dbModule.run(
      'UPDATE category_mappings SET custom_category = ? WHERE category_name = ?',
      [temuCategory, aliCategory]
    );
    console.log('[分类映射] 更新:', aliCategory, '→', temuCategory);
  } else {
    // 新增映射
    dbModule.run(
      'INSERT INTO category_mappings (category_name, custom_category) VALUES (?, ?)',
      [aliCategory, temuCategory]
    );
    console.log('[分类映射] 新增:', aliCategory, '→', temuCategory);
  }

  res.json({ ok: true, ali_category: aliCategory, temu_category: temuCategory });
});

module.exports = router;
