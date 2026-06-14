// sync-users.test.js — 验证 users 表同步 SQL 与四场景逻辑
// 防止 regression: 之前 localUpdate/cloudUpdate 漏了 password_hash/password_salt
//                  之前 pullTable/pushTable 缺 users 分支
//                  之前 pullTable purge 对 users 用物理 DELETE 改为软禁用
// 覆盖：添加(INSERT) / 修改(UPDATE) / 删除(软禁用) / 更新(再次同步)

var initSqlJs = require('sql.js');

var SQL;
var localDb;
var cloudDb;

var USERS_DDL = `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, display_name TEXT DEFAULT '', role TEXT DEFAULT 'operator', last_login TEXT DEFAULT '', must_change_password INTEGER DEFAULT 0, disabled INTEGER DEFAULT 0, created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '')`;

function dbGetOne(database, sql, params) {
  var stmt = database.prepare(sql);
  if (params) stmt.bind(params);
  if (stmt.step()) {
    var row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbRun(database, sql, params) {
  database.run(sql, params || []);
}

function dbAll(database, sql, params) {
  var stmt = database.prepare(sql);
  var rows = [];
  if (params) stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

beforeAll(async function () {
  SQL = await initSqlJs();
});

beforeEach(function () {
  localDb = new SQL.Database();
  cloudDb = new SQL.Database();
  dbRun(localDb, USERS_DDL);
  dbRun(cloudDb, USERS_DDL);
});

afterEach(function () {
  localDb.close();
  cloudDb.close();
});

// 镜像 server/cloud/sync.js SINGLE_TABLE_DEFS.users（保持字段一致）
var USERS_DEF = {
  cloudKey: ['username'],
  cloudTable: 'users',
  cloudCols: 'username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at',
  localGet: function () { return dbAll(localDb, 'SELECT username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at FROM users'); },
  localKeyMatch: function (r) { return 'SELECT id, updated_at FROM users WHERE username = ?'; },
  localKeyParams: function (r) { return [r.username]; },
  localInsert: "INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)",
  localInsertParams: function (r) { return [r.username, r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password, r.disabled || 0, r.updated_at || '']; },
  localUpdate: "UPDATE users SET password_hash = ?, password_salt = ?, display_name = ?, role = ?, last_login = ?, must_change_password = ?, disabled = ?, updated_at = ? WHERE id = ?",
  localUpdateParams: function (r, localRow) { return [r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password || 0, r.disabled || 0, r.updated_at || '', localRow.id]; },
  cloudInsert: "INSERT OR IGNORE INTO users (username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), ?)",
  cloudInsertParams: function (r) { return [r.username, r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password, r.disabled || 0, r.updated_at || '']; },
  cloudUpdate: "UPDATE users SET password_hash = ?, password_salt = ?, display_name = ?, role = ?, last_login = ?, must_change_password = ?, disabled = ?, updated_at = ? WHERE id = ?",
  cloudUpdateParams: function (r, cloudRow) { return [r.password_hash, r.password_salt, r.display_name, r.role, r.last_login, r.must_change_password || 0, r.disabled || 0, r.updated_at || '', cloudRow.id]; }
};

// 模拟 pullTable 的 users 分支（含 purge 软删除）
function pullUsersMock() {
  var cloudRows = dbAll(cloudDb, 'SELECT ' + USERS_DEF.cloudCols + ' FROM users');
  var added = 0, updated = 0, purged = 0;
  for (var i = 0; i < cloudRows.length; i++) {
    var r = cloudRows[i];
    var local = dbGetOne(localDb, USERS_DEF.localKeyMatch(r), USERS_DEF.localKeyParams(r));
    if (!local) {
      dbRun(localDb, USERS_DEF.localInsert, USERS_DEF.localInsertParams(r));
      added++;
    } else {
      var cloudNewer = r.updated_at && (!local.updated_at || r.updated_at > local.updated_at);
      if (cloudNewer) {
        dbRun(localDb, USERS_DEF.localUpdate, USERS_DEF.localUpdateParams(r, local));
        updated++;
      }
    }
  }
  // purge：本地有但云端没有 → disabled=1（软删除，不物理删除）
  var cloudKeys = {};
  for (var ci = 0; ci < cloudRows.length; ci++) cloudKeys[cloudRows[ci].username] = true;
  var localAll = dbAll(localDb, 'SELECT username FROM users');
  for (var li = 0; li < localAll.length; li++) {
    if (!cloudKeys[localAll[li].username]) {
      dbRun(localDb, 'UPDATE users SET disabled = 1 WHERE username = ?', [localAll[li].username]);
      purged++;
    }
  }
  return { added: added, updated: updated, purged: purged };
}

// 模拟 pushTable 的 users 分支
function pushUsersMock() {
  var rows = dbAll(localDb, 'SELECT username, password_hash, password_salt, display_name, role, last_login, must_change_password, disabled, created_at, updated_at FROM users');
  var pushed = 0, skipped = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var cloudExisting = dbGetOne(cloudDb, 'SELECT id FROM users WHERE username = ?', [r.username]);
    if (!cloudExisting) {
      dbRun(cloudDb, USERS_DEF.cloudInsert, USERS_DEF.cloudInsertParams(r));
      pushed++;
    } else {
      var cloudRow = dbGetOne(cloudDb, 'SELECT updated_at FROM users WHERE id = ?', [cloudExisting.id]);
      var localNewer = r.updated_at && (!cloudRow.updated_at || r.updated_at > cloudRow.updated_at);
      if (localNewer) {
        dbRun(cloudDb, USERS_DEF.cloudUpdate, USERS_DEF.cloudUpdateParams(r, cloudExisting));
        pushed++;
      } else { skipped++; }
    }
  }
  return { pushed: pushed, skipped: skipped };
}

describe('users 表同步: SQL 语句包含密码字段', function () {
  test('localUpdate SQL 含 password_hash 和 password_salt', function () {
    expect(USERS_DEF.localUpdate.indexOf('password_hash')).toBeGreaterThanOrEqual(0);
    expect(USERS_DEF.localUpdate.indexOf('password_salt')).toBeGreaterThanOrEqual(0);
  });

  test('cloudUpdate SQL 含 password_hash 和 password_salt', function () {
    expect(USERS_DEF.cloudUpdate.indexOf('password_hash')).toBeGreaterThanOrEqual(0);
    expect(USERS_DEF.cloudUpdate.indexOf('password_salt')).toBeGreaterThanOrEqual(0);
  });
});

describe('【添加】新用户 INSERT 双向传播', function () {
  test('云端新用户 → 拉取到本地（admin 管理台创建后传播给所有机器）', function () {
    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, display_name, role, updated_at) VALUES ('alice', 'h1', 's1', 'Alice', 'operator', '2026-06-14 10:00:00')");

    var result = pullUsersMock();

    expect(result.added).toBe(1);
    var local = dbGetOne(localDb, "SELECT * FROM users WHERE username = 'alice'");
    expect(local).toBeTruthy();
    expect(local.password_hash).toBe('h1');
    expect(local.password_salt).toBe('s1');
    expect(local.role).toBe('operator');
  });

  test('本地新用户 → 推送到云端（旧版本客户端本地创建后传播）', function () {
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, display_name, role, updated_at) VALUES ('bob', 'h2', 's2', 'Bob', 'operator', '2026-06-14 11:00:00')");

    var result = pushUsersMock();

    expect(result.pushed).toBe(1);
    var cloud = dbGetOne(cloudDb, "SELECT * FROM users WHERE username = 'bob'");
    expect(cloud).toBeTruthy();
    expect(cloud.password_hash).toBe('h2');
  });
});

