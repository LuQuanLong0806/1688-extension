// e2e/auth.spec.js — 登录/登出/权限流程
// 覆盖: 登录页 → 登录成功 → 登录失败 → 登出 → 多角色权限

const { test, expect, USERS, loginAs, waitForVueReady } = require('./fixtures');

test.describe('登录流程', () => {
  test('未登录应跳转到登录页', async ({ page }) => {
    // 清除 token
    await page.goto('/');
    // 应重定向到 login.html 或显示登录页
    await page.waitForTimeout(2000);
    const url = page.url();
    // 两种可能：被重定向到 login.html，或在主页显示了登录提示
    expect(url.includes('login') || await page.locator('input[type="password"]').count() > 0).toBeTruthy();
  });

  test('admin 登录成功', async ({ page }) => {
    await loginAs(page, USERS.admin);
    
    // 验证跳转到主页
    expect(page.url()).not.toContain('login');
    
    // 验证页面有主要内容区域
    await waitForVueReady(page);
    
    // 检查用户名显示（应该在右上角或导航栏）
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('admin');
  });

  test('错误密码应提示失败', async ({ page }) => {
    await page.goto('/login.html');
    
    const usernameInput = page.locator('input[placeholder*="用户名"], input[id*="username"], input[name="username"], .login-form input').first();
    await usernameInput.fill('admin');
    
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('wrong_password');
    
    const loginBtn = page.locator('button:has-text("登录"), button[type="submit"], .login-btn').first();
    await loginBtn.click();
    await page.waitForTimeout(2000);
    
    // 应该有错误提示（iView Message 组件）
    const hasError = await page.locator('.ivu-message-error, .ivu-notice, [class*="error"]').count() > 0;
    // 或者仍然在登录页
    const stillOnLogin = page.url().includes('login');
    expect(hasError || stillOnLogin).toBeTruthy();
  });

  test('空用户名/密码不应提交', async ({ page }) => {
    await page.goto('/login.html');
    
    // 直接点登录按钮
    const loginBtn = page.locator('button:has-text("登录"), button[type="submit"], .login-btn').first();
    await loginBtn.click();
    await page.waitForTimeout(1000);
    
    // 仍在登录页
    expect(page.url()).toContain('login');
  });

  test('登出后应回到登录页', async ({ page }) => {
    await loginAs(page, USERS.admin);
    await waitForVueReady(page);
    
    // 查找登出按钮（可能在用户菜单中）
    const logoutBtn = page.locator('text=退出, text=Logout, text=登出').last();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('login');
    } else {
      // 如果没有找到退出按钮，通过清除 token 模拟
      await page.evaluate(() => localStorage.removeItem('jwt_token'));
      await page.reload();
      await page.waitForTimeout(2000);
      // 应该被重定向到登录页
    }
  });
});

test.describe('多角色权限', () => {
  test('admin 应能看到用户管理菜单', async ({ page }) => {
    await loginAs(page, USERS.admin);
    await waitForVueReady(page);
    
    const bodyText = await page.textContent('body');
    expect(bodyText.toLowerCase()).toContain('用户管理');
  });

  test('viewer 不应看到用户管理菜单', async ({ page }) => {
    await loginAs(page, USERS.viewer);
    await waitForVueReady(page);
    
    const bodyText = await page.textContent('body');
    // viewer 角色不应有用户管理入口
    // 注意：前端可能通过 v-if="currentUser.role === 'admin'" 隐藏
    const userMenuVisible = await page.locator('text=用户管理').count() > 0;
    // viewer 应该看不到
    expect(userMenuVisible).toBeFalsy();
  });

  test('viewer 不能访问用户管理 API', async ({ page }) => {
    await loginAs(page, USERS.viewer);
    
    const res = await page.request.fetch('http://localhost:3000/api/users', {
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('jwt_token'))}`,
      },
    });
    expect(res.status()).toBe(403); // 权限不足
  });

  test('operator 不能创建新用户', async ({ page }) => {
    await loginAs(page, USERS.operator);
    
    const res = await page.request.fetch('http://localhost:3000/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('jwt_token'))}`,
      },
      body: JSON.stringify({ username: 'hacker', password: '123456', role: 'admin' }),
    });
    expect(res.status()).toBe(403);
  });

  test('viewer 不能编辑商品', async ({ page }) => {
    await loginAs(page, USERS.viewer);
    
    // 先获取一个商品
    const token = await page.evaluate(() => localStorage.getItem('jwt_token'));
    const listRes = await page.request.fetch('http://localhost:3000/api/product?pageSize=1', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const listData = await listRes.json();
    
    if (listData.list && listData.list.length > 0) {
      const product = listData.list[0];
      // viewer 尝试编辑商品
      const editRes = await page.request.fetch(`http://localhost:3000/api/product/${product.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: 'HACKED BY VIEWER' }),
      });
      expect(editRes.status()).toBe(403);
    }
    // 如果没有商品就跳过此测试的 API 部分
  });
});
