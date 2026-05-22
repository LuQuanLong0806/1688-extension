// 智谱AI代理路由 — 文生图/图生图/抠图/修复
const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// ===== AI 模型配置管理 =====
// 每个用途独立配置 model + apiKey，存储在 settings 表 key='ai_configs'
// 结构: { category: { model, apiKey }, vision: { model, apiKey }, image: { model, apiKey } }
var AI_USE_CASES = {
  category: {
    label: '分类推荐',
    defaultModel: 'glm-4.7-flash',
    models: [
      { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash（免费）' },
      { id: 'glm-4-flash', name: 'GLM-4-Flash（免费）' }
    ]
  },
  vision: {
    label: '智能检测',
    defaultModel: 'glm-4v-flash',
    models: [
      { id: 'glm-4v-flash', name: 'GLM-4V-Flash（免费）' }
    ]
  },
  image: {
    label: '图片生成',
    defaultModel: 'cogview-3-flash',
    models: [
      { id: 'cogview-3-flash', name: 'CogView-3-Flash（免费）' },
      { id: 'cogview-4', name: 'CogView-4' }
    ]
  }
};

// ===== 多供应商配置 =====
// 供应商密钥存储在 ai_configs 的 providers 字段
// { providers: { qwen: { apiKey: '...' }, hunyuan: { secretId: '...', secretKey: '...' } } }

function getProviderConfig(provider) {
  var configs = getAIConfigs();
  return (configs.providers && configs.providers[provider]) || {};
}

// 限流/余额不足等可重试错误判断
function isRateLimitError(err) {
  var msg = (err && err.message) || '';
  var keywords = ['访问量过大', '限流', 'rate', 'Rate', '余额', 'ResourceExhausted', 'Throttling', 'frequency', 'quota', '429'];
  for (var i = 0; i < keywords.length; i++) {
    if (msg.indexOf(keywords[i]) >= 0) return true;
  }
  return false;
}

// --- 通义千问（阿里云 DashScope，OpenAI 兼容格式）---
function qwenChatRequest(messages, temperature, maxTokens) {
  return new Promise(function (resolve, reject) {
    var cfg = getProviderConfig('qwen');
    if (!cfg.apiKey) return reject(new Error('未配置通义千问API Key'));

    var body = { model: 'qwen-turbo', messages: messages, temperature: temperature || 0.1 };
    if (maxTokens) body.max_tokens = maxTokens;
    var data = JSON.stringify(body);

    var req = https.request({
      hostname: 'dashscope.aliyuncs.com',
      port: 443,
      path: '/compatible-mode/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          var result = JSON.parse(d);
          if (result.error) return reject(new Error(result.error.message || JSON.stringify(result.error)));
          if (!result.choices || !result.choices.length) return reject(new Error('Qwen返回空结果'));
          resolve(result);
        } catch (e) {
          reject(new Error('Qwen解析失败: ' + d.substring(0, 100)));
        }
      });
    });
    req.on('error', function (e) { reject(e); });
    req.write(data);
    req.end();
  });
}

// --- 腾讯混元（Tencent Cloud API，TC3-HMAC-SHA256 签名）---
function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}
function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

