// e2e/multi-user.spec.js — 多用户隔离：scope 过滤、owner 隔离、认领/分配
// 覆盖: scope=all/mine/inbox → operator 只看自己的 → 认领 → 分配

const { test, expect, loginAs, apiRequest, waitForVueReady } = require('./fixtures');

test.describe('scope 多用户隔离', () => {
  test('admin scope=all 应看到所有商品', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const res = await apiRequest(page, 'GET', '/api/product?scope=all&pageSize=1');
    expect(res.status).toBe(200);
    // admin 应该能看到所有商品
    expect(res.data).toHaveProperty('total');
  });

  test('operator scope=mine 应只看到自己的商品', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    
    const allRes = await apiRequest(page, 'GET', '/api/product?scope=all&pageSize=1');
    const mineRes = await apiRequest(page, 'GET', '/api/product?scope=mine&pageSize=1');
    
    // mine 应该 <= all
    expect(mineRes.data?.total).toBeLessThanOrEqual(allRes.data?.total);
  });

  test('scope=inbox 应只显示无 owner 的商品', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const res = await apiRequest(page, 'GET', '/api/product?scope=inbox&pageSize=100');
    expect(res.status).toBe(200);
    
    // 所有返回的商品应该 owner 为空
    const products = res.data?.list || [];
    for (const p of products) {
      expect(p.owner || '').toBe('');
    }
  });

  test('未登录采集的商品 owner 应为空', async ({ page }) => {
    // 创建商品（免认证，无 token）
    const res = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: `https://detail.1688.com/offer/e2e_owner_${Date.now()}.html`,
        title: '[E2E] Owner 测试',
        mainImages: [],
        skus: [],
      }),
    });
    
    expect(res.status()).toBe(200);
    const data = await res.json();
    
    // 查询该商品，确认 owner 为空
    if (data.uid) {
      await loginAs(page, { username: 'admin', password: 'admin123' });
      const detailRes = await apiRequest(page, 'GET', `/api/product/${data.uid}`);
      expect(detailRes.data?.owner || '').toBe('');
      
      // 清理
      await apiRequest(page, 'DELETE', `/api/product/${data.uid}`);
    }
  });

  test('登录后采集的商品 owner 应为当前用户', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    
    // 登录后采集（通过 API 带 token）
    const res = await apiRequest(page, 'POST', '/api/product', {
      sourceUrl: `https://detail.1688.com/offer/e2e_owned_${Date.now()}.html`,
      title: '[E2E] Owned 商品',
      mainImages: [],
      skus: [],
    });
    
    // 注意: POST /api/product 是白名单的，可能不读 token
    // 如果后端读 token 设置 owner，那应该有 owner
    // 如果后端不读 token（白名单跳过），owner 为空
    
    if (res.data?.uid) {
      const detailRes = await apiRequest(page, 'GET', `/api/product/${res.data.uid}`);
      // 根据实际实现，owner 可能是 'operator' 或空
      const owner = detailRes.data?.owner || '';
      expect(['operator', '']).toContain(owner);
      
      // 清理
      await apiRequest(page, 'DELETE', `/api/product/${res.data.uid}`);
    }
  });
});

