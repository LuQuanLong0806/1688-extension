// oss-upload.test.js — 阿里云 OSS 上传服务测试
const mockFs = { writeFile: jest.fn() };
jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFile: mockFs.writeFile }));
jest.mock('ali-oss', () => {
  return jest.fn().mockImplementation(() => ({
    put: jest.fn().mockResolvedValue({ url: 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/products/2026-06-10/test.png' })
  }));
});
jest.mock('../../crypto', () => ({
  encrypt: (v) => 'ENC:' + v,
  decrypt: (v) => v.replace('ENC:', '')
}));
jest.mock('../../db', () => ({
  getOne: jest.fn()
}));

const oss = require('../../services/oss-upload');
const db = require('../../db');

const makeConfig = (overrides) => Object.assign({
  'oss_access_key_id': 'ENC:LTAI5tTest',
  'oss_access_key_secret': 'ENC:TestSecret123',
  'oss_bucket': 'ENC:test-bucket',
  'oss_region': 'ENC:oss-cn-hangzhou',
  'oss_endpoint': '',
  'oss_config_label': '测试'
}, overrides);

describe('OSS 上传服务', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('getOssConfig / isConfigured', () => {
    test('未配置时返回 null', () => {
      db.getOne.mockReturnValue(null);
      expect(oss.getOssConfig()).toBeNull();
      expect(oss.isConfigured()).toBe(false);
    });

    test('完整配置返回正确对象', () => {
      const cfg = makeConfig();
      let callIdx = 0;
      const vals = Object.values(cfg);
      db.getOne.mockImplementation(() => ({ value: vals[callIdx++] }));
      const result = oss.getOssConfig();
      expect(result).toBeTruthy();
      expect(result.bucket).toBe('test-bucket');
      expect(result.region).toBe('oss-cn-hangzhou');
    });

    test('缺少必填字段返回 null', () => {
      let callIdx = 0;
      const cfg = makeConfig({ 'oss_bucket': '' });
      const vals = Object.values(cfg);
      db.getOne.mockImplementation(() => ({ value: vals[callIdx++] }));
      expect(oss.getOssConfig()).toBeNull();
    });
  });

  describe('uploadToOSS', () => {
    test('未配置时 reject', async () => {
      db.getOne.mockReturnValue(null);
      await expect(oss.uploadToOSS('base64data')).rejects.toThrow('未配置阿里云 OSS');
    });

    test('base64 字符串上传成功', async () => {
      const cfg = makeConfig();
      let callIdx = 0;
      const vals = Object.values(cfg);
      db.getOne.mockImplementation(() => ({ value: vals[callIdx++] }));

      const result = await oss.uploadToOSS('iVBORw0KGgo=', { name: 'test.png' });
      expect(result.ok).toBe(true);
      expect(result.url).toContain('aliyuncs.com');
      expect(result.url).toContain('test.png');
    });

    test('带 data: 前缀的 base64 正常处理', async () => {
      const cfg = makeConfig();
      let callIdx = 0;
      db.getOne.mockImplementation(() => ({ value: Object.values(cfg)[callIdx++] }));

      const result = await oss.uploadToOSS('data:image/png;base64,iVBORw0KGgo=', { name: 'a.png' });
      expect(result.ok).toBe(true);
    });

    test('Buffer 输入正常处理', async () => {
      const cfg = makeConfig();
      let callIdx = 0;
      db.getOne.mockImplementation(() => ({ value: Object.values(cfg)[callIdx++] }));

      const buf = Buffer.from('test-image-data');
      const result = await oss.uploadToOSS(buf, { name: 'buf.png' });
      expect(result.ok).toBe(true);
    });

    test('未指定 name 时自动生成', async () => {
      const cfg = makeConfig();
      let callIdx = 0;
      db.getOne.mockImplementation(() => ({ value: Object.values(cfg)[callIdx++] }));

      const result = await oss.uploadToOSS('iVBORw0KGgo=');
      expect(result.ok).toBe(true);
      expect(result.url).toContain('.png');
    });

    test('OSS 路径包含日期目录', async () => {
      const OSS = require('ali-oss');
      const mockPut = jest.fn().mockResolvedValue({ url: 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/products/2026-06-10/test.png' });
      OSS.mockImplementation(() => ({ put: mockPut }));

      const cfg = makeConfig();
      let callIdx = 0;
      db.getOne.mockImplementation(() => ({ value: Object.values(cfg)[callIdx++] }));

      await oss.uploadToOSS('iVBORw0KGgo=', { name: 'test.png' });
      const calledPath = mockPut.mock.calls[0][0];
      expect(calledPath).toMatch(/^products\/\d{4}-\d{2}-\d{2}\/test\.png$/);
    });

    test('.jpg 文件设置正确 Content-Type', async () => {
      const OSS = require('ali-oss');
      const mockPut = jest.fn().mockResolvedValue({ url: 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/products/2026-06-10/test.jpg' });
      OSS.mockImplementation(() => ({ put: mockPut }));

      const cfg = makeConfig();
      let callIdx = 0;
      db.getOne.mockImplementation(() => ({ value: Object.values(cfg)[callIdx++] }));

      await oss.uploadToOSS('iVBORw0KGgo=', { name: 'photo.jpg' });
      const opts = mockPut.mock.calls[0][2];
      expect(opts.headers['Content-Type']).toBe('image/jpeg');
    });
  });
});
