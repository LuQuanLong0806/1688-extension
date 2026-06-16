var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var jwt = require('jsonwebtoken');
var auth = require('../middleware/auth');
var db = require('../db');
var cloudDb = require('../cloud/index');
var _customDb = null;

function _getDb() {
  return _customDb || db;
}

// 用户操作实时推送到云端（按 username 匹配，避免本地/云端 id 不一致）
// ⚠️ users 表的每个写操作（登录/改密/CRUD）都必须调一次，否则多机器数据不一致
function pushUserCloud(sql, params, label) {
  if (!cloudDb.connected) return;
  cloudDb.cloudRun(sql, params).catch(function (e) {
    console.error('[云同步] 用户推送失败 ' + (label || '') + ':', e.message);
  });
}

// 当前 Unix 秒级时间戳字符串 — 用于 token_invalid_at
// JWT payload.iat 也是秒级，比较时直接 parseInt
function utcNowSec() {
  return String(Math.floor(Date.now() / 1000));
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

var COOKIE_OPTIONS = { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' };

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
  _getDb().run("UPDATE users SET last_login = ?, token_invalid_at = '' WHERE id = ?", [localNow(), user.id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET last_login = MAX(last_login, ?), token_invalid_at = '' WHERE username = ?", [localNow(), user.username], 'login');
  var token = signToken(user);
  res.cookie('auth_token', token, COOKIE_OPTIONS);
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
  var user = _getDb().getOne('SELECT id, username, password_hash, password_salt, display_name, role, must_change_password FROM users WHERE username = ? AND disabled = 0', [username]);
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });
  var hash = hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return res.status(401).json({ error: '用户名或密码错误' });
  // 首次登录强制改密码的场景：扩展端登录也必须先改密（admin/admin123 不能直接用）
  if (user.must_change_password) {
    return res.status(403).json({ error: '请先在管理平台修改初始密码', must_change_password: 1 });
  }
  _getDb().run("UPDATE users SET last_login = ?, token_invalid_at = '' WHERE id = ?", [localNow(), user.id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET last_login = MAX(last_login, ?), token_invalid_at = '' WHERE username = ?", [localNow(), user.username], 'plugin-login');
  var token = signToken(user);
  res.cookie('auth_token', token, COOKIE_OPTIONS);
  res.json({ ok: true, token: token, user: { username: user.username, display_name: user.display_name, role: user.role } });
});

// GET /api/me
router.get('/me', function (req, res) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var user = _getDb().getOne('SELECT id, username, display_name, role, last_login, must_change_password, avatar_url, email, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  res.json({
    id: user.id,
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    last_login: user.last_login,
    must_change_password: user.must_change_password || 0,
    avatar_url: user.avatar_url || '',
    email: user.email || '',
    created_at: user.created_at || ''
  });
});

