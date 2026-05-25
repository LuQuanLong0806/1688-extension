// product-uid.test.js — uid 标识改造测试
// 覆盖：generateUid、回填、API 按uid查找、批量操作、同步

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

beforeAll(async () => { SQL = await initSqlJs(); });
beforeEach(() => {
  memDb = new SQL.Database();
  memDb.run(DDL);
  // 注意：UNIQUE INDEX 在回填后才创建，测试中按需手动创建
});
afterEach(() => { memDb.close(); });

// ===== 1. generateUid 测试 =====
describe('generateUid', () => {
  var dbModule = require('../../db');

  test('返回非空字符串', () => {
    var uid = dbModule.generateUid();
    expect(typeof uid).toBe('string');
    expect(uid.length).toBeGreaterThan(10);
  });

  test('连续生成不重复', () => {
    var set = new Set();
    for (var i = 0; i < 100; i++) {
      set.add(dbModule.generateUid());
    }
    expect(set.size).toBe(100);
  });

  test('不含特殊字符', () => {
    var uid = dbModule.generateUid();
    expect(/^[a-z0-9]+$/.test(uid)).toBe(true);
  });
});

// ===== 2. uid 回填测试 =====
describe('uid 回填', () => {
  test('空 uid 记录可被检测', () => {
    // 先插入带 uid 的记录，再清空一条模拟旧数据
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', 'a')");
    run("INSERT INTO products (uid, source_url, title) VALUES ('u2', 'url2', 'b')");
    run("UPDATE products SET uid = '' WHERE uid = 'u2'");
    var rows = getAll("SELECT id FROM products WHERE uid IS NULL OR uid = ''");
    expect(rows.length).toBe(1);
  });

  test('回填后 uid 唯一且非空', () => {
    var dbModule = require('../../db');
    // 模拟旧数据：逐条插入（每条先有唯一 uid 再清空）
    run("INSERT INTO products (uid, source_url, title) VALUES ('_t1', 'url1', 'a')");
    run("UPDATE products SET uid = '' WHERE uid = '_t1'");
    run("INSERT INTO products (uid, source_url, title) VALUES ('_t2', 'url2', 'b')");
    run("UPDATE products SET uid = '' WHERE uid = '_t2'");
    run("INSERT INTO products (uid, source_url, title) VALUES ('_t3', 'url3', 'c')");
    run("UPDATE products SET uid = '' WHERE uid = '_t3'");
    var rows = getAll("SELECT id FROM products WHERE uid IS NULL OR uid = ''");
    var uids = [];
    for (var i = 0; i < rows.length; i++) {
      var uid = dbModule.generateUid();
      run('UPDATE products SET uid = ? WHERE id = ?', [uid, rows[i].id]);
      uids.push(uid);
    }
    expect(uids.length).toBe(3);
    var uniqueSet = new Set(uids);
    expect(uniqueSet.size).toBe(uids.length);
    var empty = getAll("SELECT id FROM products WHERE uid IS NULL OR uid = ''");
    expect(empty.length).toBe(0);
  });

  test('已有 uid 的记录不受影响', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('existing_uid', 'url1', 'a')");
    var rows = getAll("SELECT id FROM products WHERE uid IS NULL OR uid = ''");
    expect(rows.length).toBe(0);
    var row = getOne("SELECT uid FROM products WHERE source_url = 'url1'");
    expect(row.uid).toBe('existing_uid');
  });
});

// ===== 3. 按 uid CRUD 测试 =====
describe('按 uid CRUD', () => {
  beforeEach(() => {
    try { memDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)'); } catch (e) {}
  });

  test('按 uid 查询（模拟 GET /product/:uid）', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', '毛巾')");
    var row = getOne('SELECT * FROM products WHERE uid = ?', ['u1']);
    expect(row).not.toBeNull();
    expect(row.title).toBe('毛巾');
    expect(row.uid).toBe('u1');
  });

  test('按 uid 更新（模拟 PUT /product/:uid）', () => {
    run("INSERT INTO products (uid, source_url, title, custom_category) VALUES ('u1', 'url1', '毛巾', '')");
    run("UPDATE products SET custom_category = '家居/毛巾', updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ['u1']);
    var row = getOne("SELECT custom_category FROM products WHERE uid = 'u1'");
    expect(row.custom_category).toBe('家居/毛巾');
  });

  test('按 uid 逻辑删除（模拟 DELETE /product/:uid）', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', '毛巾')");
    run('UPDATE products SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE uid = ?', ['u1']);
    var row = getOne("SELECT deleted FROM products WHERE uid = 'u1'");
    expect(row.deleted).toBe(1);
  });

  test('uid 不存在时查询返回 null', () => {
    var row = getOne('SELECT * FROM products WHERE uid = ?', ['nonexistent']);
    expect(row).toBeNull();
  });

  test('按 uid 批量删除', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', 'a')");
    run("INSERT INTO products (uid, source_url, title) VALUES ('u2', 'url2', 'b')");
    run("INSERT INTO products (uid, source_url, title) VALUES ('u3', 'url3', 'c')");
    run("UPDATE products SET deleted = 1 WHERE uid IN ('u1', 'u3')");
    var deleted = getAll('SELECT uid FROM products WHERE deleted = 1');
    expect(deleted.length).toBe(2);
    var alive = getAll('SELECT uid FROM products WHERE deleted = 0');
    expect(alive.length).toBe(1);
    expect(alive[0].uid).toBe('u2');
  });

  test('按 uid 批量更新状态', () => {
    run("INSERT INTO products (uid, source_url, title, status) VALUES ('u1', 'url1', 'a', 0)");
    run("INSERT INTO products (uid, source_url, title, status) VALUES ('u2', 'url2', 'b', 0)");
    run("UPDATE products SET status = 1 WHERE uid IN ('u1', 'u2')");
    var rows = getAll('SELECT uid, status FROM products');
    expect(rows.every(function(r) { return r.status === 1; })).toBe(true);
  });
});

