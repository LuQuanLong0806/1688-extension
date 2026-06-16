// upload-limits-middleware.test.js — 上传限制中间件测试
jest.mock('../../db', () => ({
  getOne: jest.fn(),
  run: jest.fn(),
  scheduleSave: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const limits = require('../../middleware/upload-limits');
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

function buildApp() {
  var app = express();
  // 用大 limit 让大图请求能进入 preCheck（绕过 express 自身的 413）
  app.use(express.json({ limit: '20mb' }));
  app.use(function (req, res, next) { req.user = { id: 1, role: 'admin' }; next(); });
  // 仅挂 preCheck，便于隔离测试同步逻辑
  app.post('/precheck', limits.preCheck, function (req, res) { res.json({ ok: true }); });
  return app;
}

describe('upload-limits 中间件', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _installStoreMock();
    config._resetCache();
  });

  describe('preCheck', () => {
    test('缺少 image_base64 → 400', async () => {
      var res = await request(buildApp()).post('/precheck').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('请先加载图片');
    });

    test('非法格式 → 400', async () => {
      var res = await request(buildApp()).post('/precheck').send({ image_base64: '!@#$%' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('无法识别');
    });

    test('不在白名单 → 400', async () => {
      var res = await request(buildApp()).post('/precheck').send({ image_base64: 'data:image/tiff;base64,AAAA' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('不支持');
    });

    test('字节超限 → 413', async () => {
      var huge = 'data:image/png;base64,' + 'A'.repeat(15 * 1024 * 1024); // ~11M 解码后
      var res = await request(buildApp()).post('/precheck').send({ image_base64: huge });
      expect(res.status).toBe(413);
      expect(res.body.error).toContain('超过最大尺寸');
    });

    test('合法 PNG 通过', async () => {
      var res = await request(buildApp()).post('/precheck').send({ image_base64: 'data:image/png;base64,AAAA' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('合法 JPEG 通过', async () => {
      var res = await request(buildApp()).post('/precheck').send({ image_base64: 'data:image/jpeg;base64,AAAA' });
      expect(res.status).toBe(200);
    });

    test('合法 GIF 通过', async () => {
      var res = await request(buildApp()).post('/precheck').send({ image_base64: 'data:image/gif;base64,AAAA' });
      expect(res.status).toBe(200);
    });

    test('合法 webp 通过', async () => {
      var res = await request(buildApp()).post('/precheck').send({ image_base64: 'data:image/webp;base64,AAAA' });
      expect(res.status).toBe(200);
    });

    test('自定义白名单生效', async () => {
      // 把白名单改成只允许 png
      config.save({ upload_mime_whitelist: 'png' });
      var res = await request(buildApp()).post('/precheck').send({ image_base64: 'data:image/jpeg;base64,AAAA' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('不支持');
    });
  });

  describe('内部辅助函数', () => {
    test('_parseMime 识别 data URL', () => {
      expect(limits._parseMime('data:image/png;base64,x')).toBe('image/png');
      expect(limits._parseMime('data:image/jpeg;base64,x')).toBe('image/jpeg');
    });

    test('_parseMime 裸 base64 返回 png', () => {
      expect(limits._parseMime('AAAA')).toBe('image/png');
    });

    test('_parseMime 非法返回 null', () => {
      expect(limits._parseMime('!@#')).toBeNull();
      expect(limits._parseMime('')).toBeNull();
      expect(limits._parseMime(null)).toBeNull();
    });

    test('_estimateBytes 估算正确', () => {
      // base64 长度 100 → 解码后 ~75 字节
      expect(limits._estimateBytes('data:image/png;base64,' + 'A'.repeat(100))).toBe(75);
      expect(limits._estimateBytes('')).toBe(0);
    });
  });
});
