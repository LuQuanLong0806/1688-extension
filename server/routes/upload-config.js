// 上传限制配置管理路由 — admin only
var express = require('express');
var router = express.Router();
var auth = require('../middleware/auth');
var config = require('../services/upload-config');

router.use(auth.requireRole('admin'));

// 取当前配置（合并默认值）
router.get('/', function (req, res) {
  res.json(config.get());
});

// 取默认配置（前端"恢复默认"按钮用）
router.get('/defaults', function (req, res) {
  res.json(config.defaults());
});

// 更新配置（部分字段）
router.post('/', function (req, res) {
  var updates = req.body || {};
  var validUpdates = {};
  Object.keys(updates).forEach(function (key) {
    if (key in config.DEFAULTS) validUpdates[key] = updates[key];
  });
  if (!Object.keys(validUpdates).length) {
    return res.status(400).json({ error: '没有可更新的配置项' });
  }
  var saved = config.save(validUpdates);
  console.log('[上传配置] 已更新:', Object.keys(validUpdates).join(', '));
  res.json({ ok: true, config: saved });
});

module.exports = router;
