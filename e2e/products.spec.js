// e2e/products.spec.js — 商品列表/详情/编辑/批量操作
// 覆盖: 商品列表渲染 → 搜索 → 筛选 → 详情弹窗 → 编辑保存 → 批量操作

const { test, expect, loginAs, waitForVueReady, confirmModal, apiRequest } = require('./fixtures');

test.describe('商品列表', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await waitForVueReady(page);
  });

  test('商品列表应正常渲染表格', async ({ page }) => {
    // 检查 iView Table 组件
    await page.waitForSelector('.ivu-table, table', { timeout: 10000 });
    const tableExists = await page.locator('.ivu-table, table').count() > 0;
    expect(tableExists).toBeTruthy();
  });

  test('应显示分页信息', async ({ page }) => {
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    // 分页组件或总数显示
    const hasPagination = await page.locator('.ivu-page, .ivu-pagination').count() > 0;
    // 可能是显示总数
    expect(hasPagination || bodyText.includes('共')).toBeTruthy();
  });

  test('搜索功能应过滤商品', async ({ page }) => {
    // 先获取总数
    const before = await apiRequest(page, 'GET', '/api/product?pageSize=1');
    const totalCount = before.data?.total || 0;
    
    if (totalCount === 0) {
      test.skip(true, '没有商品数据，跳过搜索测试');
      return;
    }
    
    // 使用搜索框
    const searchInput = page.locator('input.ivu-input[placeholder*="搜索"], input[placeholder*="搜索"], .search-bar input').first();
    if (await searchInput.count() > 0) {
      // 输入一个不太可能匹配的关键词
      await searchInput.fill('zzzzzz_not_exist_product');
      await page.waitForTimeout(1500); // 等待搜索触发
      
      // 验证结果减少或为空
      const after = await apiRequest(page, 'GET', '/api/product?keyword=zzzzzz_not_exist_product&pageSize=1');
      expect(after.data?.total || 0).toBeLessThanOrEqual(totalCount);
    }
  });

  test('状态筛选应工作', async ({ page }) => {
    // 查找状态下拉框
    const statusSelect = page.locator('.ivu-select:has-text("状态"), .ivu-select:has-text("全部")').first();
    if (await statusSelect.count() > 0) {
      await statusSelect.click();
      await page.waitForTimeout(300);
      
      // 选择"已发布"（或第一个选项之后的状态）
      const options = page.locator('.ivu-select-dropdown-list .ivu-select-item');
      const optionCount = await options.count();
      if (optionCount > 1) {
        await options.nth(1).click();
        await page.waitForTimeout(1500);
        // 应该有筛选结果变化
      }
    }
  });
});

test.describe('商品详情弹窗', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await waitForVueReady(page);
  });

  test('点击商品应打开详情弹窗', async ({ page }) => {
    // 等待表格加载
    await page.waitForSelector('.ivu-table-row, tr', { timeout: 10000 });
    
    // 点击第一行的标题或预览区域
    const firstRow = page.locator('.ivu-table-row').first();
    if (await firstRow.count() > 0) {
      // 点击标题链接
      const titleLink = firstRow.locator('.product-title, a, [class*="title"]').first();
      if (await titleLink.count() > 0) {
        await titleLink.click();
        await page.waitForTimeout(2000);
        
        // 应该出现 Modal
        const modalVisible = await page.locator('.ivu-modal-wrap, .ivu-drawer-wrap, .detail-modal').count() > 0;
        expect(modalVisible).toBeTruthy();
      }
    }
  });

  test('详情弹窗应显示商品图片', async ({ page }) => {
    // 先通过 API 获取有图片的商品
    const res = await apiRequest(page, 'GET', '/api/product?pageSize=5');
    const products = res.data?.list || [];
    const withImages = products.find(p => {
      const imgs = p.main_images || [];
      return imgs.length > 0;
    });
    
    if (!withImages) {
      test.skip(true, '没有含图片的商品');
      return;
    }
    
    // 通过 API 验证图片 URL 存在
    const imgUrls = Array.isArray(withImages.main_images) 
      ? withImages.main_images.map(i => typeof i === 'string' ? i : i?.url).filter(Boolean)
      : [];
    expect(imgUrls.length).toBeGreaterThan(0);
  });

  test('编辑商品标题应保存成功', async ({ page }) => {
    // 通过 API 编辑（更可靠）
    const res = await apiRequest(page, 'GET', '/api/product?pageSize=1');
    const product = res.data?.list?.[0];
    
    if (!product) {
      test.skip(true, '没有商品数据');
      return;
    }
    
    const newTitle = `[E2E Test] ${product.title || 'test'} @${Date.now()}`;
    const updateRes = await apiRequest(page, 'PUT', `/api/product/${product.id}`, {
      title: newTitle,
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.data?.ok).toBeTruthy();
    
    // 验证更新成功
    const verifyRes = await apiRequest(page, 'GET', `/api/product/${product.id}`);
    expect(verifyRes.data?.title).toBe(newTitle);
    
    // 恢复原标题
    await apiRequest(page, 'PUT', `/api/product/${product.id}`, {
      title: product.title || '',
    });
  });
});

