// upload-config.test.js — 上传限制配置服务测试
jest.mock('../../db', () => ({
  getOne: jest.fn(),
  run: jest.fn(),
  scheduleSave: jest.fn()
}));

const config = require('../../services/upload-config');
const db = require('../../db');

// 持久化 store — 让 db.run 写入的数据能被 db.getOne 读出来
let _store;
function _installStoreMock() {
  _store = {};
  db.getOne.mockImplementation(function (sql, params) {
    if (/^SELECT/i.test(sql) && params && params[0]) {
      return _store[params[0]] !== undefined ? { value: _store[params[0]] } : null;
    }
    return null;
  });
  db.run.mockImplementation(function (sql, params) {
    if (/^INSERT/i.test(sql) && params && params.length >= 2) {
      _store[params[0]] = params[1];
    }
  });
}

describe('upload-config 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _installStoreMock();
    config._resetCache();
  });

  describe('get()', () => {
    test('settings 为空时返回默认值', () => {
      db.getOne.mockReturnValue(null);
      const cfg = config.get();
      expect(cfg.upload_max_bytes).toBe(10485760);
      expect(cfg.upload_max_pixels).toBe(64000000);
      expect(cfg.upload_format_convert).toBe('auto');
      expect(cfg.upload_webp_quality).toBe(85);
      expect(cfg.upload_mime_whitelist).toBe('png,jpeg,webp,gif,bmp');
      expect(cfg.upload_strip_exif).toBe('off');
    });

    test('合并 settings 中的覆盖值', () => {
      _store['upload_max_bytes'] = '5242880';
      _store['upload_format_convert'] = 'off';
      _store['upload_webp_quality'] = '90';
      const cfg = config.get();
      expect(cfg.upload_max_bytes).toBe(5242880);
      expect(cfg.upload_format_convert).toBe('off');
      expect(cfg.upload_webp_quality).toBe(90);
      expect(cfg.upload_max_pixels).toBe(64000000); // 仍是默认
    });

    test('非法数字字段退回默认值', () => {
      _store['upload_webp_quality'] = 'abc';
      const cfg = config.get();
      expect(cfg.upload_webp_quality).toBe(85);
    });

    test('缓存生效：第二次 get 不再查 db', () => {
      db.getOne.mockReturnValue(null);
      config.get();
      const callsAfterFirst = db.getOne.mock.calls.length;
      config.get();
      expect(db.getOne.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  describe('save()', () => {
    test('只保存 DEFAULTS 中存在的 key', () => {
      config.save({ upload_max_bytes: 2097152, invalid_key: 'xxx' });
      expect(db.run).toHaveBeenCalledTimes(1);
      var params = db.run.mock.calls[0][1];
      expect(params[0]).toBe('upload_max_bytes');
      expect(params[1]).toBe('2097152');
      expect(db.scheduleSave).toHaveBeenCalled();
    });

    test('拒绝非法数字', () => {
      config.save({ upload_webp_quality: 'abc' });
      expect(db.run).not.toHaveBeenCalled();
    });

    test('save 后刷新缓存', () => {
      config.save({ upload_max_bytes: 3145728 });
      const cfg = config.get();
      expect(cfg.upload_max_bytes).toBe(3145728);
      expect(_store['upload_max_bytes']).toBe('3145728');
    });

    test('字符串值保存为字符串', () => {
      config.save({ upload_mime_whitelist: 'png,jpeg' });
      var params = db.run.mock.calls[0][1];
      expect(params[0]).toBe('upload_mime_whitelist');
      expect(params[1]).toBe('png,jpeg');
    });
  });

  describe('defaults()', () => {
    test('返回完整默认值副本', () => {
      const d = config.defaults();
      expect(d.upload_max_bytes).toBe(10485760);
      expect(Object.keys(d).length).toBeGreaterThan(5);
    });

    test('修改副本不影响后续 defaults()', () => {
      const d1 = config.defaults();
      d1.upload_max_bytes = 1;
      const d2 = config.defaults();
      expect(d2.upload_max_bytes).toBe(10485760);
    });
  });

  describe('_setDb() 注入', () => {
    test('支持注入自定义 db（测试隔离用）', () => {
      var calls = 0;
      var fakeDb = {
        getOne: function () { calls++; return null; },
        run: function () {},
        scheduleSave: function () {}
      };
      config._setDb(fakeDb);
      config._resetCache();
      config.get();
      expect(calls).toBeGreaterThan(0);
      config._setDb(null); // 恢复
    });
  });
});
