// AI 图片编辑 — 抠图/修复/智能检测 + OCR文字处理
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

var providers = require('./providers');

var UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
var lamaService = require('../../services/inpaint');
var comfyuiInpaint = null;
try { comfyuiInpaint = require('../../services/comfyui-inpaint'); } catch (e) {}
var sizeAnnotate = require('../../services/size-annotate');

// 自动选择修复服务：ComfyUI（GPU）优先，降级 LaMa（CPU）
function getInpaintService() {
  if (comfyuiInpaint && comfyuiInpaint.isAvailable()) return comfyuiInpaint;
  return lamaService;
}

// ===== AI消除/修复 =====
router.post('/inpaint', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var maskBase64 = req.body.mask_base64;

  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });
  if (!maskBase64) return res.status(400).json({ error: '请先用画笔/框选标记要消除的区域' });

  var svc = getInpaintService();
  var modelOk = svc.isModelAvailable ? svc.isModelAvailable() : svc.isAvailable();
  if (!modelOk) {
    return res.status(503).json({ error: '修复模型未安装，请检查LaMa或ComfyUI配置' });
  }

  var imgBuf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  var maskBuf = Buffer.from(maskBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

  console.log('[AI消除] LaMa推理中...');
  var t0 = Date.now();

  svc.inpaint(imgBuf, maskBuf).then(function (resultBuf) {
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
  var detectType = req.body.type || 'watermark';

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

  var fullBase64 = imageBase64;
  if (!fullBase64.startsWith('data:')) {
    fullBase64 = 'data:image/png;base64,' + fullBase64;
  }

  var visionConfig = providers.getAIConfig('vision');
  providers.visionLLMRequest('/chat/completions', {
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
  }).then(function (result) {
    var text = result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    if (!text) return res.status(502).json({ error: 'AI未返回检测结果' });

    try {
      var jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      var regions = JSON.parse(jsonStr);
      if (!Array.isArray(regions)) regions = [];
      console.log('[智能检测] 检测到', regions.length, '个区域, type:', detectType);
      res.json({ ok: true, regions: regions, raw: text });
    } catch (e) {
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
  var comfyAvailable = comfyuiInpaint && comfyuiInpaint.isAvailable();
  var lamaAvailable = lamaService.isModelAvailable();
  res.json({
    available: comfyAvailable || lamaAvailable,
    comfyui: { available: comfyAvailable, url: comfyuiInpaint ? comfyuiInpaint.getComfyuiBase() : '' },
    lama: { available: lamaAvailable, model: 'LaMa (Local ONNX)' },
    active: comfyAvailable ? 'comfyui' : (lamaAvailable ? 'lama' : 'none')
  });
});

// ===== AI图片识别（通义千问VL）=====
router.post('/recognize-image', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var imageUrl = req.body.image_url;
  var prompt = req.body.prompt || '';
  var model = req.body.model || 'qwen3.6-flash';

  if (!imageBase64 && !imageUrl) return res.status(400).json({ error: '请提供图片' });

  if (!prompt) {
    prompt = '请识别这张图片的内容，包括：\n1. 商品类型（如服装、鞋包、数码、食品等）\n2. 主要特征（颜色、材质、款式）\n3. 风格描述（简约、复古、运动、商务等）\n4. 背景情况（纯色、场景、户外等）\n5. 图片尺寸用途建议（如适合淘宝主图、详情页、朋友圈等）\n请用简洁的中文描述，每项一行。';
  }

  var apiKey = providers.getQwenVlKey();
  if (!apiKey) return res.status(503).json({ error: '未配置通义千问VL API Key，请在API设置中配置' });

  // 构造图片内容：优先base64，其次URL
  var imageContent;
  if (imageBase64) {
    var fullBase64 = imageBase64;
    if (!fullBase64.startsWith('data:')) {
      fullBase64 = 'data:image/png;base64,' + fullBase64;
    }
    imageContent = fullBase64;
  } else {
    imageContent = imageUrl;
  }

  console.log('[AI识别] 开始, model:', model);
  var t0 = Date.now();

  providers.qwenVlRequest(imageContent, prompt, model, apiKey).then(function (result) {
    console.log('[AI识别] 完成, 耗时:', Date.now() - t0, 'ms, tokens:', result.totalTokens);
    res.json({ ok: true, text: result.text, tokens: result });
  }).catch(function (err) {
    console.error('[AI识别失败]', err.message);
    res.status(502).json({ error: err.message });
  });
});

// ===== AI抠图 — 原始端点（保留兼容，客户端CDN调用）=====
var https = require('https');
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
// ===== AI抠图（ComfyUI Rembg 优先 + ISNet 本地兜底）=====
var removeBgService = require('../../services/remove-bg');

router.post('/remove-bg-local', function (req, res) {
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '请先加载图片' });

  console.log('[AI抠图] 开始...');
  var t0 = Date.now();

  var base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  var buf = Buffer.from(base64Data, 'base64');

  // 优先用 ComfyUI Rembg（GPU，质量更好），降级到 ISNet 本地
  var removePromise;
  if (comfyuiInpaint && comfyuiInpaint.isAvailable()) {
    removePromise = comfyuiInpaint.removeBackground(buf);
  } else {
    removePromise = removeBgService.removeBackground(buf);
  }

  removePromise.then(function (resultBuf) {
    var filename = 'removebg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
    var filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFile(filepath, resultBuf, function (err) {
      if (err) return res.status(500).json({ error: '保存失败' });
      console.log('[AI抠图] 完成, 耗时:', Date.now() - t0, 'ms');
      res.json({ ok: true, url: '/uploads/' + filename });
    });
  }).catch(function (err) {
    console.error('[AI抠图失败]', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  });
});

// ===== PaddleOCR 文字检测 =====
var textCleaner = require('../../services/text-cleaner');
// ===== 换背景（抠图 + 合成，一步到位）=====
var replaceBgService = require('../../services/replace-bg-composite');

router.post('/replace-bg', function (req, res) {
  var productBase64 = req.body.product_base64;
  var bgBase64 = req.body.bg_base64;
  if (!productBase64 || !bgBase64) return res.status(400).json({ error: '请提供 product_base64 和 bg_base64' });

  console.log('[换背景] 开始...');
  var t0 = Date.now();

  var productBuf = Buffer.from(productBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  var bgBuf = Buffer.from(bgBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

  var opts = {
    scale: parseFloat(req.body.scale) || 0.7,
    position: req.body.position || 'center',
    padding: parseFloat(req.body.padding) || 0.05,
    shadow: req.body.shadow !== 'false'
  };

  replaceBgService.replaceBackground(productBuf, bgBuf, opts).then(function (resultBuf) {
    var filename = 'replacebg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png';
    var filepath = path.join(UPLOADS_DIR, filename);
    fs.writeFile(filepath, resultBuf, function (err) {
      if (err) return res.status(500).json({ error: '保存失败' });
      console.log('[换背景] 完成, 耗时:', Date.now() - t0, 'ms');
      res.json({ ok: true, url: '/uploads/' + filename });
    });
  }).catch(function (err) {
    console.error('[换背景失败]', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  });
});

router.post('/detect-text', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var imageUrl = req.body.image_url;
  var chineseOnly = req.body.chinese_only !== false;

  if (!imageBase64 && !imageUrl) return res.status(400).json({ error: '请提供 image_base64 或 image_url' });

  var detectPromise;
  if (imageBase64) {
    detectPromise = textCleaner.callOcrService(imageBase64, chineseOnly);
  } else {
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
      res.json({
        ok: true,
        cleaned: false,
        regions: result.regions || [],
        regionCount: (result.regions || []).length,
        message: result.message
      });
      return;
    }

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
  var images = req.body.images;
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
        return { ok: true, cleaned: true, url: url, base64: result.imageBuffer.toString('base64'), regionCount: result.regionCount };
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

// ===== 批量消除水印+中文（OCR + AI视觉 + LaMa）=====
router.post('/batch-clean', function (req, res) {
  var images = req.body.images;
  if (!Array.isArray(images) || !images.length) {
    return res.status(400).json({ error: '请提供 images 数组' });
  }

  var options = {
    enableOCR: req.body.enable_ocr !== false,          // 默认开启
    enableVision: req.body.enable_vision === true,     // 默认关闭（需API费用）
    visionType: req.body.vision_type || 'all',           // watermark/text/all
    chineseOnly: req.body.chinese_only !== false,
    minConfidence: req.body.min_confidence || 0.5,
    dilatePx: req.body.dilate_px || 20
  };

  var uploadToSmms = req.body.upload_to_smms === true;  // 上传到图床而非保存本地
  var concurrency = Math.min(req.body.concurrency || 2, 4); // LaMa是CPU推理，默认2并发

  console.log('[批量清理] 处理 ' + images.length + ' 张图片, OCR:' + options.enableOCR + ', Vision:' + options.enableVision + ', 并发:' + concurrency);
  var t0 = Date.now();

  // 并发控制
  var idx = 0;
  var results = [];

  function processNext() {
    if (idx >= images.length) return Promise.resolve();
    var i = idx++;
    var img = images[i];

    var imagePromise;
    if (img.base64) {
      imagePromise = Promise.resolve(Buffer.from(img.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
    } else if (img.url) {
      imagePromise = textCleaner.downloadImage(img.url);
    } else {
      return Promise.resolve({ index: i, ok: true, cleaned: false, message: 'No image data' });
    }

    return imagePromise.then(function (buf) {
      return textCleaner.cleanImage(buf, options);
    }).then(function (result) {
      if (!result.cleaned) {
        results[i] = {
          index: i, ok: true, cleaned: false,
          ocrCount: (result.ocrRegions || []).length,
          visionCount: (result.visionRegions || []).length,
          regions: result.regions || [],
          message: result.message
        };
        return;
      }
      if (uploadToSmms) {
        return textCleaner.uploadToSmms(result.imageBuffer).then(function (smmsUrl) {
          results[i] = {
            index: i, ok: true, cleaned: true, url: smmsUrl,
            ocrCount: (result.ocrRegions || []).length,
            visionCount: (result.visionRegions || []).length,
            regionCount: result.regionCount,
            regions: result.regions
          };
        }).catch(function (err) {
          // 图床上传失败，降级保存本地
          console.warn('[批量清理] 图床上传失败，降级本地:', err.message);
          return textCleaner.saveCleanedImage(result.imageBuffer).then(function (localUrl) {
            results[i] = {
              index: i, ok: true, cleaned: true, url: localUrl,
              ocrCount: (result.ocrRegions || []).length,
              visionCount: (result.visionRegions || []).length,
              regionCount: result.regionCount,
              regions: result.regions
            };
          });
        });
      } else {
      return textCleaner.saveCleanedImage(result.imageBuffer).then(function (url) {
        results[i] = {
          index: i, ok: true, cleaned: true, url: url,
          ocrCount: (result.ocrRegions || []).length,
          visionCount: (result.visionRegions || []).length,
          regionCount: result.regionCount,
          regions: result.regions,
          imageWidth: result.imageWidth,
          imageHeight: result.imageHeight
        };
      });
      }
    }).catch(function (err) {
      results[i] = { index: i, ok: false, error: err.message };
      console.error('[批量清理] 图片#' + i + '失败:', err.message);
    });
  }

  // 使用分批并发
  function runBatch() {
    var workers = [];
    for (var w = 0; w < concurrency; w++) {
      workers.push(
        (function workerLoop() {
          return processNext().then(function (r) {
            if (idx < images.length) return workerLoop();
            return r;
          });
        })()
      );
    }
    return Promise.all(workers);
  }

  runBatch().then(function () {
    var elapsed = Date.now() - t0;
    var finalResults = results.filter(Boolean);
    var cleaned = finalResults.filter(function (r) { return r.cleaned; }).length;
    var failed = finalResults.filter(function (r) { return r.ok === false; }).length;
    console.log('[批量清理] 完成, ' + cleaned + '/' + images.length + ' 张被清理, ' + failed + ' 失败, 耗时: ' + elapsed + 'ms');
    res.json({
      ok: true,
      results: finalResults,
      total: images.length,
      cleaned: cleaned,
      failed: failed,
      elapsed_ms: elapsed
    });
  }).catch(function (err) {
    console.error('[批量清理] 整体失败:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
});

// ===== OCR提取尺寸（标注功能）=====
router.post('/detect-sizes', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var imageUrl = req.body.image_url;

  if (!imageBase64 && !imageUrl) return res.status(400).json({ error: '请提供图片' });

  console.log('[尺寸检测] 开始...');
  var t0 = Date.now();

  var imagePromise;
  if (imageBase64) {
    var b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    imagePromise = Promise.resolve(Buffer.from(b64, 'base64'));
  } else {
    imagePromise = new Promise(function (resolve, reject) {
      var proto = imageUrl.startsWith('https') ? require('https') : require('http');
      proto.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (r) {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          proto.get(r.headers.location, function (r2) {
            var chunks = [];
            r2.on('data', function (c) { chunks.push(c); });
            r2.on('end', function () { resolve(Buffer.concat(chunks)); });
          }).on('error', reject);
          return;
        }
        var chunks = [];
        r.on('data', function (c) { chunks.push(c); });
        r.on('end', function () { resolve(Buffer.concat(chunks)); });
      }).on('error', reject);
    });
  }

  imagePromise.then(function (buf) {
    return sizeAnnotate.detectSizes(buf);
  }).then(function (result) {
    console.log('[尺寸检测] 完成, 耗时:', Date.now() - t0, 'ms, 检测到', result.sizeGroups.length, '组尺寸');
    res.json(result);
  }).catch(function (err) {
    console.error('[尺寸检测失败]', err.message);
    res.status(502).json({ error: '尺寸检测失败: ' + err.message });
  });
});

// ===== 生成标注图 =====
router.post('/annotate-image', function (req, res) {
  var imageBase64 = req.body.image_base64;
  var imageUrl = req.body.image_url;
  var widthCm = parseFloat(req.body.width_cm);
  var heightCm = parseFloat(req.body.height_cm);
  var unit = req.body.unit || 'cm';

  if (!imageBase64 && !imageUrl) return res.status(400).json({ error: '请提供图片' });
  if (!widthCm || widthCm <= 0) return res.status(400).json({ error: '请提供宽度' });

  console.log('[标注图] 生成中...', widthCm, 'x', heightCm, unit);
  var t0 = Date.now();

  var imagePromise;
  if (imageBase64) {
    var b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    imagePromise = Promise.resolve(Buffer.from(b64, 'base64'));
  } else {
    imagePromise = new Promise(function (resolve, reject) {
      var proto = imageUrl.startsWith('https') ? require('https') : require('http');
      proto.get(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (r) {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          proto.get(r.headers.location, function (r2) {
            var chunks = [];
            r2.on('data', function (c) { chunks.push(c); });
            r2.on('end', function () { resolve(Buffer.concat(chunks)); });
          }).on('error', reject);
          return;
        }
        var chunks = [];
        r.on('data', function (c) { chunks.push(c); });
        r.on('end', function () { resolve(Buffer.concat(chunks)); });
      }).on('error', reject);
    });
  }

  imagePromise.then(function (buf) {
    return sizeAnnotate.annotateImage(buf, widthCm, heightCm, { unit: unit });
  }).then(function (result) {
    return sizeAnnotate.saveAnnotatedImage(result.imageBuffer).then(function (url) {
      console.log('[标注图] 完成, 耗时:', Date.now() - t0, 'ms');
      res.json({
        ok: true,
        url: url,
        base64: result.imageBuffer.toString('base64'),
        width: result.imageWidth,
        height: result.imageHeight
      });
    });
  }).catch(function (err) {
    console.error('[标注图失败]', err.message);
    res.status(502).json({ error: '标注图生成失败: ' + err.message });
  });
});

// ===== OCR 服务状态检查 =====
router.get('/ocr-status', function (req, res) {
  textCleaner.checkOcrHealth().then(function (status) {
    var comfyAvailable = comfyuiInpaint && comfyuiInpaint.isAvailable();
    var lamaAvailable = lamaService.isModelAvailable();
    var inpaintReady = comfyAvailable || lamaAvailable;
    res.json({
      ocr: status,
      lama: { available: lamaAvailable, model: 'LaMa (Local ONNX)' },
      comfyui: { available: comfyAvailable },
      pipeline: status.status === 'ok' && inpaintReady ? 'ready' : 'partial',
      inpaint: { ready: inpaintReady, backend: comfyAvailable ? 'ComfyUI' : (lamaAvailable ? 'LaMa' : 'none') }
    });
  });
});

module.exports = router;
