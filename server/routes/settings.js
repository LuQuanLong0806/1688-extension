const { Router } = require('express');
const { run, getAll, sseClients } = require('../db');

const router = Router();

let _clearSignals = {};

// Clear-signal
router.get('/clear-signal', (req, res) => {
  const clientId = req.query.clientId || '';
  const signal = clientId ? _clearSignals[clientId] : 0;
  res.json({ clearAt: signal || 0 });
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
