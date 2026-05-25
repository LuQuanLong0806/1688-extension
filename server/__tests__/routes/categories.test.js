// categories.test.js — 类目管理路由测试
const request = require('supertest');
const setup = require('../helpers/setup');

let app, cloudDb;

beforeAll(async () => {
  await setup.initTestDb();
  const result = setup.createTestApp();
  app = result.app;
  cloudDb = result.cloudDb;
});

// 预填测试数据
beforeEach(() => {
  // 插入测试类目
  setup.run("INSERT INTO categories (name, count) VALUES ('厨房用品', 5)");
  setup.run("INSERT INTO categories (name, count) VALUES ('家居日用', 3)");
  setup.run("INSERT INTO categories (name, count) VALUES ('电子数码', 8)");

  // 插入测试映射
  setup.run("INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('厨房用品', '厨房工具', 3, 'manual')");
  setup.run("INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('厨房用品', '餐具', 2, 'auto')");
  setup.run("INSERT INTO category_mappings (category_name, custom_category, count, source) VALUES ('电子数码', '手机配件', 5, 'manual')");

  // 插入关键词关联
  setup.run("INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('搓澡', '家居日用', 2.5, 10, 1, 'auto')");
  setup.run("INSERT INTO keyword_category_rel (keyword, category_name, weight, match_count, valid, source) VALUES ('垃圾袋', '家居日用', 1.8, 5, 1, 'manual')");

  // 插入同义词
  setup.run("INSERT INTO keyword_synonyms (word_a, word_b) VALUES ('搓澡', '洗澡')");

  // 插入黑名单
  setup.run("INSERT INTO keyword_blacklist (keyword, category_name, reason) VALUES ('免费', '厨房用品', '营销词')");

  // 插入分类配置
  setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '家居', '家居日用')");
});

afterEach(() => {
  // 清空表（测试隔离）
  ['categories', 'category_mappings', 'keyword_category_rel', 'keyword_synonyms', 'keyword_blacklist', 'category_config'].forEach(t => {
    setup.run('DELETE FROM ' + t);
  });
});