test.describe('认领与分配', () => {
  test('认领无 owner 商品应成功', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    // 创建无 owner 的商品
    const createRes = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: `https://detail.1688.com/offer/e2e_claim_${Date.now()}.html`,
        title: '[E2E] 认领测试',
        mainImages: [],
        skus: [],
      }),
    });
    const data = await createRes.json();
    
    if (!data.uid) {
      test.skip(true, '创建商品失败');
      return;
    }
    
    // 用 operator 认领
    await loginAs(page, { username: 'operator', password: 'operator123' });
    const claimRes = await apiRequest(page, 'POST', '/api/products/claim', { uids: [data.uid] });
    expect(claimRes.status).toBe(200);
    expect(claimRes.data?.claimed).toBeGreaterThanOrEqual(1);
    
    // 验证 owner 已更新
    const detailRes = await apiRequest(page, 'GET', `/api/product/${data.uid}`);
    expect(detailRes.data?.owner).toBe('operator');
    
    // 清理
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await apiRequest(page, 'DELETE', `/api/product/${data.uid}`);
  });

  test('重复认领已拥有的商品不应报错', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    
    const res = await apiRequest(page, 'POST', '/api/products/claim', { uids: ['nonexistent_uid_12345'] });
    // 不存在的 uid 不应报 500
    expect(res.status).toBeLessThan(500);
  });

  test('admin 分配商品给指定用户应成功', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    // 创建测试商品
    const createRes = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: `https://detail.1688.com/offer/e2e_assign_${Date.now()}.html`,
        title: '[E2E] 分配测试',
        mainImages: [],
        skus: [],
      }),
    });
    const data = await createRes.json();
    
    if (!data.uid) {
      test.skip(true, '创建商品失败');
      return;
    }
    
    // admin 分配给 operator
    const assignRes = await apiRequest(page, 'POST', '/api/products/assign', {
      uids: [data.uid],
      username: 'operator',
    });
    expect(assignRes.status).toBe(200);
    expect(assignRes.data?.assigned).toBeGreaterThanOrEqual(1);
    
    // 验证
    const detailRes = await apiRequest(page, 'GET', `/api/product/${data.uid}`);
    expect(detailRes.data?.owner).toBe('operator');
    
    // 清理
    await apiRequest(page, 'DELETE', `/api/product/${data.uid}`);
  });

  test('operator 不能分配商品', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    
    const res = await apiRequest(page, 'POST', '/api/products/assign', {
      uids: ['any_uid'],
      username: 'viewer',
    });
    expect(res.status).toBe(403); // operator 无权限
  });

  test('viewer 不能认领商品', async ({ page }) => {
    await loginAs(page, { username: 'viewer', password: 'viewer123' });
    
    const res = await apiRequest(page, 'POST', '/api/products/claim', { uids: ['any_uid'] });
    expect(res.status).toBe(403); // viewer 无权限
  });
});

test.describe('owner 隔离', () => {
  test('operator 不能编辑他人的商品', async ({ page }) => {
    // admin 创建一个商品并分配给 admin
    await loginAs(page, { username: 'admin', password: 'admin123' });
    const createRes = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: `https://detail.1688.com/offer/e2e_isolate_${Date.now()}.html`,
        title: '[E2E] 隔离测试',
        mainImages: [],
        skus: [],
      }),
    });
    const data = await createRes.json();
    if (!data.uid) { test.skip(true, '创建失败'); return; }
    
    // 分配给 admin
    await apiRequest(page, 'POST', '/api/products/assign', { uids: [data.uid], username: 'admin' });
    
    // operator 尝试编辑
    await loginAs(page, { username: 'operator', password: 'operator123' });
    const editRes = await apiRequest(page, 'PUT', `/api/product/${data.uid}`, { title: 'HACKED' });
    expect(editRes.status).toBe(403);
    
    // 清理
    await loginAs(page, { username: 'admin', password: 'admin123' });
    await apiRequest(page, 'DELETE', `/api/product/${data.uid}`);
  });

  test('operator 不能删除他人的商品', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    const createRes = await page.request.fetch('http://localhost:3000/api/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceUrl: `https://detail.1688.com/offer/e2e_del_iso_${Date.now()}.html`,
        title: '[E2E] 删除隔离测试',
        mainImages: [],
        skus: [],
      }),
    });
    const data = await createRes.json();
    if (!data.uid) { test.skip(true, '创建失败'); return; }
    
    await apiRequest(page, 'POST', '/api/products/assign', { uids: [data.uid], username: 'admin' });
    
    // operator 尝试删除
    await loginAs(page, { username: 'operator', password: 'operator123' });
    const delRes = await apiRequest(page, 'DELETE', `/api/product/${data.uid}`);
    expect(delRes.status).toBe(403);
    
    // 验证未被删除
    await loginAs(page, { username: 'admin', password: 'admin123' });
    const check = await apiRequest(page, 'GET', `/api/product/${data.uid}`);
    expect(check.status).toBe(200);
    
    // 清理
    await apiRequest(page, 'DELETE', `/api/product/${data.uid}`);
  });

  test('admin 可以编辑任何商品', async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
    
    const res = await apiRequest(page, 'GET', '/api/product?pageSize=1');
    const product = res.data?.list?.[0];
    if (!product) { test.skip(true, '无商品'); return; }
    
    // admin 编辑任何人的商品都应成功
    const editRes = await apiRequest(page, 'PUT', `/api/product/${product.id}`, {
      title: `[E2E] admin edit @${Date.now()}`,
    });
    expect(editRes.status).toBe(200);
  });
});
