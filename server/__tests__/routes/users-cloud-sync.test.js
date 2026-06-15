// users-cloud-sync.test.js — 验证 users.js 每个写操作都触发 cloudDb.cloudRun
// 覆盖：login / plugin-login / change-password / create-user / edit-user / disable-user

// jest.mock 工厂内只能引用 mock 前缀变量
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
const { initTestDb, run, getOne, scheduleSave } = require('../helpers/setup');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const TEST_SECRET = 'test-secret-users-cloud-sync';

// 别名指向 mock 数组，便于测试代码引用
const cloudDbCalls = mockCloudDbCalls;

function signTokenFor(user) {
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
  usersModule._setDb({ getOne: getOne, run: run, getAll: function () { return []; }, scheduleSave: function () {} });

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
});

beforeEach(() => {
  try { run('DELETE FROM users'); } catch (e) {}
  auth._resetSecret();
  mockCloudDbCalls.length = 0; // 清空数组（const 不能重新赋值）
});

afterAll(() => {
  auth._setDb(null);
  usersModule._setDb(null);
});

describe('用户操作实时云同步', () => {
  test('login → 推送 last_login 到云端 (按 username 匹配)', async () => {
    insertUser({ username: 'admin' });
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(cloudDbCalls.length).toBe(1);
    expect(cloudDbCalls[0].sql).toMatch(/UPDATE users SET last_login = MAX/);
    expect(cloudDbCalls[0].sql).toMatch(/WHERE username =/);
    expect(cloudDbCalls[0].params).toContain('admin');
  });

  test('plugin-login → 推送 last_login 到云端', async () => {
    insertUser({ username: 'op1', role: 'operator' });
    const res = await request(app).post('/api/plugin-login').send({ username: 'op1', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(cloudDbCalls.length).toBe(1);
    expect(cloudDbCalls[0].sql).toMatch(/last_login = MAX/);
  });

  test('plugin-login must_change_password=1 → 403，不推送', async () => {
    insertUser({ username: 'fresh', must_change_password: 1 });
    const res = await request(app).post('/api/plugin-login').send({ username: 'fresh', password: 'admin123' });
    expect(res.status).toBe(403);
    expect(cloudDbCalls.length).toBe(0);
  });

  test('change-password → 推送 password_hash + salt 到云端', async () => {
    var u = insertUser({ username: 'admin' });
    const res = await request(app)
      .post('/api/change-password')
      .set('Authorization', 'Bearer ' + signTokenFor(u))
      .send({ oldPassword: 'admin123', newPassword: 'newpass' });
    expect(res.status).toBe(200);
    expect(cloudDbCalls.length).toBe(1);
    expect(cloudDbCalls[0].sql).toMatch(/password_hash = \?/);
    expect(cloudDbCalls[0].sql).toMatch(/password_salt = \?/);
    expect(cloudDbCalls[0].sql).toMatch(/WHERE username =/);
  });

  test('create user → 推送 INSERT OR IGNORE', async () => {
    var admin = insertUser({ username: 'admin' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', 'Bearer ' + signTokenFor(admin))
      .send({ username: 'newuser', password: 'pass123', role: 'operator' });
    expect(res.status).toBe(200);
    expect(cloudDbCalls.length).toBe(1);
    expect(cloudDbCalls[0].sql).toMatch(/INSERT OR IGNORE INTO users/);
  });

  test('edit user → 推送 UPDATE WHERE username', async () => {
    var admin = insertUser({ username: 'admin' });
    var target = insertUser({ username: 'target', role: 'operator' });
    const res = await request(app)
      .put('/api/users/' + target.id)
      .set('Authorization', 'Bearer ' + signTokenFor(admin))
      .send({ role: 'viewer' });
    expect(res.status).toBe(200);
    expect(cloudDbCalls.length).toBe(1);
    expect(cloudDbCalls[0].sql).toMatch(/UPDATE users SET/);
    expect(cloudDbCalls[0].sql).toMatch(/WHERE username =/);
    expect(cloudDbCalls[0].params[target.id ? cloudDbCalls[0].params.length - 1 : 0]).toBe('target');
  });

  test('disable user (DELETE) → 推送 disabled=1', async () => {
    var admin = insertUser({ username: 'admin' });
    var target = insertUser({ username: 'badguy', role: 'operator' });
    const res = await request(app)
      .delete('/api/users/' + target.id)
      .set('Authorization', 'Bearer ' + signTokenFor(admin));
    expect(res.status).toBe(200);
    expect(cloudDbCalls.length).toBe(1);
    expect(cloudDbCalls[0].sql).toMatch(/disabled = 1/);
    expect(cloudDbCalls[0].sql).toMatch(/WHERE username =/);
    expect(cloudDbCalls[0].params).toContain('badguy');
  });

  test('disable self → 400，不推送', async () => {
    var admin = insertUser({ username: 'admin' });
    const res = await request(app)
      .delete('/api/users/' + admin.id)
      .set('Authorization', 'Bearer ' + signTokenFor(admin));
    expect(res.status).toBe(400);
    expect(cloudDbCalls.length).toBe(0);
  });
});
