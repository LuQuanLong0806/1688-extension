var jwt = require('jsonwebtoken');

var JWT_SECRET = null;
var _db = null;

function _getDb() {
  return _db || require('../db');
}

function getSecret() {
  if (JWT_SECRET) return JWT_SECRET;
  try {
    var db = _getDb();
    var row = db.getOne("SELECT value FROM settings WHERE key = 'jwt_secret'");
    if (row && row.value) { JWT_SECRET = row.value; return JWT_SECRET; }
  } catch (e) {}
  var crypto = require('crypto');
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  try {
    var db = _getDb();
    db.run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('jwt_secret', ?, datetime('now','+8 hours'))", [JWT_SECRET]);
    if (db.scheduleSave) db.scheduleSave();
  } catch (e) {}
  return JWT_SECRET;
}

var WHITELIST = [
  { method: 'POST', path: '/api/login' },
  { method: 'POST', path: '/api/plugin-login' },
  { method: 'POST', path: '/api/product' },
  { method: 'GET', path: '/api/product/check' },
  { method: 'GET', path: '/api/events' },
  { method: 'GET', path: '/api/extension-version' },
  { method: 'POST', path: '/api/collage-import' },
  { method: 'GET', path: '/api/collage-import' },
  { method: 'GET', path: '/api/proxy-image' },
  { method: 'POST', path: '/api/upload-image' }
];

var STATIC_PREFIXES = [
  '/login.html', '/js/', '/css/', '/uploads/', '/images/', '/fonts/',
  '/favicon.ico', '/manifest.json', '/sw.js', '/dev/sites'
];

function isWhitelisted(method, path) {
  for (var i = 0; i < WHITELIST.length; i++) {
    if (WHITELIST[i].method === method && WHITELIST[i].path === path) return true;
  }
  if (path === '/' || path === '') return true;
  for (var j = 0; j < STATIC_PREFIXES.length; j++) {
    if (path.indexOf(STATIC_PREFIXES[j]) === 0) return true;
  }
  if (/\.(html|css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|map)$/i.test(path)) return true;
  return false;
}

function authMiddleware(req, res, next) {
  var token = null;
  var authHeader = req.headers.authorization;
  if (authHeader && authHeader.indexOf('Bearer ') === 0) token = authHeader.slice(7);
  if (!token && req.query && req.query.token) token = req.query.token;
  if (token) {
    try {
      var decoded = jwt.verify(token, getSecret());
      req.user = { id: decoded.id, username: decoded.username, role: decoded.role, iat: decoded.iat };
    } catch (e) {}
  }
  // token_invalid_at 检查：登出/改密/禁用后，旧 token 立即失效
  // JWT 是无状态的，clearCookie 不能让已签发的 token 失效，所以用 DB 字段二次校验
  if (req.user && req.user.id) {
    try {
      var row = _getDb().getOne('SELECT token_invalid_at, disabled FROM users WHERE id = ?', [req.user.id]);
      if (row) {
        if (row.disabled) { req.user = null; }
        else if (row.token_invalid_at && req.user.iat && parseInt(req.user.iat) < parseInt(row.token_invalid_at)) {
          req.user = null; // iat 早于踢下线时间戳 → 视为未登录
        }
      } else {
        req.user = null; // 用户不存在（被物理删除？）
      }
    } catch (e) {
      // DB 查询失败时降级：保留 req.user（避免服务异常导致全员被踢）
      console.error('[Auth] token_invalid_at 查询失败，降级放行:', e.message);
    }
  }
  if (isWhitelisted(req.method, req.path)) return next();
  if (!req.user) return res.status(401).json({ error: '未登录' });
  next();
}

function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (roles.indexOf(req.user.role) < 0) return res.status(403).json({ error: '权限不足' });
    next();
  };
}

module.exports = { authMiddleware: authMiddleware, requireRole: requireRole, getSecret: getSecret, isWhitelisted: isWhitelisted, _resetSecret: function () { JWT_SECRET = null; }, _setDb: function (db) { _db = db; } };
