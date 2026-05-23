// ai-configs.test.js — AI配置管理路由测试
const request = require('supertest');
const setup = require('../helpers/setup');

let app, cloudDb;

beforeAll(async () => {
  await setup.initTestDb();
  const result = setup.createTestApp();
  app = result.app;
  cloudDb = result.cloudDb;
});

afterEach(() => {
  setup.run("DELETE FROM settings WHERE key LIKE 'zhipu%' OR key LIKE 'ai_%' OR key = 'imgbb_api_key'");
});

describe('AI Config 路由', () => {
  describe('GET /api/ai/check-key', () => {
    test('未配置返回 false', async () => {
      const res = await request(app).get('/api/ai/check-key');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });
  });

  describe('GET /api/ai/get-key', () => {
    test('未配置返回空', async () => {
      const res = await request(app).get('/api/ai/get-key');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });
  });

  describe('POST /api/ai/save-key', () => {
    test('保存密钥', async () => {
      const res = await request(app).post('/api/ai/save-key').send({ key: 'test-api-key-12345' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('空密钥返回400', async () => {
      const res = await request(app).post('/api/ai/save-key').send({ key: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/delete-key', () => {
    test('删除密钥', async () => {
      setup.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('zhipu_api_key', 'test')");
      const res = await request(app).post('/api/ai/delete-key').send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('GET /api/ai/configs', () => {
    test('返回配置结构', async () => {
      const res = await request(app).get('/api/ai/configs');
      expect(res.status).toBe(200);
      expect(res.body.category).toBeDefined();
      expect(res.body.vision).toBeDefined();
      expect(res.body.image).toBeDefined();
      expect(res.body._global).toBeDefined();
      expect(res.body.providers).toBeDefined();
    });
  });

  describe('POST /api/ai/configs', () => {
    test('保存配置', async () => {
      const res = await request(app).post('/api/ai/configs').send({
        category: { model: 'glm-4-flash' }
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/ai/global-key', () => {
    test('添加全局密钥', async () => {
      const res = await request(app).post('/api/ai/global-key').send({ apiKey: 'new-global-key-12345' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('空密钥返回400', async () => {
      const res = await request(app).post('/api/ai/global-key').send({ apiKey: '' });
      expect(res.status).toBe(400);
    });

    test('脱敏密钥返回400', async () => {
      const res = await request(app).post('/api/ai/global-key').send({ apiKey: 'abcd****1234' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/zhipu-keys', () => {
    test('添加 zhipu key', async () => {
      const res = await request(app).post('/api/ai/zhipu-keys').send({ action: 'add', key: 'test-key' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/ai/qwen-keys', () => {
    test('添加 qwen key', async () => {
      const res = await request(app).post('/api/ai/qwen-keys').send({ action: 'add', key: 'test-key' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/ai/hunyuan-keys', () => {
    test('添加混元账号', async () => {
      const res = await request(app).post('/api/ai/hunyuan-keys').send({
        action: 'add', secretId: 'test-id', secretKey: 'test-key'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('ImgBB Token 管理', () => {
    test('GET /api/ai/smms-token 未配置', async () => {
      const res = await request(app).get('/api/ai/smms-token');
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
    });

    test('POST /api/ai/smms-token 保存', async () => {
      const res = await request(app).post('/api/ai/smms-token').send({ token: 'imgbb-key-12345' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('POST /api/ai/smms-token 空值返回400', async () => {
      const res = await request(app).post('/api/ai/smms-token').send({ token: '' });
      expect(res.status).toBe(400);
    });

    test('POST /api/ai/smms-token-delete 删除', async () => {
      const res = await request(app).post('/api/ai/smms-token-delete').send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
