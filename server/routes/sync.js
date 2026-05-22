// 云同步路由 — Turso 配置、测试、初始化、同步
const express = require('express');
const router = express.Router();
const cloudDb = require('../cloud-db');

// 获取同步配置（脱敏）
router.get('/config', (req, res) => {
  var config = cloudDb.getConfig();
  if (!config) {
    return res.json({ configured: false });
  }
  res.json({
    configured: true,
    url: config.url || '',
    token: config.token ? config.token.substring(0, 8) + '****' : '',
    status: cloudDb.getStatus()
  });
});

// 保存配置
router.post('/config', async (req, res) => {
  var { url, token } = req.body;
  if (!url || !token) return res.status(400).json({ error: '请提供 URL 和 Token' });
  // 不覆盖已存的完整token（如果传来的带****说明是脱敏的，保留原值）
  var oldConfig = cloudDb.getConfig();
  if (token.indexOf('****') >= 0 && oldConfig && oldConfig.token) {
    token = oldConfig.token;
  }
  cloudDb.saveConfig({ url: url, token: token });
  // 尝试连接
  var ok = await cloudDb.connect();
  res.json({ ok: ok, message: ok ? '连接成功' : '连接失败，请检查配置' });
});

// 测试连接
router.post('/test', async (req, res) => {
  var ok = await cloudDb.connect();
  res.json({ ok: ok, message: ok ? '连接成功' : '连接失败' });
});

// 初始化云端（建表 + 上传本地数据）
router.post('/init', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var tablesOk = await cloudDb.createTables();
  if (!tablesOk) return res.status(500).json({ error: '建表失败' });
  var upload = await cloudDb.uploadLocalToCloud();
  res.json({ ok: true, tables: tablesOk, upload: upload });
});

// 双向同步
router.post('/sync', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.bidirectionalSync();
  res.json(result);
});

// 仅拉取（云端→本地）
router.post('/pull', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.downloadCloudToLocal();
  res.json(result);
});

// 仅推送（本地→云端）
router.post('/push', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.uploadLocalToCloud();
  res.json(result);
});

// 同步状态
router.get('/status', (req, res) => {
  res.json(cloudDb.getStatus());
});

// ===== 单表同步 =====
router.post('/table-push/:key', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.pushTable(req.params.key);
  res.json(result);
});

router.post('/table-pull/:key', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.pullTable(req.params.key);
  res.json(result);
});

router.post('/table-sync/:key', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var pull = await cloudDb.pullTable(req.params.key);
  var push = await cloudDb.pushTable(req.params.key);
  res.json({ ok: true, pull: pull, push: push });
});

// ===== 分类树单独同步（数据量大） =====

// 上传分类树到云端
router.post('/tree-push', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.uploadTree();
  res.json(result);
});

// 拉取云端分类树到本地
router.post('/tree-pull', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.downloadTree();
  res.json(result);
});

// 分类树双向同步
router.post('/tree-sync', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var pull = await cloudDb.downloadTree();
  var push = await cloudDb.uploadTree();
  res.json({ ok: true, pull: pull, push: push });
});

// ===== 商品单独同步 =====

// 上传商品到云端
router.post('/product-push', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.uploadProducts();
  res.json(result);
});

// 拉取云端商品到本地
router.post('/product-pull', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var result = await cloudDb.downloadProducts();
  res.json(result);
});

// 商品双向同步
router.post('/product-sync', async (req, res) => {
  if (!cloudDb.connected) {
    var connected = await cloudDb.connect();
    if (!connected) return res.status(400).json({ error: '未连接到 Turso' });
  }
  var pull = await cloudDb.downloadProducts();
  var push = await cloudDb.uploadProducts();
  res.json({ ok: true, pull: pull, push: push });
});

module.exports = router;
