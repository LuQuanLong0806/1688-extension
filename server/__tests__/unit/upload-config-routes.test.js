// upload-config-routes.test.js — 上传配置路由测试
jest.mock('../../db', () => ({
  getOne: jest.fn(),
  run: jest.fn(),
  scheduleSave: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const router = require('../../routes/upload-config');
const config = require('../../services/upload-config');
const db = require('../../db');

let _store;
function _installStoreMock() {
  _store = {};
  db.getOne.mockImplementation(function (sql, params) {
    if (/^SELECT/i.test(sql) && params && params[0]) {
      return _store[params[0]] !== undefined ? { value: _store[params[0]] } : null;
    }
    return null;
  });
  db.run.mockImplementation(function (sql, params) {
    if (/^INSERT/i.test(sql) && params && params.length >= 2) {
      _store[params[0]] = params[1];
    }
  });
}

function buildApp(role) {
  var app = express();
  app.use(express.json());
  app.use(function (req, res, next) {
    req.user = role === null ? null : { id: 1, username: 'admin', role: role || 'admin' };
    next();
  });
  app.use('/api/upload-config', router);
  return app;
}

describe('upload-config 路由', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _installStoreMock();
    config._resetCache();
  });

  describe('GET /', () => {
    test('返回当前配置', async () => {
      var res = await request(buildApp()).get('/api/upload-config/');
      expect(res.status).toBe(200);
      expect(res.body.upload_max_bytes).toBe(10485760);
      expect(res.body.upload_format_convert).toBe('auto');
    });

    test('非 admin → 403', async () => {
      var res = await request(buildApp('operator')).get('/api/upload-config/');
      expect(res.status).toBe(403);
    });

    test('未登录 → 401', async () => {
      var res = await request(buildApp(null)).get('/api/upload-config/');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /defaults', () => {
    test('返回默认配置', async () => {
      var res = await request(buildApp()).get('/api/upload-config/defaults');
      expect(res.status).toBe(200);
      expect(res.body.upload_max_bytes).toBe(10485760);
      expect(res.body.upload_webp_quality).toBe(85);
    });
  });

  describe('POST /', () => {
    test('更新单个字段', async () => {
      var res = await request(buildApp()).post('/api/upload-config/').send({ upload_max_bytes: 2097152 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.config.upload_max_bytes).toBe(2097152);
      expect(db.run).toHaveBeenCalled();
      expect(db.scheduleSave).toHaveBeenCalled();
    });

    test('更新多个字段', async () => {
      var res = await request(buildApp()).post('/api/upload-config/').send({
        upload_max_bytes: 5242880,
        upload_format_convert: 'off',
        upload_strip_exif: 'on'
      });
      expect(res.status).toBe(200);
      expect(db.run).toHaveBeenCalledTimes(3);
    });

    test('无有效字段 → 400', async () => {
      var res = await request(buildApp()).post('/api/upload-config/').send({ invalid_key: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('没有可更新');
    });

    test('非法数字被忽略', async () => {
      var res = await request(buildApp()).post('/api/upload-config/').send({
        upload_webp_quality: 'abc',
        upload_max_bytes: 1024
      });
      expect(res.status).toBe(200);
      // 只有 upload_max_bytes 被 save
      expect(db.run).toHaveBeenCalledTimes(1);
    });

    test('非 admin → 403', async () => {
      var res = await request(buildApp('viewer')).post('/api/upload-config/').send({ upload_max_bytes: 1024 });
      expect(res.status).toBe(403);
    });
  });
});
