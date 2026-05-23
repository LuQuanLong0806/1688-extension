// AI 路由入口 — 合并子模块 + 配置管理端点
const express = require('express');
const router = express.Router();

var providers = require('./providers');

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
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', ?)", [key]);
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
  result._global = { apiKey: providers.maskApiKey(providers.getApiKey()), configured: !!providers.getApiKey() };
  var provCfg = configs.providers || {};
  result.providers = {
    qwen: {
      label: '通义千问（阿里云）',
      apiKey: providers.maskApiKey(provCfg.qwen && provCfg.qwen.apiKey),
      configured: !!(provCfg.qwen && provCfg.qwen.apiKey)
    },
    hunyuan: {
      label: '腾讯混元（腾讯云）',
      secretId: providers.maskApiKey(provCfg.hunyuan && provCfg.hunyuan.secretId),
      secretKey: providers.maskApiKey(provCfg.hunyuan && provCfg.hunyuan.secretKey),
      configured: !!(provCfg.hunyuan && provCfg.hunyuan.secretId && provCfg.hunyuan.secretKey)
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

// 保存配置
router.post('/configs', function (req, res) {
  var updates = req.body;
  var configs = providers.getAIConfigs();

  Object.keys(updates).forEach(function (uc) {
    if (uc === 'providers') return;
    if (!providers.AI_USE_CASES[uc]) return;
    if (!configs[uc]) configs[uc] = {};
    if (updates[uc].model) configs[uc].model = updates[uc].model;
    if (updates[uc].apiKey && updates[uc].apiKey.indexOf('****') === -1) {
      configs[uc].apiKey = updates[uc].apiKey;
    }
  });

  if (updates.providers) {
    if (!configs.providers) configs.providers = {};
    if (updates.providers.qwen) {
      if (!configs.providers.qwen) configs.providers.qwen = {};
      if (updates.providers.qwen.apiKey && updates.providers.qwen.apiKey.indexOf('****') === -1) {
        configs.providers.qwen.apiKey = updates.providers.qwen.apiKey;
      }
    }
    if (updates.providers.hunyuan) {
      if (!configs.providers.hunyuan) configs.providers.hunyuan = {};
      if (updates.providers.hunyuan.secretId && updates.providers.hunyuan.secretId.indexOf('****') === -1) {
        configs.providers.hunyuan.secretId = updates.providers.hunyuan.secretId;
      }
      if (updates.providers.hunyuan.secretKey && updates.providers.hunyuan.secretKey.indexOf('****') === -1) {
        configs.providers.hunyuan.secretKey = updates.providers.hunyuan.secretKey;
      }
    }
    if (updates.providers.ollama) {
      if (!configs.providers.ollama) configs.providers.ollama = {};
      if (updates.providers.ollama.model) configs.providers.ollama.model = updates.providers.ollama.model;
      if (updates.providers.ollama.port) configs.providers.ollama.port = updates.providers.ollama.port;
    }
  }

  providers.saveAIConfigs(configs);
  console.log('[AI配置] 已保存');
  res.json({ ok: true });
});

// 保存全局 key
router.post('/global-key', function (req, res) {
  var key = (req.body.apiKey || '').trim();
  if (!key) return res.status(400).json({ error: 'API Key 不能为空' });
  if (key.indexOf('****') !== -1) return res.status(400).json({ error: '请输入完整API Key' });
  try {
    var db = require('../../db');
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', ?)", [key]);
    db.scheduleSave();
    console.log('[AI配置] 全局API Key已更新');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '保存失败' });
  }
});

// 导出 router + category-recommend 的公共函数（兼容 products.js 调用）
module.exports = router;
module.exports.extractSearchKeywordsPublic = categoryRouter.extractSearchKeywordsPublic;
module.exports.learnKeywordCategoryRelPublic = categoryRouter.learnKeywordCategoryRelPublic;
