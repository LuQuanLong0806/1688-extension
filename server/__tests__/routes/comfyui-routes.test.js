// comfyui-routes.test.js — ComfyUI img2img + 降级 + comfyui-status 路由测试
// 用 mock Express 测试参数校验、降级分支、错误处理
const express = require('express');

function createApp(opts) {
  opts = opts || {};
  var app = express();
  app.use(express.json({ limit: '50mb' }));

  var comfyuiMock = {
    isAvailable: opts.available ? function () { return true; } : function () { return false; },
    getComfyuiBase: opts.available ? function () { return 'http://localhost:8188'; } : function () { return ''; },
    checkHealth: opts.checkHealth || function () { return Promise.resolve({ available: true, stats: {} }); },
    img2img: opts.img2img || function () { return Promise.resolve(Buffer.from('fake')); }
  };

  // Mock providers.imageGenLLMRequest 用于 CogView 降级
  var cogViewMock = opts.cogView || null;

  // comfyui-status
  app.get('/api/ai/comfyui-status', function (req, res) {
    if (!comfyuiMock.isAvailable()) return res.json({ configured: false, available: false });
    var base = comfyuiMock.getComfyuiBase();
    if (!base) return res.json({ configured: false, available: false });
    comfyuiMock.checkHealth().then(function (health) {
      res.json({ configured: true, url: base, health: health });
    });
  });

  // img2img — 复刻实际路由的降级逻辑
  app.post('/api/ai/img2img', function (req, res) {
    var imageBase64 = req.body.image_base64;
    if (!imageBase64) return res.status(400).json({ error: '请提供 image_base64' });
    var prompt = req.body.prompt || '';
    var useComfyui = comfyuiMock.isAvailable();

    if (useComfyui) {
      var buf = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      comfyuiMock.img2img(buf, {
        prompt: prompt,
        negativePrompt: req.body.negative_prompt || '',
        denoise: parseFloat(req.body.denoise) || 0.5,
        model: req.body.model || ''
      }).then(function (resultBuf) {
        res.json({ ok: true, url: '/uploads/scene_test.png', size: resultBuf.length, backend: 'comfyui' });
      }).catch(function (err) {
        // ComfyUI 失败 → 降级到 CogView
        if (cogViewMock) {
          cogViewMock(prompt, imageBase64, res);
        } else {
          if (!res.headersSent) res.status(502).json({ error: err.message });
        }
      });
    } else {
      // ComfyUI 不可用 → 直接走 CogView
      if (cogViewMock) {
        cogViewMock(prompt, imageBase64, res);
      } else {
        res.status(502).json({ error: '无可用的图生图服务' });
      }
    }
  });

  return app;
}

var request = require('supertest');

describe('GET /api/ai/comfyui-status', function () {
  test('ComfyUI 未配置 → configured:false, available:false', function () {
    var app = createApp({ available: false });
    return request(app).get('/api/ai/comfyui-status').then(function (res) {
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.available).toBe(false);
    });
  });

  test('ComfyUI 已配置 → 返回 url 和 health', function () {
    var app = createApp({ available: true });
    return request(app).get('/api/ai/comfyui-status').then(function (res) {
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(true);
      expect(res.body.url).toBe('http://localhost:8188');
      expect(res.body.health).toBeDefined();
    });
  });

  test('ComfyUI health 失败 → 返回错误信息', function () {
    var app = createApp({
      available: true,
      checkHealth: function () { return Promise.resolve({ available: false, error: 'timeout' }); }
    });
    return request(app).get('/api/ai/comfyui-status').then(function (res) {
      expect(res.status).toBe(200);
      expect(res.body.health.available).toBe(false);
      expect(res.body.health.error).toBe('timeout');
    });
  });
});