function hunyuanChatRequest(messages, temperature, maxTokens) {
  return new Promise(function (resolve, reject) {
    var cfg = getProviderConfig('hunyuan');
    if (!cfg.secretId || !cfg.secretKey) return reject(new Error('未配置腾讯云密钥'));

    // 腾讯 API 用 PascalCase
    var tcMessages = messages.map(function (m) {
      return { Role: m.role, Content: m.content };
    });
    var reqBody = JSON.stringify({ Model: 'hunyuan-lite', Messages: tcMessages, Temperature: temperature || 0.1, TopP: 0.7 });

    var host = 'hunyuan.tencentcloudapi.com';
    var service = 'hunyuan';
    var action = 'ChatCompletions';
    var ts = Math.floor(Date.now() / 1000);
    var date = new Date(ts * 1000).toISOString().split('T')[0];

    // TC3 签名
    var ct = 'application/json; charset=utf-8';
    var canonicalHeaders = 'content-type:' + ct + '\nhost:' + host + '\nx-tc-action:' + action.toLowerCase() + '\n';
    var signedHeaders = 'content-type;host;x-tc-action';
    var canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(reqBody)].join('\n');
    var credentialScope = date + '/' + service + '/tc3_request';
    var stringToSign = ['TC3-HMAC-SHA256', ts, credentialScope, sha256Hex(canonicalRequest)].join('\n');
    var sig = crypto.createHmac('sha256', hmacSha256(hmacSha256(hmacSha256('TC3' + cfg.secretKey, date), service), 'tc3_request')).update(stringToSign, 'utf8').digest('hex');
    var auth = 'TC3-HMAC-SHA256 Credential=' + cfg.secretId + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + sig;

    var req = https.request({
      hostname: host, port: 443, path: '/', method: 'POST',
      headers: {
        'Content-Type': ct, 'Host': host,
        'X-TC-Action': action, 'X-TC-Version': '2023-09-01',
        'X-TC-Timestamp': ts.toString(), 'X-TC-Region': 'ap-guangzhou',
        'Authorization': auth, 'Content-Length': Buffer.byteLength(reqBody)
      }
    }, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          var result = JSON.parse(d);
          if (result.Response && result.Response.Error) {
            var errMsg = result.Response.Error.Message || JSON.stringify(result.Response.Error);
            return reject(new Error(errMsg));
          }
          // 归一化为 OpenAI 格式
          var rawChoices = (result.Response && result.Response.Choices) || [];
          if (!rawChoices.length) return reject(new Error('混元返回空结果'));
          var choices = rawChoices.map(function (c) {
            return {
              message: { role: 'assistant', content: (c.Message && c.Message.Content) || '' },
              finish_reason: c.FinishReason || 'stop'
            };
          });
          resolve({ choices: choices });
        } catch (e) {
          reject(new Error('混元解析失败: ' + d.substring(0, 100)));
        }
      });
    });
    req.on('error', function (e) { reject(e); });
    req.write(reqBody);
    req.end();
  });
}

// 分类推荐：多供应商降级链
var CATEGORY_LLM_CHAIN = [
  { name: 'GLM-4.7-Flash', provider: 'zhipu', model: 'glm-4.7-flash' },
  { name: 'GLM-4-Flash', provider: 'zhipu', model: 'glm-4-flash' },
  { name: '通义千问', provider: 'qwen' },
  { name: '腾讯混元', provider: 'hunyuan' }
];

function categoryLLMRequest(apiPath, body) {
  var zhipuConfig = getAIConfig('category');

  function tryModel(i) {
    if (i >= CATEGORY_LLM_CHAIN.length) {
      return Promise.reject(new Error('所有模型均不可用'));
    }
    var step = CATEGORY_LLM_CHAIN[i];

    if (step.provider === 'zhipu') {
      body.model = step.model;
      body.enable_thinking = false;
      return zhipuRequest(apiPath, body, { apiKey: zhipuConfig.apiKey }).catch(function (err) {
        if (isRateLimitError(err)) {
          console.log('[分类推荐]', step.name, '限流，切换下一个');
          return tryModel(i + 1);
        }
        throw err;
      });
    }

    if (step.provider === 'qwen') {
      var qc = getProviderConfig('qwen');
      if (!qc.apiKey) return tryModel(i + 1);
      return qwenChatRequest(body.messages, body.temperature, body.max_tokens).catch(function (err) {
        if (isRateLimitError(err)) {
          console.log('[分类推荐]', step.name, '限流，切换下一个');
          return tryModel(i + 1);
        }
        throw err;
      });
    }

    if (step.provider === 'hunyuan') {
      var hc = getProviderConfig('hunyuan');
      if (!hc.secretId) return tryModel(i + 1);
      return hunyuanChatRequest(body.messages, body.temperature, body.max_tokens).catch(function (err) {
        if (isRateLimitError(err)) {
          console.log('[分类推荐]', step.name, '限流，切换下一个');
          return tryModel(i + 1);
        }
        throw err;
      });
    }

    return tryModel(i + 1);
  }

  return tryModel(0);
}

