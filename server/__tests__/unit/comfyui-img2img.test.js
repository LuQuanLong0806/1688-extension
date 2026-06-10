// comfyui-img2img.test.js — ComfyUI 认证修复 + BRIA 节点 + img2img workflow 测试
// 不直接 require comfyui-inpaint（依赖 sharp 原生模块），测试提取的核心逻辑

var fs = require('fs');
var path = require('path');

var sourcePath = path.join(__dirname, '..', '..', 'services', 'comfyui-inpaint.js');
var source = fs.readFileSync(sourcePath, 'utf-8');

// 括号计数法提取函数体
function extractFunction(src, fnName) {
  var startIdx = src.indexOf('function ' + fnName);
  if (startIdx === -1) return null;
  var braceStart = src.indexOf('{', startIdx);
  var depth = 0;
  for (var i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    if (depth === 0) return src.substring(startIdx, i + 1);
  }
  return null;
}

var buildImg2ImgFnCode = extractFunction(source, 'buildImg2ImgWorkflow');
// eval 到全局作用域供后续测试用
// eslint-disable-next-line no-eval
if (buildImg2ImgFnCode) eval(buildImg2ImgFnCode);

// ========== 1. 静态值验证 ==========
describe('ComfyUI 认证安全', function () {
  test('源码中不含硬编码的凭据', function () {
    expect(source).not.toMatch(/YWRtaW4[A-Za-z0-9+/=]+/);
    expect(source).not.toContain('comfyui2024');
    expect(source).not.toContain('comfyiu2024');
    expect(source).not.toContain('comfyui2026');
    expect(source).not.toContain('admin:');
  });

  test('使用 Bearer Token 鉴权（非 Basic Auth）', function () {
    // 3 处 Bearer token 使用
    var matches = source.split("'Bearer ' + token").length - 1;
    expect(matches).toBeGreaterThanOrEqual(3);
  });

  test('不含 Basic Auth 残留', function () {
    expect(source).not.toContain('Basic ');
  });

  test('密码用 SHA-256 哈希存储', function () {
    expect(source).toContain("createHash('sha256')");
  });

  test('支持从 settings 表读取凭据', function () {
    expect(source).toContain("key = 'comfyui_creds'");
  });

  test('Token 24h 过期 + 提前5分钟刷新', function () {
    expect(source).toContain('86400');
    expect(source).toContain('300');
  });

  test('401 自动刷新 Token 重试', function () {
    var retryCount = source.split('clearToken()').length - 1;
    expect(retryCount).toBeGreaterThanOrEqual(3);
  });

  test('健康检查使用 /auth/health 免认证端点', function () {
    expect(source).toContain('/auth/health');
  });
});

describe('ComfyUI 抠图节点', function () {
  test('使用 RemBGSession+ + ImageRemoveBackground+ 本地节点', function () {
    expect(source).toContain('RemBGSession+');
    expect(source).toContain('ImageRemoveBackground+');
  });

  test('不含 BRIA 云端节点', function () {
    expect(source).not.toContain('BriaRemoveImageBackground');
  });

  test('不含旧版 RemoveImageBG', function () {
    expect(source).not.toContain('"class_type": "RemoveImageBG"');
  });
});

