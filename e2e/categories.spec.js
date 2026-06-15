// e2e/categories.spec.js — 分类管理：映射 CRUD、DXM 分类树、词库管理
// 覆盖: 分类映射查看/新增/删除 → DXM 树搜索 → 词库管理

const { test, expect, loginAs, apiRequest } = require('./fixtures');

test.describe('分类映射', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('GET /api/category-mappings/grouped 应返回分组列表', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/category-mappings/grouped');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('list');
    expect(res.data).toHaveProperty('total');
    expect(Array.isArray(res.data.list)).toBeTruthy();
  });

  test('新增分类映射应成功', async ({ page }) => {
    const uniqueCategory = `[E2E] 1688类目_${Date.now()}`;
    const uniqueCustom = `[E2E] DXM类目_${Date.now()}`;
    
    const res = await apiRequest(page, 'POST', '/api/category-mappings', {
      categoryName: uniqueCategory,
      customCategory: uniqueCustom,
    });
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBeTruthy();
    
    // 验证
    const verify = await apiRequest(page, 'GET', `/api/category-mappings/by-name?name=${encodeURIComponent(uniqueCategory)}`);
    expect(verify.data.length).toBeGreaterThan(0);
    expect(verify.data[0].customCategory).toBe(uniqueCustom);
    
    // 清理
    const mappingId = verify.data[0].id;
    await apiRequest(page, 'DELETE', `/api/category-mappings/${mappingId}`);
  });

  test('重复新增映射应跳过（不报错）', async ({ page }) => {
    const category = `[E2E] 重复_${Date.now()}`;
    const custom = `[E2E] 重复DXM_${Date.now()}`;
    
    const r1 = await apiRequest(page, 'POST', '/api/category-mappings', { categoryName: category, customCategory: custom });
    expect(r1.status).toBe(200);
    
    const r2 = await apiRequest(page, 'POST', '/api/category-mappings', { categoryName: category, customCategory: custom });
    expect(r2.status).toBe(200);
    
    // 清理
    const verify = await apiRequest(page, 'GET', `/api/category-mappings/by-name?name=${encodeURIComponent(category)}`);
    if (verify.data?.[0]?.id) {
      await apiRequest(page, 'DELETE', `/api/category-mappings/${verify.data[0].id}`);
    }
  });

  test('删除分类映射应成功', async ({ page }) => {
    // 先创建
    const category = `[E2E] 删除测试_${Date.now()}`;
    const custom = `[E2E] 删除DXM_${Date.now()}`;
    await apiRequest(page, 'POST', '/api/category-mappings', { categoryName: category, customCategory: custom });
    
    const verify = await apiRequest(page, 'GET', `/api/category-mappings/by-name?name=${encodeURIComponent(category)}`);
    const id = verify.data?.[0]?.id;
    if (!id) { test.skip(true, '创建失败'); return; }
    
    // 删除
    const delRes = await apiRequest(page, 'DELETE', `/api/category-mappings/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data?.ok).toBeTruthy();
    
    // 验证已删除
    const after = await apiRequest(page, 'GET', `/api/category-mappings/by-name?name=${encodeURIComponent(category)}`);
    expect(after.data?.length).toBe(0);
  });

  test('搜索映射应返回匹配结果', async ({ page }) => {
    // 先创建一个映射
    const keyword = `E2E_SEARCH_${Date.now()}`;
    await apiRequest(page, 'POST', '/api/category-mappings', {
      categoryName: keyword,
      customCategory: keyword,
    });
    
    const res = await apiRequest(page, 'GET', `/api/category-mappings?keyword=${keyword}`);
    expect(res.data.length).toBeGreaterThan(0);
    
    // 清理
    if (res.data?.[0]?.id) {
      await apiRequest(page, 'DELETE', `/api/category-mappings/${res.data[0].id}`);
    }
  });
});

test.describe('DXM 分类树', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('GET /api/dxm-tree/status 应返回状态', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/dxm-tree/status');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('total');
  });

  test('GET /api/dxm-tree/search 应返回叶子节点', async ({ page }) => {
    // 如果树为空，先插入一条
    await apiRequest(page, 'POST', '/api/dxm-category/collect', {
      path: '家居/厨房/餐具',
      leafName: '餐具',
    });
    
    const res = await apiRequest(page, 'GET', '/api/dxm-tree/search?keyword=餐具');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBeTruthy();
  });

  test('搜索不存在的分类应返回空', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/dxm-tree/search?keyword=zzz_not_exist');
    expect(res.data.length).toBe(0);
  });

  test('POST /api/dxm-tree/sync 批量同步应成功', async ({ page }) => {
    const res = await apiRequest(page, 'POST', '/api/dxm-tree/sync', {
      categories: [
        { catId: 100001, catName: '测试类目', parentCatId: 0, catLevel: 1, isLeaf: 1, path: '测试类目' },
        { catId: 100002, catName: '子类目', parentCatId: 100001, catLevel: 2, isLeaf: 0, path: '测试类目/子类目' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data?.saved).toBe(2);
  });
});

test.describe('关键词管理', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, { username: 'admin', password: 'admin123' });
  });

  test('GET /api/keyword-rels 应返回关联列表', async ({ page }) => {
    const res = await apiRequest(page, 'GET', '/api/keyword-rels');
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('list');
    expect(res.data).toHaveProperty('total');
  });

  test('新增同义词应成功', async ({ page }) => {
    const wordA = `e2e_syn_a_${Date.now()}`;
    const wordB = `e2e_syn_b_${Date.now()}`;
    
    const res = await apiRequest(page, 'POST', '/api/keyword-synonyms', { wordA, wordB });
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBeTruthy();
    
    // 验证
    const verify = await apiRequest(page, 'GET', `/api/keyword-synonyms?keyword=${wordA}`);
    expect(verify.data.length).toBeGreaterThan(0);
  });

  test('新增黑名单应成功', async ({ page }) => {
    const keyword = `e2e_bl_${Date.now()}`;
    
    const res = await apiRequest(page, 'POST', '/api/keyword-blacklist', {
      keyword: keyword,
      categoryName: 'E2E 测试类目',
      reason: 'E2E 自动测试',
    });
    expect(res.status).toBe(200);
    expect(res.data?.ok).toBeTruthy();
  });

  test('viewer 不能写分类映射', async ({ page }) => {
    await loginAs(page, { username: 'viewer', password: 'viewer123' });
    
    const res = await apiRequest(page, 'POST', '/api/category-mappings', {
      categoryName: 'hacked',
      customCategory: 'hacked',
    });
    expect(res.status).toBe(403);
  });

  test('operator 可以写分类映射', async ({ page }) => {
    await loginAs(page, { username: 'operator', password: 'operator123' });
    
    const res = await apiRequest(page, 'POST', '/api/category-mappings', {
      categoryName: `[E2E] operator_write_${Date.now()}`,
      customCategory: `[E2E] operator_dxm_${Date.now()}`,
    });
    expect(res.status).toBe(200);
    
    // 清理
    const verify = await apiRequest(page, 'GET', `/api/category-mappings?keyword=operator_write`);
    if (verify.data?.[0]?.id) {
      await apiRequest(page, 'DELETE', `/api/category-mappings/${verify.data[0].id}`);
    }
  });
});
