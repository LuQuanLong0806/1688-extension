// image-routes.test.js — 图片生成/编辑路由参数校验测试
const request = require('supertest');
const setup = require('../helpers/setup');

let app, cloudDb;

beforeAll(async () => {
  await setup.initTestDb();
  const result = setup.createTestApp();
  app = result.app;
  cloudDb = result.cloudDb;
});

describe('Image Gen 路由 — 参数校验', () => {
  describe('POST /api/ai/text-to-image', () => {
    test('无 prompt 返回400', async () => {
      const res = await request(app).post('/api/ai/text-to-image').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('图片描述');
    });

    test('空 prompt 返回400', async () => {
      const res = await request(app).post('/api/ai/text-to-image').send({ prompt: '   ' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/image-to-image', () => {
    test('无 prompt 返回400', async () => {
      const res = await request(app).post('/api/ai/image-to-image').send({ image_base64: 'test' });
      expect(res.status).toBe(400);
    });

    test('无 image_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/image-to-image').send({ prompt: '测试' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('参考图');
    });
  });

  describe('POST /api/ai/white-bg', () => {
    test('无 image_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/white-bg').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/enhance', () => {
    test('无 image_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/enhance').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/smms-upload', () => {
    test('无 image_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/smms-upload').send({});
      expect(res.status).toBe(400);
    });
  });
});

describe('Image Edit 路由 — 参数校验', () => {
  describe('POST /api/ai/inpaint', () => {
    test('无 image_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/inpaint').send({ mask_base64: 'test' });
      expect(res.status).toBe(400);
    });

    test('无 mask_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/inpaint').send({ image_base64: 'test' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/smart-detect', () => {
    test('无 image_base64 返回400', async () => {
      const res = await request(app).post('/api/ai/smart-detect').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/ai/model-status', () => {
    test('返回模型状态', async () => {
      const res = await request(app).get('/api/ai/model-status');
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(false);
    });
  });

  describe('POST /api/ai/detect-text', () => {
    test('无参数返回400', async () => {
      const res = await request(app).post('/api/ai/detect-text').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/auto-clean-chinese', () => {
    test('无参数返回400', async () => {
      const res = await request(app).post('/api/ai/auto-clean-chinese').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/ai/ocr-status', () => {
    test('返回OCR状态', async () => {
      const res = await request(app).get('/api/ai/ocr-status');
      expect(res.status).toBe(200);
      expect(res.body.ocr).toBeDefined();
      expect(res.body.lama).toBeDefined();
    });
  });
});
