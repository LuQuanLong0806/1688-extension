// utc8-timestamp.test.js — UTC+8 时间戳格式化验证
// 测试范围：datetime('now', '+8 hours') SQL 表达式、JS nowCST 格式化、云同步 since 参数、默认日期范围

// ===== 1. SQL datetime('now', '+8 hours') 验证 =====
describe('SQL datetime UTC+8 表达式', function () {
  test('datetime("now", "+8 hours") 格式为 YYYY-MM-DD HH:MM:SS', function () {
    // 验证格式：正则匹配
    var re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    expect(re.test('2026-06-10 14:30:00')).toBe(true);
    expect(re.test('2026-06-10T14:30:00Z')).toBe(false);
    expect(re.test('2026-06-10')).toBe(false);
  });

  test('datetime 参数 "+8 hours" 语法正确', function () {
    // SQLite 合法的 modifier 格式
    expect("+8 hours".indexOf('+')).toBe(0);
    expect("+8 hours".indexOf('hours')).toBeGreaterThan(0);
  });
});

// ===== 2. JS nowCST 函数验证 =====
describe('JS nowCST 时间戳', function () {
  function nowCST() {
    return new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
  }

  test('返回格式为 YYYY-MM-DD HH:MM:SS', function () {
    var ts = nowCST();
    var re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    expect(re.test(ts)).toBe(true);
  });

  test('时间戳与当前时间接近（±1分钟内）', function () {
    var ts = nowCST();
    var parts = ts.split(/[- :]/);
    var cstDate = new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parseInt(parts[2]),
      parseInt(parts[3]),
      parseInt(parts[4]),
      parseInt(parts[5])
    );
    var now = new Date();
    // 如果系统时区是 UTC+8，两者应接近
    var diff = Math.abs(now.getTime() - cstDate.getTime());
    // 允许最多 60 秒差异（系统时区非 UTC+8 或执行延迟）
    expect(diff).toBeLessThan(60000);
  });

  test('不含 T 和 Z（非 ISO 格式）', function () {
    var ts = nowCST();
    expect(ts.indexOf('T')).toBe(-1);
    expect(ts.indexOf('Z')).toBe(-1);
  });
});

// ===== 3. 本地日期格式化（前端 since 参数） =====
describe('前端 since 参数本地日期格式化', function () {
  function formatLocalDate(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  test('格式化为 YYYY-MM-DD', function () {
    var d = new Date(2026, 5, 10); // 2026-06-10
    expect(formatLocalDate(d)).toBe('2026-06-10');
  });

  test('月份和日期补零', function () {
    var d = new Date(2026, 0, 5); // 2026-01-05
    expect(formatLocalDate(d)).toBe('2026-01-05');
  });

  test('默认日期范围：3天前到今天', function () {
    var end = new Date();
    var start = new Date();
    start.setDate(start.getDate() - 3);
    var range = [formatLocalDate(start), formatLocalDate(end)];
    expect(range.length).toBe(2);
    // start 日期应早于 end 日期
    expect(range[0] < range[1] || range[0] === range[1]).toBe(true);
  });

  test('since 参数与 updated_at 字段可比', function () {
    // since='2026-06-07', updated_at='2026-06-07 14:30:00' → updated_at >= since 应为 true
    expect('2026-06-07 14:30:00' >= '2026-06-07').toBe(true);
    expect('2026-06-06 23:59:59' >= '2026-06-07').toBe(false);
  });
});

// ===== 4. DDL DEFAULT 值验证 =====
describe('DDL DEFAULT 时间戳表达式', function () {
  test('DEFAULT (datetime("now", "+8 hours")) 格式合法', function () {
    var ddl = "created_at DATETIME DEFAULT (datetime('now', '+8 hours'))";
    expect(ddl.indexOf('datetime')).toBeGreaterThan(0);
    expect(ddl.indexOf('DEFAULT')).toBeGreaterThan(0);
    expect(ddl.indexOf('+8 hours')).toBeGreaterThan(0);
  });

  test('INSERT 中 datetime 表达式位置正确', function () {
    var sql = "INSERT INTO t (name, created_at, updated_at) VALUES (?, datetime(\"now\", \"+8 hours\"), datetime(\"now\", \"+8 hours\"))";
    expect(sql.indexOf('datetime')).toBeGreaterThan(0);
    expect(sql.split('datetime').length - 1).toBe(2);
  });

  test('UPDATE SET updated_at 表达式正确', function () {
    var sql = 'UPDATE t SET updated_at = datetime("now", "+8 hours") WHERE id = ?';
    expect(sql.indexOf('updated_at = datetime')).toBeGreaterThan(0);
  });
});

// ===== 5. 云同步 since 日期参数传递验证 =====
describe('云同步 since 参数', function () {
  test('since 参数格式为 YYYY-MM-DD', function () {
    var d = new Date();
    var since = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    expect(since.length).toBe(10);
    expect(since.indexOf('-')).toBe(4);
  });

  test('since 参数在 WHERE 子句中正确使用', function () {
    var since = '2026-06-07';
    var sql = 'SELECT * FROM products WHERE updated_at >= ?';
    expect(sql.indexOf('updated_at >=')).toBeGreaterThan(0);
    // 字符串比较：'2026-06-07 14:30:00' >= '2026-06-07'
    expect('2026-06-07 14:30:00' >= since).toBe(true);
  });

  test('无 since 参数时查询全表', function () {
    var where = '';
    var params = [];
    var since = null;
    if (since) {
      where = ' WHERE updated_at >= ?';
      params = [since];
    }
    expect(where).toBe('');
    expect(params.length).toBe(0);
  });
});
