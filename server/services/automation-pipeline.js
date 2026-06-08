/**
 * 自动化处理流水线
 *
 * 核心功能：
 * - 串行处理队列（一次一个商品，内部图片并行）
 * - 智能跳过（质检结果驱动后续步骤）
 * - 自动重试 + 降级策略
 * - SSE 进度广播
 * - 7步流水线：质检 → 去水印+白底图(并行) → 尺寸标注 → 分类推荐(双通道) → 标题优化 → 上传ImgBB → 诊断
 */

var http = require('http');
var https = require('https');

var VALID_STAGES = ['none', 'processing', 'draft', 'ready', 'published', 'failed'];

// 合法 stage 转换
var ALLOWED_TRANSITIONS = {
  none: ['processing'],
  processing: ['draft', 'failed'],
  draft: ['ready', 'none', 'failed'],
  ready: ['published', 'draft'],
  published: ['draft'],
  failed: ['none', 'processing']
};

// 已知 issue code 列表
var KNOWN_ISSUE_CODES = [
  'no_size_detected', 'no_category', 'category_low_confidence',
  'category_conflict', 'no_white_bg', 'clean_failed', 'quality_low',
  'quality_low_score', 'upload_partial', 'ocr_error', 'pipeline_error',
  'title_unchanged', 'no_selling_points'
];

// 队列状态
var queue = {
  state: 'idle',        // idle | running
  currentUid: null,
  pending: [],           // 待处理 uid 列表
  processingAt: 0        // 当前商品开始处理的时间
};

/**
 * 验证 stage 值是否合法
 */
function isValidStage(stage) {
  return VALID_STAGES.indexOf(stage) >= 0;
}

/**
 * 验证 stage 转换是否合法
 */
function isValidTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from]) return false;
  return ALLOWED_TRANSITIONS[from].indexOf(to) >= 0;
}

/**
 * 构建空 automation_log 结构
 */
function createEmptyLog(uid) {
  return {
    steps: [],
    totalDuration: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null
  };
}

/**
 * 添加步骤结果到 log
 */
function addStepResult(log, name, status, duration, result, note) {
  var step = { name: name, status: status, duration: duration, result: result };
  if (note) step.note = note;
  if (result && result.skippable) step.skippable = true;
  log.steps.push(step);
}

/**
 * 计算处理总耗时
 */
function finalizeLog(log) {
  log.finishedAt = new Date().toISOString();
  var total = 0;
  log.steps.forEach(function (s) { total += (s.duration || 0); });
  log.totalDuration = total;
}

/**
 * 判断 SKU 数量是否超过阈值
 */
function skuCountExceeds(product, maxSku) {
  if (!product.skus) return false;
  try {
    var skus = typeof product.skus === 'string' ? JSON.parse(product.skus) : product.skus;
    return skus.length > maxSku;
  } catch (e) {
    return false;
  }
}

// ============================================================
// 新增工具函数
// ============================================================

/**
 * sleep utility
 */
function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/**
 * Check if error is transient (retryable)
 */
function isTransientError(err) {
  var msg = (err && err.message) || '';
  var keywords = ['timeout', '超时', 'ECONNRESET', 'ECONNREFUSED', 'rate', 'limit', '429', '限流', '速率', '频率', '暂时', 'temporarily', 'retry'];
  for (var i = 0; i < keywords.length; i++) {
    if (msg.toLowerCase().indexOf(keywords[i].toLowerCase()) >= 0) return true;
  }
  return false;
}

/**
 * Retry wrapper with fallback
 */
async function retryWrapper(fn, options) {
  var maxRetries = (options && options.maxRetries) || 1;
  var retryDelay = (options && options.retryDelay) || 2000;
  var fallbackFn = options && options.fallback;
  var stepName = (options && options.stepName) || 'unknown';

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      var isRetryable = isTransientError(e);
      if (attempt < maxRetries && isRetryable) {
        console.log('[Pipeline]', stepName, '重试', attempt + 1, '/', maxRetries, e.message);
        await sleep(retryDelay * (attempt + 1)); // exponential-ish backoff
        continue;
      }
      if (fallbackFn) {
        console.log('[Pipeline]', stepName, '主流程失败，尝试降级方案:', e.message);
        try { return await fallbackFn(); }
        catch (fe) { throw fe; }
      }
      throw e;
    }
  }
}

