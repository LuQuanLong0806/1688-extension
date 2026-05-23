// crypto.test.js — 加密模块测试
const crypto = require('../../crypto');

describe('Crypto 模块', () => {
  describe('encrypt / decrypt', () => {
    test('加密后能正确解密回原文', () => {
      const plain = 'my-secret-api-key-12345';
      const encrypted = crypto.encrypt(plain);
      expect(encrypted).not.toBe(plain);
      expect(encrypted.startsWith('ENC:')).toBe(true);
      expect(crypto.decrypt(encrypted)).toBe(plain);
    });

    test('加密不同明文产生不同密文', () => {
      const enc1 = crypto.encrypt('text-a');
      const enc2 = crypto.encrypt('text-b');
      expect(enc1).not.toBe(enc2);
    });

    test('加密相同明文两次产生不同密文（随机IV）', () => {
      const enc1 = crypto.encrypt('same-text');
      const enc2 = crypto.encrypt('same-text');
      expect(enc1).not.toBe(enc2);
      expect(crypto.decrypt(enc1)).toBe('same-text');
      expect(crypto.decrypt(enc2)).toBe('same-text');
    });

    test('encrypt 空值返回空值', () => {
      expect(crypto.encrypt('')).toBe('');
      expect(crypto.encrypt(null)).toBeNull();
      expect(crypto.encrypt(undefined)).toBeUndefined();
    });

    test('decrypt 空值/非ENC前缀返回原文', () => {
      expect(crypto.decrypt('')).toBe('');
      expect(crypto.decrypt('plain-text')).toBe('plain-text');
      expect(crypto.decrypt(null)).toBeNull();
      expect(crypto.decrypt(undefined)).toBeUndefined();
      expect(crypto.decrypt(123)).toBe(123);
    });

    test('decrypt 格式错误密文降级返回原文', () => {
      const bad = 'ENC:bad:data:here';
      const result = crypto.decrypt(bad);
      expect(result).toBe(bad);
    });

    test('长文本加密解密', () => {
      const longText = 'a'.repeat(10000);
      const encrypted = crypto.encrypt(longText);
      expect(crypto.decrypt(encrypted)).toBe(longText);
    });

    test('中文加密解密', () => {
      const chinese = '中文密钥测试äöü';
      const encrypted = crypto.encrypt(chinese);
      expect(crypto.decrypt(encrypted)).toBe(chinese);
    });

    test('JSON 字符串加密解密', () => {
      const json = JSON.stringify({ key: 'value', nested: { a: 1 } });
      const encrypted = crypto.encrypt(json);
      expect(crypto.decrypt(encrypted)).toBe(json);
    });
  });

  describe('isSensitive', () => {
    test('敏感 key 正确识别', () => {
      expect(crypto.isSensitive('zhipu_api_key')).toBe(true);
      expect(crypto.isSensitive('zhipu_api_keys')).toBe(true);
      expect(crypto.isSensitive('ai_configs')).toBe(true);
      expect(crypto.isSensitive('imgbb_api_key')).toBe(true);
    });

    test('非敏感 key 不误判', () => {
      expect(crypto.isSensitive('turso_config')).toBe(false);
      expect(crypto.isSensitive('other_setting')).toBe(false);
      expect(crypto.isSensitive('')).toBe(false);
      expect(crypto.isSensitive('migration_dxm_categories_to_tree')).toBe(false);
    });
  });

  describe('SENSITIVE_KEYS 常量', () => {
    test('包含所有预期的敏感 key', () => {
      expect(crypto.SENSITIVE_KEYS).toContain('zhipu_api_key');
      expect(crypto.SENSITIVE_KEYS).toContain('zhipu_api_keys');
      expect(crypto.SENSITIVE_KEYS).toContain('ai_configs');
      expect(crypto.SENSITIVE_KEYS).toContain('imgbb_api_key');
    });

    test('是数组', () => {
      expect(Array.isArray(crypto.SENSITIVE_KEYS)).toBe(true);
    });
  });
});
