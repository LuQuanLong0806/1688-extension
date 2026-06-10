const { Router } = require('express');
const { run, getOne, getAll, sseClients } = require('../db');
const sec = require('../crypto');

const router = Router();

let _clearSignals = {};
const SIGNAL_TTL = 10 * 60 * 1000; // 10 分钟过期

function cleanExpiredSignals() {
  const now = Date.now();
  for (const key of Object.keys(_clearSignals)) {
    if (now - _clearSignals[key] > SIGNAL_TTL) delete _clearSignals[key];
  }
}

// Clear-signal（按 clientId 区分，同一浏览器的 1688/DXM 共享同一 ID）
router.get('/clear-signal', (req, res) => {
  cleanExpiredSignals();
  const clientId = req.query.clientId || '';
  const signal = clientId ? _clearSignals[clientId] || 0 : 0;
  res.json({ clearAt: signal });
});

router.post('/clear-signal', (req, res) => {
  const clientId = req.body.clientId || '';
  if (clientId) _clearSignals[clientId] = Date.now();
  res.json({ ok: true });
});

// 获取所有配置
router.get('/settings', (req, res) => {
  const rows = getAll('SELECT key, value, updated_at FROM settings');
  const result = {};
  rows.forEach(r => { result[r.key] = { value: r.value, updated_at: r.updated_at }; });
  res.json(result);
});

// 批量更新配置
router.put('/settings', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) return res.json({ ok: true });
  for (const item of items) {
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now", "+8 hours"))', [item.key, item.value]);
  }
  res.json({ ok: true });
});

// 单个配置读写（GET/POST）
router.get('/settings/:key', (req, res) => {
  const row = getOne('SELECT value FROM settings WHERE key = ?', [req.params.key]);
  res.json(row ? { value: row.value } : {});
});

router.post('/settings/:key', (req, res) => {
  const { value } = req.body;
  run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now", "+8 hours"))', [req.params.key, value || '']);
  res.json({ ok: true });
});

// 导出所有设置为 JSON 文件（解密敏感值，导出后为明文，导入后由本机重新加密）
router.get('/settings-export', (req, res) => {
  const rows = getAll('SELECT key, value FROM settings');
  const data = {};
  rows.forEach(r => {
    data[r.key] = sec.isSensitive(r.key) ? sec.decrypt(r.value) : r.value;
  });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=settings_' + new Date().toISOString().slice(0, 10) + '.json');
  res.json(data);
});

