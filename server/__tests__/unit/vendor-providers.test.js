// vendor-providers.test.js — 厂商分组配置 + Key池迁移 单元测试
const sec = require('../../crypto');

// Jest 允许 mock 前缀变量在 jest.mock() 内引用
var mockDbData = {};
jest.mock('../../db', () => ({
  getOne: jest.fn((sql, params) => {
    if (sql.indexOf('FROM settings') >= 0) {
      var m = sql.match(/key\s*=\s*'([^']+)'/);
      var key = m ? m[1] : (params ? params[0] : '');
      var val = mockDbData[key];
      return val !== undefined ? { value: val } : null;
    }
    return null;
  }),
  getAll: jest.fn(() => []),
  run: jest.fn((sql, params) => {
    if (sql.indexOf('INSERT OR REPLACE') >= 0) {
      // 两种格式: (key, value) VALUES (?, ?) 或 VALUES ('key', ?)
      var m = sql.match(/VALUES\s*\('([^']+)',\s*\?\)/);
      if (m && params && params.length === 1) {
        mockDbData[m[1]] = params[0];
      } else if (params && params.length >= 2) {
        mockDbData[params[0]] = params[1];
      }
    }
    if (sql.indexOf('DELETE FROM settings') >= 0) {
      var dm = sql.match(/key\s*=\s*'([^']+)'/);
      if (dm) delete mockDbData[dm[1]];
    }
  }),
  scheduleSave: jest.fn()
}));

const providers = require('../../routes/ai/providers');

beforeEach(() => {
  mockDbData = {};
});

// ===== buildVendorConfigsFromLegacy =====
describe('buildVendorConfigsFromLegacy', () => {
  test('空配置时返回默认值', () => {
    var vc = providers.buildVendorConfigsFromLegacy();
    expect(vc.version).toBe(2);
    expect(vc.vendors.zhipu.models.text).toBe('glm-4.7-flash');
    expect(vc.vendors.zhipu.models.vision).toBe('glm-4.6v-flash');
    expect(vc.vendors.zhipu.models.image).toBe('cogview-3-flash');
    expect(vc.vendors.qwen.models.recognize).toBe('qwen3.6-flash');
    expect(vc.vendors.hunyuan.models.text).toBe('hunyuan-lite');
    expect(vc.vendors.ollama.model).toBe('qwen3:8b');
    expect(vc.vendors.ollama.port).toBe('11434');
  });

  test('从旧 ai_configs 读取模型选择', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({
      category: { model: 'glm-4-flash' },
      vision: { model: 'glm-4v-flash' },
      image: { model: 'cogview-4' },
      recognize: { model: 'qwen-vl-plus' },
      providers: { ollama: { model: 'llama3:8b', port: '8080' } }
    }));
    var vc = providers.buildVendorConfigsFromLegacy();
    expect(vc.vendors.zhipu.models.text).toBe('glm-4-flash');
    expect(vc.vendors.zhipu.models.vision).toBe('glm-4v-flash');
    expect(vc.vendors.zhipu.models.image).toBe('cogview-4');
    expect(vc.vendors.qwen.models.recognize).toBe('qwen-vl-plus');
    expect(vc.vendors.ollama.model).toBe('llama3:8b');
    expect(vc.vendors.ollama.port).toBe('8080');
  });
});

// ===== getVendorConfigs =====
describe('getVendorConfigs', () => {
  test('无 ai_vendor_configs 时返回 null', () => {
    expect(providers.getVendorConfigs()).toBeNull();
  });

  test('有 ai_vendor_configs 时正确解析', () => {
    var vc = { version: 2, vendors: { zhipu: { models: { text: 'glm-4-flash' } } } };
    mockDbData['ai_vendor_configs'] = sec.encrypt(JSON.stringify(vc));
    var result = providers.getVendorConfigs();
    expect(result.version).toBe(2);
    expect(result.vendors.zhipu.models.text).toBe('glm-4-flash');
  });
});

// ===== saveVendorModels =====
describe('saveVendorModels', () => {
  test('保存智谱文本模型并同步到 ai_configs', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({ category: { model: 'glm-4.7-flash' } }));
    providers.saveVendorModels('zhipu', 'text', 'glm-4-flash');
    var vc = providers.getVendorConfigs();
    expect(vc.vendors.zhipu.models.text).toBe('glm-4-flash');
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    expect(cfg.category.model).toBe('glm-4-flash');
  });

  test('保存智谱视觉模型', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({ vision: { model: 'glm-4.6v-flash' } }));
    providers.saveVendorModels('zhipu', 'vision', 'glm-4v-flash');
    var vc = providers.getVendorConfigs();
    expect(vc.vendors.zhipu.models.vision).toBe('glm-4v-flash');
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    expect(cfg.vision.model).toBe('glm-4v-flash');
  });

  test('保存智谱图像生成模型', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({ image: { model: 'cogview-3-flash' } }));
    providers.saveVendorModels('zhipu', 'image', 'cogview-4');
    var vc = providers.getVendorConfigs();
    expect(vc.vendors.zhipu.models.image).toBe('cogview-4');
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    expect(cfg.image.model).toBe('cogview-4');
  });

  test('保存通义视觉模型（recognize）', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({ recognize: { model: 'qwen3.6-flash' } }));
    providers.saveVendorModels('qwen', 'recognize', 'qwen-vl-plus');
    var vc = providers.getVendorConfigs();
    expect(vc.vendors.qwen.models.recognize).toBe('qwen-vl-plus');
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    expect(cfg.recognize.model).toBe('qwen-vl-plus');
  });

  test('无旧 ai_configs 时自动创建', () => {
    providers.saveVendorModels('zhipu', 'text', 'glm-4.7-flash');
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    expect(cfg.category.model).toBe('glm-4.7-flash');
  });
});

