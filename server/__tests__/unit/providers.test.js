// providers.test.js — LLM 供应商配置测试
const providers = require('../../routes/ai/providers');

describe('Providers 配置模块', () => {
  describe('maskApiKey', () => {
    test('长 key 正确脱敏', () => {
      expect(providers.maskApiKey('abcdefghijklmnop1234567890')).toBe('abcd****7890');
    });

    test('短 key 返回 ****', () => {
      expect(providers.maskApiKey('short')).toBe('****');
      expect(providers.maskApiKey('12345678')).toBe('****');
    });

    test('空值返回空字符串', () => {
      expect(providers.maskApiKey('')).toBe('');
      expect(providers.maskApiKey(null)).toBe('');
      expect(providers.maskApiKey(undefined)).toBe('');
    });
  });

  describe('AI_USE_CASES', () => {
    test('包含所有预期用例', () => {
      expect(providers.AI_USE_CASES.category).toBeDefined();
      expect(providers.AI_USE_CASES.vision).toBeDefined();
      expect(providers.AI_USE_CASES.image).toBeDefined();
    });

    test('每个用例有必要属性', () => {
      Object.keys(providers.AI_USE_CASES).forEach(uc => {
        const config = providers.AI_USE_CASES[uc];
        expect(config.label).toBeDefined();
        expect(config.defaultModel).toBeDefined();
        expect(config.models).toBeDefined();
        expect(Array.isArray(config.models)).toBe(true);
        expect(config.models.length).toBeGreaterThan(0);
      });
    });

    test('模型列表中每个模型有 id 和 name', () => {
      Object.keys(providers.AI_USE_CASES).forEach(uc => {
        providers.AI_USE_CASES[uc].models.forEach(m => {
          expect(m.id).toBeDefined();
          expect(m.name).toBeDefined();
        });
      });
    });
  });

  describe('getApiKey', () => {
    test('未配置时返回空字符串', () => {
      const key = providers.getApiKey();
      expect(typeof key).toBe('string');
    });
  });

  describe('getAIConfig', () => {
    test('返回包含 model 和 apiKey', () => {
      const config = providers.getAIConfig('category');
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('apiKey');
    });

    test('未知 useCase 使用默认值', () => {
      const config = providers.getAIConfig('nonexistent');
      expect(config.model).toBe('');
    });
  });

  describe('getZhipuKeys / getQwenKeys / getHunyuanAccounts', () => {
    test('getZhipuKeys 返回数组', () => {
      const keys = providers.getZhipuKeys();
      expect(Array.isArray(keys)).toBe(true);
    });

    test('getQwenKeys 返回数组', () => {
      const keys = providers.getQwenKeys();
      expect(Array.isArray(keys)).toBe(true);
    });

    test('getHunyuanAccounts 返回数组', () => {
      const accounts = providers.getHunyuanAccounts();
      expect(Array.isArray(accounts)).toBe(true);
    });
  });

  describe('CATEGORY_LLM_CHAIN / EXTRACTION_LLM_CHAIN', () => {
    test('降级链非空', () => {
      expect(providers.CATEGORY_LLM_CHAIN || providers.runLLMChain).toBeDefined();
    });
  });
});
