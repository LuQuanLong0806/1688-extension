// latency-bench.js — 本地 SQLite vs 远程 Turso 读写延迟基准测试
// 用法: cd server && node __tests__/latency-bench.js

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const ITERATIONS = 20; // 每项测试重复次数

// ========== 本地 SQLite 基准 ==========
async function benchLocal() {
  const SQL = await initSqlJs();

  // 使用内存数据库（代表本地 SQLite 的典型速度）
  const db = new SQL.Database();
  db.run('CREATE TABLE bench_test (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT, UNIQUE(key))');
  db.run('CREATE TABLE bench_read (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category TEXT, count INTEGER DEFAULT 1)');

  // 预填 1000 条读取数据
  for (let i = 0; i < 1000; i++) {
    db.run('INSERT INTO bench_read (name, category, count) VALUES (?, ?, ?)', ['类目' + i, '分类/子类/类目' + i, Math.floor(Math.random() * 100)]);
  }

  const results = {};

  // 1. 单条写入（INSERT）
  {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      db.run('INSERT OR IGNORE INTO bench_test (key, value) VALUES (?, ?)', ['key_' + i, 'val_' + i]);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['单条写入 INSERT'] = times;
  }

  // 2. 单条读取（SELECT by key）
  {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      db.run('SELECT * FROM bench_test WHERE key = ?', ['key_' + (i % ITERATIONS)]);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['单条读取 SELECT'] = times;
  }

  // 3. 模糊搜索（LIKE）
  {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      const stmt = db.prepare("SELECT * FROM bench_read WHERE name LIKE ?");
      stmt.bind(['%类目' + (i % 100) + '%']);
      while (stmt.step()) {}
      stmt.free();
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['模糊搜索 LIKE'] = times;
  }

  // 4. 聚合查询（COUNT + GROUP BY）
  {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      const stmt = db.prepare('SELECT category, COUNT(*) as cnt FROM bench_read GROUP BY category');
      while (stmt.step()) {}
      stmt.free();
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['聚合查询 GROUP BY'] = times;
  }

  // 5. JSON_EXTRACT 查询
  {
    db.run('CREATE TABLE bench_json (id INTEGER PRIMARY KEY, data TEXT)');
    for (let i = 0; i < 500; i++) {
      db.run('INSERT INTO bench_json (data) VALUES (?)', [JSON.stringify({ leafCategoryName: '类目' + i, categoryPath: '分类/类目' + i })]);
    }
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      const stmt = db.prepare("SELECT JSON_EXTRACT(data, '$.leafCategoryName') as name FROM bench_json WHERE JSON_EXTRACT(data, '$.leafCategoryName') = ?");
      stmt.bind(['类目' + (i % 500)]);
      while (stmt.step()) {}
      stmt.free();
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['JSON_EXTRACT 查询'] = times;
  }

  return results;
}

// ========== 远程 Turso 基准 ==========
async function benchRemote() {
  // 从 settings 读取 Turso 配置
  const sec = require('../crypto');
  const SQL = await initSqlJs();
  const DB_FILE = path.join(__dirname, '..', 'data.db');

  let db;
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    console.log('  [跳过] data.db 不存在');
    return null;
  }

  const row = db.prepare("SELECT value FROM settings WHERE key = 'turso_config'");
  if (!row.step()) {
    console.log('  [跳过] 未配置 Turso (turso_config 不存在)');
    row.free();
    return null;
  }
  const config = JSON.parse(row.getAsObject().value);
  row.free();

  const { createClient } = require('@libsql/client');
  const client = createClient({ url: config.url, authToken: config.token });

  // 测试连接
  try {
    await client.execute('SELECT 1');
    console.log('  [连接] Turso 连接成功');
  } catch (e) {
    console.log('  [跳过] Turso 连接失败:', e.message);
    return null;
  }

  // 准备测试表
  try {
    await client.execute('CREATE TABLE IF NOT EXISTS bench_test (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, value TEXT, UNIQUE(key))');
    await client.execute('DELETE FROM bench_test WHERE key LIKE \'bench_%\'');
  } catch (e) {}

  const results = {};

  // 1. 单条写入
  {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      await client.execute({ sql: 'INSERT OR IGNORE INTO bench_test (key, value) VALUES (?, ?)', args: ['bench_' + i, 'val_' + i] });
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['单条写入 INSERT'] = times;
  }

  // 2. 单条读取
  {
    const times = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const t0 = process.hrtime.bigint();
      await client.execute({ sql: 'SELECT * FROM bench_test WHERE key = ?', args: ['bench_' + (i % ITERATIONS)] });
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    results['单条读取 SELECT'] = times;
  }

  // 3. category_mappings 表读取（真实数据量）
  {
    try {
      await client.execute('SELECT 1 FROM category_mappings LIMIT 1');
      const times = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = process.hrtime.bigint();
        await client.execute({ sql: "SELECT custom_category, count, source FROM category_mappings WHERE category_name = ? ORDER BY count DESC, id", args: ['浴室用品'] });
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      results['映射查询 getMappings'] = times;
    } catch (e) { console.log('  [跳过] category_mappings 表不存在'); }
  }

  // 4. category_config 表读取
  {
    try {
      await client.execute('SELECT 1 FROM category_config LIMIT 1');
      const times = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = process.hrtime.bigint();
        await client.execute({ sql: "SELECT type, value, group_name FROM category_config WHERE type = 'mutex' ORDER BY sort_order, id", args: [] });
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      results['配置读取 getCategoryConfig'] = times;
    } catch (e) { console.log('  [跳过] category_config 表不存在'); }
  }

  // 5. 全表扫描 category_config
  {
    try {
      await client.execute('SELECT 1 FROM category_config LIMIT 1');
      const times = [];
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = process.hrtime.bigint();
        await client.execute("SELECT type, value, group_name, description, sort_order FROM category_config ORDER BY type, sort_order, id");
        times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      results['全表读取 getAllCategoryConfig'] = times;
    } catch (e) { console.log('  [跳过] category_config 表不存在'); }
  }

  // 清理
  try { await client.execute("DELETE FROM bench_test WHERE key LIKE 'bench_%'"); } catch (e) {}

  return results;
}