// ===== migrateDedicatedKeys =====
describe('migrateDedicatedKeys', () => {
  test('vision 专用Key迁移到智谱Key池', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({
      vision: { apiKey: 'test-vision-key-12345678' }
    }));
    mockDbData['zhipu_api_keys'] = sec.encrypt(JSON.stringify([
      { key: 'existing-zhipu-key', label: '' }
    ]));
    providers.migrateDedicatedKeys();
    var keys = JSON.parse(sec.decrypt(mockDbData['zhipu_api_keys']));
    expect(keys.length).toBe(2);
    expect(keys[1].key).toBe('test-vision-key-12345678');
    expect(keys[1].label).toBe('旧智能检测Key');
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    expect(cfg.vision.apiKey).toBeUndefined();
  });

  test('image 专用Key迁移到智谱Key池', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({
      image: { apiKey: 'test-image-key-12345678' }
    }));
    mockDbData['zhipu_api_keys'] = sec.encrypt(JSON.stringify([]));
    providers.migrateDedicatedKeys();
    var keys = JSON.parse(sec.decrypt(mockDbData['zhipu_api_keys']));
    expect(keys.length).toBe(1);
    expect(keys[0].key).toBe('test-image-key-12345678');
    expect(keys[0].label).toBe('旧图片生成Key');
  });

  test('重复迁移不会产生重复Key', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({
      vision: { apiKey: 'dup-key-12345678' }
    }));
    mockDbData['zhipu_api_keys'] = sec.encrypt(JSON.stringify([
      { key: 'dup-key-12345678', label: '旧智能检测Key' }
    ]));
    providers.migrateDedicatedKeys();
    var keys = JSON.parse(sec.decrypt(mockDbData['zhipu_api_keys']));
    expect(keys.length).toBe(1);
  });

  test('无专用Key时不做改动', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({}));
    mockDbData['zhipu_api_keys'] = sec.encrypt(JSON.stringify([
      { key: 'existing-key', label: '' }
    ]));
    providers.migrateDedicatedKeys();
    var keys = JSON.parse(sec.decrypt(mockDbData['zhipu_api_keys']));
    expect(keys.length).toBe(1);
    expect(keys[0].key).toBe('existing-key');
  });

  test('qwen_vl_api_key 迁移到通义Key池', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({
      providers: { qwen: { apiKeys: [{ key: 'existing-qwen-key', label: '' }] } }
    }));
    mockDbData['qwen_vl_api_key'] = sec.encrypt('vl-key-to-migrate-12345');
    providers.migrateDedicatedKeys();
    var cfg = JSON.parse(sec.decrypt(mockDbData['ai_configs']));
    var qwenKeys = cfg.providers.qwen.apiKeys;
    expect(qwenKeys.length).toBe(2);
    expect(qwenKeys[1].key).toBe('vl-key-to-migrate-12345');
    expect(qwenKeys[1].label).toBe('旧VL Key');
  });
});

// ===== getQwenVlKey 优先级 =====
describe('getQwenVlKey', () => {
  test('优先从通义Key池取', () => {
    mockDbData['ai_configs'] = sec.encrypt(JSON.stringify({
      providers: { qwen: { apiKeys: [{ key: 'pool-key-12345678', label: '' }] } }
    }));
    mockDbData['qwen_vl_api_key'] = sec.encrypt('dedicated-vl-key-12345678');
    var key = providers.getQwenVlKey();
    expect(key).toBe('pool-key-12345678');
  });

  test('Key池空时回退到旧VL Key', () => {
    mockDbData['qwen_vl_api_key'] = sec.encrypt('dedicated-vl-key-12345678');
    var key = providers.getQwenVlKey();
    expect(key).toBe('dedicated-vl-key-12345678');
  });

  test('都没有时返回内置默认Key', () => {
    var key = providers.getQwenVlKey();
    expect(key).toBe('sk-ad9a93ab29e34635a92b75fd2d751f81');
  });
});

// ===== normalizeKeyEntry =====
describe('normalizeKeyEntry', () => {
  test('字符串转为 {key, label}', () => {
    expect(providers.normalizeKeyEntry('abc')).toEqual({ key: 'abc', label: '' });
  });

  test('对象原样返回', () => {
    var obj = { key: 'abc', label: 'test' };
    expect(providers.normalizeKeyEntry(obj)).toBe(obj);
  });
});

// ===== maskApiKey =====
describe('maskApiKey', () => {
  test('长key正确脱敏', () => {
    expect(providers.maskApiKey('abcdefghijklmnop1234567890')).toBe('abcd****7890');
  });

  test('短key返回 ****', () => {
    expect(providers.maskApiKey('short')).toBe('****');
  });

  test('空值返回空字符串', () => {
    expect(providers.maskApiKey('')).toBe('');
    expect(providers.maskApiKey(null)).toBe('');
  });
});
