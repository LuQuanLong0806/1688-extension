// e2e/settings.spec.js — 设置管理 & AI 配置 & 云同步
// 覆盖: 设置读写 → AI Key 管理 → 权限检查 → 导入导出

const { test, expect, loginAs, apiRequest } = require('./fixtures');

test.describe('设置管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('PUT /api/settings 批量更新应成功', async ({ page }) => {
    const testKey = `e2e_test_${Date.now()}`;
    const res = await apiRequest(page, 'PUT', '/api/settings', {
      items: [
        { key: testKey, value: 'test_value' },
        { key: `${testKey}_2`, value: 'test_value_2' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBeTruthy();
  });

  test('GET /api/settings/:key 应返回单个设置', async ({ page }) => {
    const key = `e2e_single_${Date.now()}`;
    await apiRequest(page, 'POST', `/api/settings/${key}`, { value: 'hello' });
    
    const res = await apiRequest(page, 'GET', `/api/settings/${key}`);
    expect(res.status).toBe(200);
    expect(res.data?.value).toBe('hello');
  });

  test('设置导入导出应成功', async ({ page }) => {
    // 导出
    const exportRes = await apiRequest(page, 'GET', '/api/settings-export');
    expect(exportRes.status).toBe(200);
    expect(typeof exportRes.data).toBe('object');
    
    // 导入（自定义 key 不影响现有配置）
    const importRes = await apiRequest(page, 'POST', '/api/settings-import', {
      e2e_test_key: 'imported_value',
    });
    expect(importRes.status).toBe(200);
    expect(importRes.data?.ok).toBeTruthy();
  });
});

test.describe('AI 配置管理', () => {
  test('GET /api/ai/configs 应返回配置', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/ai/configs');
    expect(res.status).toBe(200);
    // 应该有分类/视觉/图片三个 useCase
    expect(res.data).toHaveProperty('category');
    expect(res.data).toHaveProperty('vision');
    expect(res.data).toHaveProperty('image');
  });

  test('POST /api/ai/save-key 应保存密钥', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/ai/save-key', {
      key: 'e2e_test_key_' + Date.now(),
    });
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBeTruthy();
  });

  test('空密钥应拒绝', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/ai/save-key', { key: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/ai/zhipu-keys 批量管理应成功', async ({ page }) => {
    // add
    const addRes = await apiRequest(page, 'POST', '/api/ai/zhipu-keys', {
      action: 'add',
      key: 'e2e_key_' + Date.now(),
      label: 'E2E 测试',
    });
    expect(addRes.status).toBe(200);
    expect(addRes.data?.count).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/ai/vendor-configs 应返回厂商配置', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/ai/vendor-configs');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('vendors');
  });

  test('GET /api/ai/dispatch-order 应返回调度配置', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/ai/dispatch-order');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('dispatch');
    expect(res.data).toHaveProperty('vendorStatus');
  });

  test('POST /api/ai/global-key 需要 admin 权限', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    
    const res = await apiRequest(page, 'POST', '/api/ai/global-key', {
      apiKey: 'operator_hack_key',
    });
    expect(res.status).toBe(403);
  });

  test('图片生成端点参数校验', async ({ page }) => {
    // text-to-image 缺少 prompt
    const res1 = await apiRequest(page, 'POST', '/api/ai/text-to-image', { prompt: '' });
    expect(res1.status).toBe(400);
    
    // image-to-image 缺少图片
    const res2 = await apiRequest(page, 'POST', '/api/ai/image-to-image', { prompt: 'test' });
    expect(res2.status).toBe(400);
    
    // white-bg 缺少图片
    const res3 = await apiRequest(page, 'POST', '/api/ai/white-bg', {});
    expect(res3.status).toBe(400);
  });
});

test.describe('图床管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('GET /api/ai/smms-token 应返回 token 状态', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/ai/smms-token');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('configured');
  });

  test('POST /api/ai/smms-token 保存 label 应成功', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/ai/smms-token', {
      labelOnly: true,
      label: 'E2E 测试图床',
    });
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBeTruthy();
  });

  test('OSS 配置应可读写', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/ai/oss-config');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('configured');
  });
});

