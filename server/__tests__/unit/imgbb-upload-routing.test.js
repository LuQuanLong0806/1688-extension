// imgbb-upload-routing.test.js — 统一上传路由层测试 (OSS > ImgBB)
jest.mock('../../services/oss-upload', () => ({
  isConfigured: jest.fn(),
  uploadToOSS: jest.fn()
}));
jest.mock('../../crypto', () => ({
  encrypt: (v) => 'ENC:' + v,
  decrypt: (v) => v.replace('ENC:', '')
}));
jest.mock('../../db', () => ({
  getOne: jest.fn().mockReturnValue(null)
}));
jest.mock('https', () => ({
  request: jest.fn()
}));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), writeFile: jest.fn() }));

const uploader = require('../../services/imgbb-upload');
const ossUpload = require('../../services/oss-upload');

describe('统一上传路由 (OSS > ImgBB)', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('uploadToImgBB 路由逻辑', () => {
    test('OSS 已配置时走 OSS', async () => {
      ossUpload.isConfigured.mockReturnValue(true);
      ossUpload.uploadToOSS.mockResolvedValue({ ok: true, url: 'https://oss.example.com/a.png' });

      const result = await uploader.uploadToImgBB('base64data', { name: 'test.png' });
      expect(ossUpload.uploadToOSS).toHaveBeenCalledWith('base64data', { name: 'test.png' });
      expect(result.ok).toBe(true);
      expect(result.url).toContain('oss.example.com');
    });

    test('OSS 未配置且无 ImgBB Key 时 reject', async () => {
      ossUpload.isConfigured.mockReturnValue(false);
      await expect(uploader.uploadToImgBB('base64data')).rejects.toThrow('未配置图片上传服务');
    });

    test('OSS 上传失败时错误能正确抛出', async () => {
      ossUpload.isConfigured.mockReturnValue(true);
      ossUpload.uploadToOSS.mockRejectedValue(new Error('OSS 网络超时'));

      await expect(uploader.uploadToImgBB('data:image/png;base64,abc')).rejects.toThrow('OSS 网络超时');
    });
  });

  describe('getImgbbKey', () => {
    test('未配置时返回空字符串', () => {
      const db = require('../../db');
      db.getOne.mockReturnValue(null);
      expect(uploader.getImgbbKey()).toBe('');
    });
  });
});