/**
 * Sort products by estimated processing complexity (simpler first for quick feedback)
 */
function sortByPriority(uids, db) {
  if (!db || !db.getOne) return uids;
  var products = [];
  var notFound = [];
  uids.forEach(function (uid) {
    try {
      var p = db.getOne('SELECT uid, main_images, skus, custom_category FROM products WHERE uid = ?', [uid]);
      if (p) {
        var imgCount = 0;
        try { imgCount = JSON.parse(p.main_images || '[]').length; } catch (e) {}
        var skuCount = 0;
        try { skuCount = JSON.parse(p.skus || '[]').length; } catch (e) {}
        var hasCategory = !!(p.custom_category);
        products.push({ uid: uid, score: imgCount * 3 + skuCount * 2 + (hasCategory ? 10 : 0) });
      } else {
        notFound.push(uid);
      }
    } catch (e) {
      notFound.push(uid);
    }
  });
  products.sort(function (a, b) { return a.score - b.score; });
  return products.map(function (p) { return p.uid; }).concat(notFound);
}

/**
 * Cross-validate text and vision category results
 */
function crossValidateCategory(textCat, textConf, visionCat, visionConf) {
  // Both agree
  if (textCat && visionCat && textCat === visionCat) {
    var avgConf = (textConf + visionConf) / 2;
    return { category: textCat, confidence: Math.min(avgConf * 1.1, 0.99), validated: true, source: 'dual_agree' };
  }
  // Both exist but disagree
  if (textCat && visionCat && textCat !== visionCat) {
    // Pick the higher confidence one, flag for review
    if (textConf >= visionConf) {
      return { category: textCat, confidence: textConf, validated: false, conflict: visionCat, source: 'text_higher' };
    }
    return { category: visionCat, confidence: visionConf, validated: false, conflict: textCat, source: 'vision_higher' };
  }
  // Only one available
  if (textCat) return { category: textCat, confidence: textConf, validated: false, source: 'text_only' };
  if (visionCat) return { category: visionCat, confidence: visionConf, validated: false, source: 'vision_only' };
  return { category: '', confidence: 0, validated: false, source: 'none' };
}

/**
 * 生成数据诊断 issues 列表
 */
function diagnoseIssues(product, log) {
  var issues = [];

  // 检查分类
  if (!product.custom_category) {
    issues.push({ code: 'no_category', level: 'warning', message: '分类推荐未成功' });
  }

  // 检查尺寸标注
  var sizeStep = log.steps.find(function (s) { return s.name === 'size_annotate'; });
  if (sizeStep && sizeStep.result) {
    if (sizeStep.result.no_size === sizeStep.result.total) {
      issues.push({ code: 'no_size_detected', level: 'warning', message: '所有图片均未识别到尺寸' });
    }
  }

  // 检查白底图
  var bgStep = log.steps.find(function (s) { return s.name === 'white_bg'; });
  if (bgStep && bgStep.result && bgStep.result.failed > 0 && bgStep.result.generated === 0) {
    issues.push({ code: 'no_white_bg', level: 'warning', message: '白底图生成全部失败' });
  }

  // 检查去水印
  var cleanStep = log.steps.find(function (s) { return s.name === 'clean_watermark'; });
  if (cleanStep && cleanStep.status === 'error') {
    issues.push({ code: 'clean_failed', level: 'warning', message: '去水印失败' });
  }

  // 检查上传
  var uploadStep = log.steps.find(function (s) { return s.name === 'upload_imgbb'; });
  if (uploadStep && uploadStep.result && uploadStep.result.failed > 0) {
    issues.push({ code: 'upload_partial', level: 'warning', message: '部分图片上传 ImgBB 失败' });
  }

  // 检查分类置信度
  var catStep = log.steps.find(function (s) { return s.name === 'category_recommend'; });
  if (catStep && catStep.result && catStep.result.confidence < 0.7) {
    issues.push({ code: 'category_low_confidence', level: 'warning', message: '分类置信度' + catStep.result.confidence.toFixed(2) + '，建议人工确认' });
  }

  // 检查分类冲突
  if (catStep && catStep.result && catStep.result.conflict) {
    issues.push({ code: 'category_conflict', level: 'warning', message: '视觉与文本分类不一致：' + catStep.result.category + ' vs ' + catStep.result.conflict });
  }

  // 检查质量评分
  var qualityStep = log.steps.find(function (s) { return s.name === 'quality_check'; });
  if (qualityStep && qualityStep.result && qualityStep.result.quality_score && qualityStep.result.quality_score < 50) {
    issues.push({ code: 'quality_low_score', level: 'warning', message: '图片质量评分低：' + qualityStep.result.quality_score + '/100' });
  }

  return issues;
}