// ========== 输出格式化 ==========
function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return { avg: avg.toFixed(2), p50: p50.toFixed(2), p95: p95.toFixed(2), min: min.toFixed(2), max: max.toFixed(2) };
}

function printTable(title, localResults, remoteResults) {
  console.log('\n' + '='.repeat(80));
  console.log('  ' + title);
  console.log('='.repeat(80));
  console.log('  测试次数: ' + ITERATIONS + ' 次/项\n');

  const allKeys = new Set([...Object.keys(localResults || {}), ...Object.keys(remoteResults || {})]);
  const header = '  操作类型'.padEnd(22) + '| 本地平均 (ms)'.padEnd(16) + '| 远程平均 (ms)'.padEnd(16) + '| 延迟倍数'.padEnd(12) + '| 本地 P95'.padEnd(12) + '| 远程 P95';
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  allKeys.forEach(key => {
    const local = localResults && localResults[key] ? stats(localResults[key]) : null;
    const remote = remoteResults && remoteResults[key] ? stats(remoteResults[key]) : null;
    const localAvg = local ? local.avg : '-';
    const remoteAvg = remote ? remote.avg : '-';
    const localP95 = local ? local.p95 : '-';
    const remoteP95 = remote ? remote.p95 : '-';
    let ratio = '-';
    if (local && remote) {
      ratio = (parseFloat(remote.avg) / parseFloat(local.avg)).toFixed(1) + 'x';
    }
    console.log(
      '  ' + key.padEnd(20) + '| ' + localAvg.padEnd(14) + '| ' + remoteAvg.padEnd(14) + '| ' + ratio.padEnd(10) + '| ' + localP95.padEnd(10) + '| ' + remoteP95
    );
  });

  console.log('');
}

// ========== 主流程 ==========
async function main() {
  console.log('\n  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   本地 SQLite vs 远程 Turso 读写延迟基准测试    ║');
  console.log('  ╚══════════════════════════════════════════════════╝\n');

  console.log('▶ 本地 SQLite (内存数据库) 测试中...');
  const localResults = await benchLocal();
  console.log('  本地测试完成\n');

  console.log('▶ 远程 Turso 测试中...');
  const remoteResults = await benchRemote();
  if (!remoteResults) {
    console.log('\n  远程 Turso 不可用，仅显示本地结果');
    printTable('本地 SQLite 延迟 (内存数据库)', localResults, null);
    // 打印本地详情
    Object.keys(localResults).forEach(key => {
      const s = stats(localResults[key]);
      console.log('  ' + key + ': avg=' + s.avg + 'ms p50=' + s.p50 + 'ms p95=' + s.p95 + 'ms min=' + s.min + 'ms max=' + s.max + 'ms');
    });
    return;
  }
  console.log('  远程测试完成\n');

  printTable('本地 SQLite vs 远程 Turso 延迟对比', localResults, remoteResults);

  // 总结
  console.log('─'.repeat(80));
  console.log('  总结:');
  const localWrites = stats(localResults['单条写入 INSERT']);
  const remoteWrites = stats(remoteResults['单条写入 INSERT']);
  const localReads = stats(localResults['单条读取 SELECT']);
  const remoteReads = stats(remoteResults['单条读取 SELECT']);
  console.log('  写入延迟: 本地 ' + localWrites.avg + 'ms → 远程 ' + remoteWrites.avg + 'ms (' + (parseFloat(remoteWrites.avg) / parseFloat(localWrites.avg)).toFixed(0) + 'x)');
  console.log('  读取延迟: 本地 ' + localReads.avg + 'ms → 远程 ' + remoteReads.avg + 'ms (' + (parseFloat(remoteReads.avg) / parseFloat(localReads.avg)).toFixed(0) + 'x)');
  console.log('');

  if (remoteResults['映射查询 getMappings']) {
    const mappingRemote = stats(remoteResults['映射查询 getMappings']);
    console.log('  实际场景 — getMappings 远程平均: ' + mappingRemote.avg + 'ms, P95: ' + mappingRemote.p95 + 'ms');
  }
  if (remoteResults['配置读取 getCategoryConfig']) {
    const configRemote = stats(remoteResults['配置读取 getCategoryConfig']);
    console.log('  实际场景 — getCategoryConfig 远程平均: ' + configRemote.avg + 'ms, P95: ' + configRemote.p95 + 'ms');
  }
  if (remoteResults['全表读取 getAllCategoryConfig']) {
    const allConfigRemote = stats(remoteResults['全表读取 getAllCategoryConfig']);
    console.log('  实际场景 — getAllCategoryConfig 远程平均: ' + allConfigRemote.avg + 'ms, P95: ' + allConfigRemote.p95 + 'ms');
  }

  console.log('\n  结论:');
  const remoteAvg = parseFloat(remoteWrites.avg);
  if (remoteAvg < 50) {
    console.log('  远程延迟较低 (<50ms)，优先远程方案可行');
  } else if (remoteAvg < 150) {
    console.log('  远程延迟中等 (50-150ms)，建议关键路径（分类推荐）优先本地，非实时操作优先远程');
  } else {
    console.log('  远程延迟较高 (>150ms)，建议保持本地优先，异步同步到远程');
  }
  console.log('');
}

main().catch(e => { console.error('测试失败:', e); process.exit(1); });
