// image-upload-routes.test.js — image-upload / smms-upload / oss-config 路由测试
jest.mock('../../crypto', () => ({
  encrypt: (v) => 'ENC:' + v,
  decrypt: (v) => v.replace('ENC:', '')
}));
jest.mock('../../services/imgbb-upload', () => ({
  uploadToImgBB: jest.fn(),
  getImgbbKey: jest.fn()
}));
jest.mock('../../services/oss-upload', () => ({
  uploadToOSS: jest.fn(),
  getOssConfig: jest.fn(),
  isConfigured: jest.fn()
}));
jest.mock('../../db', () => ({
  getOne: jest.fn().mockReturnValue(null),
  run: jest.fn(),
  scheduleSave: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const router = require('../../routes/ai/image-gen');
const imgbbUpload = require('../../services/imgbb-upload');
const ossUpload = require('../../services/oss-upload');
const db = require('../../db');
const sec = require('../../crypto');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', router);
  return app;
}

describe('图片上传路由', () => {
  let app;
  beforeEach(() => { jest.clearAllMocks(); app = createApp(); });

  describe('POST /api/ai/image-upload', () => {
    test('缺少 image_base64 返回 400', async () => {
      const res = await request(app).post('/api/ai/image-upload').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('请先加载图片');
    });

    test('上传成功返回 url', async () => {
      imgbbUpload.uploadToImgBB.mockResolvedValue({ ok: true, url: 'https://oss.test/a.png' });
      const res = await request(app).post('/api/ai/image-upload').send({ image_base64: 'data:image/png;base64,abc' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.url).toBe('https://oss.test/a.png');
    });

    test('上传失败返回 502', async () => {
      imgbbUpload.uploadToImgBB.mockRejectedValue(new Error('网络超时'));
      const res = await request(app).post('/api/ai/image-upload').send({ image_base64: 'abc' });
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('网络超时');
    });
  });

  describe('POST /api/ai/smms-upload (兼容)', () => {
    test('同样走上传逻辑', async () => {
      imgbbUpload.uploadToImgBB.mockResolvedValue({ ok: true, url: 'https://oss.test/b.png' });
      const res = await request(app).post('/api/ai/smms-upload').send({ image_base64: 'abc' });
      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://oss.test/b.png');
    });
  });

  describe('GET /api/ai/oss-config', () => {
    test('未配置返回 configured: false', async () => {
      ossUpload.getOssConfig.mockReturnValue(null);
      const res = await request(app).get('/api/ai/oss-config');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });

    test('已配置返回 masked 信息', async () => {
      ossUpload.getOssConfig.mockReturnValue({
        accessKeyId: 'LTAI5t12345678', accessKeySecret: 'secret',
        bucket: 'test-bucket', region: 'oss-cn-hangzhou', endpoint: '', label: '测试'
      });
      const res = await request(app).get('/api/ai/oss-config');
      expect(res.body.configured).toBe(true);
      expect(res.body.bucket).toBe('test-bucket');
      expect(res.body.masked).toContain('****');
    });
  });

  describe('POST /api/ai/oss-config', () => {
    test('缺少必填字段返回 400', async () => {
      const res = await request(app).post('/api/ai/oss-config').send({ accessKeyId: 'LTAI' });
      expect(res.status).toBe(400);
    });

    test('完整配置保存成功', async () => {
      const res = await request(app).post('/api/ai/oss-config').send({
        accessKeyId: 'LTAI5t', accessKeySecret: 'secret',
        bucket: 'my-bucket', region: 'oss-cn-hangzhou', label: '正式'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(db.run).toHaveBeenCalled();
      expect(db.scheduleSave).toHaveBeenCalled();
    });

    test('labelOnly 只更新备注', async () => {
      const res = await request(app).post('/api/ai/oss-config').send({ labelOnly: true, label: '备注' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/ai/oss-config-delete', () => {
    test('删除成功', async () => {
      const res = await request(app).post('/api/ai/oss-config-delete').send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
