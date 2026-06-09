/**
 * 自动化处理流水线 v2
 *
 * 7步流水线：
 *   1. 智能筛选 — 本地预筛(尺寸/比例/去重) → AI批量精选(glm-4.6v-flash多图一次调用，选5~8张)
 *   2. 图片处理 — 去水印去中文 + 白底图(含选中SKU图)
 *   3. 尺寸标注 — OCR检测尺寸信息并标注
 *   4. 分类推荐 — 文本通道 + 视觉通道双路交叉验证
 *   5. 标题优化 — AI去堆砌优化
 *   6. 数据诊断 — 检查完整性，标记问题
 *   7. 上传图床 — 全部成功后一次性上传ImgBB，替换原图+SKU图URL
 *
 * 核心机制：
 * - SKU门控：选中SKU > 6个 → 跳过不处理，状态不变
 * - 本地预筛：sharp元数据检查 + dhash感知哈希去重，零API成本
 * - AI多图精选：glm-4.6v-flash一次请求评价全部图片，选出最优5~8张
 * - 上传时机：最后一步一次性上传，中途失败不浪费图床配额
 * - 状态流转：成功 → draft(草稿箱待人工审核)，失败 → none(可重试)
 * - SSE实时进度广播
 */

var http = require('http');
var https = require('https');

// SSE 广播函数（由外部注入）
var _sseBroadcast = null;

function setSseBroadcast(fn) {
  _sseBroadcast = fn;
}

function broadcast(event, data) {
  if (_sseBroadcast) {
    try { _sseBroadcast(event, data); } catch (e) {}
  }
}

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
 * 判断 SKU 选中数量是否超过阈值
 * 逻辑：有 _selected 属性则只统计 _selected===true 的，否则视为全选
 */
