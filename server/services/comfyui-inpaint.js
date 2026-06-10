// ComfyUI Inpaint 服务 — 替代 LaMa ONNX，通过 ComfyUI API 进行高质量修复
// ComfyUI API: POST /prompt → GET /history/{id} → GET /view?filename=xxx
// 鉴权：Token 模式（账号密码换 Token，24h 有效，401 自动刷新）

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ========== 配置管理 ==========

var COMFYUI_BASE = '';
var COMFYUI_CREDS = null; // { username, password_hash }

function getComfyuiBase() {
  if (COMFYUI_BASE) return COMFYUI_BASE;
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'comfyui_url'");
    if (row && row.value) {
      COMFYUI_BASE = row.value.replace(/\/+$/, '');
      return COMFYUI_BASE;
    }
  } catch (e) {}
  return '';
}

function setComfyuiBase(url) {
  COMFYUI_BASE = (url || '').replace(/\/+$/, '');
  try {
    require('../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('comfyui_url', ?)", [COMFYUI_BASE]);
    require('../db').scheduleSave();
  } catch (e) {}
  _cachedToken = null; // 地址变了，清空 token
}

function getComfyuiCreds() {
  if (COMFYUI_CREDS) return COMFYUI_CREDS;
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'comfyui_creds'");
    if (row && row.value) {
      COMFYUI_CREDS = JSON.parse(row.value);
      return COMFYUI_CREDS;
    }
  } catch (e) {}
  return null;
}

function setComfyuiCreds(username, password) {
  if (!username || !password) return;
  COMFYUI_CREDS = {
    username: username,
    password_hash: crypto.createHash('sha256').update(password).digest('hex')
  };
  try {
    require('../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('comfyui_creds', ?)", [JSON.stringify(COMFYUI_CREDS)]);
    require('../db').scheduleSave();
  } catch (e) {}
  _cachedToken = null; // 凭据变了，清空 token
}

// ========== Token 管理 ==========

var _cachedToken = null;
var _tokenExpires = 0;

function getComfyuiToken(forceRefresh) {
  if (!forceRefresh && _cachedToken && Date.now() < _tokenExpires) {
    return Promise.resolve(_cachedToken);
  }
  var creds = getComfyuiCreds();
  if (!creds) return Promise.reject(new Error('未配置 ComfyUI 账号密码'));
  var base = getComfyuiBase();
  if (!base) return Promise.reject(new Error('未配置 ComfyUI 地址'));

  return new Promise(function (resolve, reject) {
    var url = new URL(base + '/auth/token');
    var proto = url.protocol === 'https:' ? https : http;
    var body = JSON.stringify({ username: creds.username, password: creds.password_hash });
    var options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    var req = proto.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          var json = JSON.parse(Buffer.concat(chunks).toString());
          if (json.token) {
            _cachedToken = json.token;
            _tokenExpires = Date.now() + ((json.expires_in || 86400) - 300) * 1000; // 提前5分钟过期
            console.log('[ComfyUI] Token 获取成功, 有效至:', new Date(_tokenExpires).toLocaleTimeString());
            resolve(_cachedToken);
          } else {
            reject(new Error(json.error || 'Token 获取失败'));
          }
        } catch (e) {
          reject(new Error('Token 响应解析失败'));
        }
      });
    });
    req.on('error', function (e) { reject(new Error('Token 请求失败: ' + e.message)); });
    req.write(body);
    req.end();
  });
}

function clearToken() {
  _cachedToken = null;
  _tokenExpires = 0;
}

// ========== 通用 ComfyUI API 请求（自动 Token 鉴权 + 401 重试）==========

function comfyuiRequest(apiPath, method, body, _retrying) {
  return getComfyuiToken().then(function (token) {
    return new Promise(function (resolve, reject) {
      var base = getComfyuiBase();
      if (!base) return reject(new Error('未配置 ComfyUI 地址'));

      var url = new URL(base + apiPath);
      var proto = url.protocol === 'https:' ? https : http;

      var options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: method || 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      };

      if (body) {
        var data = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }

      var req = proto.request(options, function (res) {
        // 401 → 刷新 Token 重试一次
        if (res.statusCode === 401 && !_retrying) {
          console.log('[ComfyUI] Token 过期，刷新重试');
          clearToken();
          res.resume();
          return comfyuiRequest(apiPath, method, body, true).then(resolve).catch(reject);
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          try {
            var json = JSON.parse(Buffer.concat(chunks).toString());
            if (res.statusCode >= 400) {
              var errMsg = typeof json.error === 'string' ? json.error : (json.message || JSON.stringify(json));
              reject(new Error('ComfyUI API ' + res.statusCode + ': ' + errMsg));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error('ComfyUI 响应解析失败: ' + Buffer.concat(chunks).toString().substring(0, 200)));
          }
        });
      });
      req.on('error', function (e) { reject(new Error('ComfyUI 连接失败: ' + e.message)); });
      req.setTimeout(300000, function () { req.destroy(); reject(new Error('ComfyUI 请求超时')); });
      if (body) req.write(data);
      req.end();
    });
  });
}