describe('Categories 路由', () => {
  describe('GET /api/categories', () => {
    test('返回分页类目列表', async () => {
      const res = await request(app).get('/api/categories?page=1&pageSize=10');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.list.length).toBe(3);
      expect(res.body.page).toBe(1);
    });

    test('关键词搜索', async () => {
      const res = await request(app).get('/api/categories?keyword=厨房');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.list[0].name).toContain('厨房');
    });

    test('无结果搜索返回空列表', async () => {
      const res = await request(app).get('/api/categories?keyword=不存在的类目');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.list).toEqual([]);
    });
  });

  describe('GET /api/category-mappings', () => {
    test('返回映射列表', async () => {
      const res = await request(app).get('/api/category-mappings');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(3);
    });

    test('关键词搜索映射', async () => {
      const res = await request(app).get('/api/category-mappings?keyword=厨房');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  describe('GET /api/category-mappings/by-name', () => {
    test('按1688类目名查映射', async () => {
      const res = await request(app).get('/api/category-mappings/by-name?name=厨房用品');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    test('空名称返回空数组', async () => {
      const res = await request(app).get('/api/category-mappings/by-name?name=');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/category-mappings/by-dxm', () => {
    test('按DXM类目查映射', async () => {
      const res = await request(app).get('/api/category-mappings/by-dxm?name=厨房工具');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].categoryName).toBe('厨房用品');
    });
  });

  describe('GET /api/category-mappings/grouped', () => {
    test('返回分组列表', async () => {
      const res = await request(app).get('/api/category-mappings/grouped');
      expect(res.status).toBe(200);
      expect(res.body.list.length).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
    });
  });

  describe('POST /api/category-mappings', () => {
    test('新增映射', async () => {
      const res = await request(app).post('/api/category-mappings').send({
        categoryName: '新类目', customCategory: '新DXM类目'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('重复映射不报错', async () => {
      await request(app).post('/api/category-mappings').send({
        categoryName: '厨房用品', customCategory: '厨房工具'
      });
      const res = await request(app).post('/api/category-mappings').send({
        categoryName: '厨房用品', customCategory: '厨房工具'
      });
      expect(res.status).toBe(200);
    });

    test('缺少参数返回400', async () => {
      const res = await request(app).post('/api/category-mappings').send({ categoryName: 'test' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/category-mappings/:id', () => {
    test('删除映射', async () => {
      const row = setup.getOne("SELECT id FROM category_mappings WHERE custom_category = '厨房工具'");
      const res = await request(app).delete('/api/category-mappings/' + row.id);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('DELETE /api/category-mappings/dxm/:name', () => {
    test('删除整个DXM类目映射', async () => {
      const res = await request(app).delete('/api/category-mappings/dxm/' + encodeURIComponent('厨房工具'));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('关键词关联库', () => {
    test('GET /api/keyword-rels 返回列表', async () => {
      const res = await request(app).get('/api/keyword-rels');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.list.length).toBe(2);
    });

    test('GET /api/keyword-rels 搜索', async () => {
      const res = await request(app).get('/api/keyword-rels?keyword=搓澡');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('DELETE /api/keyword-rels/:id 标记无效', async () => {
      const row = setup.getOne("SELECT id FROM keyword_category_rel WHERE keyword = '搓澡'");
      const res = await request(app).delete('/api/keyword-rels/' + row.id);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const updated = setup.getOne("SELECT valid FROM keyword_category_rel WHERE id = ?", [row.id]);
      expect(updated.valid).toBe(0);
    });

    test('POST /api/keyword-rels/batch-invalidate 批量无效', async () => {
      const rows = setup.getAll("SELECT id FROM keyword_category_rel");
      const ids = rows.map(r => r.id);
      const res = await request(app).post('/api/keyword-rels/batch-invalidate').send({ ids });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('批量无效缺少ids返回400', async () => {
      const res = await request(app).post('/api/keyword-rels/batch-invalidate').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('同义词管理', () => {
    test('GET /api/keyword-synonyms 返回列表', async () => {
      const res = await request(app).get('/api/keyword-synonyms');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    test('POST /api/keyword-synonyms 新增', async () => {
      const res = await request(app).post('/api/keyword-synonyms').send({ wordA: '工具', wordB: '器具' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('POST 缺少参数返回400', async () => {
      const res = await request(app).post('/api/keyword-synonyms').send({ wordA: 'test' });
      expect(res.status).toBe(400);
    });

    test('DELETE /api/keyword-synonyms/:id', async () => {
      const row = setup.getOne("SELECT id FROM keyword_synonyms WHERE word_a = '搓澡'");
      const res = await request(app).delete('/api/keyword-synonyms/' + row.id);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('黑名单管理', () => {
    test('GET /api/keyword-blacklist 返回列表', async () => {
      const res = await request(app).get('/api/keyword-blacklist');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    test('POST /api/keyword-blacklist 新增', async () => {
      const res = await request(app).post('/api/keyword-blacklist').send({ keyword: '赠品', categoryName: '厨房用品', reason: '营销词' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('POST 缺少参数返回400', async () => {
      const res = await request(app).post('/api/keyword-blacklist').send({ keyword: 'test' });
      expect(res.status).toBe(400);
    });

    test('DELETE /api/keyword-blacklist/:id', async () => {
      const row = setup.getOne("SELECT id FROM keyword_blacklist WHERE keyword = '免费'");
      const res = await request(app).delete('/api/keyword-blacklist/' + row.id);
      expect(res.status).toBe(200);
    });
  });

  describe('分类配置管理', () => {
    test('GET /api/category-config 返回配置', async () => {
      const res = await request(app).get('/api/category-config');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('POST /api/category-config 保存配置', async () => {
      const res = await request(app).post('/api/category-config').send({
        type: 'noise', value: '测试词', group_name: '', description: '测试'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('POST 缺少必填参数返回400', async () => {
      const res = await request(app).post('/api/category-config').send({ type: 'noise' });
      expect(res.status).toBe(400);
    });

    test('DELETE /api/category-config/:id 软删', async () => {
      const row = setup.getOne("SELECT id FROM category_config WHERE type = 'mutex'");
      const res = await request(app).delete('/api/category-config/' + row.id);
      expect(res.status).toBe(200);
      expect(cloudDb.deleteCategoryConfig).toHaveBeenCalledWith(row.id);
    });

    test('POST /api/category-config/batch-delete 批量软删', async () => {
      setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '批量A', '')");
      setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '批量B', '')");
      const rows = setup.getAll("SELECT id FROM category_config WHERE value IN ('批量A', '批量B')");
      const ids = rows.map(r => r.id);

      cloudDb.deleteCategoryConfig.mockClear();
      const res = await request(app).post('/api/category-config/batch-delete').send({ ids });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(cloudDb.deleteCategoryConfig).toHaveBeenCalledTimes(ids.length);
    });

    test('POST /api/category-config/batch-delete 缺少 ids 返回400', async () => {
      const res = await request(app).post('/api/category-config/batch-delete').send({});
      expect(res.status).toBe(400);
    });

    test('DELETE /api/category-config/:id 无效ID返回400', async () => {
      const res = await request(app).delete('/api/category-config/abc');
      expect(res.status).toBe(400);
    });

    test('GET /api/category-config?type=noise 按类型查询', async () => {
      setup.run("INSERT INTO category_config (type, value) VALUES ('noise', '查询词')");
      const res = await request(app).get('/api/category-config?type=noise');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(cloudDb.getCategoryConfig).toHaveBeenCalledWith('noise');
    });
  });
});
