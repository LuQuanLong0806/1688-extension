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

module.exports = router;