/**
 * 获取队列状态（供 API 使用）
 */
function getQueueStatus() {
  return {
    state: queue.state,
    currentUid: queue.currentUid,
    pending: queue.pending.length
  };
}

// ============================================================
// Pipeline 核心: 下载图片工具
// ============================================================

function downloadImage(url) {
  return new Promise(function (resolve, reject) {
    var proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

// ============================================================
// Pipeline 核心: processProduct — 7步流水线
// ============================================================

async function processProduct(uid, db) {
  var startTime = Date.now();
  var log = createEmptyLog(uid);

  try {
    // 0. 加载产品数据
    var product = db.getOne('SELECT * FROM products WHERE uid = ?', [uid]);
    if (!product) throw new Error('Product not found: ' + uid);

    // 0.5 更新 stage = 'processing'
    db.run("UPDATE products SET automation_stage = 'processing', automation_started_at = ?, automation_log = ?, automation_issues = '' WHERE uid = ?",
      [new Date().toISOString(), JSON.stringify(log), uid]);

    var mainImages = JSON.parse(product.main_images || '[]');
    if (mainImages.length === 0) {
      throw new Error('No images');
    }

    // ===== Step 1: 智能质检（Vision LLM）=====
    var qualityResult = {};
    var firstImgBuf = null;
    try {
      var t0 = Date.now();
      var firstImgUrl = mainImages[0];
      firstImgBuf = await downloadImage(firstImgUrl);
      var providers = require('../routes/ai/providers');

      var messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + firstImgBuf.toString('base64') } },
          { type: 'text', text: '分析这张商品图片，返回严格JSON格式（不要markdown标记）：{"watermark":true或false,"chinese_text":true或false,"background_complexity":"simple或medium或complex","has_size_info":true或false,"quality":"high或medium或low","quality_score":0到100的数字,"quality_summary":"一句话描述图片质量","selling_points":["卖点1","卖点2"],"visual_attrs":{"colors":["颜色1"],"material":"材质","style":"风格","scene":["场景1"],"shape":"形状","product_type":"商品类型","suggested_category":"建议分类"},"actions_needed":["需要的处理动作"]}' }
        ]
      }];
      var resp = await providers.visionLLMRequest('/chat/completions', { messages: messages });
      var text = '';
      if (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) {
        text = resp.choices[0].message.content;
      } else if (typeof resp === 'string') {
        text = resp;
      } else {
        text = JSON.stringify(resp);
      }
      var jsonMatch = text.match(/\{[\s\S]*\}/);
      qualityResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      addStepResult(log, 'quality_check', 'ok', Date.now() - t0, qualityResult);
    } catch (e) {
      addStepResult(log, 'quality_check', 'error', 0, null, e.message);
      qualityResult = { watermark: true, background_complexity: 'complex' };
    }

    // ===== Step 2+3: Parallel Image Processing Pipeline =====
    // Process each image independently with its own clean -> bg pipeline
    var processedImages = [];
    try {
      var t1 = Date.now();
      var hasWatermark = qualityResult.watermark || qualityResult.chinese_text;
      var bgComplex = qualityResult.background_complexity;

      processedImages = await Promise.all(mainImages.map(function (url, idx) {
        return (async function () {
          var buf = await retryWrapper(function () { return downloadImage(url); }, { maxRetries: 1, stepName: 'download' });
          var cleaned = false;
          var generated = false;

          // Clean watermark/text if detected
          if (hasWatermark) {
            try {
              var textCleaner = require('../services/text-cleaner');
              var cleanResult = await retryWrapper(
                function () { return textCleaner.cleanImage(buf, { chineseOnly: false }); },
                { maxRetries: 1, stepName: 'clean', fallback: function () { return { cleaned: false }; } }
              );
              if (cleanResult.cleaned && cleanResult.imageBuffer) {
                buf = cleanResult.imageBuffer;
                cleaned = true;
              }
            } catch (e) { /* keep original */ }
          }

          // Remove background if complex
          if (bgComplex !== 'simple') {
            try {
              var removeBg = require('../services/remove-bg');
              var bgResult = await retryWrapper(
                function () { return removeBg.removeBackground(buf); },
                {
                  maxRetries: 1, stepName: 'remove_bg',
                  fallback: function () {
                    var comfyui = null;
                    try { comfyui = require('./comfyui-inpaint'); } catch (e) {}
                    if (comfyui && comfyui.isAvailable()) return comfyui.removeBackground(buf);
                    return { ok: false };
                  }
                }
              );
              if (bgResult.ok && bgResult.imageBuffer) {
                var sharp = require('sharp');
                var meta = await sharp(bgResult.imageBuffer).metadata();
                buf = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
                  .composite([{ input: bgResult.imageBuffer }]).png().toBuffer();
                generated = true;
              }
            } catch (e) { /* keep as-is */ }
          }

          return { url: url, buffer: buf, cleaned: cleaned, generated: generated };
        })();
      }));

      var totalCleaned = processedImages.filter(function (img) { return img.cleaned; }).length;
      var totalGenerated = processedImages.filter(function (img) { return img.generated; }).length;
      if (!hasWatermark) {
        addStepResult(log, 'clean_watermark', 'skipped', 0, { reason: 'no_watermark' });
      } else {
        addStepResult(log, 'clean_watermark', 'ok', Date.now() - t1, { total: mainImages.length, cleaned: totalCleaned });
      }
      if (bgComplex === 'simple') {
        addStepResult(log, 'white_bg', 'skipped', 0, { reason: 'bg_simple' });
      } else {
        addStepResult(log, 'white_bg', 'ok', Date.now() - t1, { total: processedImages.length, generated: totalGenerated, failed: processedImages.length - totalGenerated });
      }
    } catch (e) {
      addStepResult(log, 'clean_watermark', 'error', 0, null, e.message);
      addStepResult(log, 'white_bg', 'error', 0, null, e.message);
      processedImages = await Promise.all(mainImages.map(function (url) {
        return (async function () {
          var buf = await downloadImage(url);
          return { url: url, buffer: buf, cleaned: false, generated: false };
        })();
      }));
    }

    // ===== Step 4: 尺寸标注（最多1张）=====
    try {
      var t3 = Date.now();
      var hasSizeInfo = qualityResult.has_size_info;
      var sizeResult = { annotated: 0, total: 0, no_size: 0 };

      if (!hasSizeInfo) {
        addStepResult(log, 'size_annotate', 'skipped', Date.now() - t3, { reason: 'no_size_info' });
      } else {
        var sizeAnnotate = require('../services/size-annotate');
        for (var k = 0; k < processedImages.length && sizeResult.annotated === 0; k++) {
          try {
            var detectResult = await retryWrapper(
              function () { return sizeAnnotate.detectSizes(processedImages[k].buffer); },
              { maxRetries: 1, stepName: 'ocr_detect' }
            );
            if (detectResult.ok && detectResult.sizes && detectResult.sizes.length > 0) {
              var annoResult = await retryWrapper(
                function () { return sizeAnnotate.annotateImage(processedImages[k].buffer, detectResult.sizes); },
                { maxRetries: 1, stepName: 'ocr_annotate' }
              );
              if (annoResult.ok && annoResult.imageBuffer) {
                processedImages[k].buffer = annoResult.imageBuffer;
                processedImages[k].sizeAnnotated = true;
                sizeResult.annotated++;
              }
            } else {
              sizeResult.no_size++;
            }
            sizeResult.total++;
          } catch (e) {
            sizeResult.total++;
            sizeResult.no_size++;
          }
        }
        addStepResult(log, 'size_annotate', 'ok', Date.now() - t3, sizeResult);
      }
    } catch (e) {
      addStepResult(log, 'size_annotate', 'error', 0, null, e.message);
    }

    // ===== Step 5: 分类推荐 =====
    var categoryResult = {};
    var catResp = null;
    try {
      var t4 = Date.now();
      var attrs = JSON.parse(product.attrs || '[]');
      catResp = await new Promise(function (resolve, reject) {
        var body = JSON.stringify({
          title: product.title,
          ali_category: product.category || '',
          attrs: attrs
        });
        var options = {
          hostname: '127.0.0.1',
          port: 3000,
          path: '/api/ai/suggest-category',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        };
        var req = http.request(options, function (res) {
          var data = '';
          res.on('data', function (chunk) { data += chunk; });
          res.on('end', function () {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      if (catResp.ok) {
        var customCategory = catResp.category || '';
        var dxmCategory = catResp.path ? JSON.stringify({ path: catResp.path, leafName: customCategory }) : '';
        db.run("UPDATE products SET custom_category = ?, dxm_category = ? WHERE uid = ?",
          [customCategory, dxmCategory, uid]);
        product.custom_category = customCategory;
        categoryResult = { ok: true, category: customCategory, confidence: catResp.confidence || 0 };
      }
      addStepResult(log, 'category_recommend', 'ok', Date.now() - t4, categoryResult);
    } catch (e) {
      addStepResult(log, 'category_recommend', 'error', 0, null, e.message);
    }

    // ===== Step 5a: Vision classification (dual-channel) =====
    var visionCategory = '';
    var visionConfidence = 0;
    try {
      if (mainImages.length > 0 && firstImgBuf) {
        var providersVision = require('../routes/ai/providers');
        var visionMsg = [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + firstImgBuf.toString('base64') } },
            { type: 'text', text: '判断这张商品图片属于什么分类？返回严格JSON：{"category":"分类名","confidence":0到1的数字,"product_type":"商品类型"}。只返回JSON。' }
          ]
        }];
        var visionResp = await providersVision.visionLLMRequest('/chat/completions', {
          messages: visionMsg, temperature: 0.1, max_tokens: 256
        });
        var visionText = '';
        if (visionResp && visionResp.choices && visionResp.choices[0] && visionResp.choices[0].message && visionResp.choices[0].message.content) {
          visionText = visionResp.choices[0].message.content;
        }
        var visionJsonMatch = visionText.match(/\{[\s\S]*\}/);
        if (visionJsonMatch) {
          var visionParsed = JSON.parse(visionJsonMatch[0]);
          visionCategory = visionParsed.category || '';
          visionConfidence = visionParsed.confidence || 0;
        }
      }
    } catch (e) {
      // Vision classification is optional enhancement
    }

    // Cross-validate text and vision results
    var textCategory = categoryResult.category || '';
    var textConfidence = categoryResult.confidence || 0;
    var validationResult = crossValidateCategory(textCategory, textConfidence, visionCategory, visionConfidence);

    // If vision improved the result, update
    if (validationResult.category && validationResult.confidence > textConfidence) {
      var valCategory = validationResult.category;
      var valDxmCategory = catResp && catResp.path ? JSON.stringify({ path: catResp.path, leafName: valCategory }) : '';
      db.run("UPDATE products SET custom_category = ?, dxm_category = ? WHERE uid = ?", [valCategory, valDxmCategory, uid]);
      product.custom_category = valCategory;
      categoryResult = { ok: true, category: valCategory, confidence: validationResult.confidence, source: validationResult.source, validated: validationResult.validated };
    }
    if (validationResult.conflict) {
      categoryResult.conflict = validationResult.conflict;
    }

    // Update category_recommend step result with validation info
    var catLogStep = log.steps.find(function (s) { return s.name === 'category_recommend'; });
    if (catLogStep) {
      catLogStep.result = categoryResult;
    }

    // ===== Step 5b + Step 6: Parallel (标题优化 + 上传 ImgBB) =====
    var uploadedUrls = [];

    await Promise.all([
      // Step 5b: 标题优化
      (async function () {
        try {
          var t5b = Date.now();
          var providersTitle = require('../routes/ai/providers');
          var titlePrompt = '优化以下电商商品标题，要求：1.保留核心关键词 2.去除冗余堆砌 3.控制在30字以内 4.用空格分隔关键词组。返回严格JSON：{"optimized_title":"优化后的标题","keywords":["关键词1","关键词2"]}。只返回JSON。\n\n原标题：' + (product.title || '') + '\n分类：' + (product.custom_category || '');
          var titleResp = await providersTitle.categoryLLMRequest('/chat/completions', {
            messages: [{ role: 'user', content: titlePrompt }],
            temperature: 0.3, max_tokens: 256
          });
          var titleText = '';
          if (titleResp && titleResp.choices && titleResp.choices[0] && titleResp.choices[0].message && titleResp.choices[0].message.content) {
            titleText = titleResp.choices[0].message.content;
          }
          var titleJsonMatch = titleText.match(/\{[\s\S]*\}/);
          if (titleJsonMatch) {
            var titleParsed = JSON.parse(titleJsonMatch[0]);
            if (titleParsed.optimized_title) {
              var originalTitle = product.title;
              product.title = titleParsed.optimized_title;
              // Store original title for reference
              addStepResult(log, 'title_optimize', 'ok', Date.now() - t5b, { original: originalTitle, optimized: titleParsed.optimized_title, keywords: titleParsed.keywords || [] });
            }
          }
        } catch (e) {
          // Title optimization is optional
        }
      })(),

      // Step 6: 上传 ImgBB
      (async function () {
        try {
          var t5 = Date.now();
          var imgbb = require('../services/imgbb-upload');
          var uploadOk = 0, uploadFail = 0;

          for (var m = 0; m < processedImages.length; m++) {
            try {
              var filename = uid + '_' + m + '.png';
              var uploadResult = await imgbb.uploadToImgBB(processedImages[m].buffer, filename);
              if (uploadResult.ok) {
                uploadedUrls.push(uploadResult.url);
                uploadOk++;
              } else {
                uploadedUrls.push(processedImages[m].url);
                uploadFail++;
              }
            } catch (e) {
              uploadedUrls.push(processedImages[m].url);
              uploadFail++;
            }
          }
          addStepResult(log, 'upload_imgbb', 'ok', Date.now() - t5, { total: processedImages.length, ok: uploadOk, failed: uploadFail });

          if (uploadedUrls.length > 0) {
            db.run("UPDATE products SET main_images = ? WHERE uid = ?", [JSON.stringify(uploadedUrls), uid]);
          }
        } catch (e) {
          addStepResult(log, 'upload_imgbb', 'error', 0, null, e.message);
        }
      })()
    ]);

    // ===== Step 7: 诊断 + 完成 =====
    finalizeLog(log);
    var issues = diagnoseIssues(product, log);
    var issueJson = issues.length > 0 ? JSON.stringify(issues) : '';

    db.run("UPDATE products SET automation_stage = 'draft', automation_log = ?, automation_issues = ?, automation_finished_at = ? WHERE uid = ?",
      [JSON.stringify(log), issueJson, new Date().toISOString(), uid]);

    return { ok: true, uid: uid, stage: 'draft', issues: issues, log: log };

  } catch (e) {
    // 致命错误
    finalizeLog(log);
    addStepResult(log, 'pipeline_error', 'error', 0, null, e.message);
    var fatalIssues = [{ code: 'pipeline_error', level: 'error', message: e.message }];

    db.run("UPDATE products SET automation_stage = 'failed', automation_log = ?, automation_issues = ?, automation_finished_at = ? WHERE uid = ?",
      [JSON.stringify(log), JSON.stringify(fatalIssues), new Date().toISOString(), uid]);

    return { ok: false, uid: uid, stage: 'failed', error: e.message };
  }
}

