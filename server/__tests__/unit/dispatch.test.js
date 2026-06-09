// dispatch.test.js — 统一调度系统 单元测试
const sec = require('../../crypto');

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
      var m = sql.match(/VALUES\s*\('([^']+)',\s*\?\)/);
      if (m && params && params.length === 1) {
        mockDbData[m[1]] = params[0];
      } else if (params && params.length >= 2) {
        mockDbData[params[0]] = params[1];
      } else {
        // 无占位符: VALUES ('key', 'value')
        var full = sql.match(/VALUES\s*\('([^']+)',\s*'([^']*)'\)/);
        if (full) mockDbData[full[1]] = full[2];
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

// ===== buildDefaultDispatchOrder =====
describe('buildDefaultDispatchOrder', () => {
  test('返回正确的默认结构', () => {
    var order = providers.buildDefaultDispatchOrder();
    expect(order.version).toBe(3);
    expect(order.dispatch.text).toBeInstanceOf(Array);
    expect(order.dispatch.vision).toBeInstanceOf(Array);
    expect(order.dispatch.image).toBeInstanceOf(Array);
  });

  test('text 默认顺序: 智谱 → 混元 → 通义', () => {
    var order = providers.buildDefaultDispatchOrder();
    expect(order.dispatch.text.length).toBe(3);
    expect(order.dispatch.text[0]).toEqual({ vendor: 'zhipu', model: 'glm-4.7-flash' });
    expect(order.dispatch.text[1]).toEqual({ vendor: 'hunyuan', model: 'hunyuan-lite' });
    expect(order.dispatch.text[2]).toEqual({ vendor: 'qwen', model: 'qwen-turbo' });
  });

  test('vision 默认顺序: 智谱 → 通义', () => {
    var order = providers.buildDefaultDispatchOrder();
    expect(order.dispatch.vision.length).toBe(2);
    expect(order.dispatch.vision[0]).toEqual({ vendor: 'zhipu', model: 'glm-4.6v-flash' });
    expect(order.dispatch.vision[1]).toEqual({ vendor: 'qwen', model: 'qwen3.6-flash' });
  });

  test('image 默认: 智谱 cogview-3-flash', () => {
    var order = providers.buildDefaultDispatchOrder();
    expect(order.dispatch.image.length).toBe(1);
    expect(order.dispatch.image[0]).toEqual({ vendor: 'zhipu', model: 'cogview-3-flash' });
  });
});

// ===== getDispatchOrder / saveDispatchOrder =====
describe('getDispatchOrder / saveDispatchOrder', () => {
  test('无数据时返回 null', () => {
    expect(providers.getDispatchOrder()).toBeNull();
  });

  test('保存后可读取', () => {
    var order = { version: 3, dispatch: { text: [{ vendor: 'zhipu', model: 'glm-4-flash' }] } };
    providers.saveDispatchOrder(order);
    var result = providers.getDispatchOrder();
    expect(result.version).toBe(3);
    expect(result.dispatch.text[0].vendor).toBe('zhipu');
    expect(result.dispatch.text[0].model).toBe('glm-4-flash');
  });

  test('覆盖保存', () => {
    providers.saveDispatchOrder({ version: 3, dispatch: { text: [{ vendor: 'qwen', model: 'qwen-turbo' }] } });
    providers.saveDispatchOrder({ version: 3, dispatch: { text: [{ vendor: 'hunyuan', model: 'hunyuan-lite' }] } });
    var result = providers.getDispatchOrder();
    expect(result.dispatch.text[0].vendor).toBe('hunyuan');
  });
});

// ===== ensureDispatchMigration =====
describe('ensureDispatchMigration', () => {
  test('首次运行创建默认调度并标记', () => {
    expect(mockDbData['ai_dispatch_migrated']).toBeUndefined();
    providers.ensureDispatchMigration();
    expect(mockDbData['ai_dispatch_migrated']).toBeDefined();
    var order = providers.getDispatchOrder();
    expect(order).not.toBeNull();
    expect(order.dispatch.text.length).toBeGreaterThan(0);
  });

  test('已迁移时不覆盖', () => {
    mockDbData['ai_dispatch_migrated'] = '1';
    mockDbData['ai_dispatch_order'] = sec.encrypt(JSON.stringify({
      version: 3, dispatch: { text: [{ vendor: 'qwen', model: 'qwen-turbo' }] }
    }));
    providers.ensureDispatchMigration();
    var order = providers.getDispatchOrder();
    expect(order.dispatch.text[0].vendor).toBe('qwen');
  });
});

// ===== DISPATCH_AVAILABLE_MODELS =====
describe('DISPATCH_AVAILABLE_MODELS', () => {
  test('包含所有厂商', () => {
    var m = providers.DISPATCH_AVAILABLE_MODELS;
    expect(m.zhipu).toBeDefined();
    expect(m.qwen).toBeDefined();
    expect(m.hunyuan).toBeDefined();
    expect(m.ollama).toBeDefined();
  });

  test('智谱包含 text/vision/image 分类', () => {
    var m = providers.DISPATCH_AVAILABLE_MODELS;
    expect(m.zhipu.text).toContain('glm-4.7-flash');
    expect(m.zhipu.vision).toContain('glm-4.6v-flash');
    expect(m.zhipu.image).toContain('cogview-3-flash');
  });

  test('通义包含 vision 分类', () => {
    var m = providers.DISPATCH_AVAILABLE_MODELS;
    expect(m.qwen.vision).toContain('qwen3.6-flash');
    expect(m.qwen.vision).toContain('qwen3.7-plus');
  });
});

// ===== recognizeLLMRequest =====
describe('recognizeLLMRequest', () => {
  test('导出为函数', () => {
    expect(typeof providers.recognizeLLMRequest).toBe('function');
  });
});

// ===== 包装函数走 dispatch =====
describe('包装函数走统一调度', () => {
  test('categoryLLMRequest 是函数', () => {
    expect(typeof providers.categoryLLMRequest).toBe('function');
  });
  test('extractionLLMRequest 是函数', () => {
    expect(typeof providers.extractionLLMRequest).toBe('function');
  });
  test('visionLLMRequest 是函数', () => {
    expect(typeof providers.visionLLMRequest).toBe('function');
  });
  test('imageGenLLMRequest 是函数', () => {
    expect(typeof providers.imageGenLLMRequest).toBe('function');
  });
  test('qwenVlRequest 仍可调用（兼容）', () => {
    expect(typeof providers.qwenVlRequest).toBe('function');
  });
});
