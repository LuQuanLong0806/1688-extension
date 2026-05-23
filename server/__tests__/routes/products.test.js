// products.test.js — 商品管理路由测试
const request = require('supertest');
const setup = require('../helpers/setup');

let app, cloudDb;

beforeAll(async () => {
  await setup.initTestDb();
  const result = setup.createTestApp();
  app = result.app;
  cloudDb = result.cloudDb;
});

function insertTestProduct(overrides) {
  const defaults = {
    source_url: 'https://detail.1688.com/offer/123.html',
    title: '测试商品 搓澡刷',
    category: JSON.stringify({ leafCategoryName: '浴室用品', categoryPath: '家居/浴室用品' }),
    custom_category: '清洁工具',
    dxm_category: '',
    manual_category: '',
    main_images: JSON.stringify(['https://img.test/1.jpg']),
    desc_images: JSON.stringify([]),
    detail_images: JSON.stringify([]),
    attrs: JSON.stringify([{ name: '材质', value: '塑料' }]),
    skus: JSON.stringify([{ name: '颜色', value: '蓝色' }, { name: '尺寸', value: '大号' }]),
    status: 0,
    deleted: 0
  };
  const data = { ...defaults, ...overrides };
  setup.run(
    `INSERT INTO products (source_url, title, category, custom_category, dxm_category, manual_category, main_images, desc_images, detail_images, attrs, skus, status, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.source_url, data.title, data.category, data.custom_category, data.dxm_category, data.manual_category,
     data.main_images, data.desc_images, data.detail_images, data.attrs, data.skus, data.status, data.deleted]
  );
  return setup.getOne('SELECT last_insert_rowid() as id');
}

describe('Products 路由', () => {
  afterEach(() => {
    setup.run('DELETE FROM products');
    setup.run('DELETE FROM categories');
    setup.run('DELETE FROM category_mappings');
  });

  describe('GET /api/product/stats', () => {
    test('空数据库返回全0', async () => {
      const res = await request(app).get('/api/product/stats');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.used).toBe(0);
      expect(res.body.unused).toBe(0);
    });

    test('统计正确', async () => {
      insertTestProduct({ status: 0 });
      insertTestProduct({ status: 1, source_url: 'https://detail.1688.com/offer/456.html' });
      insertTestProduct({ deleted: 1, source_url: 'https://detail.1688.com/offer/789.html' });

      const res = await request(app).get('/api/product/stats');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2); // deleted=0 的
      expect(res.body.used).toBe(1);  // status=1
      expect(res.body.unused).toBe(1); // status=0
    });
  });

  describe('GET /api/product', () => {
    test('返回分页列表', async () => {
      insertTestProduct({});
      const res = await request(app).get('/api/product?page=1&pageSize=10');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.list.length).toBe(1);
      expect(res.body.page).toBe(1);
    });

    test('关键词搜索', async () => {
      insertTestProduct({ title: '搓澡刷神器' });
      insertTestProduct({ title: '垃圾袋加厚', source_url: 'https://detail.1688.com/offer/456.html' });
      const res = await request(app).get('/api/product?keyword=搓澡');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('按DXM类目筛选', async () => {
      insertTestProduct({ custom_category: '清洁工具' });
      insertTestProduct({ custom_category: '厨房工具', source_url: 'https://detail.1688.com/offer/456.html' });
      const res = await request(app).get('/api/product?dxmCategory=清洁工具');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('_none 筛选无分类商品', async () => {
      insertTestProduct({ custom_category: '' });
      insertTestProduct({ custom_category: '清洁工具', source_url: 'https://detail.1688.com/offer/456.html' });
      const res = await request(app).get('/api/product?dxmCategory=_none');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('按状态筛选', async () => {
      insertTestProduct({ status: 1 });
      insertTestProduct({ status: 0, source_url: 'https://detail.1688.com/offer/456.html' });
      const res = await request(app).get('/api/product?status=1');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    test('列表字段解析正确', async () => {
      insertTestProduct({});
      const res = await request(app).get('/api/product');
      const item = res.body.list[0];
      expect(typeof item.category).toBe('object');
      expect(Array.isArray(item.attrs)).toBe(true);
      expect(typeof item.skuCount).toBe('number');
      expect(item.skuCount).toBe(2);
    });
  });

  describe('GET /api/product/:id', () => {
    test('返回单条商品', async () => {
      const row = insertTestProduct({});
      const res = await request(app).get('/api/product/' + row.id);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('测试商品 搓澡刷');
      expect(res.body.category).toBeDefined();
      expect(Array.isArray(res.body.main_images)).toBe(true);
    });

    test('不存在返回404', async () => {
      const res = await request(app).get('/api/product/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/product/check', () => {
    test('存在商品返回 exists=true', async () => {
      insertTestProduct({});
      const res = await request(app).get('/api/product/check?offerId=123');
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
    });

    test('不存在返回 exists=false', async () => {
      const res = await request(app).get('/api/product/check?offerId=notexist');
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
    });

    test('空 offerId 返回 exists=false', async () => {
      const res = await request(app).get('/api/product/check?offerId=');
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);
    });
  });

  describe('PUT /api/product/:id', () => {
    test('更新标题', async () => {
      const row = insertTestProduct({});
      const res = await request(app).put('/api/product/' + row.id).send({ title: '新标题' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const updated = setup.getOne('SELECT title FROM products WHERE id = ?', [row.id]);
      expect(updated.title).toBe('新标题');
    });

    test('更新分类', async () => {
      const row = insertTestProduct({});
      const res = await request(app).put('/api/product/' + row.id).send({ customCategory: '新分类' });
      expect(res.status).toBe(200);
      const updated = setup.getOne('SELECT custom_category FROM products WHERE id = ?', [row.id]);
      expect(updated.custom_category).toBe('新分类');
    });

    test('无更新字段也返回 ok', async () => {
      const row = insertTestProduct({});
      const res = await request(app).put('/api/product/' + row.id).send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('DELETE /api/product/:id', () => {
    test('软删除', async () => {
      const row = insertTestProduct({});
      const res = await request(app).delete('/api/product/' + row.id);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const deleted = setup.getOne('SELECT deleted FROM products WHERE id = ?', [row.id]);
      expect(deleted.deleted).toBe(1);
    });
  });

  describe('POST /api/product/batch-delete', () => {
    test('批量删除', async () => {
      const row1 = insertTestProduct({});
      const row2 = insertTestProduct({ source_url: 'https://detail.1688.com/offer/456.html' });
      const res = await request(app).post('/api/product/batch-delete').send({ ids: [row1.id, row2.id] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(2);
    });

    test('空数组不报错', async () => {
      const res = await request(app).post('/api/product/batch-delete').send({ ids: [] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(0);
    });

    test('超过500条返回400', async () => {
      const ids = Array(501).fill(1);
      const res = await request(app).post('/api/product/batch-delete').send({ ids });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/product/batch-status', () => {
    test('批量设置状态', async () => {
      const row1 = insertTestProduct({});
      const row2 = insertTestProduct({ source_url: 'https://detail.1688.com/offer/456.html' });
      const res = await request(app).post('/api/product/batch-status').send({ ids: [row1.id, row2.id], status: 1 });
      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(2);
    });

    test('status=-1 翻转状态', async () => {
      const row = insertTestProduct({ status: 0 });
      await request(app).post('/api/product/batch-status').send({ ids: [row.id], status: -1 });
      const updated = setup.getOne('SELECT status FROM products WHERE id = ?', [row.id]);
      expect(updated.status).toBe(1);
    });

    test('超过500条返回400', async () => {
      const ids = Array(501).fill(1);
      const res = await request(app).post('/api/product/batch-status').send({ ids, status: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/product/trend', () => {
    test('返回趋势数据', async () => {
      insertTestProduct({});
      const res = await request(app).get('/api/product/trend?days=7');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/product/categories', () => {
    test('返回1688类目列表', async () => {
      setup.run("INSERT INTO categories (name, count) VALUES ('测试类目', 1)");
      const res = await request(app).get('/api/product/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toContain('测试类目');
    });
  });

  describe('GET /api/product/dxm-categories', () => {
    test('返回已映射DXM类目', async () => {
      setup.run("INSERT INTO category_mappings (category_name, custom_category) VALUES ('测试', 'DXM类目')");
      const res = await request(app).get('/api/product/dxm-categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toContain('DXM类目');
    });
  });

  describe('GET /api/product/category-top', () => {
    test('返回Top类目', async () => {
      setup.run("INSERT INTO categories (name, count) VALUES ('热门类目', 100)");
      const res = await request(app).get('/api/product/category-top');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