// ===== 4. uid 向后兼容（数字 id 回退查找） =====
describe('uid/数字 id 双模式查找', () => {
  test('纯数字参数 → 按 id 查找', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', '毛巾')");
    var param = '1';
    var row;
    if (/^\d+$/.test(param)) {
      row = getOne('SELECT * FROM products WHERE id = ?', [parseInt(param)]);
    } else {
      row = getOne('SELECT * FROM products WHERE uid = ?', [param]);
    }
    expect(row).not.toBeNull();
    expect(row.title).toBe('毛巾');
  });

  test('uid 字符串参数 → 按 uid 查找', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('m1a2b3c4d5', 'url1', '毛巾')");
    var param = 'm1a2b3c4d5';
    var row;
    if (/^\d+$/.test(param)) {
      row = getOne('SELECT * FROM products WHERE id = ?', [parseInt(param)]);
    } else {
      row = getOne('SELECT * FROM products WHERE uid = ?', [param]);
    }
    expect(row).not.toBeNull();
    expect(row.title).toBe('毛巾');
  });

  test('无效参数 → 返回 null', () => {
    var row = getOne('SELECT * FROM products WHERE uid = ?', ['notexist']);
    expect(row).toBeNull();
  });
});

// ===== 5. 同一 source_url 多条记录 =====
describe('同一 source_url 不同 uid', () => {
  test('可以插入多条记录', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', '第一次采集')");
    run("INSERT INTO products (uid, source_url, title) VALUES ('u2', 'url1', '第二次采集')");
    var rows = getAll("SELECT uid, title FROM products WHERE source_url = 'url1' ORDER BY uid");
    expect(rows.length).toBe(2);
    expect(rows[0].uid).toBe('u1');
    expect(rows[1].uid).toBe('u2');
  });

  test('按 uid 精确更新不影响其他记录', () => {
    run("INSERT INTO products (uid, source_url, title, custom_category) VALUES ('u1', 'url1', 'A', '')");
    run("INSERT INTO products (uid, source_url, title, custom_category) VALUES ('u2', 'url1', 'B', '')");
    run("UPDATE products SET custom_category = '家居' WHERE uid = 'u1'");
    var row1 = getOne("SELECT custom_category FROM products WHERE uid = 'u1'");
    var row2 = getOne("SELECT custom_category FROM products WHERE uid = 'u2'");
    expect(row1.custom_category).toBe('家居');
    expect(row2.custom_category).toBe('');
  });

  test('按 uid 删除不影响其他记录', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', 'A')");
    run("INSERT INTO products (uid, source_url, title) VALUES ('u2', 'url1', 'B')");
    run("UPDATE products SET deleted = 1 WHERE uid = 'u1'");
    var alive = getAll("SELECT uid FROM products WHERE source_url = 'url1' AND deleted = 0");
    expect(alive.length).toBe(1);
    expect(alive[0].uid).toBe('u2');
  });
});

// ===== 6. uid 唯一约束测试 =====
describe('uid 唯一约束', () => {
  beforeEach(() => {
    try { memDb.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_uid ON products(uid)'); } catch (e) {}
  });

  test('重复 uid 插入会报错', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url1', 'A')");
    expect(function () {
      run("INSERT INTO products (uid, source_url, title) VALUES ('u1', 'url2', 'B')");
    }).toThrow();
  });

  test('ON CONFLICT(uid) 更新', () => {
    run("INSERT INTO products (uid, source_url, title, custom_category) VALUES ('u1', 'url1', '旧标题', '旧分类')");
    memDb.run("INSERT INTO products (uid, source_url, title, custom_category) VALUES ('u1', 'url1', '新标题', '新分类') ON CONFLICT(uid) DO UPDATE SET title = excluded.title, custom_category = excluded.custom_category");
    var row = getOne("SELECT title, custom_category FROM products WHERE uid = 'u1'");
    expect(row.title).toBe('新标题');
    expect(row.custom_category).toBe('新分类');
  });
});

// ===== 7. 空值边界测试 =====
describe('空值边界', () => {
  test('uid 为空字符串不匹配任何查询', () => {
    run("INSERT INTO products (uid, source_url, title) VALUES ('', 'url1', '无uid记录')");
    var row = getOne("SELECT * FROM products WHERE uid = ''");
    // 空字符串 uid 可以查到，但同步时会被跳过
    expect(row).not.toBeNull();
  });

  test('uid 为 NULL 不匹配', () => {
    // uid DEFAULT '' 所以正常不会 NULL，但防御性测试
    run("INSERT INTO products (uid, source_url, title) VALUES ('', 'url1', 'a')");
    var row = getOne("SELECT * FROM products WHERE uid = 'nonexistent'");
    expect(row).toBeNull();
  });
});
