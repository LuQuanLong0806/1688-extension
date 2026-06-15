// token-invalidation.test.js — 验证 token_invalid_at 字段的踢下线效果
// 场景：登出/改密/禁用 → 旧 token 立即失效；新登录签发的 token 有效

const mockCloudDbCalls = [];
jest.mock('../../cloud/index', () => ({
  connected: true,
  cloudRun: jest.fn(function (sql, params) {
    mockCloudDbCalls.push({ sql: sql, params: params });
    return Promise.resolve();
  })
}));

const express = require('express');
const request = require('supertest');
const { initTestDb, run, getOne } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TEST_SECRET = 'test-token-invalidation';

let app;
let auth;
let usersModule;

// 手动构造 JWT，以便自定义 iat（jsonwebtoken 在 noTimestamp:true 时会丢掉 payload.iat）
function manualSignToken(payload, secret) {
  function b64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  var header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  var body = b64url(Buffer.from(JSON.stringify(payload)));
  var data = header + '.' + body;
  var sig = b64url(crypto.createHmac('sha256', secret).update(data).digest());
  return data + '.' + sig;
}

function signTokenFor(user, iatOffset) {
  // iatOffset 用于模拟旧 token（iat 偏早），手工构造 JWT 保留 iat 字段
  if (iatOffset) {
    var oldIat = Math.floor(Date.now() / 1000) - iatOffset;
    return manualSignToken({ id: user.id, username: user.username, role: user.role, iat: oldIat }, TEST_SECRET);
  }
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, TEST_SECRET);
}

function hashFor(password, salt) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

function insertUser(overrides) {
  var defaults = {
    username: 'admin',
    password_hash: hashFor('admin123', 'testsalt'),
    password_salt: 'testsalt',
    display_name: '管理员',
    role: 'admin',
    must_change_password: 0,
    disabled: 0,
    token_invalid_at: ''
  };
  var data = Object.assign(defaults, overrides);
  run("INSERT INTO users (username, password_hash, password_salt, display_name, role, must_change_password, disabled, token_invalid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','+8 hours'), datetime('now','+8 hours'))",
    [data.username, data.password_hash, data.password_salt, data.display_name, data.role, data.must_change_password, data.disabled, data.token_invalid_at]);
  return getOne('SELECT id, username, role FROM users WHERE username = ?', [data.username]);
}

beforeAll(async () => {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();

  usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: function () { return []; }, scheduleSave: function () {} });

  app = express();
  app.use(express.json());
  app.use(function (req, res, next) {
    // 模拟 authMiddleware 的 token_invalid_at 检查（authMiddleware 已加，但测试这里直接用）
    if (req.headers.authorization) {
      var token = req.headers.authorization.replace('Bearer ', '');
      try {
        var decoded = jwt.verify(token, TEST_SECRET);
        req.user = { id: decoded.id, username: decoded.username, role: decoded.role, iat: decoded.iat };
      } catch (e) {}
    }
    // 复用 auth.authMiddleware 的逻辑（已含 token_invalid_at 检查）
    next();
  });
  app.use(auth.authMiddleware);
  app.use('/api', usersModule);
});

beforeEach(() => {
  try { run('DELETE FROM users'); } catch (e) {}
  auth._resetSecret();
  mockCloudDbCalls.length = 0;
});

afterAll(() => {
  auth._setDb(null);
  usersModule._setDb(null);
});

