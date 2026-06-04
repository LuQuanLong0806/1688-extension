// ComfyUI Inpaint 服务 — 替代 LaMa ONNX，通过 ComfyUI API 进行高质量修复
// ComfyUI API: POST /prompt → GET /history/{id} → GET /view?filename=xxx

const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ComfyUI 服务地址（从 settings 表读取，支持动态切换）
var COMFYUI_BASE = '';

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
}

// ========== 通用 ComfyUI API 请求 ==========

function comfyuiRequest(apiPath, method, body) {
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
      headers: {}
    };

    options.headers['Authorization'] = 'Basic YWRtaW46Y29tZnlpdTIwMjQ=';

    if (body) {
      var data = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    var req = proto.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          var json = JSON.parse(Buffer.concat(chunks).toString());
          if (res.statusCode >= 400) {
            reject(new Error('ComfyUI API ' + res.statusCode + ': ' + (json.error || JSON.stringify(json))));
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
}

// ========== 上传图片到 ComfyUI ==========

function uploadImage(imageBuffer, filename, subfolder) {
  var base = getComfyuiBase();
  return new Promise(function (resolve, reject) {
    var boundary = '----FormBoundary' + Date.now();
    var filename = filename || ('inpaint_' + Date.now() + '.png');
    var subfolder = subfolder || 'input';

    // multipart form
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
        'Authorization': 'Basic YWRtaW46Y29tZnlpdTIwMjQ=',
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': payload.length
      }
    };

    var req = proto.request(options, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        try {
          var json = JSON.parse(Buffer.concat(chunks).toString());
          if (json.name) {
            var name = subfolder ? (subfolder + '/' + json.name) : json.name;
            resolve(name);
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

function downloadFromComfyui(filename) {
  return new Promise(function (resolve, reject) {
    var base = getComfyuiBase();
    if (!base) return reject(new Error('未配置 ComfyUI 地址'));

    var url = new URL(base + '/view?' + new URLSearchParams({ filename: filename, type: 'output', subfolder: '' }));
    var proto = url.protocol === 'https:' ? https : http;

    proto.get({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: '/view?' + new URLSearchParams({ filename: filename, type: 'output' }),
      headers: { 'Accept': 'image/*', 'Authorization': 'Basic YWRtaW46Y29tZnlpdTIwMjQ=' }
    }, function (res) {
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
}

// ========== 检查 ComfyUI 是否可用 ==========

function isAvailable() {
  return !!getComfyuiBase();
}

async function checkHealth() {
  try {
    var stats = await comfyuiRequest('/system_stats');
    return { available: true, stats: stats };
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

// ========== 导出 ==========

module.exports = {
  inpaint: inpaint,
  isAvailable: isAvailable,
  checkHealth: checkHealth,
  getComfyuiBase: getComfyuiBase,
  setComfyuiBase: setComfyuiBase,
  getModelList: getModelList,
  updateWorkflowModel: updateWorkflowModel,
  getWorkflowModel: getWorkflowModel
};
