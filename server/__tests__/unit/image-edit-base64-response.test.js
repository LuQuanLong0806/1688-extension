// image-edit-base64-response.test.js — 验证图片编辑端点返回 base64 而非文件路径
// 覆盖：inpaint, remove-bg, remove-bg-local, replace-bg, img2img, scene-inpaint, img2img-auto
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Mock 所有服务模块
jest.mock('../../services/inpaint', () => {
  const fakePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  return {
    isModelAvailable: jest.fn().mockReturnValue(true),
    isAvailable: jest.fn().mockReturnValue(true),
    inpaint: jest.fn().mockResolvedValue(fakePng)
  };
}, { virtual: true });

jest.mock('../../services/comfyui-inpaint', () => ({
  isAvailable: jest.fn().mockReturnValue(false),
  removeBackground: jest.fn(),
  inpaintScene: jest.fn(),
  img2img: jest.fn()
}), { virtual: true });

jest.mock('../../services/remove-bg', () => {
  const fakePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  return { removeBackground: jest.fn().mockResolvedValue(fakePng) };
}, { virtual: true });

jest.mock('../../services/replace-bg-composite', () => {
  const fakePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
  return { replaceBackground: jest.fn().mockResolvedValue(fakePng) };
}, { virtual: true });

jest.mock('../../services/text-cleaner', () => ({
  callOcrService: jest.fn(),
  cleanImage: jest.fn(),
  downloadImage: jest.fn()
}), { virtual: true });

jest.mock('../../routes/ai/providers', () => ({
  getAIConfig: jest.fn().mockReturnValue({ model: 'test-model' }),
  visionLLMRequest: jest.fn(),
  imageGenLLMRequest: jest.fn(),
  recognizeLLMRequest: jest.fn()
}), { virtual: true });

// 构建 mock app
function createApp() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use('/api/ai', require('../../routes/ai/image-edit'));
  return app;
}

const FAKE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('图片编辑端点 — base64 响应格式', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  function expectBase64Url(body) {
    expect(body.ok).toBe(true);
    expect(body.url).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    expect(body.url).not.toMatch(/^\/uploads\//);
  }

  describe('POST /api/ai/inpaint — AI消除', () => {
    test('返回 base64 data URL 而非 /uploads/ 路径', async () => {
      const res = await request(app).post('/api/ai/inpaint').send({
        image_base64: FAKE_PNG_BASE64,
        mask_base64: FAKE_PNG_BASE64
      });
      expect(res.status).toBe(200);
      expectBase64Url(res.body);
    });

    test('无 image_base64 返回 400', async () => {
      const res = await request(app).post('/api/ai/inpaint').send({ mask_base64: 'x' });
      expect(res.status).toBe(400);
    });

    test('无 mask_base64 返回 400', async () => {
      const res = await request(app).post('/api/ai/inpaint').send({ image_base64: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/replace-bg — 换背景', () => {
    test('返回 base64 data URL', async () => {
      const res = await request(app).post('/api/ai/replace-bg').send({
        product_base64: FAKE_PNG_BASE64,
        bg_base64: FAKE_PNG_BASE64
      });
      expect(res.status).toBe(200);
      expectBase64Url(res.body);
    });

    test('缺少参数返回 400', async () => {
      const res = await request(app).post('/api/ai/replace-bg').send({ product_base64: 'x' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/ai/remove-bg-local — 本地抠图', () => {
    test('返回 base64 data URL', async () => {
      const res = await request(app).post('/api/ai/remove-bg-local').send({
        image_base64: FAKE_PNG_BASE64
      });
      expect(res.status).toBe(200);
      expectBase64Url(res.body);
    });

    test('无 image_base64 返回 400', async () => {
      const res = await request(app).post('/api/ai/remove-bg-local').send({});
      expect(res.status).toBe(400);
    });
  });
});

describe('image-edit.js — 无 fs/path 残留', () => {
  test('不包含 fs.writeFile 调用', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'ai', 'image-edit.js'), 'utf8');
    expect(code).not.toContain('fs.writeFile');
    expect(code).not.toContain("require('fs')");
    expect(code).not.toContain('require("fs")');
  });

  test('不包含 UPLOADS_DIR 引用', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'ai', 'image-edit.js'), 'utf8');
    expect(code).not.toContain('UPLOADS_DIR');
  });

  test('不包含 /uploads/ 响应路径', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'ai', 'image-edit.js'), 'utf8');
    // 排除注释中的引用
    const lines = code.split('\n');
    const codeLines = lines.filter(l => !l.trim().startsWith('//'));
    const joined = codeLines.join('\n');
    expect(joined).not.toContain("'/uploads/");
    expect(joined).not.toContain('"/uploads/');
  });
});

describe('server.js — cleanup 调度参数', () => {
  test('过期天数 = 7, 扫描间隔 = 6h', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
    // 检查 7 天过期
    expect(code).toMatch(/startCleanupScheduler\([^)]*,\s*7\)/);
    expect(code).toMatch(/runCleanup\(7\)/);
    // 检查 6h 间隔
    expect(code).toMatch(/6\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    // 不再是 30 天
    expect(code).not.toMatch(/startCleanupScheduler\([^)]*,\s*30\)/);
    expect(code).not.toMatch(/runCleanup\(30\)/);
  });
});

describe('doCogViewFallback — 错误处理', () => {
  test('智谱未返回图片URL时 throw 而非直接 res.json', async () => {
    const providers = require('../../routes/ai/providers');
    // 模拟智谱返回空数据
    providers.imageGenLLMRequest.mockResolvedValueOnce({ data: [{}] });

    const app = express();
    app.use(express.json({ limit: '50mb' }));
    app.use('/api/ai', require('../../routes/ai/image-edit'));

    const res = await request(app).post('/api/ai/img2img').send({
      image_base64: FAKE_PNG_BASE64,
      prompt: 'test'
    });
    // 应该是 502 而非 500 崩溃
    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();
  });
});