// ========== 上传图片到 ComfyUI ==========

function uploadImage(imageBuffer, filename, subfolder, _retrying) {
  var base = getComfyuiBase();
  return getComfyuiToken().then(function (token) {
    return new Promise(function (resolve, reject) {
      var boundary = '----FormBoundary' + Date.now();
      filename = filename || ('inpaint_' + Date.now() + '.png');
      subfolder = subfolder || 'input';

      var header = '--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="image"; filename="' + filename + '"\r\n' +
        'Content-Type: image/png\r\n\r\n';
      var footer = '\r\n--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="subfolder"\r\n\r\n' +
        subfolder + '\r\n' +
        '--' + boundary + '--\r\n';

      var payload = Buffer.concat([
        Buffer.from(header),
        imageBuffer,
        Buffer.from(footer)
      ]);

      var url = new URL(base + '/upload/image');
      var proto = url.protocol === 'https:' ? https : http;

      var options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/upload/image',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'multipart/form-data; boundary=' + boundary,
          'Content-Length': payload.length
        }
      };

      var req = proto.request(options, function (res) {
        if (res.statusCode === 401 && !_retrying) {
          clearToken();
          res.resume();
          return uploadImage(imageBuffer, filename, subfolder, true).then(resolve).catch(reject);
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          try {
            var json = JSON.parse(Buffer.concat(chunks).toString());
            if (json.name) {
              resolve(subfolder ? (subfolder + '/' + json.name) : json.name);
            } else {
              reject(new Error('ComfyUI upload 失败: ' + JSON.stringify(json)));
            }
          } catch (e) {
            reject(new Error('ComfyUI upload 响应解析失败'));
          }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  });
}

// ========== 构建 Inpainting Workflow ==========
// 方案A（推荐）：ComfyUI 内置 InpaintModelConditioning + dreamshaper
// 优点：不需要额外模型，标准 SD inpainting，兼容性好
function buildInpaintWorkflow(imageName, maskName, modelName, prompt, negativePrompt) {
  return {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": modelName || "sd-v1-5-inpainting.ckpt" }
    },
    "2": {
      "class_type": "LoadImage",
      "inputs": { "image": imageName }
    },
    "3": {
      "class_type": "LoadImageMask",
      "inputs": { "image": maskName, "channel": "red" }
    },
    "4": {
      "class_type": "InpaintModelConditioning",
      "inputs": {
        "positive": ["5", 0],
        "negative": ["6", 0],
        "vae": ["1", 2],
        "pixels": ["2", 0],
        "mask": ["3", 0],
        "noise_mask": true
      }
    },
    "5": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": prompt || "match surrounding texture, seamless background continuation, natural, no objects, no text", "clip": ["1", 1] }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": negativePrompt || "text, watermark, logo, objects, patterns, drawings, images, people, noise, artifacts", "clip": ["1", 1] }
    },
    "7": {
      "class_type": "KSampler",
      "inputs": {
        "seed": Math.floor(Math.random() * 10000000000),
        "steps": 20,
        "cfg": 4.0,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 0.5,
        "model": ["1", 0],
        "positive": ["4", 0],
        "negative": ["4", 1],
        "latent_image": ["4", 2]
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": { "samples": ["7", 0], "vae": ["1", 2] }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": { "filename_prefix": "inpaint_" + Date.now(), "images": ["8", 0] }
    }
  };
}

// ========== 核心 inpaint 函数（与 LaMa 接口一致）==========

var POLL_INTERVAL = 1000;
var POLL_TIMEOUT = 120000;

async function inpaint(imageBuffer, maskBuffer, options) {
  options = options || {};
  var prompt = options.prompt || '';
  var negativePrompt = options.negativePrompt || '';

  var base = getComfyuiBase();
  if (!base) {
    // ComfyUI 未配置，降级到 LaMa
    console.log('[ComfyUI] 未配置，降级到 LaMa');
    return require('./inpaint').inpaint(imageBuffer, maskBuffer);
  }

  var t0 = Date.now();
  console.log('[ComfyUI] 开始 inpaint...');

  // Step 1: 大图自动缩放到 512 max（SD模型最佳性能分辨率），处理完再放大回来
  var sharp = require('sharp');
  var originalSize;
  var metadata = await sharp(imageBuffer).metadata();
  var maxDim = Math.max(metadata.width || 800, metadata.height || 800);
  originalSize = { w: metadata.width, h: metadata.height };

  var processImage = imageBuffer;
  var processMask = maskBuffer;

  if (maxDim > 768) {
    console.log('[ComfyUI] 缩放', originalSize.w + 'x' + originalSize.h, '→ 768 (性能优化)');
    processImage = await sharp(imageBuffer)
      .resize(768, 768, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
    processMask = await sharp(maskBuffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toBuffer();
  }

  // Step 2: 上传原图和 mask 到 ComfyUI
  var timestamp = Date.now();
  var imgName, maskName;

  try {
    imgName = await uploadImage(processImage, 'img_' + timestamp + '.png', 'input');
    maskName = await uploadImage(processMask, 'mask_' + timestamp + '.png', 'input');
    console.log('[ComfyUI] 上传完成: img=' + imgName + ', mask=' + maskName);
  } catch (uploadErr) {
    console.warn('[ComfyUI] 上传失败，降级到 LaMa:', uploadErr.message);
    return require('./inpaint').inpaint(imageBuffer, maskBuffer);
  }

  // Step 2: 构建 workflow 并提交
  var model = getWorkflowModel() || 'sd-v1-5-inpainting.ckpt';
  var workflow = buildInpaintWorkflow(imgName, maskName, model, prompt, negativePrompt);
  var client_id = 'openclaw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  var promptResult;
  try {
    promptResult = await comfyuiRequest('/prompt', 'POST', {
      prompt: workflow,
      client_id: client_id
    });
  } catch (submitErr) {
    console.warn('[ComfyUI] 提交失败，降级到 LaMa:', submitErr.message);
    return require('./inpaint').inpaint(imageBuffer, maskBuffer);
  }

  var promptId = promptResult.prompt_id;
  console.log('[ComfyUI] 任务已提交, prompt_id:', promptId);

  // Step 3: 轮询等待结果
  var outputFilename = null;
  var startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT) {
    await new Promise(function (r) { setTimeout(r, POLL_INTERVAL); });

    try {
      var history = await comfyuiRequest('/history/' + promptId);
      var item = history[promptId];

      if (!item) continue;

      var status = item.status || {};
      if (status.completed || status.status_str === 'success') {
        // 获取输出图片
        var outputs = item.outputs;
        if (outputs) {
          for (var nodeId in outputs) {
            var nodeOutput = outputs[nodeId];
            if (nodeOutput.images && nodeOutput.images.length) {
              outputFilename = nodeOutput.images[0].filename;
              var outputSubfolder = nodeOutput.images[0].subfolder || '';
              if (outputSubfolder) outputFilename = outputSubfolder + '/' + outputFilename;
              break;
            }
          }
        }
        break;
      }
      if (status.status_str === 'error') {
        var errMsg = (item.status && item.status.messages && JSON.stringify(item.status.messages)) || '未知错误';
        console.error('[ComfyUI] 执行失败:', errMsg);
        console.warn('[ComfyUI] 降级到 LaMa');
        return require('./inpaint').inpaint(imageBuffer, maskBuffer);
      }
    } catch (pollErr) {
      // 轮询错误，继续尝试
    }
  }

  if (!outputFilename) {
    console.warn('[ComfyUI] 等待超时，降级到 LaMa');
    return require('./inpaint').inpaint(imageBuffer, maskBuffer);
  }

  // Step 4: 下载结果图片
  try {
    var resultBuffer = await downloadFromComfyui(outputFilename);
    // 如果之前缩放过，放大回原始尺寸
    if (maxDim > 768 && originalSize) {
      resultBuffer = await sharp(resultBuffer)
        .resize(originalSize.w, originalSize.h, { fit: 'fill', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();
      console.log('[ComfyUI] 放大回', originalSize.w + 'x' + originalSize.h);
    }
    console.log('[ComfyUI] inpaint 完成, 耗时:', Date.now() - t0, 'ms');
    return resultBuffer;
  } catch (downloadErr) {
    console.warn('[ComfyUI] 下载结果失败，降级到 LaMa:', downloadErr.message);
    return require('./inpaint').inpaint(imageBuffer, maskBuffer);
  }
}

// ========== 下载 ComfyUI 输出图片 ==========

function downloadFromComfyui(filename, _retrying) {
  return getComfyuiToken().then(function (token) {
    return new Promise(function (resolve, reject) {
      var base = getComfyuiBase();
      if (!base) return reject(new Error('未配置 ComfyUI 地址'));

      var qs = new URLSearchParams({ filename: filename, type: 'output' });
      var url = new URL(base + '/view?' + qs);
      var proto = url.protocol === 'https:' ? https : http;

      proto.get({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/view?' + qs.toString(),
        headers: { 'Accept': 'image/*', 'Authorization': 'Bearer ' + token }
      }, function (res) {
        if (res.statusCode === 401 && !_retrying) {
          clearToken();
          res.resume();
          return downloadFromComfyui(filename, true).then(resolve).catch(reject);
        }
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadFromComfyui(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode >= 400) {
          return reject(new Error('ComfyUI view ' + res.statusCode));
        }
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { resolve(Buffer.concat(chunks)); });
      }).on('error', reject);
    });
  });
}

// ========== 检查 ComfyUI 是否可用 ==========

function isAvailable() {
  return !!getComfyuiBase();
}

async function checkHealth() {
  try {
    // /auth/health 免认证，仅检查服务是否在线
    var base = getComfyuiBase();
    if (!base) return { available: false, error: '未配置地址' };
    var result = await new Promise(function (resolve, reject) {
      var url = new URL(base + '/auth/health');
      var proto = url.protocol === 'https:' ? https : http;
      proto.get({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: '/auth/health'
      }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) {
            resolve({ status: 'unknown' });
          }
        });
      }).on('error', reject);
    });
    if (result.status === 'ok') {
      return { available: true, stats: result };
    }
    return { available: false, error: '服务异常' };
  } catch (e) {
    return { available: false, error: e.message };
  }
}