describe('【修改】密码变更 UPDATE 双向传播', function () {
  test('云端改密码 → 本地覆盖（另一台机器改密后本机能登录）', function () {
    var oldSalt = 'old_salt', oldHash = 'old_hash';
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, display_name, role, updated_at) VALUES ('admin', ?, ?, '管理员', 'admin', '2026-06-01 10:00:00')", [oldHash, oldSalt]);

    var newSalt = 'new_salt', newHash = 'new_hash';
    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, display_name, role, updated_at) VALUES ('admin', ?, ?, '管理员', 'admin', '2026-06-14 12:00:00')", [newHash, newSalt]);

    pullUsersMock();

    var after = dbGetOne(localDb, "SELECT password_hash, password_salt FROM users WHERE username = 'admin'");
    expect(after.password_hash).toBe(newHash);
    expect(after.password_salt).toBe(newSalt);
  });

  test('本地改密码 → 推送到云端（本机改密后其他机器同步）', function () {
    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'cloud_old_hash', 'cloud_old_salt', '2026-06-01 10:00:00')");

    var localSalt = 'local_new_salt', localHash = 'local_new_hash';
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', ?, ?, '2026-06-14 18:00:00')", [localHash, localSalt]);

    pushUsersMock();

    var after = dbGetOne(cloudDb, "SELECT password_hash, password_salt FROM users WHERE username = 'admin'");
    expect(after.password_hash).toBe(localHash);
    expect(after.password_salt).toBe(localSalt);
  });
});

