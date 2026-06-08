/**
 * 自动化处理流水线
 * 
 * 核心功能：
 * - 串行处理队列（一次一个商品）
 * - 智能跳过（质检结果驱动后续步骤）
 * - 自动重试 + 降级策略
 * - SSE 进度广播
 */

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
  queue: queue
};