// ========== 获取可用模型列表（用于前端选择）==========

async function getModelList() {
  try {
    var info = await comfyuiRequest('/object_info/CheckpointLoaderSimple');
    var nodeInfo = info['CheckpointLoaderSimple'];
    if (nodeInfo && nodeInfo.input && nodeInfo.input.required && nodeInfo.input.required.ckpt_name) {
      return nodeInfo.input.required.ckpt_name[0]; // [options_list]
    }
    return [];
  } catch (e) {
    return [];
  }
}

// ========== 更新 workflow 中的模型名 ==========

async function updateWorkflowModel(modelName) {
  if (!modelName) return;
  // 保存到 settings
  try {
    require('../db').run("INSERT OR REPLACE INTO settings (key, value) VALUES ('comfyui_model', ?)", [modelName]);
    require('../db').scheduleSave();
  } catch (e) {}
}

function getWorkflowModel() {
  try {
    var row = require('../db').getOne("SELECT value FROM settings WHERE key = 'comfyui_model'");
    return row ? row.value : '';
  } catch (e) { return ''; }
}

// ========== ComfyUI 抠图（Rembg）==========
// 使用 ComfyUI 的 rembg 节点进行 GPU 加速抠图

function buildRembgWorkflow(imageName) {
  return {
    "10": {
      "class_type": "LoadImage",
      "inputs": { "image": imageName }
    },
    "11": {
      "class_type": "RemBGSession+",
      "inputs": { "model": "isnet-general-use: general purpose", "providers": "CUDA" }
    },
    "12": {
      "class_type": "ImageRemoveBackground+",
      "inputs": { "rembg_session": ["11", 0], "image": ["10", 0] }
    },
    "13": {
      "class_type": "SaveImage",
      "inputs": { "filename_prefix": "rembg_" + Date.now(), "images": ["12", 0] }
    }
  };
}

