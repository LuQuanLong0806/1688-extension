// sync-and-crud.test.js — 云同步 + 词库CRUD 全量测试
const { initTestDb, createTestApp, createMockCloudDb, run, getOne, getAll } = require('../../__tests__/helpers/setup');
const request = require('supertest');

let app, cloudDb;

beforeAll(async () => {
  await initTestDb();
  const result = createTestApp();
  app = result.app;
  cloudDb = result.cloudDb;
});

// ===== 词库管理 CRUD =====

describe('词库管理 — category-config (过滤词/泛词/互斥组)', () => {
  beforeEach(() => {
    // 清空表
    run('DELETE FROM category_config');
    // mock: saveCategoryConfig 实际写入本地
    cloudDb.saveCategoryConfig.mockImplementation(async (type, value, groupName, desc, sortOrder) => {
      const existing = getOne('SELECT id FROM category_config WHERE type = ? AND value = ? AND group_name = ? AND deleted = 1', [type, value, groupName || '']);
      if (existing) {
        run('UPDATE category_config SET description = ?, sort_order = ?, deleted = 0 WHERE id = ?', [desc || '', sortOrder || 0, existing.id]);
      } else {
        run('INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted) VALUES (?, ?, ?, ?, ?, 0)', [type, value, groupName || '', desc || '', sortOrder || 0]);
      }
    });
    cloudDb.deleteCategoryConfig.mockImplementation(async (id) => {
      run('UPDATE category_config SET deleted = 1 WHERE id = ?', [id]);
    });
    cloudDb.getCategoryConfig.mockImplementation(async (type) => {
      return getAll('SELECT id, type, value, group_name, description, sort_order FROM category_config WHERE type = ? AND deleted = 0 ORDER BY sort_order, id', [type]);
    });
    cloudDb.getAllCategoryConfig.mockImplementation(async () => {
      return getAll('SELECT id, type, value, group_name, description, sort_order FROM category_config WHERE deleted = 0 ORDER BY type, sort_order, id');
    });
  });

  test('新增过滤词', async () => {
    const res = await request(app).post('/api/category-config').send({ type: 'noise', value: '爆款', description: '营销词' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = getOne('SELECT * FROM category_config WHERE type = \'noise\' AND value = \'爆款\'');
    expect(row).toBeTruthy();
    expect(row.deleted).toBe(0);
  });

  test('新增泛词', async () => {
    const res = await request(app).post('/api/category-config').send({ type: 'generic', value: '防水' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = getOne('SELECT * FROM category_config WHERE type = \'generic\' AND value = \'防水\'');
    expect(row).toBeTruthy();
  });

  test('新增互斥组词', async () => {
    const res = await request(app).post('/api/category-config').send({ type: 'mutex', value: '家居', group_name: '家居日用', description: '家居类' });
    expect(res.status).toBe(200);
    const row = getOne('SELECT * FROM category_config WHERE type = \'mutex\' AND value = \'家居\' AND group_name = \'家居日用\'');
    expect(row).toBeTruthy();
    expect(row.group_name).toBe('家居日用');
  });

  test('缺少type返回400', async () => {
    const res = await request(app).post('/api/category-config').send({ value: '测试' });
    expect(res.status).toBe(400);
  });

  test('缺少value返回400', async () => {
    const res = await request(app).post('/api/category-config').send({ type: 'noise' });
    expect(res.status).toBe(400);
  });

  test('重复添加同词覆盖不重复', async () => {
    await request(app).post('/api/category-config').send({ type: 'noise', value: '包邮', description: '第一版' });
    await request(app).post('/api/category-config').send({ type: 'noise', value: '包邮', description: '第二版' });
    const rows = getAll('SELECT * FROM category_config WHERE type = \'noise\' AND value = \'包邮\' AND deleted = 0');
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe('第二版');
  });

  test('软删除后重新添加会复活', async () => {
    await request(app).post('/api/category-config').send({ type: 'noise', value: '限时' });
    const row1 = getOne('SELECT * FROM category_config WHERE type = \'noise\' AND value = \'限时\'');
    expect(row1.deleted).toBe(0);
    // 软删除
    await request(app).delete('/api/category-config/' + row1.id);
    const row2 = getOne('SELECT * FROM category_config WHERE id = ?', [row1.id]);
    expect(row2.deleted).toBe(1);
    // 重新添加
    await request(app).post('/api/category-config').send({ type: 'noise', value: '限时', description: '复活' });
    const row3 = getOne('SELECT * FROM category_config WHERE type = \'noise\' AND value = \'限时\' AND deleted = 0');
    expect(row3).toBeTruthy();
    expect(row3.description).toBe('复活');
  });

  test('删除配置项', async () => {
    await request(app).post('/api/category-config').send({ type: 'noise', value: '秒杀' });
    const row = getOne('SELECT * FROM category_config WHERE type = \'noise\' AND value = \'秒杀\'');
    const res = await request(app).delete('/api/category-config/' + row.id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const deleted = getOne('SELECT * FROM category_config WHERE id = ?', [row.id]);
    expect(deleted.deleted).toBe(1);
  });

  test('批量删除', async () => {
    await request(app).post('/api/category-config').send({ type: 'noise', value: 'AA' });
    await request(app).post('/api/category-config').send({ type: 'noise', value: 'BB' });
    const rows = getAll('SELECT * FROM category_config WHERE type = \'noise\' AND value IN (\'AA\', \'BB\') AND deleted = 0');
    expect(rows.length).toBe(2);
    const res = await request(app).post('/api/category-config/batch-delete').send({ ids: rows.map(r => r.id) });
    expect(res.status).toBe(200);
    const remaining = getAll('SELECT * FROM category_config WHERE type = \'noise\' AND value IN (\'AA\', \'BB\') AND deleted = 0');
    expect(remaining.length).toBe(0);
  });

  test('查询过滤词列表', async () => {
    await request(app).post('/api/category-config').send({ type: 'noise', value: '热销' });
    await request(app).post('/api/category-config').send({ type: 'noise', value: '新款' });
    const res = await request(app).get('/api/category-config?type=noise');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.list.length).toBeGreaterThanOrEqual(2);
  });

  test('查询全部配置', async () => {
    await request(app).post('/api/category-config').send({ type: 'noise', value: '测试全部' });
    const res = await request(app).get('/api/category-config');
    expect(res.status).toBe(200);
    expect(res.body.list.length).toBeGreaterThanOrEqual(1);
  });
});

// ===== 黑名单 CRUD =====

describe('词库管理 — keyword-blacklist', () => {
  beforeEach(() => {
    run('DELETE FROM keyword_blacklist');
  });

  test('新增黑名单', async () => {
    const res = await request(app).post('/api/keyword-blacklist').send({ keyword: '工具', categoryName: '其他工具', reason: '误匹配' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = getOne('SELECT * FROM keyword_blacklist WHERE keyword = \'工具\' AND category_name = \'其他工具\'');
    expect(row).toBeTruthy();
  });

  test('缺少keyword返回400', async () => {
    const res = await request(app).post('/api/keyword-blacklist').send({ categoryName: '类目' });
    expect(res.status).toBe(400);
  });

  test('查询黑名单', async () => {
    run('INSERT INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['雨衣', '男装', '跨类', 3]);
    const res = await request(app).get('/api/keyword-blacklist');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('按关键词搜索黑名单', async () => {
    run('INSERT INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['搓澡', '五金', '不相关', 2]);
    const res = await request(app).get('/api/keyword-blacklist?keyword=搓澡');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].keyword).toBe('搓澡');
  });

  test('删除黑名单', async () => {
    run('INSERT INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['垃圾', '食品', '跨类', 1]);
    const row = getOne('SELECT * FROM keyword_blacklist WHERE keyword = \'垃圾\'');
    const res = await request(app).delete('/api/keyword-blacklist/' + row.id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const deleted = getOne('SELECT * FROM keyword_blacklist WHERE id = ?', [row.id]);
    expect(deleted).toBeNull();
  });

  test('重复插入不报错(IGNORE)', async () => {
    run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['重复', '类目', '', 1]);
    run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['重复', '类目', '', 1]);
    const rows = getAll('SELECT * FROM keyword_blacklist WHERE keyword = \'重复\' AND category_name = \'类目\'');
    expect(rows.length).toBe(1);
  });
});

// ===== 关联库 CRUD =====

describe('词库管理 — keyword-rels', () => {
  beforeEach(() => {
    run('DELETE FROM keyword_category_rel');
  });

  test('查询关联库列表', async () => {
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['雨衣', '户外雨衣', 2.5, 10, 1, 'auto']);
    const res = await request(app).get('/api/keyword-rels');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.list[0].keyword).toBe('雨衣');
    expect(res.body.list[0].weight).toBe(2.5);
  });

  test('按关键词搜索', async () => {
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['工具', '五金工具', 1.0, 5, 1, 'manual']);
    const res = await request(app).get('/api/keyword-rels?keyword=工具');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  test('作废关联(valid=0)', async () => {
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['灯', '台灯', 1.0, 3, 1, 'auto']);
    const row = getOne('SELECT * FROM keyword_category_rel WHERE keyword = \'灯\'');
    const res = await request(app).delete('/api/keyword-rels/' + row.id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const updated = getOne('SELECT * FROM keyword_category_rel WHERE id = ?', [row.id]);
    expect(updated.valid).toBe(0);
  });

  test('作废后不出现在列表中', async () => {
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['作废词', '类目', 1.0, 1, 0, 'auto']);
    const res = await request(app).get('/api/keyword-rels');
    const found = res.body.list.find(r => r.keyword === '作废词');
    expect(found).toBeUndefined();
  });

  test('批量作废', async () => {
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['批量1', '类目1', 1.0, 1, 1, 'auto']);
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['批量2', '类目2', 1.0, 1, 1, 'auto']);
    const rows = getAll('SELECT * FROM keyword_category_rel WHERE keyword IN (\'批量1\', \'批量2\') AND valid = 1');
    const res = await request(app).post('/api/keyword-rels/batch-invalidate').send({ ids: rows.map(r => r.id) });
    expect(res.status).toBe(200);
    const remaining = getAll('SELECT * FROM keyword_category_rel WHERE keyword IN (\'批量1\', \'批量2\') AND valid = 1');
    expect(remaining.length).toBe(0);
  });

  test('批量作废缺少ids返回400', async () => {
    const res = await request(app).post('/api/keyword-rels/batch-invalidate').send({});
    expect(res.status).toBe(400);
  });
});

// ===== 同义词 CRUD =====

describe('词库管理 — keyword-synonyms', () => {
  beforeEach(() => {
    run('DELETE FROM keyword_synonyms');
  });

  test('新增同义词', async () => {
    const res = await request(app).post('/api/keyword-synonyms').send({ wordA: '搓澡', wordB: '洗澡' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = getOne('SELECT * FROM keyword_synonyms WHERE word_a = \'搓澡\' AND word_b = \'洗澡\'');
    expect(row).toBeTruthy();
  });

  test('缺少参数返回400', async () => {
    const res = await request(app).post('/api/keyword-synonyms').send({ wordA: '测试' });
    expect(res.status).toBe(400);
  });

  test('重复插入不报错', async () => {
    run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', ['雨衣', '雨披']);
    run('INSERT OR IGNORE INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', ['雨衣', '雨披']);
    const rows = getAll('SELECT * FROM keyword_synonyms WHERE word_a = \'雨衣\' AND word_b = \'雨披\'');
    expect(rows.length).toBe(1);
  });

  test('查询同义词列表', async () => {
    run('INSERT INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', ['工具', '器具']);
    const res = await request(app).get('/api/keyword-synonyms');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('按关键词搜索同义词', async () => {
    run('INSERT INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', ['台灯', '电灯']);
    const res = await request(app).get('/api/keyword-synonyms?keyword=台灯');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('删除同义词', async () => {
    run('INSERT INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', ['删除测试', '测试']);
    const row = getOne('SELECT * FROM keyword_synonyms WHERE word_a = \'删除测试\'');
    const res = await request(app).delete('/api/keyword-synonyms/' + row.id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const deleted = getOne('SELECT * FROM keyword_synonyms WHERE id = ?', [row.id]);
    expect(deleted).toBeNull();
  });
});

// ===== 类目映射 CRUD =====

describe('类目映射 — category-mappings', () => {
  beforeEach(() => {
    run('DELETE FROM category_mappings');
  });

  test('新增映射', async () => {
    const res = await request(app).post('/api/category-mappings').send({ categoryName: '搓澡刷', customCategory: '洗浴用品' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const row = getOne('SELECT * FROM category_mappings WHERE category_name = \'搓澡刷\' AND custom_category = \'洗浴用品\'');
    expect(row).toBeTruthy();
    expect(row.source).toBe('manual');
  });

  test('缺少参数返回400', async () => {
    const res = await request(app).post('/api/category-mappings').send({ categoryName: '测试' });
    expect(res.status).toBe(400);
  });

  test('重复添加不创建新行', async () => {
    await request(app).post('/api/category-mappings').send({ categoryName: '雨衣', customCategory: '户外雨具' });
    await request(app).post('/api/category-mappings').send({ categoryName: '雨衣', customCategory: '户外雨具' });
    const rows = getAll('SELECT * FROM category_mappings WHERE category_name = \'雨衣\' AND custom_category = \'户外雨具\'');
    expect(rows.length).toBe(1);
  });

  test('查询映射列表', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['垃圾袋', '包装袋', 5, 'auto']);
    const res = await request(app).get('/api/category-mappings');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  test('按关键词搜索映射', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['台灯', '照明灯具', 3, 'manual']);
    const res = await request(app).get('/api/category-mappings?keyword=台灯');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  test('按1688类目名查询', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['帽子', '服饰配件', 2, 'auto']);
    const res = await request(app).get('/api/category-mappings/by-name?name=帽子');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].customCategory).toBe('服饰配件');
  });

  test('按DXM类目名查询', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['碗', '餐具', 1, 'auto']);
    const res = await request(app).get('/api/category-mappings/by-dxm?name=餐具');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].categoryName).toBe('碗');
  });

  test('删除映射', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['删除测试', '类目', 1, 'manual']);
    const row = getOne('SELECT * FROM category_mappings WHERE category_name = \'删除测试\'');
    const res = await request(app).delete('/api/category-mappings/' + row.id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const deleted = getOne('SELECT * FROM category_mappings WHERE id = ?', [row.id]);
    expect(deleted).toBeNull();
  });

  test('按DXM类目批量删除映射', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['测试1', '批量删除类目', 1, 'auto']);
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['测试2', '批量删除类目', 1, 'auto']);
    const res = await request(app).delete('/api/category-mappings/dxm/' + encodeURIComponent('批量删除类目'));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const remaining = getAll('SELECT * FROM category_mappings WHERE custom_category = \'批量删除类目\'');
    expect(remaining.length).toBe(0);
  });

  test('分组查询映射', async () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['杯子A', '水杯', 1, 'auto']);
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['杯子B', '水杯', 2, 'manual']);
    const res = await request(app).get('/api/category-mappings/grouped');
    expect(res.status).toBe(200);
    const group = res.body.list.find(g => g.customCategory === '水杯');
    expect(group).toBeTruthy();
    expect(group.aliCategories.length).toBe(2);
  });
});