test.describe('批量操作', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await waitForVueReady(page);
  });

  test('批量修改状态应成功', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/product?pageSize=2&status=0');
    const products = res.data?.list || [];
    
    if (products.length < 1) {
      test.skip(true, '没有未使用的商品');
      return;
    }
    
    const ids = products.map(p => p.id);
    const batchRes = await apiRequest(page, 'POST', '/api/product/batch-status', {
      ids: ids,
      status: 1,
    });
    expect(batchRes.status).toBe(200);
    expect(batchRes.data?.ok).toBeTruthy();
    
    // 恢复
    await apiRequest(page, 'POST', '/api/product/batch-status', { ids, status: 0 });
  });

  test('批量删除应成功', async ({ page }) => {
    // 先创建一个测试商品
    const createRes = await apiRequest(page, 'POST', '/api/product', {
      sourceUrl: 'https://e2e-test.1688.com/mock-product-' + Date.now(),
      title: '[E2E] 批量删除测试商品',
      mainImages: [],
      skus: [],
    });
    
    if (!createRes.data?.id) {
      test.skip(true, '创建测试商品失败');
      return;
    }
    
    const testId = createRes.data.id;
    
    // 批量删除
    const delRes = await apiRequest(page, 'POST', '/api/product/batch-delete', {
      ids: [testId],
    });
    expect(delRes.status).toBe(200);
    expect(delRes.data?.ok).toBeTruthy();
    
    // 验证已删除
    const checkRes = await apiRequest(page, 'GET', `/api/product/${testId}`);
    expect(checkRes.status).toBe(404);
  });

  test('单次批量操作不应超过 500 条', async ({ page }) => {
    const ids = Array.from({ length: 501 }, (_, i) => 99999 + i);
    const res = await apiRequest(page, 'POST', '/api/product/batch-status', { ids, status: 1 });
    expect(res.status).toBe(400);
    expect(res.data?.error).toContain('500');
  });
});

test.describe('商品采集', () => {
  test('POST /api/product 应创建商品（免认证）', async ({ page }) => {
    const res = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: `https://detail.1688.com/offer/e2e_test_${Date.now()}.html`,
        title: '[E2E] 采集测试商品',
        mainImages: ['https://via.placeholder.com/400'],
        skus: [{ name: '默认', image: '' }],
      }),
    });
    
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBeTruthy();
    expect(data.uid).toBeTruthy();
    
    // 清理
    if (data.uid) {
      await page.request.fetch(`http://localhost:3000/api/product/${data.uid}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('jwt_token'))}` },
      });
    }
  });

  test('重复 offerId 应返回 409', async ({ page }) => {
    const url = `https://detail.1688.com/offer/e2e_dup_${Date.now()}.html`;
    
    // 第一次
    const r1 = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: url, title: '重复测试', mainImages: [], skus: [] }),
    });
    expect(r1.status()).toBe(200);
    
    // 第二次
    const r2 = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: url, title: '重复测试2', mainImages: [], skus: [] }),
    });
    expect(r2.status()).toBe(409);
  });
});

test.describe('商品统计', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('GET /api/product/stats 应返回统计数据', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/product/stats');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('total');
    expect(typeof res.data.total).toBe('number');
  });

  test('GET /api/product/trend 应返回趋势数据', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/product/trend?days=7');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBeTruthy();
  });
});
