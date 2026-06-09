// dxm-tree.test.js — 分类树路由测试
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
  setup.treeRun('DELETE FROM dxm_category_tree');
});

function insertTreeNode(overrides) {
  const defaults = {
    cat_id: Date.now() + Math.floor(Math.random() * 10000),
    cat_name: '测试分类',
    parent_cat_id: 0,
    cat_level: 1,
    is_leaf: 0,
    path: '测试分类'
  };
  const data = { ...defaults, ...overrides };
  setup.treeRun(
    'INSERT INTO dxm_category_tree (cat_id, cat_name, parent_cat_id, cat_level, is_leaf, path) VALUES (?, ?, ?, ?, ?, ?)',
    [data.cat_id, data.cat_name, data.parent_cat_id, data.cat_level, data.is_leaf, data.path]
  );
}

describe('DXM Tree 路由', () => {
  describe('POST /api/dxm-category/collect', () => {
    test('收集新分类', async () => {
      const res = await request(app).post('/api/dxm-category/collect').send({
        path: '家居/厨房/餐具',
        leafName: '餐具'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('重复路径更新 sync_at', async () => {
      await request(app).post('/api/dxm-category/collect').send({
        path: '家居/厨房/餐具',
        leafName: '餐具'
      });
      const res = await request(app).post('/api/dxm-category/collect').send({
        path: '家居/厨房/餐具',
        leafName: '餐具'
      });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('缺少参数返回400', async () => {
      const res = await request(app).post('/api/dxm-category/collect').send({ path: 'test' });
      expect(res.status).toBe(400);
    });

    test('路径含空格被清理', async () => {
      const res = await request(app).post('/api/dxm-category/collect').send({
        path: '家居 / 厨房 / 餐具',
        leafName: '餐具'
      });
      expect(res.status).toBe(200);
      const row = setup.treeGetOne("SELECT path FROM dxm_category_tree WHERE cat_name = '餐具'");
      expect(row.path.indexOf(' ')).toBe(-1);
    });
  });

  describe('POST /api/dxm-tree/sync', () => {
    test('批量同步分类', async () => {
      const res = await request(app).post('/api/dxm-tree/sync').send({
        categories: [
          { catId: 1001, catName: '家居', parentCatId: 0, catLevel: 1, isLeaf: false, path: '家居' },
          { catId: 1002, catName: '厨房', parentCatId: 1001, catLevel: 2, isLeaf: true, path: '家居/厨房' }
        ]
      });
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(2);
    });

    test('更新已有分类', async () => {
      await request(app).post('/api/dxm-tree/sync').send({
        categories: [{ catId: 2001, catName: '旧名', parentCatId: 0, catLevel: 1, isLeaf: false, path: '旧名' }]
      });
      const res = await request(app).post('/api/dxm-tree/sync').send({
        categories: [{ catId: 2001, catName: '新名', parentCatId: 0, catLevel: 1, isLeaf: true, path: '新名' }]
      });
      expect(res.body.saved).toBe(1);
      const row = setup.treeGetOne('SELECT cat_name FROM dxm_category_tree WHERE cat_id = 2001');
      expect(row.cat_name).toBe('新名');
    });

    test('空数组返回 saved=0', async () => {
      const res = await request(app).post('/api/dxm-tree/sync').send({ categories: [] });
      expect(res.status).toBe(200);
      expect(res.body.saved).toBe(0);
    });
  });

  describe('GET /api/dxm-tree/children', () => {
    test('获取子级分类', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '家居', parent_cat_id: 0, cat_level: 1, is_leaf: 0, path: '家居' });
      insertTreeNode({ cat_id: 2, cat_name: '厨房', parent_cat_id: 1, cat_level: 2, is_leaf: 1, path: '家居/厨房' });
      insertTreeNode({ cat_id: 3, cat_name: '卧室', parent_cat_id: 1, cat_level: 2, is_leaf: 0, path: '家居/卧室' });

      const res = await request(app).get('/api/dxm-tree/children?parentId=1');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    test('根分类 parentId=0', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '家居', parent_cat_id: 0 });
      const res = await request(app).get('/api/dxm-tree/children?parentId=0');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  describe('GET /api/dxm-tree/status', () => {
    test('返回同步状态', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '家居', parent_cat_id: 0, cat_level: 1 });
      const res = await request(app).get('/api/dxm-tree/status');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(typeof res.body.levels).toBe('number');
    });

    test('空树返回 total=0', async () => {
      const res = await request(app).get('/api/dxm-tree/status');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /api/dxm-tree/root-status', () => {
    test('返回各大类状态', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '家居', parent_cat_id: 0, cat_level: 1, path: '家居' });
      insertTreeNode({ cat_id: 2, cat_name: '厨房', parent_cat_id: 1, cat_level: 2, path: '家居/厨房' });
      const res = await request(app).get('/api/dxm-tree/root-status');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].catName).toBe('家居');
      expect(res.body[0].count).toBe(2); // 包含子节点
    });
  });

  describe('GET /api/dxm-tree/search', () => {
    test('搜索叶子节点', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '厨房用品', parent_cat_id: 0, cat_level: 2, is_leaf: 1, path: '家居/厨房用品' });
      const res = await request(app).get('/api/dxm-tree/search?keyword=厨房');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].catName).toBe('厨房用品');
    });

    test('空关键词返回空数组', async () => {
      const res = await request(app).get('/api/dxm-tree/search?keyword=');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test('不返回非叶子节点', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '厨房', parent_cat_id: 0, cat_level: 1, is_leaf: 0, path: '厨房' });
      const res = await request(app).get('/api/dxm-tree/search?keyword=厨房');
      expect(res.body.length).toBe(0);
    });
  });

  describe('GET /api/dxm-tree/resolve-path', () => {
    test('根据叶子名查路径', async () => {
      insertTreeNode({ cat_id: 1, cat_name: '餐具', parent_cat_id: 0, cat_level: 3, is_leaf: 1, path: '家居/厨房/餐具' });
      const res = await request(app).get('/api/dxm-tree/resolve-path?name=餐具');
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('家居/厨房/餐具');
    });

    test('不存在返回空路径', async () => {
      const res = await request(app).get('/api/dxm-tree/resolve-path?name=不存在');
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('');
    });

    test('空名称返回空路径', async () => {
      const res = await request(app).get('/api/dxm-tree/resolve-path?name=');
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('');
    });
  });

  // ========== 时间戳验证测试 ==========

  describe('时间戳字段验证', () => {
    test('POST /api/dxm-category/collect 新增节点写入 created_at 和 updated_at', async () => {
      await request(app).post('/api/dxm-category/collect').send({
        path: '家居/厨房/锅具',
        leafName: '锅具'
      });
      const row = setup.treeGetOne("SELECT created_at, updated_at FROM dxm_category_tree WHERE cat_name = '锅具'");
      expect(row).toBeTruthy();
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
      expect(row.created_at.length).toBeGreaterThan(0);
      expect(row.updated_at.length).toBeGreaterThan(0);
    });

    test('POST /api/dxm-category/collect 重复路径更新 updated_at', async () => {
      await request(app).post('/api/dxm-category/collect').send({
        path: '家居/厨房/砧板',
        leafName: '砧板'
      });
      const before = setup.treeGetOne("SELECT created_at, updated_at FROM dxm_category_tree WHERE cat_name = '砧板'");
      // 再次收集同一路径
      await request(app).post('/api/dxm-category/collect').send({
        path: '家居/厨房/砧板',
        leafName: '砧板'
      });
      const after = setup.treeGetOne("SELECT created_at, updated_at FROM dxm_category_tree WHERE cat_name = '砧板'");
      expect(after.created_at).toBe(before.created_at); // created_at 不变
      expect(after.updated_at).toBeTruthy();
    });

    test('POST /api/dxm-tree/sync 新增节点写入 created_at 和 updated_at', async () => {
      await request(app).post('/api/dxm-tree/sync').send({
        categories: [{ catId: 3001, catName: '家居', parentCatId: 0, catLevel: 1, isLeaf: false, path: '家居' }]
      });
      const row = setup.treeGetOne('SELECT created_at, updated_at FROM dxm_category_tree WHERE cat_id = 3001');
      expect(row).toBeTruthy();
      expect(row.created_at).toBeTruthy();
      expect(row.updated_at).toBeTruthy();
    });

    test('POST /api/dxm-tree/sync 更新已有节点时 updated_at 更新', async () => {
      await request(app).post('/api/dxm-tree/sync').send({
        categories: [{ catId: 4001, catName: '旧名', parentCatId: 0, catLevel: 1, isLeaf: false, path: '旧名' }]
      });
      const before = setup.treeGetOne('SELECT created_at, updated_at FROM dxm_category_tree WHERE cat_id = 4001');
      // 更新
      await request(app).post('/api/dxm-tree/sync').send({
        categories: [{ catId: 4001, catName: '新名', parentCatId: 0, catLevel: 1, isLeaf: true, path: '新名' }]
      });
      const after = setup.treeGetOne('SELECT created_at, updated_at, cat_name FROM dxm_category_tree WHERE cat_id = 4001');
      expect(after.cat_name).toBe('新名');
      expect(after.created_at).toBe(before.created_at); // created_at 不变
      expect(after.updated_at).toBeTruthy();
    });
  });
});