async function removeBackground(imageBuffer, options) {
  options = options || {};
  // 抠图优先本地 ISNet（同模型，CPU 1.5s 快于 ComfyUI 网络往返 4.5s）
  if (!options.forceComfyui) {
    return require('./remove-bg').removeBackground(imageBuffer);
  }

  var base = getComfyuiBase();
  if (!base) {
    console.log('[ComfyUI-Rembg] 未配置 ComfyUI，降级到本地 ISNet');
    return require('./remove-bg').removeBackground(imageBuffer);
  }

  var t0 = Date.now();
  console.log('[ComfyUI-Rembg] 开始抠图...');

  var timestamp = Date.now();
  var imgName;
  try {
    imgName = await uploadImage(imageBuffer, 'rembg_' + timestamp + '.png', 'input');
    console.log('[ComfyUI-Rembg] 上传完成:', imgName);
  } catch (uploadErr) {
    console.warn('[ComfyUI-Rembg] 上传失败，降级到本地 ISNet:', uploadErr.message);
    return require('./remove-bg').removeBackground(imageBuffer);
  }

  var workflow = buildRembgWorkflow(imgName);
  var client_id = 'rembg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  var promptResult;
  try {
    promptResult = await comfyuiRequest('/prompt', 'POST', {
      prompt: workflow,
      client_id: client_id
    });
  } catch (submitErr) {
    console.warn('[ComfyUI-Rembg] 提交失败，降级到本地 ISNet:', submitErr.message);
    return require('./remove-bg').removeBackground(imageBuffer);
  }

  var promptId = promptResult.prompt_id;
  console.log('[ComfyUI-Rembg] 任务已提交, prompt_id:', promptId);

  // 轮询等待结果
  var outputFilename = null;
  var startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT) {
    await new Promise(function (r) { setTimeout(r, POLL_INTERVAL); });
    try {
      var history = await comfyuiRequest('/history/' + promptId);
      var item = history[promptId];
      if (!item) continue;
      var status = item.status || {};
      if (status.completed || status.status_str === 'success') {
        var outputs = item.outputs;
        if (outputs) {
          for (var nodeId in outputs) {
            var nodeOutput = outputs[nodeId];
            if (nodeOutput.images && nodeOutput.images.length) {
              outputFilename = nodeOutput.images[0].filename;
              var sf = nodeOutput.images[0].subfolder || '';
              if (sf) outputFilename = sf + '/' + outputFilename;
              break;
            }
          }
        }
        break;
      }
      if (status.status_str === 'error') {
        var errMsg = (item.status && item.status.messages && JSON.stringify(item.status.messages)) || '未知错误';
        console.error('[ComfyUI-Rembg] 执行失败:', errMsg);
        return require('./remove-bg').removeBackground(imageBuffer);
      }
    } catch (pollErr) { /* continue */ }
  }

  if (!outputFilename) {
    console.warn('[ComfyUI-Rembg] 等待超时，降级到本地 ISNet');
    return require('./remove-bg').removeBackground(imageBuffer);
  }

  try {
    var resultBuffer = await downloadFromComfyui(outputFilename);
    console.log('[ComfyUI-Rembg] 完成, 耗时:', Date.now() - t0, 'ms');
    return resultBuffer;
  } catch (downloadErr) {
    console.warn('[ComfyUI-Rembg] 下载失败，降级到本地 ISNet:', downloadErr.message);
    return require('./remove-bg').removeBackground(imageBuffer);
  }
}