// ========== 2. buildImg2ImgWorkflow 结构 ==========
describe('buildImg2ImgWorkflow 结构', function () {
  var workflow;

  beforeAll(function () {
    expect(buildImg2ImgFnCode).not.toBeNull();
    workflow = buildImg2ImgWorkflow('test_img.png', 'dreamshaper_v8.safetensors', 'a modern room', 'blurry', 0.5);
  });

  test('包含 8 个节点', function () {
    expect(Object.keys(workflow).length).toBe(8);
  });

  test('节点1 是 CheckpointLoaderSimple', function () {
    expect(workflow['1'].class_type).toBe('CheckpointLoaderSimple');
    expect(workflow['1'].inputs.ckpt_name).toBe('dreamshaper_v8.safetensors');
  });

  test('节点2 是 LoadImage', function () {
    expect(workflow['2'].class_type).toBe('LoadImage');
    expect(workflow['2'].inputs.image).toBe('test_img.png');
  });

  test('节点3 是 CLIPTextEncode（正向提示词）', function () {
    expect(workflow['3'].class_type).toBe('CLIPTextEncode');
    expect(workflow['3'].inputs.text).toBe('a modern room');
  });

  test('节点4 是 CLIPTextEncode（负向提示词）', function () {
    expect(workflow['4'].class_type).toBe('CLIPTextEncode');
    expect(workflow['4'].inputs.text).toBe('blurry');
  });

  test('节点5 是 VAEEncode', function () {
    expect(workflow['5'].class_type).toBe('VAEEncode');
  });

  test('节点6 是 KSampler，denoise=0.5', function () {
    expect(workflow['6'].class_type).toBe('KSampler');
    expect(workflow['6'].inputs.denoise).toBe(0.5);
    expect(workflow['6'].inputs.steps).toBe(25);
    expect(workflow['6'].inputs.sampler_name).toBe('euler_ancestral');
  });

  test('节点7 是 VAEDecode', function () {
    expect(workflow['7'].class_type).toBe('VAEDecode');
  });

  test('节点8 是 SaveImage，前缀 scene_', function () {
    expect(workflow['8'].class_type).toBe('SaveImage');
    expect(workflow['8'].inputs.filename_prefix).toMatch(/^scene_\d+$/);
  });

  test('KSampler 引用链正确', function () {
    var ks = workflow['6'].inputs;
    expect(ks.model).toEqual(['1', 0]);
    expect(ks.positive).toEqual(['3', 0]);
    expect(ks.negative).toEqual(['4', 0]);
    expect(ks.latent_image).toEqual(['5', 0]);
  });

  test('VAEEncode 引用 LoadImage 和 CheckpointLoaderSimple 的 VAE', function () {
    expect(workflow['5'].inputs.pixels).toEqual(['2', 0]);
    expect(workflow['5'].inputs.vae).toEqual(['1', 2]);
  });

  test('KSampler seed 是数字', function () {
    expect(typeof workflow['6'].inputs.seed).toBe('number');
    expect(workflow['6'].inputs.seed).toBeGreaterThan(0);
  });
});

// ========== 3. denoise 边界 ==========
describe('denoise 参数边界', function () {
  test('denoise 被 Math.max(0.1) 限制下界', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, -5);
    expect(wf['6'].inputs.denoise).toBe(0.1);
  });

  test('denoise 被 Math.min(1.0) 限制上界', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 99);
    expect(wf['6'].inputs.denoise).toBe(1.0);
  });

  test('denoise 默认 0.5', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null);
    expect(wf['6'].inputs.denoise).toBe(0.5);
  });

  test('合法 denoise 值原样传递', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 0.7);
    expect(wf['6'].inputs.denoise).toBe(0.7);
  });

  test('denoise=0.2 正常传递', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 0.2);
    expect(wf['6'].inputs.denoise).toBe(0.2);
  });

  test('denoise=1.0 正常传递', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 1.0);
    expect(wf['6'].inputs.denoise).toBe(1.0);
  });
});

// ========== 4. 默认值 ==========
describe('buildImg2ImgWorkflow 默认值', function () {
  test('默认模型是 dreamshaper_v8', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 0.5);
    expect(wf['1'].inputs.ckpt_name).toBe('dreamshaper_v8.safetensors');
  });

  test('自定义模型名传入', function () {
    var wf = buildImg2ImgWorkflow('x.png', 'my_model.safetensors', null, null, 0.5);
    expect(wf['1'].inputs.ckpt_name).toBe('my_model.safetensors');
  });

  test('默认正向提示词不为空', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 0.5);
    expect(wf['3'].inputs.text.length).toBeGreaterThan(0);
  });

  test('默认负向提示词包含 watermark', function () {
    var wf = buildImg2ImgWorkflow('x.png', null, null, null, 0.5);
    expect(wf['4'].inputs.text).toContain('watermark');
  });
});

// ========== 5. 导出 ==========
describe('img2img 导出', function () {
  test('module.exports 包含 img2img', function () {
    var exportMatch = source.match(/module\.exports[\s\S]*$/);
    expect(exportMatch).not.toBeNull();
    expect(exportMatch[0]).toContain('img2img: img2img');
  });
});