// ============================================================
// Pipeline 核心: 队列处理
// ============================================================

async function startQueue(db) {
  if (queue.state === 'running') return;
  if (queue.pending.length === 0) {
    queue.state = 'idle';
    return;
  }

  queue.state = 'running';
  queue.currentUid = queue.pending.shift();
  queue.processingAt = Date.now();

  try {
    await processProduct(queue.currentUid, db);
  } catch (e) {
    console.error('[Pipeline] 处理失败:', queue.currentUid, e);
  }

  queue.currentUid = null;

  if (queue.pending.length > 0) {
    setImmediate(function () { startQueue(db); });
  } else {
    queue.state = 'idle';
  }
}

function enqueue(uids, db) {
  var added = [];
  uids.forEach(function (uid) {
    if (queue.pending.indexOf(uid) < 0 && queue.currentUid !== uid) {
      queue.pending.push(uid);
      added.push(uid);
    }
  });
  // Sort by priority (simpler products first)
  if (queue.pending.length > 1 && db) {
    var sorted = sortByPriority(queue.pending, db);
    queue.pending = sorted;
  }
  if (added.length > 0 && queue.state === 'idle') {
    setImmediate(function () { startQueue(db); });
  }
  return added;
}

// ============================================================
// Pipeline 核心: 恢复卡住的 job
// ============================================================

