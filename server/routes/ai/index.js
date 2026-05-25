// AI 路由入口 — 合并子模块 + 配置管理端点
const express = require('express');
const router = express.Router();

var providers = require('./providers');
var sec = require('../../crypto');

// 挂载子路由
router.use(require('./image-gen'));
router.use(require('./image-edit'));
var categoryRouter = require('./category-recommend');
router.use(categoryRouter);

// ===== API 密钥管理端点 =====

// 检查API密钥
router.get('/check-key', function (req, res) {
  var key = providers.getApiKey();
  res.json({ configured: !!key });
});

// 获取API密钥（脱敏）
router.get('/get-key', function (req, res) {
  var key = providers.getApiKey();
  if (!key) return res.json({ configured: false, masked: '' });
  var masked = key.length > 8 ? key.substring(0, 4) + '****' + key.substring(key.length - 4) : '****';
  res.json({ configured: true, masked: masked });
});

// 保存API密钥
router.post('/save-key', function (req, res) {
  var key = (req.body.key || '').trim();
  if (!key) return res.status(400).json({ error: '密钥不能为空' });
  try {
    var db = require('../../db');
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', ?)", [sec.encrypt(key)]);
    db.scheduleSave();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

// 删除API密钥
router.post('/delete-key', function (req, res) {
  try {
    var db = require('../../db');
    db.run("DELETE FROM settings WHERE key = 'zhipu_api_key'");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '删除失败' });
  }
});

// ===== AI 模型配置管理 =====

// 获取所有配置（key 脱敏）
router.get('/configs', function (req, res) {
  var configs = providers.getAIConfigs();
  var result = {};
  Object.keys(providers.AI_USE_CASES).forEach(function (uc) {
    var c = configs[uc] || {};
    result[uc] = {
      model: c.model || providers.AI_USE_CASES[uc].defaultModel,
      apiKey: providers.maskApiKey(c.apiKey),
      configured: !!(c.apiKey || providers.getApiKey()),
      label: providers.AI_USE_CASES[uc].label,
      models: providers.AI_USE_CASES[uc].models
    };
  });
  // 智谱多 key
  var zhipuKeys = providers.getZhipuKeys();
  result._global = {
    apiKey: providers.maskApiKey(providers.getApiKey()),
    configured: !!providers.getApiKey(),
    keys: zhipuKeys.map(function (e) { return { key: providers.maskApiKey(e.key), label: e.label || '' }; })
  };
  // 供应商多 key
  var qwenKeys = providers.getQwenKeys();
  var hunyuanAccounts = providers.getHunyuanAccounts();
  var provCfg = configs.providers || {};
  result.providers = {
    qwen: {
      label: '通义千问（阿里云）',
      keys: qwenKeys.map(function (e) { return { key: providers.maskApiKey(e.key), label: e.label || '' }; }),
      configured: qwenKeys.length > 0
    },
    hunyuan: {
      label: '腾讯混元（腾讯云）',
      accounts: hunyuanAccounts.map(function (a) {
        return { secretId: providers.maskApiKey(a.secretId), secretKey: providers.maskApiKey(a.secretKey), label: a.label || '' };
      }),
      configured: hunyuanAccounts.length > 0
    },
    ollama: {
      label: '本地模型（Ollama）',
      model: (provCfg.ollama && provCfg.ollama.model) || 'qwen3:8b',
      port: (provCfg.ollama && provCfg.ollama.port) || '11434',
      configured: !!(provCfg.ollama && provCfg.ollama.model)
    }
  };
  res.json(result);
});

// 保存配置（仅 ollama 和 per-use-case model，key 管理走专用端点）
router.post('/configs', function (req, res) {
  var updates = req.body;
  var configs = providers.getAIConfigs();

  Object.keys(updates).forEach(function (uc) {
    if (uc === 'providers') return;
    if (!providers.AI_USE_CASES[uc]) return;
    if (!configs[uc]) configs[uc] = {};
    if (updates[uc].model) configs[uc].model = updates[uc].model;
    // 兼容：如果传来单个 apiKey，追加到对应数组
    if (updates[uc].apiKey && updates[uc].apiKey.indexOf('****') === -1) {
      configs[uc].apiKey = updates[uc].apiKey;
    }
  });

  if (updates.providers && updates.providers.ollama) {
    if (!configs.providers) configs.providers = {};
    if (!configs.providers.ollama) configs.providers.ollama = {};
    if (updates.providers.ollama.model) configs.providers.ollama.model = updates.providers.ollama.model;
    if (updates.providers.ollama.port) configs.providers.ollama.port = updates.providers.ollama.port;
  }

  providers.saveAIConfigs(configs);
  console.log('[AI配置] 已保存');
  res.json({ ok: true });
});

// 保存全局 key（兼容旧调用，追加到 zhipu_api_keys）
router.post('/global-key', function (req, res) {
  var key = (req.body.apiKey || '').trim();
  if (!key) return res.status(400).json({ error: 'API Key 不能为空' });
  if (key.indexOf('****') !== -1) return res.status(400).json({ error: '请输入完整API Key' });
  try {
    var keys = providers.getZhipuKeys();
    if (keys.some(function (e) { return (e.key || e) === key; })) return res.status(400).json({ error: 'Key已存在' });
    keys.push({ key: key, label: '' });
    providers.saveZhipuKeys(keys);
    console.log('[AI配置] 智谱API Key已添加，共', keys.length, '个');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

// ===== 多 Key 管理端点 =====

// 智谱 key 管理
router.post('/zhipu-keys', function (req, res) {
  var action = req.body.action;
  var keys = providers.getZhipuKeys();
  if (action === 'add') {
    var key = (req.body.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Key不能为空' });
    if (keys.some(function (e) { return (e.key || e) === key; })) return res.status(400).json({ error: 'Key已存在' });
    keys.push({ key: key, label: (req.body.label || '').trim() });
    providers.saveZhipuKeys(keys);
    console.log('[AI配置] 智谱Key已添加，共', keys.length, '个');
    res.json({ ok: true, count: keys.length });
  } else if (action === 'delete') {
    var idx = parseInt(req.body.index);
    if (isNaN(idx) || idx < 0 || idx >= keys.length) return res.status(400).json({ error: '无效索引' });
    keys.splice(idx, 1);
    providers.saveZhipuKeys(keys);
    console.log('[AI配置] 智谱Key已删除，剩余', keys.length, '个');
    res.json({ ok: true, count: keys.length });
  } else if (action === 'update-label') {
    var idx = parseInt(req.body.index);
    if (isNaN(idx) || idx < 0 || idx >= keys.length) return res.status(400).json({ error: '无效索引' });
    keys[idx].label = (req.body.label || '').trim();
    providers.saveZhipuKeys(keys);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: '未知操作' });
  }
});

// 通义千问 key 管理
router.post('/qwen-keys', function (req, res) {
  var action = req.body.action;
  var configs = providers.getAIConfigs();
  if (!configs.providers) configs.providers = {};
  if (!configs.providers.qwen) configs.providers.qwen = {};
  var keys = providers.getQwenKeys();
  if (action === 'add') {
    var key = (req.body.key || '').trim();
    if (!key) return res.status(400).json({ error: 'Key不能为空' });
    if (keys.some(function (e) { return (e.key || e) === key; })) return res.status(400).json({ error: 'Key已存在' });
    keys.push({ key: key, label: (req.body.label || '').trim() });
    configs.providers.qwen.apiKeys = keys;
    delete configs.providers.qwen.apiKey;
    providers.saveAIConfigs(configs);
    console.log('[AI配置] 通义千问Key已添加，共', keys.length, '个');
    res.json({ ok: true, count: keys.length });
  } else if (action === 'delete') {
    var idx = parseInt(req.body.index);
    if (isNaN(idx) || idx < 0 || idx >= keys.length) return res.status(400).json({ error: '无效索引' });
    keys.splice(idx, 1);
    configs.providers.qwen.apiKeys = keys;
    providers.saveAIConfigs(configs);
    console.log('[AI配置] 通义千问Key已删除，剩余', keys.length, '个');
    res.json({ ok: true, count: keys.length });
  } else if (action === 'update-label') {
    var idx = parseInt(req.body.index);
    if (isNaN(idx) || idx < 0 || idx >= keys.length) return res.status(400).json({ error: '无效索引' });
    keys[idx].label = (req.body.label || '').trim();
    configs.providers.qwen.apiKeys = keys;
    providers.saveAIConfigs(configs);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: '未知操作' });
  }
});

// 腾讯混元账号管理
router.post('/hunyuan-keys', function (req, res) {
  var action = req.body.action;
  var configs = providers.getAIConfigs();
  if (!configs.providers) configs.providers = {};
  if (!configs.providers.hunyuan) configs.providers.hunyuan = {};
  var accounts = providers.getHunyuanAccounts();
  if (action === 'add') {
    var sid = (req.body.secretId || '').trim();
    var skey = (req.body.secretKey || '').trim();
    if (!sid || !skey) return res.status(400).json({ error: '请填写 SecretId 和 SecretKey' });
    accounts.push({ secretId: sid, secretKey: skey, label: (req.body.label || '').trim() });
    configs.providers.hunyuan.accounts = accounts;
    delete configs.providers.hunyuan.secretId;
    delete configs.providers.hunyuan.secretKey;
    providers.saveAIConfigs(configs);
    console.log('[AI配置] 混元账号已添加，共', accounts.length, '个');
    res.json({ ok: true, count: accounts.length });
  } else if (action === 'delete') {
    var idx = parseInt(req.body.index);
    if (isNaN(idx) || idx < 0 || idx >= accounts.length) return res.status(400).json({ error: '无效索引' });
    accounts.splice(idx, 1);
    configs.providers.hunyuan.accounts = accounts;
    providers.saveAIConfigs(configs);
    console.log('[AI配置] 混元账号已删除，剩余', accounts.length, '个');
    res.json({ ok: true, count: accounts.length });
  } else if (action === 'update-label') {
    var idx = parseInt(req.body.index);
    if (isNaN(idx) || idx < 0 || idx >= accounts.length) return res.status(400).json({ error: '无效索引' });
    accounts[idx].label = (req.body.label || '').trim();
    configs.providers.hunyuan.accounts = accounts;
    providers.saveAIConfigs(configs);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: '未知操作' });
  }
});

// 导出 router + category-recommend 的公共函数（兼容 products.js 调用）
module.exports = router;
module.exports.extractSearchKeywordsPublic = categoryRouter.extractSearchKeywordsPublic;
module.exports.clearConfigCache = categoryRouter.clearConfigCache;