function skuCountExceeds(product, maxSku) {
  if (!product.skus) return false;
  try {
    var skus = typeof product.skus === 'string' ? JSON.parse(product.skus) : product.skus;
    if (!Array.isArray(skus) || skus.length === 0) return false;
    var hasSelectedProp = skus.some(function (s) { return s && s._selected !== undefined; });
    var selectedCount = hasSelectedProp
      ? skus.filter(function (s) { return s && s._selected === true; }).length
      : skus.length;
    return selectedCount > maxSku;
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
  var totalSteps = 7;

  try {
    // 0. 加载产品数据
    var product = db.getOne('SELECT * FROM products WHERE uid = ?', [uid]);
    if (!product) throw new Error('Product not found: ' + uid);

    // 0.5 更新 stage = 'processing'
    db.run("UPDATE products SET automation_stage = 'processing', automation_started_at = ?, automation_log = ?, automation_issues = '' WHERE uid = ?",
      [new Date().toISOString(), JSON.stringify(log), uid]);

    broadcast('pipeline-progress', { uid: uid, step: 0, total: totalSteps, stage: 'processing', message: '开始处理: ' + (product.title || uid).substring(0, 30) });

    var mainImages = JSON.parse(product.main_images || '[]');
    if (mainImages.length === 0) {
      throw new Error('No images');
    }

    broadcast('pipeline-progress', { uid: uid, step: 0, total: totalSteps, stage: 'processing', message: '加载完成，共 ' + mainImages.length + ' 张图片' });

    // ===== Step 1: 智能筛选（本地预筛 + AI 批量精选）=====
    var qualityResult = {};
    var firstImgBuf = null;
    var selectedImages = []; // 最终选中要处理的图片

    try {
      var t0 = Date.now();

      // 1a. 下载全部主图
      var allImageBufs = await Promise.all(mainImages.map(function (url) {
        return retryWrapper(function () { return downloadImage(url); }, { maxRetries: 1, stepName: 'download' })
          .then(function (buf) { return { url: url, buffer: buf }; })
          .catch(function () { return null; });
      }));
      allImageBufs = allImageBufs.filter(Boolean);
      firstImgBuf = allImageBufs.length > 0 ? allImageBufs[0].buffer : null;

      broadcast('pipeline-progress', { uid: uid, step: 1, total: totalSteps, stage: 'processing', message: 'Step 1/7 本地预筛中... 共 ' + allImageBufs.length + ' 张' });

      // 1b. 本地预筛（去小图/横幅/重复）
      var prefilter = require('../services/image-prefilter');
      var filteredImages = await prefilter.prefilterImages(allImageBufs);

      broadcast('pipeline-progress', { uid: uid, step: 1, total: totalSteps, stage: 'processing', message: 'Step 1/7 预筛: ' + allImageBufs.length + ' → ' + filteredImages.length + ' 张' });

      // 1c. AI 批量精选（多图一次调用）
      if (filteredImages.length > 0) {
        var sharp = require('sharp');
        var providers = require('../routes/ai/providers');

        // 缩小图片减少 payload，保留原始 buffer 给后续处理
        var content = [];
        for (var fi = 0; fi < filteredImages.length; fi++) {
          try {
            var small = await sharp(filteredImages[fi].buffer)
              .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 80 }).toBuffer();
            content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + small.toString('base64') } });
          } catch (e) {
            content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + filteredImages[fi].buffer.toString('base64') } });
          }
        }
        content.push({
          type: 'text',
          text: '分析这组商品图片(共' + filteredImages.length + '张)，按序号评估每张。返回严格JSON(不要markdown)：{"overall_quality":0到100,"has_watermark":true或false,"has_chinese_text":true或false,"background_complexity":"simple或medium或complex","has_size_info":true或false,"quality_summary":"一句话","visual_attrs":{"colors":[],"material":"","suggested_category":""},"images":[{"index":0,"score":85,"selected":true,"notes":"清晰主图"},{"index":1,"score":30,"selected":false,"notes":"重复角度"}]}。selected为true的保留(5-8张)，false的丢弃。按score降序排列。只返回JSON。'
        });

        var resp = await providers.visionLLMRequest('/chat/completions', { messages: [{ role: 'user', content: content }] });
        var text = (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || '';
        var jsonMatch = text.match(/\{[\s\S]*\}/);
        var curation = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

        qualityResult = {
          watermark: curation.has_watermark || false,
          chinese_text: curation.has_chinese_text || false,
          background_complexity: curation.background_complexity || 'medium',
          has_size_info: curation.has_size_info || false,
          quality_score: curation.overall_quality || 70,
          quality_summary: curation.quality_summary || '',
          visual_attrs: curation.visual_attrs || {}
        };

        // 从 AI 结果取选中图片
        if (curation.images && Array.isArray(curation.images)) {
          var ranked = curation.images
            .filter(function (img) { return img.selected !== false; })
            .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
            .slice(0, 8);
          selectedImages = ranked.map(function (r) {
            return filteredImages[r.index] || filteredImages[0];
          }).filter(Boolean);
        }

        // 如果 AI 没选中任何图，fallback 取前 5 张
        if (selectedImages.length === 0) {
          selectedImages = filteredImages.slice(0, Math.min(5, filteredImages.length));
        }
      }

      addStepResult(log, 'quality_check', 'ok', Date.now() - t0, { prefiltered: allImageBufs.length - filteredImages.length, curated: selectedImages.length, quality: qualityResult });
      broadcast('pipeline-progress', { uid: uid, step: 1, total: totalSteps, stage: 'processing', message: 'Step 1/7 筛选完成: ' + mainImages.length + ' → ' + selectedImages.length + ' 张, 质量' + (qualityResult.quality_score || '?') + '/100' });
    } catch (e) {
      addStepResult(log, 'quality_check', 'error', 0, null, e.message);
      qualityResult = { watermark: true, chinese_text: true, background_complexity: 'complex' };
      // fallback: 取所有图片
      selectedImages = await Promise.all(mainImages.slice(0, 8).map(function (url) {
        return downloadImage(url).then(function (buf) { return { url: url, buffer: buf }; }).catch(function () { return null; });
      }));
      selectedImages = selectedImages.filter(Boolean);
      if (selectedImages.length > 0) firstImgBuf = selectedImages[0].buffer;
      broadcast('pipeline-progress', { uid: uid, step: 1, total: totalSteps, stage: 'processing', message: 'Step 1/7 筛选失败，使用全部图片', error: e.message });
    }

    // 提取选中 SKU 图片
    var skus = JSON.parse(product.skus || '[]');
    var hasSelectedProp = skus.some(function (s) { return s && s._selected !== undefined; });
    var selectedSkus = hasSelectedProp
      ? skus.filter(function (s) { return s && s._selected === true; })
      : skus;
    var skuImageUrls = [];
    var seen = {};
    for (var si = 0; si < selectedSkus.length; si++) {
      var skuImg = selectedSkus[si] && selectedSkus[si].image;
      if (skuImg && !seen[skuImg]) {
        seen[skuImg] = true;
        skuImageUrls.push(skuImg);
      }
    }
    var skuImageBufs = [];
    if (skuImageUrls.length > 0) {
      skuImageBufs = await Promise.all(skuImageUrls.map(function (url) {
        return retryWrapper(function () { return downloadImage(url); }, { maxRetries: 1, stepName: 'download_sku' })
          .then(function (buf) { return { url: url, buffer: buf, isSku: true }; })
          .catch(function () { return null; });
      }));
      skuImageBufs = skuImageBufs.filter(Boolean);
    }

    // ===== Step 2: 图片处理（去水印 + 白底，含 SKU 图）=====
    var hasWatermark = qualityResult.watermark || qualityResult.chinese_text;
    var bgComplex = qualityResult.background_complexity;
    var allProcessable = selectedImages.concat(skuImageBufs);

    broadcast('pipeline-progress', { uid: uid, step: 2, total: totalSteps, stage: 'processing', message: 'Step 2/7 处理图片中... 共' + allProcessable.length + '张' + (skuImageBufs.length ? '(含' + skuImageBufs.length + '张SKU图)' : '') });

    var processedImages = [];
    try {
      var t1 = Date.now();

      processedImages = await Promise.all(allProcessable.map(function (img, idx) {
        return (async function () {
          var buf = img.buffer;
          var cleaned = false;
          var generated = false;

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
                var sharpMod = require('sharp');
                var meta = await sharpMod(bgResult.imageBuffer).metadata();
                buf = await sharpMod({ create: { width: meta.width, height: meta.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
                  .composite([{ input: bgResult.imageBuffer }]).png().toBuffer();
                generated = true;
              }
            } catch (e) { /* keep as-is */ }
          }

          return { url: img.url, buffer: buf, cleaned: cleaned, generated: generated, isSku: !!img.isSku };
        })();
      }));

      var totalCleaned = processedImages.filter(function (img) { return img.cleaned; }).length;
      var totalGenerated = processedImages.filter(function (img) { return img.generated; }).length;

      if (!hasWatermark) {
        addStepResult(log, 'clean_watermark', 'skipped', 0, { reason: 'no_watermark' });
      } else {
        addStepResult(log, 'clean_watermark', 'ok', Date.now() - t1, { total: allProcessable.length, cleaned: totalCleaned });
      }
      if (bgComplex === 'simple') {
        addStepResult(log, 'white_bg', 'skipped', 0, { reason: 'bg_simple' });
      } else {
        addStepResult(log, 'white_bg', 'ok', Date.now() - t1, { total: allProcessable.length, generated: totalGenerated });
      }
      broadcast('pipeline-progress', { uid: uid, step: 2, total: totalSteps, stage: 'processing', message: 'Step 2/7 完成: 去水印' + totalCleaned + '/' + allProcessable.length + ', 白底' + totalGenerated });
    } catch (e) {
      addStepResult(log, 'clean_watermark', 'error', 0, null, e.message);
      addStepResult(log, 'white_bg', 'error', 0, null, e.message);
      processedImages = allProcessable.map(function (img) {
        return { url: img.url, buffer: img.buffer, cleaned: false, generated: false, isSku: !!img.isSku };
      });
    }

    var processedMain = processedImages.filter(function (img) { return !img.isSku; });
    var processedSkus = processedImages.filter(function (img) { return img.isSku; });

    // ===== Step 3: 尺寸标注 =====
    var hasSizeInfo = qualityResult.has_size_info;
    broadcast('pipeline-progress', { uid: uid, step: 3, total: totalSteps, stage: 'processing', message: 'Step 3/7 尺寸标注' + (hasSizeInfo ? '中...' : ': 无尺寸信息，跳过') });
    try {
      var t3 = Date.now();
      var sizeResult = { annotated: 0, total: 0, no_size: 0 };

      if (!hasSizeInfo) {
        addStepResult(log, 'size_annotate', 'skipped', Date.now() - t3, { reason: 'no_size_info' });
      } else {
        var sizeAnnotate = require('../services/size-annotate');
        for (var k = 0; k < processedMain.length && sizeResult.annotated === 0; k++) {
          try {
            var detectResult = await retryWrapper(
              function () { return sizeAnnotate.detectSizes(processedMain[k].buffer); },
              { maxRetries: 1, stepName: 'ocr_detect' }
            );
            if (detectResult.ok && detectResult.sizes && detectResult.sizes.length > 0) {
              var annoResult = await retryWrapper(
                function () { return sizeAnnotate.annotateImage(processedMain[k].buffer, detectResult.sizes); },
                { maxRetries: 1, stepName: 'ocr_annotate' }
              );
              if (annoResult.ok && annoResult.imageBuffer) {
                processedMain[k].buffer = annoResult.imageBuffer;
                processedMain[k].sizeAnnotated = true;
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

    // ===== Step 4: 分类推荐 =====
    var categoryResult = {};
    var catResp = null;
    broadcast('pipeline-progress', { uid: uid, step: 4, total: totalSteps, stage: 'processing', message: 'Step 4/7 分类推荐中...' });
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

    // 视觉分类验证（dual-channel）
    var visionCategory = '';
    var visionConfidence = 0;
    try {
      if (firstImgBuf) {
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
        var visionText = (visionResp && visionResp.choices && visionResp.choices[0] && visionResp.choices[0].message && visionResp.choices[0].message.content) || '';
        var visionJsonMatch = visionText.match(/\{[\s\S]*\}/);
        if (visionJsonMatch) {
          var visionParsed = JSON.parse(visionJsonMatch[0]);
          visionCategory = visionParsed.category || '';
          visionConfidence = visionParsed.confidence || 0;
        }
      }
    } catch (e) { /* optional */ }

    var textCategory = categoryResult.category || '';
    var textConfidence = categoryResult.confidence || 0;
    var validationResult = crossValidateCategory(textCategory, textConfidence, visionCategory, visionConfidence);
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
    var catLogStep = log.steps.find(function (s) { return s.name === 'category_recommend'; });
    if (catLogStep) catLogStep.result = categoryResult;

    broadcast('pipeline-progress', { uid: uid, step: 4, total: totalSteps, stage: 'processing', message: 'Step 4/7 分类: ' + (categoryResult.category || '未确定') });

    // ===== Step 5: 标题优化 =====
    broadcast('pipeline-progress', { uid: uid, step: 5, total: totalSteps, stage: 'processing', message: 'Step 5/7 标题优化中...' });
    try {
      var t5 = Date.now();
      var providersTitle = require('../routes/ai/providers');
      var titlePrompt = '优化以下电商商品标题，要求：1.保留核心关键词 2.去除冗余堆砌 3.控制在30字以内 4.用空格分隔关键词组。返回严格JSON：{"optimized_title":"优化后的标题","keywords":["关键词1","关键词2"]}。只返回JSON。\n\n原标题：' + (product.title || '') + '\n分类：' + (product.custom_category || '');
      var titleResp = await providersTitle.categoryLLMRequest('/chat/completions', {
        messages: [{ role: 'user', content: titlePrompt }],
        temperature: 0.3, max_tokens: 256
      });
      var titleText = (titleResp && titleResp.choices && titleResp.choices[0] && titleResp.choices[0].message && titleResp.choices[0].message.content) || '';
      var titleJsonMatch = titleText.match(/\{[\s\S]*\}/);
      if (titleJsonMatch) {
        var titleParsed = JSON.parse(titleJsonMatch[0]);
        if (titleParsed.optimized_title) {
          var originalTitle = product.title;
          product.title = titleParsed.optimized_title;
          addStepResult(log, 'title_optimize', 'ok', Date.now() - t5, { original: originalTitle, optimized: titleParsed.optimized_title, keywords: titleParsed.keywords || [] });
        }
      }
    } catch (e) {
      // Title optimization is optional
    }

    // ===== Step 6: 数据诊断 =====
    broadcast('pipeline-progress', { uid: uid, step: 6, total: totalSteps, stage: 'processing', message: 'Step 6/7 数据诊断中...' });
    finalizeLog(log);
    var issues = diagnoseIssues(product, log);

    // ===== Step 7: 一次性上传图床 =====
    broadcast('pipeline-progress', { uid: uid, step: 7, total: totalSteps, stage: 'processing', message: 'Step 7/7 上传图床中...' });
    var uploadedMainUrls = [];
    var uploadedSkuMap = {};
    var imageMapping = []; // [{original, uploaded, type}]
    try {
      var t7 = Date.now();
      var imgbb = require('../services/imgbb-upload');
      var uploadOk = 0, uploadFail = 0;

      // 上传主图
      for (var m = 0; m < processedMain.length; m++) {
        var originalUrl = processedMain[m].url;
        try {
          var filename = uid + '_main_' + m + '.png';
          var uploadResult = await imgbb.uploadToImgBB(processedMain[m].buffer, filename);
          if (uploadResult.ok) {
            uploadedMainUrls.push(uploadResult.url);
            imageMapping.push({ original: originalUrl, uploaded: uploadResult.url, type: 'main' });
            uploadOk++;
          } else {
            uploadedMainUrls.push(originalUrl);
            uploadFail++;
          }
        } catch (e) {
          uploadedMainUrls.push(originalUrl);
          uploadFail++;
        }
      }

      // 上传 SKU 图
      for (var s = 0; s < processedSkus.length; s++) {
        try {
          var skuFilename = uid + '_sku_' + s + '.png';
          var skuUploadResult = await imgbb.uploadToImgBB(processedSkus[s].buffer, skuFilename);
          if (skuUploadResult.ok) {
            uploadedSkuMap[processedSkus[s].url] = skuUploadResult.url;
            imageMapping.push({ original: processedSkus[s].url, uploaded: skuUploadResult.url, type: 'sku' });
            uploadOk++;
          } else {
            uploadFail++;
          }
        } catch (e) {
          uploadFail++;
        }
      }

      // 备份原始图片对应关系，再覆盖
      if (uploadedMainUrls.length > 0 || Object.keys(uploadedSkuMap).length > 0) {
        var existingMapping = [];
        try { existingMapping = JSON.parse(product.original_images || '[]'); } catch (e) {}
        if (!Array.isArray(existingMapping) || (existingMapping.length && typeof existingMapping[0] === 'string')) {
          existingMapping = [];
        }
        if (!existingMapping.length) {
          db.run("UPDATE products SET original_images = ? WHERE uid = ?", [JSON.stringify(imageMapping), uid]);
        }
        if (uploadedMainUrls.length > 0) {
          db.run("UPDATE products SET main_images = ? WHERE uid = ?", [JSON.stringify(uploadedMainUrls), uid]);
        }
      }

      // 更新数据库: SKU 图
      if (Object.keys(uploadedSkuMap).length > 0) {
        var updatedSkus = JSON.parse(product.skus || '[]');
        updatedSkus.forEach(function (sku) {
          if (sku.image && uploadedSkuMap[sku.image]) {
            sku.image = uploadedSkuMap[sku.image];
          }
        });
        db.run("UPDATE products SET skus = ? WHERE uid = ?", [JSON.stringify(updatedSkus), uid]);
      }

      addStepResult(log, 'upload_imgbb', 'ok', Date.now() - t7, { total: processedMain.length + processedSkus.length, ok: uploadOk, failed: uploadFail });
    } catch (e) {
      addStepResult(log, 'upload_imgbb', 'error', 0, null, e.message);
    }

    // ===== 完成 → 草稿箱 =====
    var issueJson = issues.length > 0 ? JSON.stringify(issues) : '';
    db.run("UPDATE products SET automation_stage = 'draft', automation_log = ?, automation_issues = ?, automation_finished_at = ?, title = ? WHERE uid = ?",
      [JSON.stringify(log), issueJson, new Date().toISOString(), product.title || '', uid]);

    broadcast('pipeline-progress', { uid: uid, step: 7, total: totalSteps, stage: 'draft', message: '处理完成 → 草稿箱' + (issues.length ? ' (' + issues.length + '个问题)' : ''), issues: issues.length, duration: Date.now() - startTime });
    return { ok: true, uid: uid, stage: 'draft', issues: issues, log: log };

  } catch (e) {
    // 致命错误 → 状态还原为 none（可重试）
    finalizeLog(log);
    addStepResult(log, 'pipeline_error', 'error', 0, null, e.message);
    var fatalIssues = [{ code: 'pipeline_error', level: 'error', message: e.message }];

    db.run("UPDATE products SET automation_stage = 'none', automation_log = ?, automation_issues = ?, automation_finished_at = ? WHERE uid = ?",
      [JSON.stringify(log), JSON.stringify(fatalIssues), new Date().toISOString(), uid]);

    broadcast('pipeline-progress', { uid: uid, step: 0, total: totalSteps, stage: 'none', message: '处理失败(可重试): ' + e.message, error: e.message });
    return { ok: false, uid: uid, stage: 'none', error: e.message };
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
  broadcast('pipeline-queue', { state: 'running', currentUid: queue.currentUid, pending: queue.pending.length, message: '开始处理 (' + (queue.pending.length + 1) + '个剩余)' });

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
    broadcast('pipeline-queue', { state: 'idle', currentUid: null, pending: 0, message: '全部处理完成' });
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
      db.run("UPDATE products SET automation_stage = 'none' WHERE uid = ?", [p.uid]);
      continue;
    }
    var started = new Date(p.automation_started_at).getTime();
    if (now - started > staleThreshold) {
      db.run("UPDATE products SET automation_stage = 'none' WHERE uid = ?", [p.uid]);
    } else {
      queue.pending.unshift(p.uid);
    }
  }

  if (queue.pending.length > 0 && queue.state === 'idle') {
    setImmediate(function () { startQueue(db); });
  }
}

module.exports = {
  setSseBroadcast: setSseBroadcast,
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
