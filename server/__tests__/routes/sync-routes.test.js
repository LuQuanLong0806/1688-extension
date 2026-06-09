// sync-routes.test.js — 同步路由 API 端点测试（验证 since 参数传递）
const request = require('supertest');
const express = require('express');

// Mock cloudDb
function createMockCloudDb() {
  return {
    connected: true,
    uploadProducts: jest.fn().mockResolvedValue({ ok: true, total: 10, uploaded: 10 }),
    downloadProducts: jest.fn().mockResolvedValue({ ok: true, cloudTotal: 5, added: 3, skipped: 2 }),
    pushTable: jest.fn().mockResolvedValue({ ok: true, pushed: 5, skipped: 1 }),
    pullTable: jest.fn().mockResolvedValue({ ok: true, added: 3, updated: 1, purged: 0 }),
    uploadLocalToCloud: jest.fn().mockResolvedValue({ ok: true, counts: {} }),
    downloadCloudToLocal: jest.fn().mockResolvedValue({ ok: true, counts: {} }),
    bidirectionalSync: jest.fn().mockResolvedValue({ ok: true, pull: {}, push: {} }),
    uploadTree: jest.fn().mockResolvedValue({ ok: true, total: 100, uploaded: 100, errors: 0 }),
    downloadTree: jest.fn().mockResolvedValue({ ok: true, cloudTotal: 100, added: 5 }),
    connect: jest.fn().mockResolvedValue(true)
  };
}

function createSyncRouter(cloudDb) {
  const { Router } = require('express');
  const router = Router();

  router.post('/product-push', async (req, res) => {
    if (!cloudDb.connected) {
      var connected = await cloudDb.connect();
      if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
    }
    var result = await cloudDb.uploadProducts({ since: req.body.since || null });
    res.json(result);
  });

  router.post('/product-pull', async (req, res) => {
    if (!cloudDb.connected) {
      var connected = await cloudDb.connect();
      if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
    }
    var result = await cloudDb.downloadProducts({ since: req.body.since || null });
    res.json(result);
  });

  router.post('/product-sync', async (req, res) => {
    if (!cloudDb.connected) {
      var connected = await cloudDb.connect();
      if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
    }
    var pull = await cloudDb.downloadProducts({ since: req.body.since || null });
    var push = await cloudDb.uploadProducts({ since: req.body.since || null });
    res.json({ ok: true, pull: pull, push: push });
  });

  router.post('/table-push/:key', async (req, res) => {
    if (!cloudDb.connected) {
      var connected = await cloudDb.connect();
      if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
    }
    var result = await cloudDb.pushTable(req.params.key, { since: req.body.since || null });
    res.json(result);
  });

  router.post('/table-pull/:key', async (req, res) => {
    if (!cloudDb.connected) {
      var connected = await cloudDb.connect();
      if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
    }
    var result = await cloudDb.pullTable(req.params.key, { since: req.body.since || null });
    res.json(result);
  });

  router.post('/table-sync/:key', async (req, res) => {
    if (!cloudDb.connected) {
      var connected = await cloudDb.connect();
      if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
    }
    var opts = { since: req.body.since || null };
    var pull = await cloudDb.pullTable(req.params.key, opts);
    var push = await cloudDb.pushTable(req.params.key, opts);
    res.json({ ok: true, pull: pull, push: push });
  });

  return router;
}

let app, cloudDb;

beforeEach(() => {
  cloudDb = createMockCloudDb();
  app = express();
  app.use(express.json());
  app.use('/api/sync', createSyncRouter(cloudDb));
});

describe('POST /api/sync/product-push', () => {
  test('无 since 参数时传 null', async () => {
    const res = await request(app).post('/api/sync/product-push').send({});
    expect(res.status).toBe(200);
    expect(cloudDb.uploadProducts).toHaveBeenCalledWith({ since: null });
  });

  test('有 since 参数时传递日期', async () => {
    const res = await request(app).post('/api/sync/product-push').send({ since: '2026-06-01' });
    expect(res.status).toBe(200);
    expect(cloudDb.uploadProducts).toHaveBeenCalledWith({ since: '2026-06-01' });
  });

  test('返回上传结果', async () => {
    const res = await request(app).post('/api/sync/product-push').send({});
    expect(res.body.ok).toBe(true);
    expect(res.body.total).toBe(10);
  });
});