// ========== ComfyUI 图生图（生成场景图）==========

function buildImg2ImgWorkflow(imageName, modelName, prompt, negativePrompt, denoise) {
  return {
    "1": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": modelName || "dreamshaper_v8.safetensors" }
    },
    "2": {
      "class_type": "LoadImage",
      "inputs": { "image": imageName }
    },
    "3": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": prompt || "product photo in a modern room, professional lighting, high quality, 4k", "clip": ["1", 1] }
    },
    "4": {
      "class_type": "CLIPTextEncode",
      "inputs": { "text": negativePrompt || "text, watermark, logo, blurry, low quality, distorted, ugly, deformed", "clip": ["1", 1] }
    },
    "5": {
      "class_type": "VAEEncode",
      "inputs": { "pixels": ["2", 0], "vae": ["1", 2] }
    },
    "6": {
      "class_type": "KSampler",
      "inputs": {
        "seed": Math.floor(Math.random() * 10000000000),
        "steps": 25,
        "cfg": 7.0,
        "sampler_name": "euler_ancestral",
        "scheduler": "normal",
        "denoise": Math.max(0.1, Math.min(1.0, denoise || 0.5)),
        "model": ["1", 0],
        "positive": ["3", 0],
        "negative": ["4", 0],
        "latent_image": ["5", 0]
      }
    },
    "7": {
      "class_type": "VAEDecode",
      "inputs": { "samples": ["6", 0], "vae": ["1", 2] }
    },
    "8": {
      "class_type": "SaveImage",
      "inputs": { "filename_prefix": "scene_" + Date.now(), "images": ["7", 0] }
    }
  };
}