// ===== Schema 一致性验证 =====

describe('Schema 一致性 — 本地表字段完整性', () => {
  test('category_config 包含所有字段', () => {
    run('INSERT INTO category_config (type, value, group_name, description, sort_order, deleted) VALUES (?, ?, ?, ?, ?, ?)', ['test', '值', '组', '说明', 1, 0]);
    const row = getOne('SELECT * FROM category_config WHERE type = \'test\'');
    expect(row.type).toBe('test');
    expect(row.value).toBe('值');
    expect(row.group_name).toBe('组');
    expect(row.description).toBe('说明');
    expect(row.sort_order).toBe(1);
    expect(row.deleted).toBe(0);
  });

  test('keyword_category_rel 包含所有字段', () => {
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['关键词', '类目名', 1.5, 10, 1, 'manual']);
    const row = getOne('SELECT * FROM keyword_category_rel WHERE keyword = \'关键词\'');
    expect(row.weight).toBe(1.5);
    expect(row.match_count).toBe(10);
    expect(row.valid).toBe(1);
    expect(row.source).toBe('manual');
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  test('keyword_blacklist 包含所有字段', () => {
    run('INSERT INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['黑词', '类目', '原因', 5]);
    const row = getOne('SELECT * FROM keyword_blacklist WHERE keyword = \'黑词\'');
    expect(row.reason).toBe('原因');
    expect(row.count).toBe(5);
    expect(row.updated_at).toBeTruthy();
  });

  test('keyword_synonyms 只有核心字段', () => {
    run('INSERT INTO keyword_synonyms (word_a, word_b) VALUES (?, ?)', ['同义A', '同义B']);
    const row = getOne('SELECT * FROM keyword_synonyms WHERE word_a = \'同义A\'');
    expect(row.word_a).toBe('同义A');
    expect(row.word_b).toBe('同义B');
  });

  test('category_mappings 包含所有字段', () => {
    run('INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES (?, ?, ?, ?)', ['源类目', '目标类目', 3, 'manual']);
    const row = getOne('SELECT * FROM category_mappings WHERE category_name = \'源类目\'');
    expect(row.count).toBe(3);
    expect(row.source).toBe('manual');
  });

  test('UNIQUE约束 — category_config 不重复', () => {
    run('INSERT INTO category_config (type, value, group_name, description, sort_order, deleted) VALUES (?, ?, ?, ?, ?, ?)', ['unique_test', '值', '组', '', 0, 0]);
    // INSERT OR REPLACE 应该覆盖而不是重复
    run('INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted) VALUES (?, ?, ?, ?, ?, ?)', ['unique_test', '值', '组', '新说明', 0, 0]);
    const rows = getAll('SELECT * FROM category_config WHERE type = \'unique_test\' AND value = \'值\' AND group_name = \'组\'');
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe('新说明');
  });

  test('UNIQUE约束 — keyword_blacklist 不重复', () => {
    run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['唯一', '类目', '', 1]);
    run('INSERT OR IGNORE INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['唯一', '类目', '', 1]);
    const rows = getAll('SELECT * FROM keyword_blacklist WHERE keyword = \'唯一\' AND category_name = \'类目\'');
    expect(rows.length).toBe(1);
  });

  test('UNIQUE约束 — keyword_category_rel 不重复', () => {
    run('INSERT OR IGNORE INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['唯一词', '类目', 1.0, 1, 1, 'auto']);
    run('INSERT OR IGNORE INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['唯一词', '类目', 1.0, 1, 1, 'auto']);
    const rows = getAll('SELECT * FROM keyword_category_rel WHERE keyword = \'唯一词\' AND category_name = \'类目\'');
    expect(rows.length).toBe(1);
  });
});

// ===== 数据完整性边界场景 =====

describe('数据完整性 — 边界场景', () => {
  test('category_config 软删除后不出现在正常查询', async () => {
    run('DELETE FROM category_config');
    cloudDb.saveCategoryConfig.mockImplementation(async (type, value, groupName, desc, sortOrder) => {
      run('INSERT OR REPLACE INTO category_config (type, value, group_name, description, sort_order, deleted) VALUES (?, ?, ?, ?, ?, 0)', [type, value, groupName || '', desc || '', sortOrder || 0]);
    });
    cloudDb.getCategoryConfig.mockImplementation(async (type) => {
      return getAll('SELECT * FROM category_config WHERE type = ? AND deleted = 0 ORDER BY sort_order, id', [type]);
    });
    cloudDb.deleteCategoryConfig.mockImplementation(async (id) => {
      run('UPDATE category_config SET deleted = 1 WHERE id = ?', [id]);
    });

    await request(app).post('/api/category-config').send({ type: 'noise', value: '边界词' });
    const row = getOne('SELECT * FROM category_config WHERE type = \'noise\' AND value = \'边界词\' AND deleted = 0');
    expect(row).toBeTruthy();

    await request(app).delete('/api/category-config/' + row.id);
    const res = await request(app).get('/api/category-config?type=noise');
    const found = res.body.list.find(r => r.value === '边界词');
    expect(found).toBeUndefined();
  });

  test('keyword_category_rel 权重取最大值', () => {
    run('DELETE FROM keyword_category_rel');
    run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['权重测试', '类目', 1.0, 5, 1, 'auto']);
    const row = getOne('SELECT * FROM keyword_category_rel WHERE keyword = \'权重测试\'');
    // 模拟更新权重（取max）
    run('UPDATE keyword_category_rel SET weight = MAX(weight, ?), match_count = match_count + 1 WHERE id = ?', [2.5, row.id]);
    const updated = getOne('SELECT * FROM keyword_category_rel WHERE id = ?', [row.id]);
    expect(updated.weight).toBe(2.5);
    expect(updated.match_count).toBe(6);
  });

  test('keyword_blacklist count递增', () => {
    run('DELETE FROM keyword_blacklist');
    run('INSERT INTO keyword_blacklist (keyword, category_name, reason, count) VALUES (?, ?, ?, ?)', ['递增', '类目', '', 1]);
    const row = getOne('SELECT * FROM keyword_blacklist WHERE keyword = \'递增\'');
    run('UPDATE keyword_blacklist SET count = count + 1 WHERE id = ?', [row.id]);
    const updated = getOne('SELECT * FROM keyword_blacklist WHERE id = ?', [row.id]);
    expect(updated.count).toBe(2);
  });

  test('空表查询不报错', async () => {
    run('DELETE FROM category_config');
    run('DELETE FROM keyword_blacklist');
    run('DELETE FROM keyword_category_rel');
    run('DELETE FROM keyword_synonyms');
    run('DELETE FROM category_mappings');

    cloudDb.getCategoryConfig.mockResolvedValue([]);
    cloudDb.getAllCategoryConfig.mockResolvedValue([]);

    const r1 = await request(app).get('/api/category-config');
    expect(r1.status).toBe(200);
    expect(r1.body.list).toEqual([]);

    const r2 = await request(app).get('/api/keyword-blacklist');
    expect(r2.status).toBe(200);

    const r3 = await request(app).get('/api/keyword-rels');
    expect(r3.status).toBe(200);
    expect(r3.body.total).toBe(0);

    const r4 = await request(app).get('/api/keyword-synonyms');
    expect(r4.status).toBe(200);
    expect(r4.body).toEqual([]);

    const r5 = await request(app).get('/api/category-mappings');
    expect(r5.status).toBe(200);
    expect(r5.body).toEqual([]);
  });

  test('无效ID删除不报错', async () => {
    const res = await request(app).delete('/api/category-config/99999');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('分页查询边界', async () => {
    run('DELETE FROM keyword_category_rel');
    for (let i = 0; i < 25; i++) {
      run('INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES (?, ?, ?, ?, ?, ?)', ['分页' + i, '类目' + i, 1.0, 1, 1, 'auto']);
    }
    const r1 = await request(app).get('/api/keyword-rels?page=1&pageSize=10');
    expect(r1.body.total).toBe(25);
    expect(r1.body.list.length).toBe(10);
    const r2 = await request(app).get('/api/keyword-rels?page=3&pageSize=10');
    expect(r2.body.list.length).toBe(5);
  });
});
