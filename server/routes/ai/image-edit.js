// AI 图片编辑 — 抠图/修复/智能检测 + OCR文字处理
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

var providers = require('./providers');

var UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
var lamaService = require('../../services/inpaint');

// ===== AI消除/修复（本地LaMa ONNX推理）=====
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
  providers.zhipuRequest('/chat/completions', {
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
  res.json({
    available: lamaService.isModelAvailable(),
    model: 'LaMa (Local ONNX)'
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
var removeBgService = require('../../services/remove-bg');

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

// ===== PaddleOCR 文字检测 =====
var textCleaner = require('../../services/text-cleaner');

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

module.exports = router;
