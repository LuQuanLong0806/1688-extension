var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var jwt = require('jsonwebtoken');
var auth = require('../middleware/auth');
var db = require('../db');
var _customDb = null;

function _getDb() {
  return _customDb || db;
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, auth.getSecret(), { expiresIn: '7d' });
}

function localNow() {
  return new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
}

// POST /api/login
router.post('/login', function (req, res) {
  var username = (req.body.username || '').trim();
  var password = req.body.password || '';
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  var user = _getDb().getOne('SELECT id, username, password_hash, password_salt, display_name, role, must_change_password FROM users WHERE username = ? AND disabled = 0', [username]);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  var hash = hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return res.status(401).json({ error: '用户名或密码错误' });
  _getDb().run("UPDATE users SET last_login = datetime('now','+8 hours') WHERE id = ?", [user.id]);
  _getDb().scheduleSave();
  var token = signToken(user);
  res.json({
    ok: true,
    token: token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      must_change_password: user.must_change_password || 0
    }
  });
});

// POST /api/plugin-login
router.post('/plugin-login', function (req, res) {
  var username = (req.body.username || '').trim();
  var password = req.body.password || '';
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });
  var user = _getDb().getOne('SELECT id, username, password_hash, password_salt, display_name, role FROM users WHERE username = ? AND disabled = 0', [username]);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  var hash = hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return res.status(401).json({ error: '用户名或密码错误' });
  _getDb().run("UPDATE users SET last_login = datetime('now','+8 hours') WHERE id = ?", [user.id]);
  _getDb().scheduleSave();
  var token = signToken(user);
  res.json({ ok: true, token: token, user: { username: user.username, display_name: user.display_name, role: user.role } });
});

// GET /api/me
router.get('/me', function (req, res) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var user = _getDb().getOne('SELECT id, username, display_name, role, last_login, must_change_password FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, last_login: user.last_login, must_change_password: user.must_change_password || 0 });
});

// POST /api/change-password
router.post('/change-password', function (req, res) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var oldPassword = req.body.oldPassword || '';
  var newPassword = req.body.newPassword || '';
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请输入旧密码和新密码' });
  if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少6个字符' });
  var user = _getDb().getOne('SELECT id, password_hash, password_salt FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  if (hashPassword(oldPassword, user.password_salt) !== user.password_hash) return res.status(401).json({ error: '旧密码错误' });
  var newSalt = generateSalt();
  var newHash = hashPassword(newPassword, newSalt);
  _getDb().run("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, updated_at = datetime('now','+8 hours') WHERE id = ?", [newHash, newSalt, user.id]);
  _getDb().scheduleSave();
  var token = signToken({ id: user.id, username: req.user.username, role: req.user.role });
  res.json({ ok: true, token: token });
});

// POST /api/logout
router.post('/logout', function (req, res) {
  res.json({ ok: true });
});

// GET /api/users — admin only
router.get('/users', auth.requireRole('admin'), function (req, res) {
  var users = _getDb().getAll("SELECT id, username, display_name, role, last_login, must_change_password, disabled, created_at, updated_at FROM users ORDER BY id");
  res.json(users);
});

// POST /api/users — admin only, create user
router.post('/users', auth.requireRole('admin'), function (req, res) {
  var username = (req.body.username || '').trim();
  var password = req.body.password || '';
  var displayName = (req.body.display_name || '').trim();
  var role = req.body.role || 'operator';
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });
  if (['admin', 'operator', 'viewer'].indexOf(role) < 0) role = 'operator';
  var existing = _getDb().getOne('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) return res.status(400).json({ error: '用户名已存在' });
  var salt = generateSalt();
  var hash = hashPassword(password, salt);
  _getDb().run("INSERT INTO users (username, password_hash, password_salt, display_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))", [username, hash, salt, displayName, role]);
  _getDb().scheduleSave();
  res.json({ ok: true });
});

// PUT /api/users/:id — admin only, edit user
router.put('/users/:id', auth.requireRole('admin'), function (req, res) {
  var id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效ID' });
  var user = _getDb().getOne('SELECT id FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  var updates = [];
  var params = [];
  if (req.body.display_name !== undefined) { updates.push('display_name = ?'); params.push(req.body.display_name); }
  if (req.body.role !== undefined && ['admin', 'operator', 'viewer'].indexOf(req.body.role) >= 0) { updates.push('role = ?'); params.push(req.body.role); }
  if (req.body.password) {
    if (req.body.password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });
    var newSalt = generateSalt();
    var newHash = hashPassword(req.body.password, newSalt);
    updates.push('password_hash = ?'); params.push(newHash);
    updates.push('password_salt = ?'); params.push(newSalt);
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push("updated_at = datetime('now','+8 hours')");
  params.push(id);
  _getDb().run('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?', params);
  _getDb().scheduleSave();
  res.json({ ok: true });
});

// DELETE /api/users/:id — admin only, disable user
router.delete('/users/:id', auth.requireRole('admin'), function (req, res) {
  var id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效ID' });
  if (req.user && req.user.id === id) return res.status(400).json({ error: '不能禁用自己' });
  _getDb().run("UPDATE users SET disabled = 1, updated_at = datetime('now','+8 hours') WHERE id = ?", [id]);
  _getDb().scheduleSave();
  res.json({ ok: true });
});

function ensureAdmin() {
  try {
    var existing = _getDb().getOne("SELECT id FROM users WHERE username = 'admin'");
    if (!existing) {
      var salt = generateSalt();
      var hash = hashPassword('admin123', salt);
      _getDb().run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, created_at, updated_at) VALUES ('admin', ?, ?, '管理员', 'admin', 1, datetime('now','+8 hours'), datetime('now','+8 hours'))", [hash, salt]);
      _getDb().scheduleSave();
      console.log('[Auth] 已自动创建管理员账户 admin/admin123');
    }
  } catch (e) {
    console.error('[Auth] 创建管理员账户失败:', e.message);
  }
}

module.exports = router;
module.exports.ensureAdmin = ensureAdmin;
module.exports.hashPassword = hashPassword;
module.exports.generateSalt = generateSalt;
module.exports._setDb = function (d) { _customDb = d; };