async function recoverStaleJobs(db) {
  var staleThreshold = 10 * 60 * 1000; // 10分钟
  var now = Date.now();
  var processing = db.getAll("SELECT uid, automation_started_at FROM products WHERE automation_stage = 'processing'");

  for (var i = 0; i < processing.length; i++) {
    var p = processing[i];
    if (!p.automation_started_at) {
      db.run("UPDATE products SET automation_stage = 'failed' WHERE uid = ?", [p.uid]);
      continue;
    }
    var started = new Date(p.automation_started_at).getTime();
    if (now - started > staleThreshold) {
      db.run("UPDATE products SET automation_stage = 'failed' WHERE uid = ?", [p.uid]);
    } else {
      queue.pending.unshift(p.uid);
    }
  }

  if (queue.pending.length > 0 && queue.state === 'idle') {
    setImmediate(function () { startQueue(db); });
  }
}

module.exports = {
  VALID_STAGES: VALID_STAGES,
  ALLOWED_TRANSITIONS: ALLOWED_TRANSITIONS,
  KNOWN_ISSUE_CODES: KNOWN_ISSUE_CODES,
  isValidStage: isValidStage,
  isValidTransition: isValidTransition,
  createEmptyLog: createEmptyLog,
  addStepResult: addStepResult,
  finalizeLog: finalizeLog,
  skuCountExceeds: skuCountExceeds,
  diagnoseIssues: diagnoseIssues,
  getQueueStatus: getQueueStatus,
  downloadImage: downloadImage,
  processProduct: processProduct,
  startQueue: startQueue,
  enqueue: enqueue,
  recoverStaleJobs: recoverStaleJobs,
  queue: queue,
  sleep: sleep,
  isTransientError: isTransientError,
  retryWrapper: retryWrapper,
  sortByPriority: sortByPriority,
  crossValidateCategory: crossValidateCategory
};
