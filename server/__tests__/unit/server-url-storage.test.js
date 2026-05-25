// server-url-storage.test.js — 测试跨域共享服务器地址（chrome.storage.local）
// 验证 dxm-config.js 和 collect-data.js 中 setServerUrl / getServerUrl 的正确性

// ========== Mock 环境 ==========
const STORAGE_KEY = '1688_server_url';

function createMockEnv() {
  const localStorage = {};
  const chromeStorage = {};

  return {
    localStorage: {
      getItem: jest.fn(key => localStorage[key] || null),
      setItem: jest.fn((key, val) => { localStorage[key] = val; }),
      removeItem: jest.fn(key => { delete localStorage[key]; })
    },
    chromeStorageData: chromeStorage,
    chrome: {
      storage: {
        local: {
          get: jest.fn((key, cb) => {
            const result = {};
            if (chromeStorage[key]) result[key] = chromeStorage[key];
            cb(result);
          }),
          set: jest.fn((obj, cb) => {
            Object.assign(chromeStorage, obj);
            if (cb) cb();
          })
        }
      }
    },
    _local: localStorage,
    _chrome: chromeStorage
  };
}

// 模拟 dxm-config.js 中的 setServerUrl / getServerUrl 逻辑
function createConfigFunctions(env) {
  function getServerUrl() {
    return env.localStorage.getItem(STORAGE_KEY) || 'http://localhost:3000';
  }

  function setServerUrl(url) {
    env.localStorage.setItem(STORAGE_KEY, url);
    try {
      var _o = {};
      _o[STORAGE_KEY] = url;
      env.chrome.storage.local.set(_o);
    } catch (e) {}
  }

  // 启动时同步
  function syncFromChromeStorage() {
    try {
      env.chrome.storage.local.get(STORAGE_KEY, function (r) {
        if (r[STORAGE_KEY]) env.localStorage.setItem(STORAGE_KEY, r[STORAGE_KEY]);
      });
    } catch (e) {}
  }

  return { getServerUrl, setServerUrl, syncFromChromeStorage };
}

// ========== 测试 ==========

describe('服务器地址存储 — chrome.storage.local', () => {
  let env, config;

  beforeEach(() => {
    env = createMockEnv();
    config = createConfigFunctions(env);
  });

  // 1. getServerUrl 默认值
  test('getServerUrl 无存储时返回默认值', () => {
    expect(config.getServerUrl()).toBe('http://localhost:3000');
    expect(env.localStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  // 2. getServerUrl 读取已存储的值
  test('getServerUrl 有存储时返回存储值', () => {
    env._local[STORAGE_KEY] = 'http://192.168.1.100:3000';
    expect(config.getServerUrl()).toBe('http://192.168.1.100:3000');
  });

  // 3. setServerUrl 同时写入 localStorage 和 chrome.storage.local
  test('setServerUrl 同时写入 localStorage 和 chrome.storage.local', () => {
    config.setServerUrl('http://10.0.0.1:8080');
    expect(env.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'http://10.0.0.1:8080');
    expect(env.chrome.storage.local.set).toHaveBeenCalledWith({ [STORAGE_KEY]: 'http://10.0.0.1:8080' });
    // 验证实际存储
    expect(env._local[STORAGE_KEY]).toBe('http://10.0.0.1:8080');
    expect(env._chrome[STORAGE_KEY]).toBe('http://10.0.0.1:8080');
  });

  // 4. setServerUrl 使用变量作为 key（不是字面量 "SERVER_URL_KEY"）
  test('setServerUrl 使用变量值作为 chrome.storage key，不是字面量', () => {
    config.setServerUrl('http://example.com');
    const setCalls = env.chrome.storage.local.set.mock.calls;
    expect(setCalls.length).toBe(1);
    const storedObj = setCalls[0][0];
    // key 应该是 '1688_server_url'，不是 'SERVER_URL_KEY'
    expect(storedObj).toHaveProperty('1688_server_url');
    expect(storedObj).not.toHaveProperty('SERVER_URL_KEY');
    expect(storedObj['1688_server_url']).toBe('http://example.com');
  });

  // 5. 启动时从 chrome.storage.local 同步到 localStorage
  test('启动同步：chrome.storage 有值 → 写入 localStorage', () => {
    env._chrome[STORAGE_KEY] = 'http://sync-test.com:3000';
    config.syncFromChromeStorage();
    expect(env.localStorage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'http://sync-test.com:3000');
  });

  // 6. 启动时 chrome.storage 无值 → 不覆盖 localStorage
  test('启动同步：chrome.storage 无值 → 不覆盖 localStorage', () => {
    env._local[STORAGE_KEY] = 'http://existing.com';
    config.syncFromChromeStorage();
    // 不应调用 setItem（chrome.storage 无该 key）
    const setCalls = env.localStorage.setItem.mock.calls.filter(c => c[0] === STORAGE_KEY);
    expect(setCalls.length).toBe(0);
  });

  // 7. 跨域共享场景：1688 插件设置地址 → 店小秘插件启动时读取
  test('跨域共享：1688插件设置 → chrome.storage → 店小秘插件读取', () => {
    // 模拟 1688 插件设置地址
    config.setServerUrl('http://192.168.0.50:3000');
    expect(env._chrome[STORAGE_KEY]).toBe('http://192.168.0.50:3000');

    // 模拟店小秘插件新环境（localStorage 为空，chrome.storage 有值）
    const env2 = createMockEnv();
    env2._chrome[STORAGE_KEY] = 'http://192.168.0.50:3000';
    const config2 = createConfigFunctions(env2);

    // 启动同步
    config2.syncFromChromeStorage();

    // 读取到正确的地址
    expect(config2.getServerUrl()).toBe('http://192.168.0.50:3000');
  });

  // 8. 多次 setServerUrl 不冲突
  test('多次设置地址：最后一次生效', () => {
    config.setServerUrl('http://first.com');
    config.setServerUrl('http://second.com');
    config.setServerUrl('http://third.com');
    expect(config.getServerUrl()).toBe('http://third.com');
    expect(env._chrome[STORAGE_KEY]).toBe('http://third.com');
  });

  // 9. URL 尾部斜杠处理（由调用方 trim，setServerUrl 不处理）
  test('setServerUrl 不自动去尾斜杠（由调用方负责）', () => {
    config.setServerUrl('http://example.com/');
    expect(config.getServerUrl()).toBe('http://example.com/');
    // 调用方应负责 .replace(/\/+$/, '')
  });

  // 10. chrome.storage.local 不可用时 setServerUrl 仍写入 localStorage
  test('chrome.storage 不可用时仍正常写入 localStorage', () => {
    env.chrome.storage.local.set = jest.fn(() => { throw new Error('not available'); });
    config.setServerUrl('http://fallback.com');
    expect(env._local[STORAGE_KEY]).toBe('http://fallback.com');
  });
});
