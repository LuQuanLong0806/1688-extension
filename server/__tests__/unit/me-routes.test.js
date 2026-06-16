// me-routes.test.js — /api/me + /api/me/profile + /api/me/avatar 接口测试
jest.mock('../../crypto', () => ({
  encrypt: (v) => 'ENC:' + v,
  decrypt: (v) => v.replace('ENC:', '')
}));
jest.mock('../../services/oss-upload', () => ({
  uploadToOSS: jest.fn(),
  getOssConfig: jest.fn(),
  isConfigured: jest.fn()
}));
jest.mock('../../db', () => ({
  getOne: jest.fn(),
  run: jest.fn(),
  scheduleSave: jest.fn()
}));
jest.mock('../../cloud/index', () => ({
  connected: false,
  cloudRun: jest.fn().mockResolvedValue({})
}));

const express = require('express');
const request = require('supertest');
const router = require('../../routes/users');
const db = require('../../db');
const ossUpload = require('../../services/oss-upload');

let _store;
function installDbMock() {
  _store = {
    users: {
      1: { id: 1, username: 'alice', display_name: 'Alice', role: 'operator', last_login: '2026-06-15 10:00:00', must_change_password: 0, avatar_url: '', email: '', created_at: '2026-01-01 00:00:00', password_hash: 'hash', password_salt: 'salt' }
    }
  };
  db.getOne.mockImplementation(function (sql, params) {
    if (/FROM users WHERE id = \?/i.test(sql) && params && params[0]) {
      var u = _store.users[params[0]];
      // 返回 SELECT 字段子集（按 sql 选取的字段过滤）
      if (!u) return null;
      // 简化：直接返回完整对象（sql 字段在测试上下文里够用）
      return Object.assign({}, u);
    }
    if (/FROM users WHERE username = \?/i.test(sql)) {
      for (var k in _store.users) {
        if (_store.users[k].username === (params && params[0])) return Object.assign({}, _store.users[k]);
      }
      return null;
    }
    return null;
  });
  db.run.mockImplementation(function (sql, params) {
    if (/UPDATE users SET (.+) WHERE id = \?/i.test(sql) && params) {
      var id = params[params.length - 1];
      if (!_store.users[id]) return;
      // 解析 SET 子句里的字段名（轻量解析）
      var setClause = RegExp.$1;
      var fields = setClause.split(',').map(function (s) { return s.trim().split(/\s+=/)[0]; });
      for (var i = 0; i < fields.length; i++) {
        if (params[i] !== undefined && _store.users[id].hasOwnProperty(fields[i])) {
          _store.users[id][fields[i]] = params[i];
        } else if (params[i] !== undefined) {
          _store.users[id][fields[i]] = params[i];
        }
      }
    }
  });
}

function createApp(user) {
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use(function (req, res, next) {
    if (user !== null) req.user = user || { id: 1, username: 'alice', role: 'operator' };
    next();
  });
  app.use('/api', router);
  return app;
}

describe('/api/me 接口', () => {
  beforeEach(() => { jest.clearAllMocks(); installDbMock(); });

  describe('GET /api/me', () => {
    test('返回完整字段（含 avatar_url/email/created_at）', async () => {
      const res = await request(createApp()).get('/api/me');
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('alice');
      expect(res.body.display_name).toBe('Alice');
      expect(res.body.role).toBe('operator');
      expect(res.body.email).toBe('');
      expect(res.body.avatar_url).toBe('');
      expect(res.body.created_at).toBe('2026-01-01 00:00:00');
    });

    test('未登录返回 401', async () => {
      const res = await request(createApp(null)).get('/api/me');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/me/profile', () => {
    test('改 display_name + email 成功', async () => {
      const res = await request(createApp())
        .put('/api/me/profile')
        .send({ display_name: 'Alice New', email: 'alice@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.display_name).toBe('Alice New');
      expect(res.body.email).toBe('alice@example.com');
      expect(db.run).toHaveBeenCalled();
      expect(db.scheduleSave).toHaveBeenCalled();
    });

    test('display_name 超过 32 字符返回 400', async () => {
      const res = await request(createApp())
        .put('/api/me/profile')
        .send({ display_name: 'a'.repeat(33), email: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('显示名');
    });

    test('邮箱格式错误返回 400', async () => {
      const res = await request(createApp())
        .put('/api/me/profile')
        .send({ display_name: 'Alice', email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('邮箱');
    });

    test('空字符串邮箱允许（清空邮箱）', async () => {
      const res = await request(createApp())
        .put('/api/me/profile')
        .send({ display_name: 'Alice', email: '' });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('');
    });

    test('未登录返回 401', async () => {
      const res = await request(createApp(null))
        .put('/api/me/profile')
        .send({ display_name: 'X', email: '' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/me/avatar', () => {
    test('OSS 未配置 → 走本地存储', async () => {
      ossUpload.isConfigured.mockReturnValue(false);
      // 构造一个 1x1 PNG（裸 base64）
      var png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await request(createApp())
        .post('/api/me/avatar')
        .send({ image_base64: 'data:image/png;base64,' + png });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.avatar_url).toMatch(/^\/avatars\/avatar_1_\d+\.png$/);
      expect(db.run).toHaveBeenCalled();
    });

    test('未登录返回 401', async () => {
      ossUpload.isConfigured.mockReturnValue(false);
      const res = await request(createApp(null))
        .post('/api/me/avatar')
        .send({ image_base64: 'data:image/png;base64,abc' });
      expect(res.status).toBe(401);
    });

    test('缺少 image_base64 返回 400', async () => {
      ossUpload.isConfigured.mockReturnValue(false);
      const res = await request(createApp())
        .post('/api/me/avatar')
        .send({});
      expect(res.status).toBe(400);
    });

    test('非白名单 MIME 返回 400', async () => {
      ossUpload.isConfigured.mockReturnValue(false);
      const res = await request(createApp())
        .post('/api/me/avatar')
        .send({ image_base64: 'data:image/tiff;base64,AAAA' });
      expect(res.status).toBe(400);
    });
  });
});