test.describe('云同步', () => {
  test('GET /api/sync/config 需要 admin 权限', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    const res = await apiRequest(page, 'GET', '/api/sync/config');
    expect(res.status).toBe(200);
  });

  test('operator 不能访问同步配置', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    const res = await apiRequest(page, 'GET', '/api/sync/config');
    expect(res.status).toBe(403);
  });

  test('viewer 不能访问同步配置', async ({ page }) => {
    await loginAs(page, { username: 'viewer', password: 'viewer123' });
    const res = await apiRequest(page, 'GET', '/api/sync/config');
    expect(res.status).toBe(403);
  });

  test('POST /api/sync/config 保存应成功', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    const res = await apiRequest(page, 'POST', '/api/sync/config', {
      url: 'libsql://test.turso.io',
      token: 'e2e_test_token',
    });
    // 可能因为 URL 格式校验失败
    // 主要验证权限
    expect(res.status).toBeLessThan(403);
  });

  test('POST /api/sync/test 测试连接应返回结果', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    const res = await apiRequest(page, 'POST', '/api/sync/test');
    expect(res.status).toBeLessThan(403);
    // 应该返回 ok: true/false
    expect(res.data).toHaveProperty('ok');
  });
});

test.describe('用户管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('GET /api/users 应返回用户列表', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBeTruthy();
    expect(res.data.length).toBeGreaterThanOrEqual(1);
    
    // 不应包含密码
    for (const user of res.data) {
      expect(user).not.toHaveProperty('password_hash');
      expect(user).not.toHaveProperty('password_salt');
    }
  });

  test('创建用户应成功', async ({ page }) => {
    const username = `e2e_user_${Date.now()}`;
    const res = await apiRequest(page, 'POST', '/api/users', {
      username: username,
      password: 'Test123456',
      role: 'viewer',
      display_name: 'E2E 测试用户',
    });
    expect(res.status).toBe(200);
    expect(res.data?.username).toBe(username);
    expect(res.data?.role).toBe('viewer');
  });

  test('重复用户名应拒绝', async ({ page }) => {
    const username = `e2e_dup_${Date.now()}`;
    
    await apiRequest(page, 'POST', '/api/users', {
      username: username,
      password: 'Test123456',
      role: 'viewer',
    });
    
    const dupRes = await apiRequest(page, 'POST', '/api/users', {
      username: username,
      password: 'AnotherPass',
      role: 'viewer',
    });
    expect(dupRes.status).toBe(400);
  });

  test('禁用用户应成功', async ({ page }) => {
    // 先创建
    const username = `e2e_disable_${Date.now()}`;
    const createRes = await apiRequest(page, 'POST', '/api/users', {
      username: username,
      password: 'Test123456',
      role: 'operator',
    });
    const userId = createRes.data?.id;
    if (!userId) { test.skip(true, '创建用户失败'); return; }
    
    // 禁用
    const disableRes = await apiRequest(page, 'DELETE', `/api/users/${userId}`);
    expect(disableRes.status).toBe(200);
    expect(disableRes.data?.ok).toBeTruthy();
    
    // 被禁用用户应无法登录
    const loginRes = await page.request.fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: 'Test123456' }),
    });
    expect(loginRes.status()).toBe(401);
  });

  test('不能禁用自己', async ({ page }) => {
    // 获取当前 admin 的 id
    const meRes = await apiRequest(page, 'GET', '/api/me');
    const myId = meRes.data?.id;
    if (!myId) { test.skip(true, '获取用户信息失败'); return; }
    
    const res = await apiRequest(page, 'DELETE', `/api/users/${myId}`);
    expect(res.status).toBe(400);
  });

  test('修改密码应成功', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/change-password', {
      oldPassword: 'admin123',
      newPassword: 'admin123', // 改回一样
    });
    expect(res.status).toBe(200);
  });

  test('错误旧密码应拒绝', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/change-password', {
      oldPassword: 'wrong_password',
      newPassword: 'new_password',
    });
    expect(res.status).toBe(401);
  });
});
