// backfill-path.test.js — 补全路径接口测试
const request = require('supertest');
const setup = require('../helpers/setup');

let app, cloudDb;

beforeAll(async () => {
  await setup.initTestDb();
  const result = setup.createTestApp();
  app = result.app;
  cloudDb = result.cloudDb;
});

afterEach(() => {
  setup.run('DELETE FROM products');
  setup.treeRun('DELETE FROM dxm_category_tree');
});

function insertTestProduct(overrides) {
  const defaults = {
    source_url: 'https://detail.1688.com/offer/100.html',
    title: '测试商品',
    category: JSON.stringify({}),
    custom_category: '',
    dxm_category: '',
    manual_category: '',
    main_images: JSON.stringify([]),
    desc_images: JSON.stringify([]),
    detail_images: JSON.stringify([]),
    attrs: JSON.stringify([]),
    skus: JSON.stringify([]),
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

function insertTreeNode(overrides) {
  const defaults = {
    cat_id: Date.now() + Math.floor(Math.random() * 10000),
    cat_name: '测试分类',
    parent_cat_id: 0,
    cat_level: 1,
    is_leaf: 1,
    path: '父级/子级/测试分类'
  };
  const data = { ...defaults, ...overrides };
  setup.treeRun(
    'INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
    [data.cat_id, data.cat_name, data.parent_cat_id, data.cat_level, data.is_leaf, data.path]
  );
}

describe('PATCH /api/products/backfill-path', () => {

  test('缺少 customCategory 返回 400', async () => {
    const res = await request(app).patch('/api/products/backfill-path').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('分类树中找不到类目，返回 updated=0', async () => {
    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '不存在的类目'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).toBe(0);
  });

  test('分类树中有类目但没有 path，返回 updated=0', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '' });
    insertTestProduct({ custom_category: '餐具', manual_category: '' });

    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '餐具'
    });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);
  });

  test('成功补全单个商品的路径', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '家居/厨房/餐具' });
    const row = insertTestProduct({ custom_category: '餐具', manual_category: '' });

    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '餐具'
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.updated).toBe(1);
    expect(res.body.path).toBe('家居/厨房/餐具');

    // 验证数据库
    const updated = setup.getOne('SELECT manual_category, dxm_category FROM products WHERE id = ?', [row.id]);
    expect(updated.manual_category).toBe('家居/厨房/餐具');
    const dxmCat = JSON.parse(updated.dxm_category);
    expect(dxmCat.path).toBe('家居/厨房/餐具');
    expect(dxmCat.leafName).toBe('餐具');
  });

  test('补全多个同分类商品的路径', async () => {
    insertTreeNode({ cat_name: '模具', is_leaf: 1, path: '工业/加工/模具' });
    insertTestProduct({ custom_category: '模具', manual_category: '' });
    insertTestProduct({ custom_category: '模具', manual_category: '', source_url: 'https://detail.1688.com/offer/101.html' });
    insertTestProduct({ custom_category: '模具', manual_category: '', source_url: 'https://detail.1688.com/offer/102.html' });

    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '模具'
    });
    expect(res.body.updated).toBe(3);
  });

  test('已有路径的商品不被更新', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '家居/厨房/餐具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '旧路径/餐具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '' });

    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '餐具'
    });
    expect(res.body.updated).toBe(1);

    // 已有路径的商品不变
    const products = setup.getAll("SELECT manual_category FROM products WHERE custom_category = '餐具' ORDER BY id");
    const hasOld = products.some(function (p) { return p.manual_category === '旧路径/餐具'; });
    expect(hasOld).toBe(true);
  });

  test('已删除的商品不被更新', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '家居/厨房/餐具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '', deleted: 1 });

    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '餐具'
    });
    expect(res.body.updated).toBe(0);
  });

  test('不同类目互不影响', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '家居/厨房/餐具' });
    insertTreeNode({ cat_name: '模具', is_leaf: 1, path: '工业/加工/模具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '' });
    insertTestProduct({ custom_category: '模具', manual_category: '', source_url: 'https://detail.1688.com/offer/101.html' });
    insertTestProduct({ custom_category: '玩具', manual_category: '', source_url: 'https://detail.1688.com/offer/102.html' });

    // 只补全餐具
    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '餐具'
    });
    expect(res.body.updated).toBe(1);

    // 模具和玩具不受影响
    const moldy = setup.getOne("SELECT manual_category FROM products WHERE custom_category = '模具'");
    expect(moldy.manual_category).toBe('');
    const toy = setup.getOne("SELECT manual_category FROM products WHERE custom_category = '玩具'");
    expect(toy.manual_category).toBe('');
  });

  test('树中有多个同名类目，取 is_leaf=1 的', async () => {
    insertTreeNode({ cat_name: '餐具', cat_id: 1, is_leaf: 0, path: '错误路径' });
    insertTreeNode({ cat_name: '餐具', cat_id: 2, is_leaf: 1, path: '家居/厨房/餐具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '' });

    const res = await request(app).patch('/api/products/backfill-path').send({
      customCategory: '餐具'
    });
    expect(res.body.path).toBe('家居/厨房/餐具');
    expect(res.body.updated).toBe(1);
  });

  test('批量补全：连续调用多个类目', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '家居/厨房/餐具' });
    insertTreeNode({ cat_name: '模具', is_leaf: 1, path: '工业/加工/模具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '' });
    insertTestProduct({ custom_category: '模具', manual_category: '', source_url: 'https://detail.1688.com/offer/101.html' });

    const res1 = await request(app).patch('/api/products/backfill-path').send({ customCategory: '餐具' });
    const res2 = await request(app).patch('/api/products/backfill-path').send({ customCategory: '模具' });

    expect(res1.body.updated).toBe(1);
    expect(res2.body.updated).toBe(1);
    expect(res1.body.path).toBe('家居/厨房/餐具');
    expect(res2.body.path).toBe('工业/加工/模具');
  });

  test('重复补全不会重复更新', async () => {
    insertTreeNode({ cat_name: '餐具', is_leaf: 1, path: '家居/厨房/餐具' });
    insertTestProduct({ custom_category: '餐具', manual_category: '' });

    const res1 = await request(app).patch('/api/products/backfill-path').send({ customCategory: '餐具' });
    expect(res1.body.updated).toBe(1);

    // 第二次调用，已补全的不更新
    const res2 = await request(app).patch('/api/products/backfill-path').send({ customCategory: '餐具' });
    expect(res2.body.updated).toBe(0);
  });
});