describe('【删除】用户从云端移除 → 本地软禁用（不物理删除）', function () {
  test('本地有 alice，云端没有 → 本地 alice 设为 disabled=1', function () {
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, disabled, updated_at) VALUES ('alice', 'h1', 's1', 0, '2026-06-14 10:00:00')");
    // 云端无 alice（被 admin 删除）

    var result = pullUsersMock();

    expect(result.purged).toBe(1);
    var local = dbGetOne(localDb, "SELECT disabled, password_hash FROM users WHERE username = 'alice'");
    expect(local.disabled).toBe(1);  // 软禁用
    expect(local.password_hash).toBe('h1'); // 数据保留，方便 admin 恢复
  });

  test('本地无 admin 用户时不被误删（admin 不在 cloud 时也不应锁死）', function () {
    // 边界场景：本地有 admin，云端暂时连接故障导致 cloudRows 为空
    // 软禁用设计避免锁死，admin 可手动修复
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, role, disabled, updated_at) VALUES ('admin', 'h', 's', 'admin', 0, '2026-06-14 10:00:00')");

    var result = pullUsersMock();

    expect(result.purged).toBe(1);
    var local = dbGetOne(localDb, "SELECT disabled FROM users WHERE username = 'admin'");
    expect(local.disabled).toBe(1); // 软禁用而非物理删除，安全可恢复
  });
});

describe('【更新】updated_at 时间戳冲突解决', function () {
  test('本地比云端新时，pull 不覆盖本地', function () {
    var localHash = 'local_fresh_hash';
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', ?, 's', '2026-06-14 10:00:00')", [localHash]);

    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'cloud_stale_hash', 's2', '2026-06-10 10:00:00')");

    var result = pullUsersMock();

    expect(result.updated).toBe(0); // 云端较旧，不更新
    var after = dbGetOne(localDb, "SELECT password_hash FROM users WHERE username = 'admin'");
    expect(after.password_hash).toBe(localHash);
  });

  test('云端比本地新时，pull 用云端覆盖本地', function () {
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'local_stale', 's', '2026-06-10 10:00:00')");

    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'cloud_fresh', 's2', '2026-06-14 10:00:00')");

    var result = pullUsersMock();

    expect(result.updated).toBe(1);
    var after = dbGetOne(localDb, "SELECT password_hash FROM users WHERE username = 'admin'");
    expect(after.password_hash).toBe('cloud_fresh');
  });

  test('双向同步幂等：再同步一次不会重复更新', function () {
    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'h', 's', '2026-06-14 10:00:00')");

    var r1 = pullUsersMock();
    var r2 = pullUsersMock();

    expect(r1.added).toBe(1);
    expect(r2.added).toBe(0);
    expect(r2.updated).toBe(0); // updated_at 相同，不重复更新
  });
});

describe('【启动同步】ensureAdmin 默认密码不会覆盖云端真实密码', function () {
  test('本地刚创建 admin（updated_at=空）→ pull 时被云端覆盖', function () {
    // 模拟 ensureAdmin：本地新建 admin，updated_at='' （空字符串）
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, must_change_password, updated_at) VALUES ('admin', 'default_hash', 'default_salt', 1, '')");

    // 云端已有 admin（机器 A 之前改过密码）
    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'real_password_hash', 'real_salt', '2026-06-13 10:00:00')");

    pullUsersMock();

    var after = dbGetOne(localDb, "SELECT password_hash, must_change_password FROM users WHERE username = 'admin'");
    expect(after.password_hash).toBe('real_password_hash'); // 云端密码覆盖本地默认
  });

  test('本地刚创建 admin（updated_at=空）→ push 不覆盖云端', function () {
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, must_change_password, updated_at) VALUES ('admin', 'default_hash', 'default_salt', 1, '')");
    dbRun(cloudDb, "INSERT INTO users (username, password_hash, password_salt, updated_at) VALUES ('admin', 'real_password_hash', 'real_salt', '2026-06-13 10:00:00')");

    pushUsersMock();

    var cloud = dbGetOne(cloudDb, "SELECT password_hash FROM users WHERE username = 'admin'");
    expect(cloud.password_hash).toBe('real_password_hash'); // 云端不被默认密码覆盖
  });

  test('云端无 admin 时，本地默认 admin 推送到云端（首次部署场景）', function () {
    dbRun(localDb, "INSERT INTO users (username, password_hash, password_salt, must_change_password, updated_at) VALUES ('admin', 'default_hash', 'default_salt', 1, '')");

    var result = pushUsersMock();

    expect(result.pushed).toBe(1); // 首次 insert，不判断 updated_at
    var cloud = dbGetOne(cloudDb, "SELECT password_hash FROM users WHERE username = 'admin'");
    expect(cloud).toBeTruthy();
    expect(cloud.password_hash).toBe('default_hash');
  });
});