// 导入设置 JSON
router.post('/settings-import', (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: '无效数据' });
  // 排除内部迁移标记
  const skipKeys = ['migration_custom_name_to_mappings', 'migration_dxm_categories_to_tree', 'migration_cleanup_path_mappings'];
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (skipKeys.includes(key)) continue;
    var val = String(value);
    if (sec.isSensitive(key) && val.indexOf('ENC:') !== 0) val = sec.encrypt(val);
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now", "+8 hours"))', [key, val]);
    count++;
  }
  // 迁移：旧单 key 格式 → 新多 key 数组格式
  try {
    // 智谱：zhipu_api_key（单个字符串）→ zhipu_api_keys（JSON 数组）
    if (data['zhipu_api_key'] && !data['zhipu_api_keys']) {
      var oldKey = String(data['zhipu_api_key']).trim();
      if (oldKey) {
        run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zhipu_api_keys', ?, datetime('now', '+8 hours'))`, [sec.encrypt(JSON.stringify([{key: oldKey, label: ''}]))]);
      }
      run("DELETE FROM settings WHERE key = 'zhipu_api_key'");
    }
    // 智谱：旧格式纯字符串数组 → {key, label} 对象数组
    if (data['zhipu_api_keys']) {
      var arr;
      try { arr = JSON.parse(data['zhipu_api_keys']); } catch (e) { arr = null; }
      if (Array.isArray(arr) && arr.length && typeof arr[0] === 'string') {
        run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zhipu_api_keys', ?, datetime('now', '+8 hours'))`, [sec.encrypt(JSON.stringify(arr.map(function (k) { return {key: k, label: ''}; })))]);
      }
    }
    // ai_configs 内 provider 旧格式迁移
    if (data['ai_configs']) {
      var cfg;
      try { cfg = JSON.parse(data['ai_configs']); } catch (e) { cfg = null; }
      if (cfg && cfg.providers) {
        var changed = false;
        // 通义千问：apiKey 字符串 → apiKeys 数组
        if (cfg.providers.qwen && cfg.providers.qwen.apiKey && !cfg.providers.qwen.apiKeys) {
          cfg.providers.qwen.apiKeys = [{key: cfg.providers.qwen.apiKey, label: ''}];
          delete cfg.providers.qwen.apiKey;
          changed = true;
        }
        // 通义千问：旧格式纯字符串数组 → {key, label} 对象数组
        if (cfg.providers.qwen && cfg.providers.qwen.apiKeys && Array.isArray(cfg.providers.qwen.apiKeys)) {
          var qwenMigrated = false;
          cfg.providers.qwen.apiKeys = cfg.providers.qwen.apiKeys.map(function (e) {
            if (typeof e === 'string') { qwenMigrated = true; return {key: e, label: ''}; }
            return e;
          });
          if (qwenMigrated) changed = true;
        }
        // 混元：secretId/secretKey → accounts 数组
        if (cfg.providers.hunyuan && cfg.providers.hunyuan.secretId && !cfg.providers.hunyuan.accounts) {
          cfg.providers.hunyuan.accounts = [{ secretId: cfg.providers.hunyuan.secretId, secretKey: cfg.providers.hunyuan.secretKey, label: '' }];
          delete cfg.providers.hunyuan.secretId;
          delete cfg.providers.hunyuan.secretKey;
          changed = true;
        }
        if (changed) {
          run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_configs', ?, datetime('now', '+8 hours'))`, [sec.encrypt(JSON.stringify(cfg))]);
        }
      }
    }
  } catch (e) {
    console.log('[导入迁移] 迁移异常:', e.message);
  }

  // 厂商Key池迁移：旧专用Key合并到厂商Key池
  try {
    var aiCfg;
    try { aiCfg = JSON.parse(data['ai_configs'] || '{}'); } catch(e2) { aiCfg = {}; }
    // 智谱：vision/image 专用Key → zhipu_api_keys
    var zhipuArr;
    try { zhipuArr = JSON.parse(data['zhipu_api_keys'] || '[]'); } catch(e2) { zhipuArr = []; }
    zhipuArr = zhipuArr.map(function(e) { return typeof e === 'string' ? {key: e, label: ''} : e; });
    var zhipuChanged = false;
    if (aiCfg.vision && aiCfg.vision.apiKey) {
      var vk = aiCfg.vision.apiKey;
      if (!zhipuArr.some(function(e) { return e.key === vk; })) {
        zhipuArr.push({ key: vk, label: '旧智能检测Key' });
      }
      delete aiCfg.vision.apiKey;
      zhipuChanged = true;
    }
    if (aiCfg.image && aiCfg.image.apiKey) {
      var ik = aiCfg.image.apiKey;
      if (!zhipuArr.some(function(e) { return e.key === ik; })) {
        zhipuArr.push({ key: ik, label: '旧图片生成Key' });
      }
      delete aiCfg.image.apiKey;
      zhipuChanged = true;
    }
    if (zhipuArr.length) {
      run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zhipu_api_keys', ?, datetime('now', '+8 hours'))`, [sec.encrypt(JSON.stringify(zhipuArr))]);
    }
    // 通义千问：qwen_vl_api_key → ai_configs.providers.qwen.apiKeys
    if (data['qwen_vl_api_key']) {
      var vlKey = String(data['qwen_vl_api_key']).trim();
      if (vlKey && vlKey !== 'sk-ad9a93ab29e34635a92b75fd2d751f81') {
        if (!aiCfg.providers) aiCfg.providers = {};
        if (!aiCfg.providers.qwen) aiCfg.providers.qwen = {};
        if (!aiCfg.providers.qwen.apiKeys) aiCfg.providers.qwen.apiKeys = [];
        if (!aiCfg.providers.qwen.apiKeys.some(function(e) { return (e.key||e) === vlKey; })) {
          aiCfg.providers.qwen.apiKeys.push({ key: vlKey, label: '旧VL Key' });
        }
      }
    }
    if (zhipuChanged || data['qwen_vl_api_key']) {
      var cfgVal = JSON.stringify(aiCfg);
      if (sec.isSensitive('ai_configs')) cfgVal = sec.encrypt(cfgVal);
      run(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_configs', ?, datetime('now', '+8 hours'))`, [cfgVal]);
    }
    // 清除迁移标记，让下次启动重新检测
    run("DELETE FROM settings WHERE key = 'ai_vendor_migrated'");
  } catch(e3) {
    console.log('[导入迁移] Key合并异常:', e3.message);
  }

  res.json({ ok: true, imported: count });
});

// SSE 实时推送
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

module.exports = router;
