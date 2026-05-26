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
  setup.run("DELETE FROM settings WHERE key LIKE 'zhipu%' OR key LIKE 'ai_%' OR key = 'imgbb_api_key' OR key = 'imgbb_api_key_label'");
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

  // ===== 备注标签（customLabel）功能 =====
  describe('单Key备注 — vision/image customLabel', () => {
    test('GET /configs 返回 customLabel 字段', async () => {
      const res = await request(app).get('/api/ai/configs');
      expect(res.status).toBe(200);
      expect(res.body.vision.customLabel).toBeDefined();
      expect(res.body.image.customLabel).toBeDefined();
    });

    test('POST /configs 保存 vision label', async () => {
      const res = await request(app).post('/api/ai/configs').send({
        vision: { model: 'glm-4v-flash', apiKey: 'test-vision-key-abc123456', label: '测试备注' }
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const cfg = await request(app).get('/api/ai/configs');
      expect(cfg.body.vision.customLabel).toBe('测试备注');
    });

    test('POST /configs 保存 image label', async () => {
      const res = await request(app).post('/api/ai/configs').send({
        image: { model: 'cogview-3-flash', apiKey: 'test-image-key-abc123456', label: '图片备注' }
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const cfg = await request(app).get('/api/ai/configs');
      expect(cfg.body.image.customLabel).toBe('图片备注');
    });

    test('POST /configs 清空 label（删除key时）', async () => {
      await request(app).post('/api/ai/configs').send({
        vision: { model: 'glm-4v-flash', apiKey: 'test-key-abc1234567890', label: '备注' }
      });
      await request(app).post('/api/ai/configs').send({
        vision: { model: 'glm-4v-flash', apiKey: '', label: '' }
      });
      const cfg = await request(app).get('/api/ai/configs');
      expect(cfg.body.vision.customLabel).toBe('');
    });

    test('未设置 label 时 customLabel 为空字符串', async () => {
      await request(app).post('/api/ai/configs').send({
        vision: { model: 'glm-4v-flash', apiKey: 'test-key-abc1234567890' }
      });
      const cfg = await request(app).get('/api/ai/configs');
      expect(cfg.body.vision.customLabel).toBe('');
    });
  });

  describe('ImgBB 备注标签', () => {
    test('GET /smms-token 未配置时返回空 label', async () => {
      const res = await request(app).get('/api/ai/smms-token');
      expect(res.status).toBe(200);
      expect(res.body.label).toBeDefined();
      expect(res.body.label).toBe('');
    });

    test('POST /smms-token 保存带 label', async () => {
      const res = await request(app).post('/api/ai/smms-token').send({
        token: 'imgbb-test-key-12345',
        label: '我的图床'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const cfg = await request(app).get('/api/ai/smms-token');
      expect(cfg.body.configured).toBe(true);
      expect(cfg.body.label).toBe('我的图床');
    });

    test('POST /smms-token-delete 同时清除 label', async () => {
      await request(app).post('/api/ai/smms-token').send({
        token: 'imgbb-test-key-12345',
        label: '备注'
      });
      await request(app).post('/api/ai/smms-token-delete').send({});
      const cfg = await request(app).get('/api/ai/smms-token');
      expect(cfg.body.configured).toBe(false);
      expect(cfg.body.label).toBe('');
    });

    test('POST /smms-token 无 label 时为空', async () => {
      await request(app).post('/api/ai/smms-token').send({
        token: 'imgbb-test-key-12345'
      });
      const cfg = await request(app).get('/api/ai/smms-token');
      expect(cfg.body.label).toBe('');
    });

    test('POST /smms-token 仅更新 label（__label_only__）不修改 key', async () => {
      await request(app).post('/api/ai/smms-token').send({ token: 'imgbb-test-key-12345' });
      const before = await request(app).get('/api/ai/smms-token');
      expect(before.body.configured).toBe(true);

      await request(app).post('/api/ai/smms-token').send({ token: '__label_only__', label: '新备注' });
      const after = await request(app).get('/api/ai/smms-token');
      expect(after.body.configured).toBe(true);
      expect(after.body.label).toBe('新备注');
    });
  });

  describe('仅更新备注不修改 Key', () => {
    test('vision 只提交 label 不影响 apiKey', async () => {
      await request(app).post('/api/ai/configs').send({
        vision: { model: 'glm-4v-flash', apiKey: 'test-key-abc1234567890', label: '初始' }
      });
      // 只更新 label
      await request(app).post('/api/ai/configs').send({
        vision: { label: '仅改备注' }
      });
      const cfg = await request(app).get('/api/ai/configs');
      expect(cfg.body.vision.customLabel).toBe('仅改备注');
    });

    test('image 只提交 label 不影响 apiKey', async () => {
      await request(app).post('/api/ai/configs').send({
        image: { model: 'cogview-3-flash', apiKey: 'test-key-abc1234567890', label: '初始' }
      });
      await request(app).post('/api/ai/configs').send({
        image: { label: '新图片备注' }
      });
      const cfg = await request(app).get('/api/ai/configs');
      expect(cfg.body.image.customLabel).toBe('新图片备注');
    });
  });
});
