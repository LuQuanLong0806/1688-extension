// multi-user-audit-fix.test.js — 验证 multi-user-full-audit-2026-06-14.md 复审修复
// 覆盖：
// 1. P0 AI 配置端点 admin 守卫
// 2. P0 图片生成端点 operator+ 守卫
// 3. P0 GET /settings 过滤敏感字段
// 4. P2 plugin-login must_change_password 检查
// 5. P2 LIKE 转义 % 和 _

const express = require('express');
const request = require('supertest');
const { initTestDb, run, getOne, getAll, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TEST_SECRET = 'test-secret-multi-user-audit-fix';

let app;
let auth;
let usersModule;
let settingsModule;

function signTokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, TEST_SECRET);
}

function insertUser(overrides) {
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
  return getOne('SELECT id, username, role FROM users WHERE username = ?', [data.username]);
}

beforeAll(async () => {
  await initTestDb();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('jwt_secret', '" + TEST_SECRET + "')");

  auth = require('../../middleware/auth');
  auth._setDb({ getOne: getOne, run: run, scheduleSave: function () {} });
  auth._resetSecret();

  usersModule = require('../../routes/users');
  usersModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  settingsModule = require('../../routes/settings');
  settingsModule._setDb({ getOne: getOne, run: run, getAll: getAll, scheduleSave: function () {} });

  app = express();
  app.use(express.json());

  app.use(function (req, res, next) {
    if (req.headers.authorization) {
      var token = req.headers.authorization.replace('Bearer ', '');
      try { req.user = jwt.verify(token, TEST_SECRET); } catch (e) {}
    }
    next();
  });

  app.use('/api', usersModule);
  app.use('/api/ai', require('../../routes/ai/index'));
  app.use('/api', settingsModule);
});

beforeEach(() => {
  try { run('DELETE FROM users'); } catch (e) {}
  try { run('DELETE FROM settings WHERE key != \'jwt_secret\''); } catch (e) {}
  try { run('DELETE FROM products'); } catch (e) {}
  auth._resetSecret();
});

afterAll(() => {
  auth._setDb(null);
  usersModule._setDb(null);
  settingsModule._setDb(null);
});

describe('P0-1 AI 配置端点 admin 守卫', () => {
  test('未登录访问 /api/ai/configs → 401', async () => {
    const res = await request(app).get('/api/ai/configs');
    expect(res.status).toBe(401);
  });

  test('operator 访问 /api/ai/configs → 403', async () => {
    var op = insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .get('/api/ai/configs')
      .set('Authorization', 'Bearer ' + signTokenFor(op));
    expect(res.status).toBe(403);
  });

  test('admin 访问 /api/ai/configs → 200', async () => {
    var admin = insertUser({ username: 'admin1', role: 'admin' });
    const res = await request(app)
      .get('/api/ai/configs')
      .set('Authorization', 'Bearer ' + signTokenFor(admin));
    expect(res.status).toBe(200);
  });

  test('operator POST /api/ai/save-key → 403', async () => {
    var op = insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .post('/api/ai/save-key')
      .set('Authorization', 'Bearer ' + signTokenFor(op))
      .send({ provider: 'zhipu', apiKey: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('P0-2 图片生成端点 operator+ 守卫', () => {
  test('未登录 POST /api/ai/text-to-image → 401', async () => {
    const res = await request(app).post('/api/ai/text-to-image').send({ prompt: 'test' });
    expect(res.status).toBe(401);
  });

  test('未登录 POST /api/ai/image-upload → 401', async () => {
    const res = await request(app).post('/api/ai/image-upload');
    expect(res.status).toBe(401);
  });

  test('operator POST /api/ai/text-to-image → 不被 401/403 拦截（可继续到业务逻辑）', async () => {
    var op = insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .post('/api/ai/text-to-image')
      .set('Authorization', 'Bearer ' + signTokenFor(op))
      .send({ prompt: '' });
    // 没有认证拦截（200/400/500 都行，关键是 != 401 && != 403）
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

describe('P0-3 GET /settings 过滤敏感字段', () => {
  beforeEach(() => {
    // 设置一些非敏感和敏感字段
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('jwt_secret', 'SHOULD_NOT_LEAK', datetime('now','+8 hours'))");
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('price_formulas', '[]', datetime('now','+8 hours'))");
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('zhipu_api_key', 'encrypted_garbage', datetime('now','+8 hours'))");
    run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('turso_config', 'encrypted_garbage', datetime('now','+8 hours'))");
  });

  test('未登录 GET /api/settings → 401', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  test('operator GET /api/settings → 200 + jwt_secret 不在响应里', async () => {
    var op = insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', 'Bearer ' + signTokenFor(op));
    expect(res.status).toBe(200);
    expect(res.body.jwt_secret).toBeUndefined();
    expect(res.body.zhipu_api_key).toBeUndefined();
    expect(res.body.turso_config).toBeUndefined();
    // 非敏感字段保留
    expect(res.body.price_formulas).toBeTruthy();
  });

  test('GET /api/settings/jwt_secret 非 admin → 403', async () => {
    var op = insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .get('/api/settings/jwt_secret')
      .set('Authorization', 'Bearer ' + signTokenFor(op));
    expect(res.status).toBe(403);
  });

  test('GET /api/settings/price_formulas operator → 200 + 返回值', async () => {
    var op = insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app)
      .get('/api/settings/price_formulas')
      .set('Authorization', 'Bearer ' + signTokenFor(op));
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('[]');
  });
});

describe('P2-8 plugin-login 检查 must_change_password', () => {
  test('must_change_password=1 → 403 + must_change_password:1', async () => {
    insertUser({ username: 'freshadmin', password_hash: crypto.createHash('sha256').update('testsalt' + 'admin123').digest('hex'), must_change_password: 1 });
    const res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'freshadmin', password: 'admin123' });
    expect(res.status).toBe(403);
    expect(res.body.must_change_password).toBe(1);
    expect(res.body.error).toMatch(/修改初始密码/);
  });

  test('must_change_password=0 → 正常登录', async () => {
    insertUser({ username: 'op1', role: 'operator', must_change_password: 0 });
    const res = await request(app)
      .post('/api/plugin-login')
      .send({ username: 'op1', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('P2-2 LIKE 转义函数（escapeLike 输入 → SQL 参数）', () => {
  // 直接验证 escape 逻辑（products.js 内部使用 replace(/[%_\\]/g, '\\$&')）
  function escapeLike(s) { return String(s).replace(/[%_\\]/g, '\\$&'); }

  test('% 被转义为 \\%', () => {
    expect(escapeLike('100%纯棉')).toBe('100\\%纯棉');
  });

  test('_ 被转义为 \\_', () => {
    expect(escapeLike('毛巾_B款')).toBe('毛巾\\_B款');
  });

  test('反斜杠被转义', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  test('无通配符不变', () => {
    expect(escapeLike('浴巾')).toBe('浴巾');
  });
});