async function img2img(imageBuffer, options) {
  options = options || {};
  var base = getComfyuiBase();
  if (!base) throw new Error('未配置 ComfyUI 地址');

  var t0 = Date.now();
  console.log('[ComfyUI-Img2Img] 开始图生图, denoise=' + (options.denoise || 0.5));

  var sharp = require('sharp');

  // 缩放到 SD 1.5 最佳分辨率（512 或 768）
  var meta = await sharp(imageBuffer).metadata();
  var maxDim = Math.max(meta.width || 512, meta.height || 512);
  var targetSize = maxDim > 768 ? 768 : (maxDim > 512 ? 512 : maxDim);
  // 取 64 的倍数
  targetSize = Math.round(targetSize / 64) * 64;

  var processImage = imageBuffer;
  if (meta.width > 768 || meta.height > 768) {
    console.log('[ComfyUI-Img2Img] 缩放到', targetSize);
    processImage = await sharp(imageBuffer)
      .resize(targetSize, targetSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png().toBuffer();
  }

  var timestamp = Date.now();
  var imgName;
  try {
    imgName = await uploadImage(processImage, 'scene_' + timestamp + '.png', 'input');
    console.log('[ComfyUI-Img2Img] 上传完成:', imgName);
  } catch (uploadErr) {
    throw new Error('上传图片失败: ' + uploadErr.message);
  }

  var model = options.model || getWorkflowModel() || 'dreamshaper_v8.safetensors';
  var workflow = buildImg2ImgWorkflow(imgName, model, options.prompt, options.negativePrompt, options.denoise);
  var client_id = 'img2img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  var promptResult;
  try {
    promptResult = await comfyuiRequest('/prompt', 'POST', {
      prompt: workflow,
      client_id: client_id
    });
  } catch (submitErr) {
    throw new Error('提交任务失败: ' + submitErr.message);
  }

  var promptId = promptResult.prompt_id;
  console.log('[ComfyUI-Img2Img] 任务已提交, prompt_id:', promptId);

  // 轮询等待
  var outputFilename = null;
  var startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT) {
    await new Promise(function (r) { setTimeout(r, POLL_INTERVAL); });
    try {
      var history = await comfyuiRequest('/history/' + promptId);
      var item = history[promptId];
      if (!item) continue;
      var status = item.status || {};
      if (status.completed || status.status_str === 'success') {
        var outputs = item.outputs;
        if (outputs) {
          for (var nodeId in outputs) {
            var nodeOutput = outputs[nodeId];
            if (nodeOutput.images && nodeOutput.images.length) {
              outputFilename = nodeOutput.images[0].filename;
              var sf = nodeOutput.images[0].subfolder || '';
              if (sf) outputFilename = sf + '/' + outputFilename;
              break;
            }
          }
        }
        break;
      }
      if (status.status_str === 'error') {
        var errMsg = (item.status && item.status.messages && JSON.stringify(item.status.messages)) || '未知错误';
        throw new Error('执行失败: ' + errMsg);
      }
    } catch (pollErr) {
      if (pollErr.message && pollErr.message.indexOf('执行失败') >= 0) throw pollErr;
    }
  }

  if (!outputFilename) throw new Error('等待超时');

  try {
    var resultBuffer = await downloadFromComfyui(outputFilename);
    // 放大回原始尺寸
    if (meta.width > 768 || meta.height > 768) {
      resultBuffer = await sharp(resultBuffer)
        .resize(meta.width, meta.height, { fit: 'fill' })
        .png().toBuffer();
      console.log('[ComfyUI-Img2Img] 放大回', meta.width + 'x' + meta.height);
    }
    console.log('[ComfyUI-Img2Img] 完成, 耗时:', Date.now() - t0, 'ms');
    return resultBuffer;
  } catch (downloadErr) {
    throw new Error('下载结果失败: ' + downloadErr.message);
  }
}

// ========== 导出 ==========

module.exports = {
  inpaint: inpaint,
  removeBackground: removeBackground,
  buildRembgWorkflow: buildRembgWorkflow,
  isAvailable: isAvailable,
  checkHealth: checkHealth,
  getComfyuiBase: getComfyuiBase,
  setComfyuiBase: setComfyuiBase,
  getComfyuiCreds: getComfyuiCreds,
  setComfyuiCreds: setComfyuiCreds,
  getComfyuiToken: getComfyuiToken,
  getModelList: getModelList,
  updateWorkflowModel: updateWorkflowModel,
  getWorkflowModel: getWorkflowModel,
  img2img: img2img
};
