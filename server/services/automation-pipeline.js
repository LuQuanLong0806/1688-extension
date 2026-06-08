/**
 * 自动化处理流水线
 * 
 * 核心功能：
 * - 串行处理队列（一次一个商品）
 * - 智能跳过（质检结果驱动后续步骤）
 * - 自动重试 + 降级策略
 * - SSE 进度广播
 * - 7步流水线：质检 → 去水印 → 白底图 → 尺寸标注 → 分类推荐 → 上传ImgBB → 诊断
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
  'no_white_bg', 'clean_failed', 'quality_low', 'upload_partial',
  'ocr_error', 'pipeline_error'
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
    try {
      var t0 = Date.now();
      var firstImgUrl = mainImages[0];
      var imgBuf = await downloadImage(firstImgUrl);
      var providers = require('../routes/ai/providers');

      var messages = [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imgBuf.toString('base64') } },
          { type: 'text', text: '分析这张商品图片，返回JSON：{"watermark":true/false,"chinese_text":true/false,"background_complexity":"simple/medium/complex","has_size_info":true/false,"quality":"high/medium/low","visual_attrs":{"colors":[],"material":"","style":""}}' }
        ]
      }];
      var resp = await providers.visionLLMRequest(messages);
      var text = typeof resp === 'string' ? resp : (resp.content || JSON.stringify(resp));
      var jsonMatch = text.match(/\{[\s\S]*\}/);
      qualityResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      addStepResult(log, 'quality_check', 'ok', Date.now() - t0, qualityResult);
    } catch (e) {
      addStepResult(log, 'quality_check', 'error', 0, null, e.message);
      qualityResult = { watermark: true, background_complexity: 'complex' };
    }

    // ===== Step 2: 去水印/去中文 =====
    var cleanedImages = [];
    try {
      var t1 = Date.now();
      var textCleaner = require('../services/text-cleaner');
      var hasWatermark = qualityResult.watermark || qualityResult.chinese_text;

      if (!hasWatermark) {
        addStepResult(log, 'clean_watermark', 'skipped', Date.now() - t1, { reason: 'no_watermark' });
        cleanedImages = await Promise.all(mainImages.map(async function (url) {
          var buf = await downloadImage(url);
          return { url: url, buffer: buf, cleaned: false };
        }));
      } else {
        var cleanResults = [];
        for (var i = 0; i < mainImages.length; i++) {
          try {
            var imgBuf = await downloadImage(mainImages[i]);
            var result = await textCleaner.cleanImage(imgBuf, { chineseOnly: false });
            if (result.cleaned && result.imageBuffer) {
              cleanResults.push({ url: mainImages[i], buffer: result.imageBuffer, cleaned: true });
            } else {
              cleanResults.push({ url: mainImages[i], buffer: imgBuf, cleaned: false });
            }
          } catch (e) {
            var origBuf = await downloadImage(mainImages[i]);
            cleanResults.push({ url: mainImages[i], buffer: origBuf, cleaned: false });
          }
        }
        var cleanedCount = cleanResults.filter(function (r) { return r.cleaned; }).length;
        addStepResult(log, 'clean_watermark', 'ok', Date.now() - t1, { total: mainImages.length, cleaned: cleanedCount });
        cleanedImages = cleanResults;
      }
    } catch (e) {
      addStepResult(log, 'clean_watermark', 'error', 0, null, e.message);
      cleanedImages = await Promise.all(mainImages.map(async function (url) {
        var buf = await downloadImage(url);
        return { url: url, buffer: buf, cleaned: false };
      }));
    }

    // ===== Step 3: 白底图 =====
    var bgResults = [];
    try {
      var t2 = Date.now();
      var bgComplex = qualityResult.background_complexity;

      if (bgComplex === 'simple') {
        addStepResult(log, 'white_bg', 'skipped', Date.now() - t2, { reason: 'bg_simple' });
        bgResults = cleanedImages.map(function (img) { return { url: img.url, buffer: img.buffer, generated: false }; });
      } else {
        var removeBg = require('../services/remove-bg');
        var generated = 0, failed = 0;
        for (var j = 0; j < cleanedImages.length; j++) {
          try {
            var result = await removeBg.removeBackground(cleanedImages[j].buffer);
            if (result.ok && result.imageBuffer) {
              var sharp = require('sharp');
              var fgBuf = result.imageBuffer;
              var meta = await sharp(fgBuf).metadata();
              var composited = await sharp({
                create: { width: meta.width, height: meta.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
              }).composite([{ input: fgBuf }]).png().toBuffer();
              bgResults.push({ url: cleanedImages[j].url, buffer: composited, generated: true });
              generated++;
            } else {
              bgResults.push({ url: cleanedImages[j].url, buffer: cleanedImages[j].buffer, generated: false });
              failed++;
            }
          } catch (e) {
            bgResults.push({ url: cleanedImages[j].url, buffer: cleanedImages[j].buffer, generated: false });
            failed++;
          }
        }
        addStepResult(log, 'white_bg', 'ok', Date.now() - t2, { total: cleanedImages.length, generated: generated, failed: failed });
      }
    } catch (e) {
      addStepResult(log, 'white_bg', 'error', 0, null, e.message);
      bgResults = cleanedImages.map(function (img) { return { url: img.url, buffer: img.buffer, generated: false }; });
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
        for (var k = 0; k < bgResults.length && sizeResult.annotated === 0; k++) {
          try {
            var detectResult = await sizeAnnotate.detectSizes(bgResults[k].buffer);
            if (detectResult.ok && detectResult.sizes && detectResult.sizes.length > 0) {
              var annoResult = await sizeAnnotate.annotateImage(bgResults[k].buffer, detectResult.sizes);
              if (annoResult.ok && annoResult.imageBuffer) {
                bgResults[k].buffer = annoResult.imageBuffer;
                bgResults[k].sizeAnnotated = true;
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
    try {
      var t4 = Date.now();
      var attrs = JSON.parse(product.attrs || '[]');
      var catResp = await new Promise(function (resolve, reject) {
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

    // ===== Step 6: 上传 ImgBB =====
    var uploadedUrls = [];
    try {
      var t5 = Date.now();
      var imgbb = require('../services/imgbb-upload');
      var uploadOk = 0, uploadFail = 0;

      for (var m = 0; m < bgResults.length; m++) {
        try {
          var filename = uid + '_' + m + '.png';
          var uploadResult = await imgbb.uploadToImgBB(bgResults[m].buffer, filename);
          if (uploadResult.ok) {
            uploadedUrls.push(uploadResult.url);
            uploadOk++;
          } else {
            uploadedUrls.push(bgResults[m].url);
            uploadFail++;
          }
        } catch (e) {
          uploadedUrls.push(bgResults[m].url);
          uploadFail++;
        }
      }
      addStepResult(log, 'upload_imgbb', 'ok', Date.now() - t5, { total: bgResults.length, ok: uploadOk, failed: uploadFail });

      if (uploadedUrls.length > 0) {
        db.run("UPDATE products SET main_images = ? WHERE uid = ?", [JSON.stringify(uploadedUrls), uid]);
      }
    } catch (e) {
      addStepResult(log, 'upload_imgbb', 'error', 0, null, e.message);
    }

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
  queue: queue
};
