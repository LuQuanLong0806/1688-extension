const { Router } = require('express');
const { run, getOne, getAll, sseClients } = require('../db');

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
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [item.key, item.value]);
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
  run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [req.params.key, value || '']);
  res.json({ ok: true });
});

// 导出所有设置为 JSON 文件
router.get('/settings-export', (req, res) => {
  const rows = getAll('SELECT key, value FROM settings');
  const data = {};
  rows.forEach(r => { data[r.key] = r.value; });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=settings_' + new Date().toISOString().slice(0, 10) + '.json');
  res.json(data);
});

// 导入设置 JSON
router.post('/settings-import', (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') return res.status(400).json({ error: '无效数据' });
  // 排除内部迁移标记
  const skipKeys = ['migration_custom_name_to_mappings', 'migration_dxm_categories_to_tree', 'migration_cleanup_path_mappings'];
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (skipKeys.includes(key)) continue;
    run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)', [key, String(value)]);
    count++;
  }
  res.json({ ok: true, imported: count });
});

// SSE 实时推送
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('event: connected\ndata: {}\n\n');
  sseClients.push(res);
  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx >= 0) sseClients.splice(idx, 1);
  });
});

module.exports = router;