// PUT /api/me/profile — 自助改 display_name + email（不能改 username/role）
router.put('/me/profile', function (req, res) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var displayName = (req.body.display_name || '').trim();
  var email = (req.body.email || '').trim();
  if (displayName.length > 32) return res.status(400).json({ error: '显示名最多 32 字符' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }
  var now = localNow();
  _getDb().run("UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?", [displayName, email, now, req.user.id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE username = ?", [displayName, email, now, req.user.username], 'self-update-profile');
  res.json({ ok: true, display_name: displayName, email: email });
});

// POST /api/me/avatar — 上传头像
// 复用 upload-limits 中间件保护（MIME 白名单 + 字节上限 + 转码）
// 存储：OSS 优先（路径 avatars/） / 本地 public/avatars/ 兜底（不走 7 天清理）
router.post('/me/avatar',
  require('../middleware/upload-limits').preCheck,
  require('../middleware/upload-limits').transformHandler,
  function (req, res) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    var transformed = req._uploadTransformed;
    var imageData, ext = 'png';
    if (transformed) {
      imageData = transformed.buffer;
      ext = transformed.ext || 'png';
    } else {
      imageData = req.body.image_base64;
    }
    var filename = 'avatar_' + req.user.id + '_' + Date.now() + '.' + ext;
    var now = new Date();

    function saveLocal(buf) {
      var fs = require('fs');
      var path = require('path');
      var dir = path.join(__dirname, '..', 'public', 'avatars');
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
      var filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, buf);
      return '/avatars/' + filename;
    }

    function updateDbUrl(url) {
      var nowStr = localNow();
      _getDb().run("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?", [url, nowStr, req.user.id]);
      _getDb().scheduleSave();
      pushUserCloud("UPDATE users SET avatar_url = ?, updated_at = ? WHERE username = ?", [url, nowStr, req.user.username], 'self-update-avatar');
      return url;
    }

    // 解码 buffer（imageData 可能是 Buffer 或 base64 字符串）
    var buf = Buffer.isBuffer(imageData) ? imageData : Buffer.from(String(imageData).replace(/^data:image\/\w+;base64,/, ''), 'base64');

    var oss = require('../services/oss-upload');
    if (oss.isConfigured()) {
      // OSS 路径：avatars/{date}/{filename}
      var dateDir = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      var cloudPath = 'avatars/' + dateDir + '/' + filename;
      var config = oss.getOssConfig();
      var OSS = require('ali-oss');
      var clientOpts = { accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret, bucket: config.bucket, region: config.region };
      if (config.endpoint) clientOpts.endpoint = config.endpoint;
      var client = new OSS(clientOpts);
      var mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      var mime = mimeMap['.' + ext] || 'image/png';
      client.put(cloudPath, buf, { headers: { 'Content-Type': mime } }).then(function (result) {
        var url = result.url || ('https://' + config.bucket + '.' + config.region + '.aliyuncs.com/' + cloudPath);
        res.json({ ok: true, avatar_url: updateDbUrl(url) });
      }).catch(function (e) {
        console.error('[头像] OSS 上传失败，回退本地:', e.message);
        res.json({ ok: true, avatar_url: updateDbUrl(saveLocal(buf)) });
      });
    } else {
      res.json({ ok: true, avatar_url: updateDbUrl(saveLocal(buf)) });
    }
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
  var now = localNow();
  // 改密后 token_invalid_at = now：旧 token（包括其他机器）全部失效，必须重新登录
  var invAt = utcNowSec();
  _getDb().run("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, token_invalid_at = ?, updated_at = ? WHERE id = ?", [newHash, newSalt, invAt, now, user.id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0, token_invalid_at = MAX(token_invalid_at, ?), updated_at = ? WHERE username = ?", [newHash, newSalt, invAt, now, req.user.username], 'change-password');
  var token = signToken({ id: user.id, username: req.user.username, role: req.user.role });
  res.cookie('auth_token', token, COOKIE_OPTIONS);
  res.json({ ok: true, token: token });
});

// POST /api/logout
// 设置 token_invalid_at = now：让本机和其他机器上的旧 token 立即失效
// （JWT 是无状态的，仅 clearCookie 不能让已签发的 token 失效）
router.post('/logout', function (req, res) {
  res.clearCookie('auth_token');
  if (req.user) {
    var invAt = utcNowSec();
    _getDb().run("UPDATE users SET token_invalid_at = ? WHERE id = ?", [invAt, req.user.id]);
    _getDb().scheduleSave();
    pushUserCloud("UPDATE users SET token_invalid_at = MAX(token_invalid_at, ?) WHERE username = ?", [invAt, req.user.username], 'logout');
  }
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
  var now = localNow();
  _getDb().run("INSERT INTO users (username, password_hash, password_salt, display_name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [username, hash, salt, displayName, role, now, now]);
  _getDb().scheduleSave();
  pushUserCloud("INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)", [username, hash, salt, displayName, role, now, now], 'create-user');
  res.json({ ok: true });
});

// PUT /api/users/:id — admin only, edit user
router.put('/users/:id', auth.requireRole('admin'), function (req, res) {
  var id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效ID' });
  var user = _getDb().getOne('SELECT id, username FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  var updates = [];
  var params = [];
  var passwordChanged = false;
  if (req.body.display_name !== undefined) { updates.push('display_name = ?'); params.push(req.body.display_name); }
  if (req.body.role !== undefined && ['admin', 'operator', 'viewer'].indexOf(req.body.role) >= 0) { updates.push('role = ?'); params.push(req.body.role); }
  if (req.body.password) {
    if (req.body.password.length < 6) return res.status(400).json({ error: '密码至少6个字符' });
    var newSalt = generateSalt();
    var newHash = hashPassword(req.body.password, newSalt);
    updates.push('password_hash = ?'); params.push(newHash);
    updates.push('password_salt = ?'); params.push(newSalt);
    passwordChanged = true;
  }
  if (!updates.length) return res.json({ ok: true });
  var now = localNow();
  updates.push('updated_at = ?');
  params.push(now);
  // 改了密码就强制踢下线（旧 token 失效，必须用新密码重新登录）
  if (passwordChanged) {
    var invAt = utcNowSec();
    updates.push('token_invalid_at = ?');
    params.push(invAt);
  }
  params.push(id);
  _getDb().run('UPDATE users SET ' + updates.join(', ') + ' WHERE id = ?', params);
  _getDb().scheduleSave();
  // 云端：如果改了密码，把 token_invalid_at 加进去（用 MAX 合并）
  var cloudUpdates = updates.slice();
  if (passwordChanged) {
    // 把本地 'token_invalid_at = ?' 替换成云端 'token_invalid_at = MAX(token_invalid_at, ?)'
    cloudUpdates = cloudUpdates.map(function (s) {
      return s === 'token_invalid_at = ?' ? 'token_invalid_at = MAX(token_invalid_at, ?)' : s;
    });
  }
  var cloudParams = params.slice(0, params.length - 1); // 去掉最后的 id
  cloudParams.push(user.username);
  pushUserCloud('UPDATE users SET ' + cloudUpdates.join(', ') + ' WHERE username = ?', cloudParams, 'edit-user ' + user.username);
  res.json({ ok: true });
});

// DELETE /api/users/:id — admin only, disable user
router.delete('/users/:id', auth.requireRole('admin'), function (req, res) {
  var id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效ID' });
  if (req.user && req.user.id === id) return res.status(400).json({ error: '不能禁用自己' });
  var target = _getDb().getOne('SELECT username FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  var now = localNow();
  var invAt = utcNowSec();
  // 禁用时同时踢下线（双保险，disabled=1 已经能拦截，但 token_invalid_at 让旧 token 立即失效）
  _getDb().run("UPDATE users SET disabled = 1, token_invalid_at = ?, updated_at = ? WHERE id = ?", [invAt, now, id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET disabled = 1, token_invalid_at = MAX(token_invalid_at, ?), updated_at = ? WHERE username = ?", [invAt, now, target.username], 'disable-user ' + target.username);
  res.json({ ok: true });
});

// POST /api/users/:id/enable — admin only, re-enable a disabled user
// 清掉 disabled + token_invalid_at；启用后用户能用原密码登录
// （禁用时没有改密码，所以密码还是禁用前的）
router.post('/users/:id/enable', auth.requireRole('admin'), function (req, res) {
  var id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: '无效ID' });
  var target = _getDb().getOne('SELECT username, disabled FROM users WHERE id = ?', [id]);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (!target.disabled) return res.json({ ok: true });
  var now = localNow();
  _getDb().run("UPDATE users SET disabled = 0, token_invalid_at = '', updated_at = ? WHERE id = ?", [now, id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET disabled = 0, token_invalid_at = '', updated_at = ? WHERE username = ?", [now, target.username], 'enable-user ' + target.username);
  res.json({ ok: true });
});

function ensureAdmin() {
  try {
    var existing = _getDb().getOne("SELECT id FROM users WHERE username = 'admin'");
    if (!existing) {
      var salt = generateSalt();
      var hash = hashPassword('admin123', salt);
      _getDb().run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, created_at, updated_at) VALUES ('admin', ?, ?, '管理员', 'admin', 1, datetime('now','+8 hours'), '')", [hash, salt]);
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