describe('A 方案：token_invalid_at 踢下线', () => {
  test('登出 → token_invalid_at 写入；旧 token 立即 401', async () => {
    var u = insertUser({ username: 'admin' });
    // 用旧 token（iat 早 100 秒）模拟登出前的 token
    var oldToken = signTokenFor(u, 100);
    // 登出
    var logoutRes = await request(app)
      .post('/api/logout')
      .set('Authorization', 'Bearer ' + oldToken);
    expect(logoutRes.status).toBe(200);
    // token_invalid_at 应该被写入云端
    expect(mockCloudDbCalls.some(c => /token_invalid_at = MAX/.test(c.sql))).toBe(true);

    // 登出后用同样的旧 token 调 /api/me 应该 401
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + oldToken);
    expect(meRes.status).toBe(401);
  });

  test('改密 → token_invalid_at 写入；旧 token 401', async () => {
    var u = insertUser({ username: 'admin' });
    var oldToken = signTokenFor(u, 100);
    var cp = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + oldToken)
      .send({ oldPassword: 'admin123', newPassword: 'newpass' });
    expect(cp.status).toBe(200);
    // 返回的 token_invalid_at 应该推送云端
    expect(mockCloudDbCalls.some(c => /token_invalid_at = MAX/.test(c.sql))).toBe(true);
    // 用旧 token 调 /api/me 应 401
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + oldToken);
    expect(meRes.status).toBe(401);
  });

  test('改密后返回的新 token 立即可用（iat 是当前时间，不早于 invalid_at）', async () => {
    var u = insertUser({ username: 'admin' });
    var cp = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + signTokenFor(u))
      .send({ oldPassword: 'admin123', newPassword: 'newpass' });
    expect(cp.status).toBe(200);
    expect(cp.body.token).toBeTruthy();
    // 用返回的新 token 调 /api/me 应 200
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + cp.body.token);
    expect(meRes.status).toBe(200);
  });

  test('disabled=1 → token 立即失效', async () => {
    var admin = insertUser({ username: 'admin' });
    var target = insertUser({ username: 'victim', role: 'operator' });
    // 用 admin 禁用 victim
    var del = await request(app)
      .delete('/api/users/' + target.id)
      .set('Authorization', 'Bearer ' + signTokenFor(admin));
    expect(del.status).toBe(200);
    // victim 的旧 token 应失效
    var victimToken = signTokenFor(target);
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + victimToken);
    expect(meRes.status).toBe(401);
  });

  test('admin 编辑用户改密码 → 用户被踢下线', async () => {
    var admin = insertUser({ username: 'admin' });
    var target = insertUser({ username: 'op1', role: 'operator' });
    var targetOldToken = signTokenFor(target, 100);
    // admin 改 op1 的密码
    var edit = await request(app)
      .put('/api/users/' + target.id)
      .set('Authorization', 'Bearer ' + signTokenFor(admin))
      .send({ password: 'newpassword' });
    expect(edit.status).toBe(200);
    // op1 旧 token 失效
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + targetOldToken);
    expect(meRes.status).toBe(401);
  });

  test('admin 编辑用户不改密码 → 用户不被踢下线', async () => {
    var admin = insertUser({ username: 'admin' });
    var target = insertUser({ username: 'op1', role: 'operator' });
    var targetOldToken = signTokenFor(target, 100);
    var edit = await request(app)
      .put('/api/users/' + target.id)
      .set('Authorization', 'Bearer ' + signTokenFor(admin))
      .send({ display_name: '新名字' });
    expect(edit.status).toBe(200);
    // op1 token 仍有效
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + targetOldToken);
    expect(meRes.status).toBe(200);
  });

  test('未踢下线的用户 → token_invalid_at 为空，token 正常工作', async () => {
    var u = insertUser({ username: 'admin' });
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + signTokenFor(u));
    expect(meRes.status).toBe(200);
  });

  test('登录 → 清空 token_invalid_at（新 token 不被旧踢下线时间戳拦）', async () => {
    // 用户有旧的踢下线时间戳（模拟之前登出过）
    var u = insertUser({ username: 'admin', token_invalid_at: String(Math.floor(Date.now() / 1000) - 50) });
    // 登录（应清空 token_invalid_at）
    var loginRes = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(loginRes.status).toBe(200);
    var newToken = loginRes.body.token;
    expect(newToken).toBeTruthy();
    // 用新 token 调 /api/me 应 200（虽然 iat 比 invalid_at 晚，因为 login 清了）
    var meRes = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ' + newToken);
    expect(meRes.status).toBe(200);
  });
});
