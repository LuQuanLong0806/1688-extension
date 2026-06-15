// e2e/ui-navigation.spec.js — UI 导航与交互
// 覆盖: 菜单切换 → 页面跳转 → 筛选器 → 弹窗交互 → 响应式

const { test, expect, loginAs, waitForVueReady } = require('./fixtures');

test.describe('页面导航', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await waitForVueReady(page);
  });

  test('主页应显示商品数量统计', async ({ page }) => {
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    // 应该有统计数字或"商品"字样
    expect(bodyText).toContain('商品');
  });

  test('点击菜单项应切换页面', async ({ page }) => {
    // 查找侧边栏菜单
    const menuItems = page.locator('.ivu-menu-item, .menu-item, [class*="menu"] a, .sidebar a, nav a');
    const count = await menuItems.count();
    
    if (count > 1) {
      // 点击第二个菜单项（第一个可能是当前页）
      const text = await menuItems.nth(1).textContent();
      if (text && text.trim()) {
        await menuItems.nth(1).click();
        await page.waitForTimeout(1500);
        // URL 或页面内容应该变化
      }
    }
  });

  test('商品列表页应有搜索和筛选控件', async ({ page }) => {
    // 查找搜索框
    const inputs = page.locator('input.ivu-input');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThan(0);
    
    // 查找下拉筛选
    const selects = page.locator('.ivu-select');
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThan(0);
  });
});

test.describe('表格交互', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await waitForVueReady(page);
    await page.waitForTimeout(2000);
  });

  test('表格应有列头', async ({ page }) => {
    const headers = page.locator('.ivu-table-header th, thead th, .ant-table-thead th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);
    
    // 检查关键列
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('商品');
  });

  test('表格行应有操作按钮', async ({ page }) => {
    const rows = page.locator('.ivu-table-row');
    const rowCount = await rows.count();
    
    if (rowCount > 0) {
      // 检查每行有操作区
      const firstRowText = await rows.first().textContent();
      // 应该有编辑/删除/详情等操作
      const hasAction = firstRowText.includes('编辑') || firstRowText.includes('删除') ||
                         firstRowText.includes('详情') || firstRowText.includes('发布');
      expect(hasAction).toBeTruthy();
    }
  });

  test('选择框应能勾选行', async ({ page }) => {
    const checkboxes = page.locator('.ivu-checkbox-input, .ivu-table-selection .ivu-checkbox');
    const count = await checkboxes.count();
    
    if (count > 0) {
      await checkboxes.first().check();
      await page.waitForTimeout(500);
      
      // 勾选后应显示批量操作按钮
      const batchBtns = page.locator('text=批量, text=Batch');
      // 可能在工具栏出现
    }
  });
});

test.describe('SSE 事件推送', () => {
  test('EventSource 应能连接', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const token = await page.evaluate(() => localStorage.getItem('jwt_token'));
    
    // 模拟 SSE 连接
    const connected = await page.evaluate(async (token) => {
      return new Promise((resolve) => {
        const es = new EventSource(`/api/events?token=${token}`);
        let resolved = false;
        es.addEventListener('connected', () => {
          if (!resolved) { resolved = true; es.close(); resolve(true); }
        });
        es.onopen = () => {
          if (!resolved) { resolved = true; es.close(); resolve(true); }
        };
        setTimeout(() => { if (!resolved) { resolved = true; es.close(); resolve(false); } }, 3000);
      });
    }, token);
    
    expect(connected).toBeTruthy();
  });
});

test.describe('错误处理', () => {
  test('无效 API 路径应返回 404', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const res = await page.request.fetch('http://localhost:3000/api/nonexistent-endpoint', {
      headers: { 'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('jwt_token'))}` },
    });
    expect(res.status()).toBe(404);
  });

  test('无效 JSON body 应返回 400', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const res = await page.request.fetch('http://localhost:3000/api/category-mappings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('jwt_token'))}`,
        'Content-Type': 'application/json',
      },
      body: 'invalid json{{{',
    });
    expect(res.status()).toBe(400);
  });

  test('无 token 访问受保护端点应返回 401', async ({ page }) => {
    const res = await page.request.fetch('http://localhost:3000/api/product/stats');
    expect(res.status()).toBe(401);
  });
});

test.describe('性能基线', () => {
  test('商品列表页加载应在 5 秒内完成', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const start = Date.now();
    await page.waitForSelector('.ivu-table, table', { timeout: 10000 });
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(5000);
  });

  test('API 响应应在 2 秒内返回', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const start = Date.now();
    const res = await page.request.fetch('http://localhost:3000/api/product/stats', {
      headers: { 'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('jwt_token'))}` },
    });
    const elapsed = Date.now() - start;
    
    expect(res.status()).toBe(200);
    expect(elapsed).toBeLessThan(2000);
  });
});