describe('POST /api/ai/img2img ComfyUI 路径', function () {
  test('无 image_base64 → 400', function () {
    var app = createApp({ available: true });
    return request(app).post('/api/ai/img2img').send({ prompt: 'test' }).then(function (res) {
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('image_base64');
    });
  });

  test('ComfyUI 可用 + 成功 → backend:comfyui', function () {
    var called = null;
    var app = createApp({
      available: true,
      img2img: function (buf, opts) {
        called = { bufLen: buf.length, opts: opts };
        return Promise.resolve(Buffer.from('result'));
      }
    });
    var b64 = Buffer.from('fake image data').toString('base64');
    return request(app).post('/api/ai/img2img').send({
      image_base64: b64,
      prompt: 'modern room',
      denoise: 0.7
    }).then(function (res) {
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.backend).toBe('comfyui');
      expect(called.opts.prompt).toBe('modern room');
      expect(called.opts.denoise).toBe(0.7);
    });
  });

  test('ComfyUI 失败 + CogView 降级成功 → backend:cogview', function () {
    var cogViewCalled = false;
    var app = createApp({
      available: true,
      img2img: function () { return Promise.reject(new Error('GPU OOM')); },
      cogView: function (prompt, imageBase64, res) {
        cogViewCalled = true;
        res.json({ ok: true, url: '/uploads/scene_cogview.png', backend: 'cogview' });
      }
    });
    var b64 = Buffer.from('fake').toString('base64');
    return request(app).post('/api/ai/img2img').send({
      image_base64: b64,
      prompt: 'a nice room'
    }).then(function (res) {
      expect(res.status).toBe(200);
      expect(res.body.backend).toBe('cogview');
      expect(cogViewCalled).toBe(true);
    });
  });

  test('denoise 缺失默认 0.5', function () {
    var called = null;
    var app = createApp({
      available: true,
      img2img: function (buf, opts) {
        called = opts;
        return Promise.resolve(Buffer.from('ok'));
      }
    });
    var b64 = Buffer.from('fake').toString('base64');
    return request(app).post('/api/ai/img2img').send({ image_base64: b64 }).then(function (res) {
      expect(res.status).toBe(200);
      expect(called.denoise).toBe(0.5);
    });
  });

  test('带 data: 前缀的 base64 正常处理', function () {
    var called = null;
    var app = createApp({
      available: true,
      img2img: function (buf, opts) {
        called = { bufLen: buf.length };
        return Promise.resolve(Buffer.from('ok'));
      }
    });
    var b64 = 'data:image/png;base64,' + Buffer.from('fake').toString('base64');
    return request(app).post('/api/ai/img2img').send({ image_base64: b64 }).then(function (res) {
      expect(res.status).toBe(200);
      expect(called.bufLen).toBe(4);
    });
  });
});

describe('POST /api/ai/img2img CogView 降级路径', function () {
  test('ComfyUI 不可用 + CogView 成功 → backend:cogview', function () {
    var cogViewPrompt = null;
    var app = createApp({
      available: false,
      cogView: function (prompt, imageBase64, res) {
        cogViewPrompt = prompt;
        res.json({ ok: true, url: '/uploads/scene_cogview.png', backend: 'cogview' });
      }
    });
    var b64 = Buffer.from('fake').toString('base64');
    return request(app).post('/api/ai/img2img').send({
      image_base64: b64,
      prompt: 'modern kitchen'
    }).then(function (res) {
      expect(res.status).toBe(200);
      expect(res.body.backend).toBe('cogview');
      expect(cogViewPrompt).toBe('modern kitchen');
    });
  });

  test('ComfyUI 不可用 + 无 CogView → 502', function () {
    var app = createApp({ available: false });
    var b64 = Buffer.from('fake').toString('base64');
    return request(app).post('/api/ai/img2img').send({ image_base64: b64 }).then(function (res) {
      expect(res.status).toBe(502);
    });
  });

  test('ComfyUI 失败 + 无 CogView → 502 原始错误', function () {
    var app = createApp({
      available: true,
      img2img: function () { return Promise.reject(new Error('ComfyUI 连接超时')); }
    });
    var b64 = Buffer.from('fake').toString('base64');
    return request(app).post('/api/ai/img2img').send({ image_base64: b64 }).then(function (res) {
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('超时');
    });
  });
});
