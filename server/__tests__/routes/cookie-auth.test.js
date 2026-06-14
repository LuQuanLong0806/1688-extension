// cookie-auth.test.js — 验证扩展自动登录场景下的 cookie 行为
// 覆盖 login/plugin-login/change-password/logout 的 Set-Cookie
// 防止 regression: 任何路由 handler 误删 res.cookie 调用都会让扩展登录失效

const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');
const { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let app;
let auth;
let usersModule;
const TEST_SECRET = 'test-secret-for-cookie-tests';

function insertTestUser(overrides) {
  var defaults = {
    username: 'admin',
    password_hash: crypto.createHash('sha256').update('testsalt' + 'admin123').digest('hex'),
    password_salt: 'testsalt',
    display_name: '管理员',
    role: 'admin',
    must_change_password: 0,
    disabled: 0
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.username, data.password_hash, data.password_salt, data.display_name, data.role, data.must_change_password, data.disabled]);
  return data;
}

// 从 Set-Cookie 头里提取 auth_token cookie 的属性
function parseAuthTokenCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  var cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (var i = 0; i < cookies.length; i++) {
    if (cookies[i].indexOf('auth_token=') === 0) {
      var parts = cookies[i].split(';');
      var kv = parts[0].split('=');
      var attrs = { value: kv[1], httpOnly: false, maxAge: null, sameSite: null };
      for (var j = 1; j < parts.length; j++) {
        var p = parts[j].trim().toLowerCase();
        if (p === 'httponly') attrs.httpOnly = true;
        if (p.indexOf('max-age=') === 0) attrs.maxAge = parseInt(p.substring(8), 10);
        if (p.indexOf('samesite=') === 0) attrs.sameSite = p.substring(9);
      }
      return attrs;
    }
  }
  return null;
}

beforeAll(async () => {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();

  usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use(function (req, res, next) {
    if (req.headers.authorization) {
      var token = req.headers.authorization.replace('Bearer ', '');
      try {
        var decoded = jwt.verify(token, TEST_SECRET);
        req.user = decoded;
      } catch (e) {}
    }
    next();
  });

  app.use('/api', usersModule);
});

beforeEach(() => {
  try { run('DELETE FROM users'); } catch (e) {}
  auth._resetSecret();
});

afterAll(() => {
  auth._setDb(null);
  usersModule._setDb(null);
});

describe('POST /api/login 写入 auth_token cookie', () => {
  test('登录成功 → Set-Cookie 包含 auth_token', async () => {
    insertTestUser({ username: 'admin' });
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    var cookie = parseAuthTokenCookie(res.headers['set-cookie']);
    expect(cookie).not.toBeNull();
    expect(cookie.value).toBeTruthy();
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    // maxAge 是 7 天的秒数
    expect(cookie.maxAge).toBe(7 * 24 * 60 * 60);
  });

  test('登录失败 → 不写 auth_token cookie', async () => {
    insertTestUser({ username: 'admin' });
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    var cookie = parseAuthTokenCookie(res.headers['set-cookie']);
    expect(cookie).toBeNull();
  });
});

describe('POST /api/plugin-login 写入 auth_token cookie（扩展登录场景）', () => {
  test('plugin-login 成功 → 写入 cookie', async () => {
    insertTestUser({ username: 'op1' });
    const res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'op1', password: 'admin123' });
    expect(res.status).toBe(200);
    var cookie = parseAuthTokenCookie(res.headers['set-cookie']);
    expect(cookie).not.toBeNull();
    expect(cookie.value).toBeTruthy();
    expect(cookie.httpOnly).toBe(true);
  });
});

describe('POST /api/change-password 刷新 auth_token cookie', () => {
  test('改密成功 → 写入新 token 的 cookie（旧 token 失效）', async () => {
    insertTestUser({ username: 'admin' });
    // 先 login 拿真实 token（包含正确的 user id）
    var loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    var token = loginRes.body.token;

    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'admin123', newPassword: 'newpass456' });
    expect(res.status).toBe(200);
    var cookie = parseAuthTokenCookie(res.headers['set-cookie']);
    expect(cookie).not.toBeNull();
    expect(cookie.value).toBeTruthy();
    // 新 cookie 应能解出 user 信息（JWT 有效）
    var decoded = jwt.verify(cookie.value, TEST_SECRET);
    expect(decoded.username).toBe('admin');
  });

  test('改密失败（旧密码错） → 不写新 cookie', async () => {
    insertTestUser({ username: 'admin' });
    var loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    var token = loginRes.body.token;

    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + token)
      .send({ oldPassword: 'wrongold', newPassword: 'newpass456' });
    expect(res.status).toBe(401);
    var cookie = parseAuthTokenCookie(res.headers['set-cookie']);
    expect(cookie).toBeNull();
  });
});

describe('POST /api/logout 清除 auth_token cookie', () => {
  test('logout → Set-Cookie auth_token 为空 + Max-Age=0', async () => {
    const res = await request(app).post('/api/logout');
    expect(res.status).toBe(200);
    var setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    var cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    var cleared = cookies.find(function (c) { return c.indexOf('auth_token=;') === 0 || c.indexOf('auth_token= ;') === 0; });
    expect(cleared).toBeTruthy();
    // 应该带 Max-Age=0 或 Expires=过期
    expect(/max-age=0/i.test(cleared) || /expires=Thu, 01 Jan 1970/i.test(cleared) || /expires=expired/i.test(cleared)).toBe(true);
  });
});

describe('cookie 与 JWT token 一致性', () => {
  test('login 返回的 token 与 cookie 里 auth_token 是同一个值', async () => {
    insertTestUser({ username: 'admin' });
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    var cookie = parseAuthTokenCookie(res.headers['set-cookie']);
    expect(cookie.value).toBe(res.body.token);
  });
});
