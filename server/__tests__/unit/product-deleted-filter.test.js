// product-deleted-filter.test.js — 删除筛选功能测试
// 覆盖：deleted 参数的三种模式（默认/已删除/全部）、与其他筛选组合

const initSqlJs = require('sql.js');

let SQL;
let memDb;

function run(sql, params) { memDb.run(sql, params); }
function getOne(sql, params) {
  var stmt = memDb.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) { var row = stmt.getAsObject(); stmt.free(); return row; }
  stmt.free(); return null;
}
function getAll(sql, params) {
  var stmt = memDb.prepare(sql);
  if (params) stmt.bind(params);
  var rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}

const DDL = `CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT DEFAULT '',
  source_url TEXT NOT NULL,
  title TEXT,
  main_images TEXT DEFAULT '',
  desc_images TEXT DEFAULT '',
  detail_images TEXT DEFAULT '',
  attrs TEXT DEFAULT '',
  skus TEXT DEFAULT '',
  status INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  category TEXT DEFAULT '',
  custom_category TEXT DEFAULT '',
  dxm_category TEXT DEFAULT '',
  manual_category TEXT DEFAULT '',
  deleted INTEGER DEFAULT 0
)`;

// 模拟路由中的 deleted 筛选逻辑
function buildDeletedWhere(deleted) {
  var where = [];
  if (deleted === '1') {
    where.push('deleted = 1');
  } else if (deleted === 'all') {
    // 不加 deleted 条件
  } else {
    where.push('deleted = 0');
  }
  return where;
}

function queryProducts(deleted, extraWhere, params) {
  extraWhere = extraWhere || [];
  params = params || [];
  var where = buildDeletedWhere(deleted).concat(extraWhere);
  var clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return getAll('SELECT uid, title, deleted, status FROM products ' + clause + ' ORDER BY id', params);
}

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  memDb = new SQL.Database();
  memDb.run(DDL);
  // 插入测试数据
  run("INSERT INTO products (uid, source_url, title, deleted, status) VALUES ('u1', 'url1', '正常商品A', 0, 0)");
  run("INSERT INTO products (uid, source_url, title, deleted, status) VALUES ('u2', 'url2', '正常商品B', 0, 1)");
  run("INSERT INTO products (uid, source_url, title, deleted, status) VALUES ('u3', 'url3', '已删除商品C', 1, 0)");
  run("INSERT INTO products (uid, source_url, title, deleted, status) VALUES ('u4', 'url4', '已删除商品D', 1, 1)");
});
afterEach(() => { memDb.close(); });

// ===== 1. 默认模式（deleted = 0 / 未传参） =====
describe('默认模式：只返回未删除商品', () => {
  test('不传 deleted 参数 → 只返回 deleted=0', () => {
    var rows = queryProducts(undefined);
    expect(rows.length).toBe(2);
    expect(rows.every(function(r) { return r.deleted === 0; })).toBe(true);
  });

  test('deleted=0 → 只返回未删除', () => {
    var rows = queryProducts('0');
    expect(rows.length).toBe(2);
    expect(rows.every(function(r) { return r.deleted === 0; })).toBe(true);
  });

  test('默认模式包含已发布和未发布', () => {
    var rows = queryProducts(undefined);
    var statuses = rows.map(function(r) { return r.status; }).sort();
    expect(statuses).toEqual([0, 1]);
  });
});

// ===== 2. 已删除模式（deleted = 1） =====
describe('已删除模式：只返回已删除商品', () => {
  test('deleted=1 → 只返回 deleted=1', () => {
    var rows = queryProducts('1');
    expect(rows.length).toBe(2);
    expect(rows.every(function(r) { return r.deleted === 1; })).toBe(true);
  });

  test('已删除商品的标题正确', () => {
    var rows = queryProducts('1');
    var titles = rows.map(function(r) { return r.title; });
    expect(titles).toContain('已删除商品C');
    expect(titles).toContain('已删除商品D');
  });
});

// ===== 3. 全部模式（deleted = all） =====
describe('全部模式：返回所有商品', () => {
  test('deleted=all → 返回全部4条', () => {
    var rows = queryProducts('all');
    expect(rows.length).toBe(4);
  });

  test('deleted=all → 包含 deleted=0 和 deleted=1', () => {
    var rows = queryProducts('all');
    var deletedValues = rows.map(function(r) { return r.deleted; });
    expect(deletedValues).toContain(0);
    expect(deletedValues).toContain(1);
  });
});

// ===== 4. 与其他筛选条件组合 =====
describe('与其他筛选条件组合', () => {
  test('deleted=0 + status=1（已发布未删除）', () => {
    var rows = queryProducts('0', ['status = 1']);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('正常商品B');
    expect(rows[0].deleted).toBe(0);
    expect(rows[0].status).toBe(1);
  });

  test('deleted=1 + status=0（未发布已删除）', () => {
    var rows = queryProducts('1', ['status = 0']);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('已删除商品C');
    expect(rows[0].deleted).toBe(1);
  });

  test('deleted=all + 关键词搜索', () => {
    var rows = queryProducts('all', ['title LIKE ?'], ['%正常%']);
    expect(rows.length).toBe(2);
    expect(rows.every(function(r) { return r.title.indexOf('正常') >= 0; })).toBe(true);
  });

  test('deleted=0 + 关键词搜索（无匹配）', () => {
    var rows = queryProducts('0', ['title LIKE ?'], ['%不存在%']);
    expect(rows.length).toBe(0);
  });

  test('deleted=1 + 关键词搜索', () => {
    var rows = queryProducts('1', ['title LIKE ?'], ['%C%']);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('已删除商品C');
  });
});

// ===== 5. 统计测试 =====
describe('删除筛选统计', () => {
  test('默认模式总数', () => {
    var rows = queryProducts(undefined);
    expect(rows.length).toBe(2);
  });

  test('已删除模式总数', () => {
    var rows = queryProducts('1');
    expect(rows.length).toBe(2);
  });

  test('全部模式总数', () => {
    var rows = queryProducts('all');
    expect(rows.length).toBe(4);
  });
});

// ===== 6. 边界测试 =====
describe('边界情况', () => {
  test('空表默认模式返回空', () => {
    memDb.close();
    memDb = new SQL.Database();
    memDb.run(DDL);
    var rows = queryProducts(undefined);
    expect(rows.length).toBe(0);
  });

  test('全部删除后默认模式为空', () => {
    run("UPDATE products SET deleted = 1");
    var rows = queryProducts(undefined);
    expect(rows.length).toBe(0);
  });

  test('全部删除后已删除模式返回全部', () => {
    run("UPDATE products SET deleted = 1");
    var rows = queryProducts('1');
    expect(rows.length).toBe(4);
  });
});