function getAIConfigs() {
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'ai_configs'");
    if (row && row.value) return JSON.parse(row.value);
  } catch (e) {}
  return {};
}

function saveAIConfigs(configs) {
  require('../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_configs', ?)", [JSON.stringify(configs)]);
  require('../db').scheduleSave();
}

// 获取指定用途的配置，apiKey 回退到全局 zhipu_api_key
function getAIConfig(useCase) {
  var configs = getAIConfigs();
  var uc = configs[useCase] || {};
  var apiKey = uc.apiKey || getApiKey();
  var model = uc.model || (AI_USE_CASES[useCase] && AI_USE_CASES[useCase].defaultModel) || '';
  return { model: model, apiKey: apiKey };
}

function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

// 图片生成专用请求
function imageLLMRequest(apiPath, body) {
  var config = getAIConfig('image');
  return zhipuRequest(apiPath, body, { apiKey: config.apiKey });
}

// 通用请求函数 — 支持 apiKey/model 参数
function zhipuRequest(apiPath, body, options) {
  return new Promise(function (resolve, reject) {
    var apiKey = (options && options.apiKey) || getApiKey();
    if (!apiKey) return reject(new Error('未配置API密钥，请在AI模型配置中设置'));

    // 如果 options 传了 model 且 body 没指定，用 options 的
    if (options && options.model && !body.model) body.model = options.model;

    var data = JSON.stringify(body);
    var url = new URL(API_BASE + apiPath);
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

  imageLLMRequest('/images/generations', {
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

  imageLLMRequest('/images/generations', {
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

  var visionConfig = getAIConfig('vision');
  zhipuRequest('/chat/completions', {
    model: visionConfig.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: fullBase64 } }
      ]
    }],
    temperature: 0.1,
    max_tokens: 1024
  }, { apiKey: visionConfig.apiKey }).then(function (result) {
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

  imageLLMRequest('/images/generations', {
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

  imageLLMRequest('/images/generations', {
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

// 关键词清洗：剔除促销/虚词，保留品类/材质/功能/用途核心词
var NOISE_WORDS = [
  '爆款', '热销', '新款', '新款上市', '厂家直销', '批发', '包邮', '特价', '促销',
  '限时', '秒杀', '折扣', '优惠', '满减', '赠品', '现货', '定制', '加工', '代发',
  '一件代发', '源头工厂', '工厂直供', '厂家直供', '品牌', '正品', '旗舰', '专柜',
  '同款', '网红', '直播', '推荐', '精选', '热卖', '畅销', '质量保证', '售后',
  '七天无理由', '退换货', '包邮区', '非偏远包邮', '快递', '物流', '发货',
  '拍照', '实物', '拍摄', '样品', '拿样', '小批量', '起批', '混批',
  '春夏', '秋冬', '春款', '夏款', '秋款', '冬款', '春夏新款', '秋冬新款',
  '2024', '2025', '2026', '最新', '潮流', '时尚', 'ins', 'INS',
  '百搭', '简约', '韩版', '日系', '欧美', '港风', '复古', '文艺',
  '可爱', '小清新', 'ins风', '北欧', '轻奢', '高端', '大气', '上档次',
  '多功能', '二合一', '三合一', '升级', '省心', '省力', '省时',
  '好用', '实用', '耐用', '经久耐用'
];

function cleanTitleKeywords(text) {
  if (!text) return [];
  var t = text;
  // 剔除常见促销虚词
  NOISE_WORDS.forEach(function (w) { t = t.replace(new RegExp(w, 'g'), ' '); });
  // 剔除纯数字、尺码、容量等
  t = t.replace(/\d+[mgkmlMGKML只件套盒条瓶包箱个支把片张块台套米cmCMmmMM]*/g, ' ');
  // 剔除英文型号如 A123、XH-888
  t = t.replace(/[A-Z]{1,3}[-]?\d{2,6}/gi, ' ');
  // 分词
  var words = t.split(/[\s\/,|，、：:·\-—\(\)（）\[\]【】{}]+/).filter(function (w) {
    if (!w) return false;
    if (w.length < 2) return false;
    // 过滤纯数字
    if (/^\d+$/.test(w)) return false;
    // 过滤单个英文字母
    if (/^[a-zA-Z]$/.test(w)) return false;
    return true;
  });
  return words;
}

// 提取搜索关键词：完整词优先，长中文串用2字片段补充
function extractSearchKeywords(title, aliCategory) {
  var titleWords = cleanTitleKeywords(title);
  var catWords = cleanTitleKeywords(aliCategory);

  var wholeWords = [];
  var segments = [];
  var seen = {};

  // 辅助函数：提取完整词和2字片段
  function addWords(words) {
    words.forEach(function (w) {
      var cn = w.replace(/[a-zA-Z0-9]/g, '');
      if (cn.length >= 2 && cn.length <= 6 && !seen[w]) { seen[w] = true; wholeWords.push(w); }
      // 长中文串（>4字且无空格分割的连续文本）用2字片段补充
      if (cn.length > 4) {
        for (var i = 0; i <= cn.length - 2; i++) {
          var seg = cn.substring(i, i + 2);
          if (!seen[seg]) { seen[seg] = true; segments.push(seg); }
        }
      }
    });
  }

  addWords(titleWords);
  addWords(catWords);

  return wholeWords.concat(segments);
}

// 高频错配纠正表
var CATEGORY_CORRECTIONS = [
  { wrong: '美术用品', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务', '抹布'] },
  { wrong: '刷子和笔清洁用品', correct_keywords: ['洗碗', '厨房', '百洁', '家务', '抹布'] },
  { wrong: '办公用品', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务', '沐浴', '美妆', '抹布'] },
  { wrong: '镂空印画刷和海绵擦', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务', '抹布', '去污'] },
  { wrong: '剪贴', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务'] },
  { wrong: '工艺工具', correct_keywords: ['洗碗', '厨房', '清洁', '百洁', '刷锅', '家务'] }
];

function applyCategoryCorrection(title, category, path) {
  if (!title || !category) return null;
  for (var i = 0; i < CATEGORY_CORRECTIONS.length; i++) {
    var rule = CATEGORY_CORRECTIONS[i];
    if (category.indexOf(rule.wrong) >= 0 || (path && path.indexOf(rule.wrong) >= 0)) {
      for (var j = 0; j < rule.correct_keywords.length; j++) {
        if (title.indexOf(rule.correct_keywords[j]) >= 0) {
          return { corrected: true, reason: '标题包含"' + rule.correct_keywords[j] + '"，"' + rule.wrong + '"为误匹配' };
        }
      }
    }
  }
  return null;
}

router.post('/suggest-category', function (req, res) {
  var title = (req.body.title || '').trim();
  var aliCategory = (req.body.ali_category || '').trim();
  var imageUrl = (req.body.image_url || '').trim();
  var attrs = req.body.attrs; // 规格参数，辅助参考

  if (!title && !aliCategory) {
    return res.status(400).json({ error: '请提供 title 或 ali_category' });
  }

  // 构建辅助信息摘要
  var attrSummary = '';
  if (Array.isArray(attrs) && attrs.length) {
    var attrParts = attrs.slice(0, 5).map(function (a) {
      return (a.name || a.key || '') + ':' + (a.value || a.values || '');
    }).filter(function (s) { return s.length > 2; });
    if (attrParts.length) attrSummary = attrParts.join(', ');
  }

  console.log('[分类推荐] 标题:', title, '1688类目:', aliCategory, attrs ? '含规格参数' : '');

  // Step 1: 先查映射表
  if (aliCategory) {
    var mappings = dbModule.getAll(
      'SELECT custom_category FROM category_mappings WHERE category_name = ? ORDER BY id',
      [aliCategory]
    );
    if (mappings.length > 0) {
      var mappedCategory = mappings[0].custom_category;
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

  // Step 2: LLM 提炼标题核心属性 → 用提炼的关键词搜索候选
  extractProductKeywords(title, aliCategory, attrSummary).then(function (keywords) {
    // 本地关键词作为补充（LLM 提炼失败时兜底）
    var localKw = extractSearchKeywords(title, aliCategory);
    localKw.forEach(function (kw) {
      if (keywords.indexOf(kw) < 0) keywords.push(kw);
    });

    var candidates = [];
    var seenPaths = {};
    var MAX_CANDIDATES = 30;
    console.log('[分类推荐] 搜索关键词:', keywords.slice(0, 15).join(', '));
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

    // 对候选执行错配纠正过滤
    var beforeCorrect = candidates.length;
    if (title && candidates.length > 0) {
      candidates = candidates.filter(function (c) {
        var correction = applyCategoryCorrection(title, c.name, c.path);
        if (correction) console.log('[分类推荐] 纠正过滤:', c.name, '→', correction.reason);
        return !correction;
      });
    }
    console.log('[分类推荐] 候选:', candidates.length, '(纠正前:', beforeCorrect, ')');

    // 如果关键词搜索无结果，用LLM
    if (candidates.length === 0) {
      suggestCategoryWithLLM(title, aliCategory, attrSummary).then(function (suggestion) {
        if (suggestion) {
          var corr = applyCategoryCorrection(title, suggestion.category, suggestion.path);
          if (corr) {
            console.log('[分类推荐] 错配纠正:', suggestion.category, '-> 拒绝(', corr.reason, ')');
            return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
          }
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
      suggestCategoryFromCandidates(title, aliCategory, attrSummary, candidates).then(function (choice) {
        var corr = applyCategoryCorrection(title, choice.category, choice.path);
        if (corr) {
          console.log('[分类推荐] 错配纠正:', choice.category, '-> 拒绝(', corr.reason, ')');
          return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
        }
        res.json({
          ok: true,
          source: 'llm_search',
          category: choice.category,
          path: choice.path,
          confidence: choice.confidence !== undefined ? choice.confidence : 0.7,
          alternatives: candidates.slice(0, 5)
        });
      }).catch(function () {
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
    var corr = applyCategoryCorrection(title, candidates[0].name, candidates[0].path);
    if (corr) {
      console.log('[分类推荐] 错配纠正:', candidates[0].name, '-> 拒绝(', corr.reason, ')');
      return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
    }
    res.json({
      ok: true,
      source: 'search',
      category: candidates[0].name,
      path: candidates[0].path,
      confidence: 0.8,
      alternatives: candidates
    });
  }).catch(function (err) {
    // LLM 提炼失败，回退到本地关键词搜索
    console.log('[分类推荐] LLM提炼失败，回退本地搜索:', err.message);
    fallbackLocalSearch(title, aliCategory, res);
  });
});

// LLM 提炼标题核心属性 → 返回关键词数组
function extractProductKeywords(title, aliCategory, attrSummary) {
  var prompt = '你是一个产品分类专家。请从以下产品标题中提取核心属性，排除节日、风格、装饰、促销等无关词语。\n\n';
  prompt += '重点关注：\n1. 产品品类（是什么东西）\n2. 功能用途（做什么用）\n3. 使用场景/场所（在哪用）\n4. 核心材质\n\n';
  if (title) prompt += '产品标题: ' + title + '\n';
  if (aliCategory) prompt += '来源类目: ' + aliCategory + '\n';
  if (attrSummary) prompt += '规格参数: ' + attrSummary + '\n';
  prompt += '\n请返回JSON格式：\n{"keywords": ["关键词1", "关键词2", ...]}\n';
  prompt += '要求：只返回3-6个最核心的搜索关键词，按重要性排序。关键词应适合在分类目录中搜索匹配。\n只返回一行JSON。';

  return categoryLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 200
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var m = msg.reasoning_content.match(/\{[^{}]*"keywords"[^{}]*\}/);
      if (m) text = m[0];
    }
    if (!text) return [];
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.keywords) && parsed.keywords.length) {
        console.log('[分类推荐] LLM提炼关键词:', parsed.keywords.join(', '));
        return parsed.keywords;
      }
    } catch (e) {
      console.log('[分类推荐] LLM提炼JSON解析失败:', text.substring(0, 100));
    }
    return [];
  }).catch(function (err) {
    console.log('[分类推荐] LLM提炼请求失败:', err.message);
    return [];
  });
}

// 本地关键词兜底搜索（LLM 提炼失败时）
function fallbackLocalSearch(title, aliCategory, res) {
  var keywords = extractSearchKeywords(title, aliCategory);
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
  if (title && candidates.length > 0) {
    candidates = candidates.filter(function (c) {
      return !applyCategoryCorrection(title, c.name, c.path);
    });
  }
  if (candidates.length === 0) {
    return res.json({ ok: true, source: 'none', category: '', path: '', confidence: 0 });
  }
  res.json({
    ok: true,
    source: 'search',
    category: candidates[0].name,
    path: candidates[0].path,
    confidence: 0.5,
    alternatives: candidates.slice(0, 5)
  });
}

// 构建LLM通用指令前缀
var LLM_SYSTEM_PROMPT = '你是一个跨境电商分类匹配专家，负责将商品归类到正确的店小秘类目。\n\n' +
  '匹配规则：\n' +
  '1. 优先匹配三级(叶子)精准类目，无匹配则向上回溯二级、一级\n' +
  '2. 必须贴合商品实际属性和用途，跨大类禁止匹配（如清洁用品不能归入办公用品/美术用品）\n' +
  '3. 仅输出唯一最优类目，不额外赘述\n' +
  '4. 相似度低于60%(confidence<0.6)判定无匹配，直接返回confidence=0\n' +
  '5. 分析维度：优先标题语义 > 规格参数 > 来源类目\n';

// LLM 推荐分类（无候选时）— 两阶段：先选分支，再选叶子
function suggestCategoryWithLLM(title, aliCategory, attrSummary) {
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

  var stage1Prompt = LLM_SYSTEM_PROMPT;
  stage1Prompt += '\n任务：请从以下分类分支中选择最匹配产品的分支。\n\n';
  stage1Prompt += '重要：请优先根据产品标题分析产品的实际用途和使用场景，来源平台类目仅供参考。\n';
  if (title) stage1Prompt += '\n产品标题: ' + title;
  if (aliCategory) stage1Prompt += '\n来源平台类目（参考）: ' + aliCategory;
  if (attrSummary) stage1Prompt += '\n规格参数（参考）: ' + attrSummary;
  stage1Prompt += '\n\n可选分类分支:\n' + branchList;
  stage1Prompt += '\n\n请返回JSON格式，将序号填入choice字段。示例：如果选第3个，返回 {"choice": 3, "reason": "理由"}\n只返回一行JSON，不要其他文字。';

  return categoryLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: stage1Prompt }],
    temperature: 0.1,
    max_tokens: 1024
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var jsonMatch = msg.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
      if (jsonMatch) text = jsonMatch[0];
    }
    console.log('[分类推荐] 阶段1响应 content:', (msg && msg.content || '').substring(0, 100));
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
      leaves = dbModule.treeGetAll(
        'SELECT cat_name, path FROM dxm_category_tree WHERE is_leaf = 1 AND path LIKE ? LIMIT 50',
        [selectedBranch.substring(0, selectedBranch.indexOf('/') + 1) + '%']
      );
    }
    if (!leaves.length) return null;

    if (leaves.length <= 3) {
      return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.6 };
    }

    var leafList = leaves.slice(0, 30).map(function (l, i) {
      return (i + 1) + '. ' + l.path;
    }).join('\n');

    var stage2Prompt = LLM_SYSTEM_PROMPT;
    stage2Prompt += '\n任务：请从以下叶子分类中选择最匹配产品的分类。\n\n';
    stage2Prompt += '重要：请优先分析产品标题中的用途和使用场景，来源平台类目仅供参考。\n';
    if (title) stage2Prompt += '\n产品标题: ' + title;
    if (aliCategory) stage2Prompt += '\n来源平台类目（参考）: ' + aliCategory;
    if (attrSummary) stage2Prompt += '\n规格参数（参考）: ' + attrSummary;
    stage2Prompt += '\n\n候选分类:\n' + leafList;
    stage2Prompt += '\n\n请返回JSON格式，将序号填入choice字段，confidence为0.0到1.0。示例：如果选第2个且置信度0.85，返回 {"choice": 2, "confidence": 0.85}\n只返回一行JSON。';

    return categoryLLMRequest('/chat/completions', {
      messages: [{ role: 'user', content: stage2Prompt }],
      temperature: 0.1,
      max_tokens: 1024
    }).then(function (result2) {
      var msg2 = result2.choices && result2.choices[0] && result2.choices[0].message;
      var text2 = (msg2 && msg2.content) || '';
      if (!text2 && msg2 && msg2.reasoning_content) {
        var jsonMatch2 = msg2.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
        if (jsonMatch2) text2 = jsonMatch2[0];
      }
      if (!text2) return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.5 };
      console.log('[分类推荐] 阶段2响应:', text2.substring(0, 150));
      try {
        var jsonStr2 = text2.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        var parsed2 = JSON.parse(jsonStr2);
        var leafIdx = (parsed2.choice || 1) - 1;
        if (leafIdx >= 0 && leafIdx < leaves.length) {
          var conf = parsed2.confidence !== undefined ? parsed2.confidence : 0.5;
          console.log('[分类推荐] 阶段2选择:', leaves[leafIdx].cat_name, '置信度:', conf);
          if (conf < 0.6) return { category: '', path: '', confidence: 0 };
          return { category: leaves[leafIdx].cat_name, path: leaves[leafIdx].path, confidence: conf };
        }
      } catch (e) {}
      return { category: leaves[0].cat_name, path: leaves[0].path, confidence: 0.5 };
    });
  }).catch(function () { return null; });
}

// LLM 从候选中选择最佳
function suggestCategoryFromCandidates(title, aliCategory, attrSummary, candidates) {
  var apiKey = getApiKey();
  if (!apiKey) return Promise.resolve({ category: candidates[0].name, path: candidates[0].path, confidence: 0.5 });

  var candidateList = candidates.slice(0, 15).map(function (c, i) {
    return (i + 1) + '. ' + c.path;
  }).join('\n');

  var prompt = LLM_SYSTEM_PROMPT;
  prompt += '\n任务：请从候选分类路径中选择最匹配产品的一个。\n\n';
  prompt += '分析要求：\n';
  prompt += '1. 产品的实际用途是什么？\n';
  prompt += '2. 用在什么场景？\n';
  prompt += '3. 候选路径的层级语义是否与产品匹配？\n';
  prompt += '4. 相似度低于70%则confidence设为0\n\n';
  if (title) prompt += '产品标题: ' + title + '\n';
  if (aliCategory) prompt += '来源平台类目（参考）: ' + aliCategory + '\n';
  if (attrSummary) prompt += '规格参数（参考）: ' + attrSummary + '\n';
  prompt += '\n候选分类路径:\n' + candidateList;
  prompt += '\n\n请返回JSON格式，将序号填入choice字段，confidence为0.0到1.0。示例：如果选第5个且置信度0.9，返回 {"choice": 5, "confidence": 0.9}\n只返回一行JSON。';

  return categoryLLMRequest('/chat/completions', {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1024
  }).then(function (result) {
    var msg = result.choices && result.choices[0] && result.choices[0].message;
    var text = (msg && msg.content) || '';
    if (!text && msg && msg.reasoning_content) {
      var jsonMatchC = msg.reasoning_content.match(/\{[^{}]*"choice"[^{}]*\}/);
      if (jsonMatchC) text = jsonMatchC[0];
    }
    console.log('[分类推荐] 候选LLM content:', (msg && msg.content || '').substring(0, 150));
    console.log('[分类推荐] 候选LLM finish_reason:', result.choices && result.choices[0] && result.choices[0].finish_reason);
    if (!text) return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var parsed = JSON.parse(jsonStr);
      var idx = (parsed.choice || 1) - 1;
      if (idx >= 0 && idx < candidates.length) {
        var conf = parsed.confidence !== undefined ? parsed.confidence : 0.7;
        if (conf < 0.6) return { category: '', path: '', confidence: 0 };
        return { category: candidates[idx].name, path: candidates[idx].path, confidence: conf };
      }
    } catch (e) { console.log('[分类推荐] JSON解析失败:', e.message, '原文:', text.substring(0, 100)); }
    return { category: candidates[0].name, path: candidates[0].path, confidence: 0.5 };
  }).catch(function (e) {
    console.log('[分类推荐] suggestCategoryFromCandidates API错误:', e.message);
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

// ===== AI 模型配置管理 API =====

// 获取所有配置（key 脱敏）
router.get('/configs', function (req, res) {
  var configs = getAIConfigs();
  var result = {};
  Object.keys(AI_USE_CASES).forEach(function (uc) {
    var c = configs[uc] || {};
    result[uc] = {
      model: c.model || AI_USE_CASES[uc].defaultModel,
      apiKey: maskApiKey(c.apiKey),
      configured: !!(c.apiKey || getApiKey()),
      label: AI_USE_CASES[uc].label,
      models: AI_USE_CASES[uc].models
    };
  });
  // 全局 key
  result._global = { apiKey: maskApiKey(getApiKey()), configured: !!getApiKey() };
  // 供应商密钥（脱敏）
  var provCfg = configs.providers || {};
  result.providers = {
    qwen: {
      label: '通义千问（阿里云）',
      apiKey: maskApiKey(provCfg.qwen && provCfg.qwen.apiKey),
      configured: !!(provCfg.qwen && provCfg.qwen.apiKey)
    },
    hunyuan: {
      label: '腾讯混元（腾讯云）',
      secretId: maskApiKey(provCfg.hunyuan && provCfg.hunyuan.secretId),
      secretKey: maskApiKey(provCfg.hunyuan && provCfg.hunyuan.secretKey),
      configured: !!(provCfg.hunyuan && provCfg.hunyuan.secretId && provCfg.hunyuan.secretKey)
    }
  };
  res.json(result);
});

// 保存配置
router.post('/configs', function (req, res) {
  var updates = req.body; // { category: { model, apiKey }, providers: { qwen: { apiKey }, hunyuan: { secretId, secretKey } } }
  var configs = getAIConfigs();

  // 用途配置
  Object.keys(updates).forEach(function (uc) {
    if (uc === 'providers') return;
    if (!AI_USE_CASES[uc]) return;
    if (!configs[uc]) configs[uc] = {};
    if (updates[uc].model) configs[uc].model = updates[uc].model;
    if (updates[uc].apiKey && updates[uc].apiKey.indexOf('****') === -1) {
      configs[uc].apiKey = updates[uc].apiKey;
    }
  });

  // 供应商密钥
  if (updates.providers) {
    if (!configs.providers) configs.providers = {};
    if (updates.providers.qwen) {
      if (!configs.providers.qwen) configs.providers.qwen = {};
      if (updates.providers.qwen.apiKey && updates.providers.qwen.apiKey.indexOf('****') === -1) {
        configs.providers.qwen.apiKey = updates.providers.qwen.apiKey;
      }
    }
    if (updates.providers.hunyuan) {
      if (!configs.providers.hunyuan) configs.providers.hunyuan = {};
      if (updates.providers.hunyuan.secretId && updates.providers.hunyuan.secretId.indexOf('****') === -1) {
        configs.providers.hunyuan.secretId = updates.providers.hunyuan.secretId;
      }
      if (updates.providers.hunyuan.secretKey && updates.providers.hunyuan.secretKey.indexOf('****') === -1) {
        configs.providers.hunyuan.secretKey = updates.providers.hunyuan.secretKey;
      }
    }
  }

  saveAIConfigs(configs);
  console.log('[AI配置] 已保存');
  res.json({ ok: true });
});

// 保存全局 key
router.post('/global-key', function (req, res) {
  var key = (req.body.apiKey || '').trim();
  if (!key) return res.status(400).json({ error: 'API Key 不能为空' });
  if (key.indexOf('****') !== -1) return res.status(400).json({ error: '请输入完整API Key' });
  try {
    var db = require('../db');
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', ?)", [key]);
    db.scheduleSave();
    console.log('[AI配置] 全局API Key已更新');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

module.exports = router;
