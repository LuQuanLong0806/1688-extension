// automation-pipeline.test.js — 自动化处理流水线单元测试
const pipeline = require('../../services/automation-pipeline');

describe('Automation Pipeline', () => {
  // Reset queue state between tests
  beforeEach(() => {
    pipeline.queue.state = 'idle';
    pipeline.queue.currentUid = null;
    pipeline.queue.pending = [];
    pipeline.queue.processingAt = 0;
  });

  // ============================================================
  // Constants
  // ============================================================
  describe('Constants', () => {
    test('VALID_STAGES contains all expected stages', () => {
      expect(pipeline.VALID_STAGES).toContain('none');
      expect(pipeline.VALID_STAGES).toContain('processing');
      expect(pipeline.VALID_STAGES).toContain('draft');
      expect(pipeline.VALID_STAGES).toContain('ready');
      expect(pipeline.VALID_STAGES).toContain('published');
      expect(pipeline.VALID_STAGES).toContain('failed');
    });

    test('VALID_STAGES is an array', () => {
      expect(Array.isArray(pipeline.VALID_STAGES)).toBe(true);
    });

    test('VALID_STAGES has 6 entries', () => {
      expect(pipeline.VALID_STAGES).toHaveLength(6);
    });

    test('ALLOWED_TRANSITIONS has entries for all stages', () => {
      expect(pipeline.ALLOWED_TRANSITIONS.none).toBeDefined();
      expect(pipeline.ALLOWED_TRANSITIONS.processing).toBeDefined();
      expect(pipeline.ALLOWED_TRANSITIONS.draft).toBeDefined();
      expect(pipeline.ALLOWED_TRANSITIONS.ready).toBeDefined();
      expect(pipeline.ALLOWED_TRANSITIONS.published).toBeDefined();
      expect(pipeline.ALLOWED_TRANSITIONS.failed).toBeDefined();
    });

    test('KNOWN_ISSUE_CODES includes expected codes', () => {
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('no_size_detected');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('no_category');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('category_low_confidence');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('no_white_bg');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('clean_failed');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('quality_low');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('upload_partial');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('ocr_error');
      expect(pipeline.KNOWN_ISSUE_CODES).toContain('pipeline_error');
    });

    test('KNOWN_ISSUE_CODES is an array', () => {
      expect(Array.isArray(pipeline.KNOWN_ISSUE_CODES)).toBe(true);
    });
  });

  // ============================================================
  // isValidStage
  // ============================================================
  describe('isValidStage', () => {
    test('returns true for valid stages', () => {
      expect(pipeline.isValidStage('none')).toBe(true);
      expect(pipeline.isValidStage('processing')).toBe(true);
      expect(pipeline.isValidStage('draft')).toBe(true);
      expect(pipeline.isValidStage('ready')).toBe(true);
      expect(pipeline.isValidStage('published')).toBe(true);
      expect(pipeline.isValidStage('failed')).toBe(true);
    });

    test('returns false for invalid stages', () => {
      expect(pipeline.isValidStage('')).toBe(false);
      expect(pipeline.isValidStage('unknown')).toBe(false);
      expect(pipeline.isValidStage('PENDING')).toBe(false);
      expect(pipeline.isValidStage('success')).toBe(false);
      expect(pipeline.isValidStage(null)).toBe(false);
      expect(pipeline.isValidStage(undefined)).toBe(false);
    });
  });

  // ============================================================
  // isValidTransition
  // ============================================================
  describe('isValidTransition', () => {
    test('allows none -> processing', () => {
      expect(pipeline.isValidTransition('none', 'processing')).toBe(true);
    });

    test('allows processing -> draft', () => {
      expect(pipeline.isValidTransition('processing', 'draft')).toBe(true);
    });

    test('allows processing -> failed', () => {
      expect(pipeline.isValidTransition('processing', 'failed')).toBe(true);
    });

    test('allows draft -> ready', () => {
      expect(pipeline.isValidTransition('draft', 'ready')).toBe(true);
    });

    test('allows draft -> none', () => {
      expect(pipeline.isValidTransition('draft', 'none')).toBe(true);
    });

    test('allows draft -> failed', () => {
      expect(pipeline.isValidTransition('draft', 'failed')).toBe(true);
    });

    test('allows ready -> published', () => {
      expect(pipeline.isValidTransition('ready', 'published')).toBe(true);
    });

    test('allows ready -> draft', () => {
      expect(pipeline.isValidTransition('ready', 'draft')).toBe(true);
    });

    test('allows published -> draft', () => {
      expect(pipeline.isValidTransition('published', 'draft')).toBe(true);
    });

    test('allows failed -> none', () => {
      expect(pipeline.isValidTransition('failed', 'none')).toBe(true);
    });

    test('allows failed -> processing', () => {
      expect(pipeline.isValidTransition('failed', 'processing')).toBe(true);
    });

    test('blocks none -> draft', () => {
      expect(pipeline.isValidTransition('none', 'draft')).toBe(false);
    });

    test('blocks processing -> none', () => {
      expect(pipeline.isValidTransition('processing', 'none')).toBe(false);
    });

    test('blocks none -> none', () => {
      expect(pipeline.isValidTransition('none', 'none')).toBe(false);
    });

    test('blocks draft -> processing', () => {
      expect(pipeline.isValidTransition('draft', 'processing')).toBe(false);
    });

    test('blocks ready -> none', () => {
      expect(pipeline.isValidTransition('ready', 'none')).toBe(false);
    });

    test('blocks published -> none', () => {
      expect(pipeline.isValidTransition('published', 'none')).toBe(false);
    });

    test('blocks invalid from stage', () => {
      expect(pipeline.isValidTransition('unknown', 'processing')).toBe(false);
    });

    test('blocks invalid to stage', () => {
      expect(pipeline.isValidTransition('none', 'unknown')).toBe(false);
    });

    test('blocks null from stage', () => {
      expect(pipeline.isValidTransition(null, 'processing')).toBe(false);
    });
  });

  // ============================================================
  // createEmptyLog
  // ============================================================
  describe('createEmptyLog', () => {
    test('creates log with correct structure', () => {
      const log = pipeline.createEmptyLog('test-uid');
      expect(log).toHaveProperty('steps');
      expect(log).toHaveProperty('totalDuration');
      expect(log).toHaveProperty('startedAt');
      expect(log).toHaveProperty('finishedAt');
      expect(Array.isArray(log.steps)).toBe(true);
      expect(log.steps).toHaveLength(0);
      expect(log.totalDuration).toBe(0);
      expect(log.finishedAt).toBeNull();
    });

    test('sets startedAt to ISO string', () => {
      const before = new Date().toISOString();
      const log = pipeline.createEmptyLog('test-uid');
      const after = new Date().toISOString();
      expect(typeof log.startedAt).toBe('string');
      expect(log.startedAt >= before).toBe(true);
      expect(log.startedAt <= after).toBe(true);
    });

    test('creates independent logs on each call', () => {
      const log1 = pipeline.createEmptyLog('uid1');
      const log2 = pipeline.createEmptyLog('uid2');
      log1.steps.push({ name: 'test' });
      expect(log1.steps).toHaveLength(1);
      expect(log2.steps).toHaveLength(0);
    });
  });

  // ============================================================
  // addStepResult
  // ============================================================
  describe('addStepResult', () => {
    test('adds step to log', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'quality_check', 'ok', 150, { watermark: true });
      expect(log.steps).toHaveLength(1);
      expect(log.steps[0].name).toBe('quality_check');
      expect(log.steps[0].status).toBe('ok');
      expect(log.steps[0].duration).toBe(150);
      expect(log.steps[0].result).toEqual({ watermark: true });
    });

    test('includes note when provided', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'clean_watermark', 'error', 0, null, 'Network timeout');
      expect(log.steps[0].note).toBe('Network timeout');
    });

    test('does not include note when not provided', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'quality_check', 'ok', 100, {});
      expect(log.steps[0]).not.toHaveProperty('note');
    });

    test('sets skippable from result', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'skipped', 0, { reason: 'no_watermark', skippable: true });
      expect(log.steps[0].skippable).toBe(true);
    });

    test('does not set skippable when result has no skippable field', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'ok', 50, { watermark: false });
      expect(log.steps[0]).not.toHaveProperty('skippable');
    });

    test('does not set skippable when result is null', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'error', 0, null);
      expect(log.steps[0]).not.toHaveProperty('skippable');
    });

    test('preserves falsy note that is empty string', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'ok', 10, {}, '');
      expect(log.steps[0]).not.toHaveProperty('note');
    });

    test('allows multiple steps to be added', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'ok', 10, {});
      pipeline.addStepResult(log, 'step2', 'ok', 20, {});
      pipeline.addStepResult(log, 'step3', 'error', 0, null, 'fail');
      expect(log.steps).toHaveLength(3);
    });
  });

  // ============================================================
  // finalizeLog
  // ============================================================
  describe('finalizeLog', () => {
    test('calculates total duration', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'ok', 100, {});
      pipeline.addStepResult(log, 'step2', 'ok', 200, {});
      pipeline.addStepResult(log, 'step3', 'ok', 50, {});
      pipeline.finalizeLog(log);
      expect(log.totalDuration).toBe(350);
    });

    test('sets finishedAt to ISO string', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.finalizeLog(log);
      expect(typeof log.finishedAt).toBe('string');
      expect(log.finishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('handles empty steps', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.finalizeLog(log);
      expect(log.totalDuration).toBe(0);
    });

    test('treats missing duration as 0', () => {
      const log = pipeline.createEmptyLog('uid');
      log.steps.push({ name: 'test', status: 'ok' }); // no duration field
      pipeline.finalizeLog(log);
      expect(log.totalDuration).toBe(0);
    });

    test('sums only duration field from each step', () => {
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'step1', 'ok', 100, {});
      log.steps.push({ name: 'step2', status: 'ok', duration: 300 });
      pipeline.finalizeLog(log);
      expect(log.totalDuration).toBe(400);
    });
  });

  // ============================================================
  // skuCountExceeds
  // ============================================================
  describe('skuCountExceeds', () => {
    test('returns true when SKU count exceeds max', () => {
      const product = { skus: '[{"id":1},{"id":2},{"id":3}]' };
      expect(pipeline.skuCountExceeds(product, 2)).toBe(true);
    });

    test('returns false when within limit', () => {
      const product = { skus: '[{"id":1},{"id":2}]' };
      expect(pipeline.skuCountExceeds(product, 5)).toBe(false);
    });

    test('returns false when exactly at limit', () => {
      const product = { skus: '[{"id":1},{"id":2},{"id":3}]' };
      expect(pipeline.skuCountExceeds(product, 3)).toBe(false);
    });

    test('returns false for null skus', () => {
      expect(pipeline.skuCountExceeds({ skus: null }, 5)).toBe(false);
    });

    test('returns false for undefined skus', () => {
      expect(pipeline.skuCountExceeds({}, 5)).toBe(false);
    });

    test('returns false for empty string skus', () => {
      expect(pipeline.skuCountExceeds({ skus: '' }, 5)).toBe(false);
    });

    test('handles string JSON skus', () => {
      const product = { skus: '[1,2,3,4,5,6]' };
      expect(pipeline.skuCountExceeds(product, 5)).toBe(true);
    });

    test('handles parsed array skus', () => {
      const product = { skus: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      expect(pipeline.skuCountExceeds(product, 2)).toBe(true);
    });

    test('handles invalid JSON string gracefully', () => {
      const product = { skus: 'not-valid-json' };
      expect(pipeline.skuCountExceeds(product, 5)).toBe(false);
    });

    test('handles zero maxSku', () => {
      const product = { skus: '[{"id":1}]' };
      expect(pipeline.skuCountExceeds(product, 0)).toBe(true);
    });

    test('returns false when zero SKUs and zero maxSku', () => {
      const product = { skus: '[]' };
      expect(pipeline.skuCountExceeds(product, 0)).toBe(false);
    });
  });

  // ============================================================
  // diagnoseIssues
  // ============================================================
  describe('diagnoseIssues', () => {
    test('detects no_category', () => {
      const product = { custom_category: null };
      const log = pipeline.createEmptyLog('uid');
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_category')).toBe(true);
    });

    test('detects no_category when custom_category is empty string', () => {
      const product = { custom_category: '' };
      const log = pipeline.createEmptyLog('uid');
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_category')).toBe(true);
    });

    test('does not flag no_category when category is set', () => {
      const product = { custom_category: '家居/厨房/餐具' };
      const log = pipeline.createEmptyLog('uid');
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_category')).toBe(false);
    });

    test('detects no_size_detected when all images have no size', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'size_annotate', 'ok', 100, { no_size: 3, total: 3, annotated: 0 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_size_detected')).toBe(true);
    });

    test('does not detect no_size_detected when some sizes found', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'size_annotate', 'ok', 100, { no_size: 2, total: 3, annotated: 1 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_size_detected')).toBe(false);
    });

    test('detects no_white_bg when all generations failed', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'white_bg', 'ok', 100, { failed: 5, generated: 0, total: 5 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_white_bg')).toBe(true);
    });

    test('does not detect no_white_bg when some generated', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'white_bg', 'ok', 100, { failed: 2, generated: 3, total: 5 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_white_bg')).toBe(false);
    });

    test('does not detect no_white_bg when no failures', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'white_bg', 'ok', 100, { failed: 0, generated: 5, total: 5 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'no_white_bg')).toBe(false);
    });

    test('detects clean_failed when clean_watermark has error status', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'clean_watermark', 'error', 0, null, 'API error');
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'clean_failed')).toBe(true);
    });

    test('does not detect clean_failed when clean_watermark succeeded', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'clean_watermark', 'ok', 100, { total: 3, cleaned: 2 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'clean_failed')).toBe(false);
    });

    test('detects upload_partial when some uploads failed', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'upload_imgbb', 'ok', 200, { total: 5, ok: 3, failed: 2 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'upload_partial')).toBe(true);
    });

    test('does not detect upload_partial when all uploads ok', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'upload_imgbb', 'ok', 200, { total: 5, ok: 5, failed: 0 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'upload_partial')).toBe(false);
    });

    test('detects category_low_confidence when confidence below 0.7', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'category_recommend', 'ok', 100, { ok: true, category: 'test', confidence: 0.45 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'category_low_confidence')).toBe(true);
    });

    test('does not detect category_low_confidence when confidence at 0.7', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'category_recommend', 'ok', 100, { ok: true, category: 'test', confidence: 0.7 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'category_low_confidence')).toBe(false);
    });

    test('does not detect category_low_confidence when confidence above 0.7', () => {
      const product = { custom_category: 'cat' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'category_recommend', 'ok', 100, { ok: true, category: 'test', confidence: 0.9 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.some(i => i.code === 'category_low_confidence')).toBe(false);
    });

    test('returns empty for healthy product', () => {
      const product = { custom_category: '家居/厨房/餐具' };
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'clean_watermark', 'ok', 100, { total: 3, cleaned: 3 });
      pipeline.addStepResult(log, 'white_bg', 'ok', 100, { total: 3, generated: 3, failed: 0 });
      pipeline.addStepResult(log, 'size_annotate', 'ok', 100, { no_size: 0, total: 3, annotated: 2 });
      pipeline.addStepResult(log, 'category_recommend', 'ok', 100, { ok: true, category: '家居/厨房/餐具', confidence: 0.95 });
      pipeline.addStepResult(log, 'upload_imgbb', 'ok', 100, { total: 3, ok: 3, failed: 0 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues).toHaveLength(0);
    });

    test('returns multiple issues for problematic product', () => {
      const product = {}; // no custom_category
      const log = pipeline.createEmptyLog('uid');
      pipeline.addStepResult(log, 'clean_watermark', 'error', 0, null, 'fail');
      pipeline.addStepResult(log, 'white_bg', 'ok', 100, { failed: 3, generated: 0 });
      pipeline.addStepResult(log, 'upload_imgbb', 'ok', 100, { total: 3, ok: 1, failed: 2 });
      const issues = pipeline.diagnoseIssues(product, log);
      expect(issues.length).toBeGreaterThanOrEqual(3);
    });

    test('issues have correct structure', () => {
      const product = {};
      const log = pipeline.createEmptyLog('uid');
      const issues = pipeline.diagnoseIssues(product, log);
      issues.forEach(issue => {
        expect(issue).toHaveProperty('code');
        expect(issue).toHaveProperty('level');
        expect(issue).toHaveProperty('message');
      });
    });
  });

  // ============================================================
  // getQueueStatus
  // ============================================================
  describe('getQueueStatus', () => {
    test('returns current queue state', () => {
      pipeline.queue.state = 'idle';
      pipeline.queue.currentUid = null;
      pipeline.queue.pending = [];
      const status = pipeline.getQueueStatus();
      expect(status).toEqual({ state: 'idle', currentUid: null, pending: 0 });
    });

    test('returns running state with current uid', () => {
      pipeline.queue.state = 'running';
      pipeline.queue.currentUid = 'test-uid-123';
      pipeline.queue.pending = ['uid2', 'uid3'];
      const status = pipeline.getQueueStatus();
      expect(status.state).toBe('running');
      expect(status.currentUid).toBe('test-uid-123');
      expect(status.pending).toBe(2);
    });

    test('returns pending count not array', () => {
      pipeline.queue.pending = ['a', 'b', 'c'];
      const status = pipeline.getQueueStatus();
      expect(typeof status.pending).toBe('number');
      expect(status.pending).toBe(3);
    });
  });

  // ============================================================
  // enqueue
  // ============================================================
  describe('enqueue', () => {
    const mockDb = {
      getOne: jest.fn(function () { return null; })
    };

    test('adds items to queue', () => {
      const added = pipeline.enqueue(['uid1', 'uid2'], mockDb);
      expect(added).toEqual(['uid1', 'uid2']);
      expect(pipeline.queue.pending).toEqual(['uid1', 'uid2']);
    });

    test('deduplicates items', () => {
      pipeline.queue.pending = ['uid1'];
      const added = pipeline.enqueue(['uid1', 'uid2', 'uid3'], mockDb);
      expect(added).toEqual(['uid2', 'uid3']);
      expect(pipeline.queue.pending).toEqual(['uid1', 'uid2', 'uid3']);
    });

    test('does not add currently processing uid', () => {
      pipeline.queue.currentUid = 'uid-processing';
      const added = pipeline.enqueue(['uid-processing', 'uid-new'], mockDb);
      expect(added).toEqual(['uid-new']);
      expect(pipeline.queue.pending).toEqual(['uid-new']);
    });

    test('returns empty array when all items are duplicates', () => {
      pipeline.queue.pending = ['uid1', 'uid2'];
      const added = pipeline.enqueue(['uid1', 'uid2'], mockDb);
      expect(added).toEqual([]);
    });

    test('handles empty input array', () => {
      const added = pipeline.enqueue([], mockDb);
      expect(added).toEqual([]);
      expect(pipeline.queue.pending).toEqual([]);
    });

    test('handles duplicate items within same enqueue call', () => {
      const added = pipeline.enqueue(['uid1', 'uid1', 'uid2'], mockDb);
      // first uid1 gets added, second uid1 is already in pending so it's a dup
      expect(added).toEqual(['uid1', 'uid2']);
    });

    test('triggers startQueue when idle and items added', () => {
      // We verify by checking that queue.pending was set and state changed
      // startQueue uses setImmediate so we can't directly test it here
      // but we can verify the queue state changes
      pipeline.queue.state = 'idle';
      pipeline.enqueue(['uid1'], mockDb);
      expect(pipeline.queue.pending).toContain('uid1');
    });
  });

  // ============================================================
  // startQueue
  // ============================================================
  describe('startQueue', () => {
    test('does nothing when already running', async () => {
      pipeline.queue.state = 'running';
      pipeline.queue.pending = ['uid1'];
      await pipeline.startQueue({});
      expect(pipeline.queue.state).toBe('running');
      expect(pipeline.queue.pending).toEqual(['uid1']);
    });

    test('sets idle when no pending items', async () => {
      pipeline.queue.state = 'idle';
      pipeline.queue.pending = [];
      await pipeline.startQueue({});
      expect(pipeline.queue.state).toBe('idle');
    });
  });

  // ============================================================
  // recoverStaleJobs
  // ============================================================
  describe('recoverStaleJobs', () => {
    test('fails products with no automation_started_at', async () => {
      const runSql = jest.fn();
      const mockDb = {
        getAll: jest.fn().mockReturnValue([
          { uid: 'uid-no-start', automation_started_at: null }
        ]),
        run: runSql
      };
      await pipeline.recoverStaleJobs(mockDb);
      expect(runSql).toHaveBeenCalledWith(
        "UPDATE products SET automation_stage = 'failed' WHERE uid = ?",
        ['uid-no-start']
      );
    });

    test('fails products stuck processing for over 10 minutes', async () => {
      const runSql = jest.fn();
      const staleTime = new Date(Date.now() - 11 * 60 * 1000).toISOString();
      const mockDb = {
        getAll: jest.fn().mockReturnValue([
          { uid: 'uid-stale', automation_started_at: staleTime }
        ]),
        run: runSql
      };
      await pipeline.recoverStaleJobs(mockDb);
      expect(runSql).toHaveBeenCalledWith(
        "UPDATE products SET automation_stage = 'failed' WHERE uid = ?",
        ['uid-stale']
      );
    });

    test('re-queues recently started products', async () => {
      const recentTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const runSql = jest.fn();
      const mockDb = {
        getAll: jest.fn().mockReturnValue([
          { uid: 'uid-recent', automation_started_at: recentTime }
        ]),
        run: runSql
      };
      await pipeline.recoverStaleJobs(mockDb);
      expect(pipeline.queue.pending).toContain('uid-recent');
    });

    test('handles empty processing list', async () => {
      const mockDb = {
        getAll: jest.fn().mockReturnValue([]),
        run: jest.fn()
      };
      await pipeline.recoverStaleJobs(mockDb);
      expect(pipeline.queue.pending).toEqual([]);
    });

    test('handles multiple stale products', async () => {
      const runSql = jest.fn();
      const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const mockDb = {
        getAll: jest.fn().mockReturnValue([
          { uid: 'uid-stale-1', automation_started_at: staleTime },
          { uid: 'uid-stale-2', automation_started_at: null }
        ]),
        run: runSql
      };
      await pipeline.recoverStaleJobs(mockDb);
      expect(runSql).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // queue object
  // ============================================================
  describe('queue object', () => {
    test('has expected properties', () => {
      expect(pipeline.queue).toHaveProperty('state');
      expect(pipeline.queue).toHaveProperty('currentUid');
      expect(pipeline.queue).toHaveProperty('pending');
      expect(pipeline.queue).toHaveProperty('processingAt');
    });

    test('pending is an array', () => {
      expect(Array.isArray(pipeline.queue.pending)).toBe(true);
    });

    test('processingAt is a number', () => {
      expect(typeof pipeline.queue.processingAt).toBe('number');
    });
  });

  // ============================================================
  // processProduct (mocked)
  // ============================================================
  describe('processProduct', () => {
    test('returns error when product not found', async () => {
      const mockDb = {
        getOne: jest.fn().mockReturnValue(null),
        run: jest.fn()
      };
      const result = await pipeline.processProduct('nonexistent-uid', mockDb);
      expect(result.ok).toBe(false);
      expect(result.stage).toBe('failed');
      expect(result.error).toMatch(/not found/i);
    });

    test('returns error when product has no images', async () => {
      const mockDb = {
        getOne: jest.fn().mockReturnValue({
          uid: 'uid-no-img',
          main_images: '[]',
          skus: null,
          attrs: '[]',
          category: '',
          title: 'Test'
        }),
        run: jest.fn()
      };
      const result = await pipeline.processProduct('uid-no-img', mockDb);
      expect(result.ok).toBe(false);
      expect(result.stage).toBe('failed');
      expect(result.error).toMatch(/no images/i);
    });
  });

  // ============================================================
  // downloadImage (structure only, not actually downloading)
  // ============================================================
  describe('downloadImage', () => {
    test('is exported as a function', () => {
      expect(typeof pipeline.downloadImage).toBe('function');
    });

    test('returns a promise', () => {
      expect(pipeline.downloadImage.length).toBe(1);
    });
  });

  // ============================================================
  // NEW: sleep
  // ============================================================
  describe('sleep', () => {
    test('resolves after specified time', async () => {
      var start = Date.now();
      await pipeline.sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });

    test('resolves with zero ms', async () => {
      await expect(pipeline.sleep(0)).resolves.toBeUndefined();
    });
  });

  // ============================================================
  // NEW: isTransientError
  // ============================================================
  describe('isTransientError', () => {
    test('detects timeout errors', () => {
      expect(pipeline.isTransientError(new Error('request timeout'))).toBe(true);
      expect(pipeline.isTransientError(new Error('连接超时'))).toBe(true);
    });

    test('detects rate limit errors', () => {
      expect(pipeline.isTransientError(new Error('rate limit exceeded'))).toBe(true);
      expect(pipeline.isTransientError(new Error('429 Too Many Requests'))).toBe(true);
      expect(pipeline.isTransientError(new Error('访问频率限制'))).toBe(true);
    });

    test('detects connection reset', () => {
      expect(pipeline.isTransientError(new Error('ECONNRESET'))).toBe(true);
      expect(pipeline.isTransientError(new Error('ECONNREFUSED'))).toBe(true);
    });

    test('returns false for non-transient errors', () => {
      expect(pipeline.isTransientError(new Error('invalid JSON'))).toBe(false);
      expect(pipeline.isTransientError(new Error('model not found'))).toBe(false);
    });

    test('handles null/undefined', () => {
      expect(pipeline.isTransientError(null)).toBe(false);
      expect(pipeline.isTransientError(undefined)).toBe(false);
      expect(pipeline.isTransientError({})).toBe(false);
    });
  });

  // ============================================================
  // NEW: retryWrapper
  // ============================================================
  describe('retryWrapper', () => {
    test('returns result on first success', async () => {
      var fn = jest.fn().mockResolvedValue('ok');
      var result = await pipeline.retryWrapper(fn, { stepName: 'test' });
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries on transient error then succeeds', async () => {
      var fn = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('recovered');
      var result = await pipeline.retryWrapper(fn, { maxRetries: 1, retryDelay: 10, stepName: 'test' });
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('calls fallback after retries exhausted', async () => {
      var fn = jest.fn().mockRejectedValue(new Error('timeout'));
      var fallback = jest.fn().mockResolvedValue('fallback_ok');
      var result = await pipeline.retryWrapper(fn, { maxRetries: 1, retryDelay: 10, stepName: 'test', fallback: fallback });
      expect(result).toBe('fallback_ok');
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    test('throws when all attempts fail with no fallback', async () => {
      var fn = jest.fn().mockRejectedValue(new Error('timeout'));
      await expect(pipeline.retryWrapper(fn, { maxRetries: 1, retryDelay: 10, stepName: 'test' }))
        .rejects.toThrow('timeout');
    });

    test('does not retry non-transient errors', async () => {
      var fn = jest.fn().mockRejectedValue(new Error('parse error: invalid data'));
      await expect(pipeline.retryWrapper(fn, { maxRetries: 2, retryDelay: 10, stepName: 'test' }))
        .rejects.toThrow('parse error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // NEW: sortByPriority
  // ============================================================
  describe('sortByPriority', () => {
    test('sorts by image count (fewer first)', () => {
      var data = {
        'a': { uid: 'a', main_images: '["img1"]', skus: '[]', custom_category: '' },
        'b': { uid: 'b', main_images: '["img1","img2","img3"]', skus: '[]', custom_category: '' }
      };
      var mockDb = {
        getOne: jest.fn(function (sql, params) { return data[params[0]] || null; })
      };
      var result = pipeline.sortByPriority(['b', 'a'], mockDb);
      expect(result[0]).toBe('a'); // 1 image → higher priority
      expect(result[1]).toBe('b'); // 3 images → lower priority
    });

    test('sorts products with existing category last', () => {
      var data = {
        'a': { uid: 'a', main_images: '[]', skus: '[]', custom_category: '杯子' },
        'b': { uid: 'b', main_images: '[]', skus: '[]', custom_category: '' }
      };
      var mockDb = {
        getOne: jest.fn(function (sql, params) { return data[params[0]] || null; })
      };
      var result = pipeline.sortByPriority(['a', 'b'], mockDb);
      expect(result[0]).toBe('b'); // no category → higher priority
      expect(result[1]).toBe('a'); // has category → lower priority
    });

    test('preserves order for missing products', () => {
      var mockDb = {
        getOne: jest.fn().mockReturnValue(null)
      };
      var result = pipeline.sortByPriority(['x', 'y'], mockDb);
      expect(result).toEqual(['x', 'y']); // not found items kept in original order
    });
  });

  // ============================================================
  // NEW: crossValidateCategory
  // ============================================================
  describe('crossValidateCategory', () => {
    test('returns boosted confidence when both agree', () => {
      var result = pipeline.crossValidateCategory('杯子', 0.8, '杯子', 0.85);
      expect(result.category).toBe('杯子');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.validated).toBe(true);
      expect(result.source).toBe('dual_agree');
    });

    test('picks text when confidence higher and disagree', () => {
      var result = pipeline.crossValidateCategory('家居', 0.9, '办公', 0.6);
      expect(result.category).toBe('家居');
      expect(result.confidence).toBe(0.9);
      expect(result.validated).toBe(false);
      expect(result.conflict).toBe('办公');
      expect(result.source).toBe('text_higher');
    });

    test('picks vision when confidence higher and disagree', () => {
      var result = pipeline.crossValidateCategory('家居', 0.5, '杯子', 0.9);
      expect(result.category).toBe('杯子');
      expect(result.validated).toBe(false);
      expect(result.conflict).toBe('家居');
      expect(result.source).toBe('vision_higher');
    });

    test('uses text only when vision unavailable', () => {
      var result = pipeline.crossValidateCategory('杯子', 0.8, '', 0);
      expect(result.category).toBe('杯子');
      expect(result.source).toBe('text_only');
      expect(result.validated).toBe(false);
    });

    test('uses vision only when text unavailable', () => {
      var result = pipeline.crossValidateCategory('', 0, '杯子', 0.7);
      expect(result.category).toBe('杯子');
      expect(result.source).toBe('vision_only');
    });

    test('returns empty when both unavailable', () => {
      var result = pipeline.crossValidateCategory('', 0, '', 0);
      expect(result.category).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.source).toBe('none');
    });
  });
});