describe('POST /api/sync/product-pull', () => {
  test('无 since 参数时传 null', async () => {
    const res = await request(app).post('/api/sync/product-pull').send({});
    expect(res.status).toBe(200);
    expect(cloudDb.downloadProducts).toHaveBeenCalledWith({ since: null });
  });

  test('有 since 参数时传递日期', async () => {
    const res = await request(app).post('/api/sync/product-pull').send({ since: '2026-06-07' });
    expect(res.status).toBe(200);
    expect(cloudDb.downloadProducts).toHaveBeenCalledWith({ since: '2026-06-07' });
  });

  test('返回下载结果', async () => {
    const res = await request(app).post('/api/sync/product-pull').send({});
    expect(res.body.ok).toBe(true);
    expect(res.body.added).toBe(3);
  });
});

describe('POST /api/sync/product-sync', () => {
  test('since 参数同时传递给 pull 和 push', async () => {
    const res = await request(app).post('/api/sync/product-sync').send({ since: '2026-06-01' });
    expect(res.status).toBe(200);
    expect(cloudDb.downloadProducts).toHaveBeenCalledWith({ since: '2026-06-01' });
    expect(cloudDb.uploadProducts).toHaveBeenCalledWith({ since: '2026-06-01' });
  });

  test('无 since 时双向同步传 null', async () => {
    const res = await request(app).post('/api/sync/product-sync').send({});
    expect(cloudDb.downloadProducts).toHaveBeenCalledWith({ since: null });
    expect(cloudDb.uploadProducts).toHaveBeenCalledWith({ since: null });
  });
});

describe('POST /api/sync/table-push/:key', () => {
  test('传递 since 参数给 pushTable', async () => {
    const res = await request(app).post('/api/sync/table-push/mappings').send({ since: '2026-06-05' });
    expect(res.status).toBe(200);
    expect(cloudDb.pushTable).toHaveBeenCalledWith('mappings', { since: '2026-06-05' });
  });

  test('无 since 时传 null', async () => {
    const res = await request(app).post('/api/sync/table-push/synonyms').send({});
    expect(cloudDb.pushTable).toHaveBeenCalledWith('synonyms', { since: null });
  });
});

describe('POST /api/sync/table-pull/:key', () => {
  test('传递 since 参数给 pullTable', async () => {
    const res = await request(app).post('/api/sync/table-pull/blacklist').send({ since: '2026-06-08' });
    expect(res.status).toBe(200);
    expect(cloudDb.pullTable).toHaveBeenCalledWith('blacklist', { since: '2026-06-08' });
  });

  test('无 since 时传 null', async () => {
    const res = await request(app).post('/api/sync/table-pull/category-config').send({});
    expect(cloudDb.pullTable).toHaveBeenCalledWith('category-config', { since: null });
  });
});

describe('POST /api/sync/table-sync/:key', () => {
  test('since 参数同时传递给 pull 和 push', async () => {
    const res = await request(app).post('/api/sync/table-sync/mappings').send({ since: '2026-06-01' });
    expect(res.status).toBe(200);
    expect(cloudDb.pullTable).toHaveBeenCalledWith('mappings', { since: '2026-06-01' });
    expect(cloudDb.pushTable).toHaveBeenCalledWith('mappings', { since: '2026-06-01' });
  });

  test('返回合并结果', async () => {
    const res = await request(app).post('/api/sync/table-sync/synonyms').send({});
    expect(res.body.ok).toBe(true);
    expect(res.body.pull).toBeDefined();
    expect(res.body.push).toBeDefined();
  });
});
