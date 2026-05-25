// category-config-soft-delete.test.js — 词库软删/复活/过滤测试
const setup = require('../helpers/setup');

beforeAll(async () => {
  await setup.initTestDb();
});

beforeEach(() => {
  setup.run('DELETE FROM category_config');
});

afterEach(() => {
  setup.run('DELETE FROM category_config');
});

describe('category_config 软删', () => {
  test('插入后 deleted 为 0', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '测试词', '')");
    const row = setup.getOne("SELECT deleted FROM category_config WHERE type = 'noise' AND value = '测试词'");
    expect(row.deleted).toBe(0);
  });

  test('软删设置 deleted=1，记录仍存在', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '爆款词', '')");
    const row = setup.getOne("SELECT id FROM category_config WHERE type = 'noise' AND value = '爆款词'");
    expect(row).toBeTruthy();

    setup.run('UPDATE category_config SET deleted = 1 WHERE id = ?', [row.id]);

    const after = setup.getOne("SELECT id, deleted FROM category_config WHERE id = ?", [row.id]);
    expect(after).toBeTruthy();
    expect(after.deleted).toBe(1);
  });

  test('查询过滤 deleted=0 不返回已删记录', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '活跃词', '')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '已删词', '')");
    setup.run("UPDATE category_config SET deleted = 1 WHERE value = '已删词'");

    const rows = setup.getAll("SELECT value FROM category_config WHERE type = 'noise' AND deleted = 0");
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('活跃词');
  });

  test('查询包含 deleted=0 返回所有正常记录', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('generic', '词A', '')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('generic', '词B', '')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('generic', '词C', '')");

    const rows = setup.getAll("SELECT value FROM category_config WHERE type = 'generic' AND deleted = 0 ORDER BY value");
    expect(rows.length).toBe(3);
  });

  test('复活已删记录: deleted=1 → deleted=0', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '厨房', '厨房用品')");
    setup.run("UPDATE category_config SET deleted = 1 WHERE value = '厨房'");

    const deleted = setup.getOne("SELECT deleted FROM category_config WHERE value = '厨房'");
    expect(deleted.deleted).toBe(1);

    // 复活
    setup.run("UPDATE category_config SET deleted = 0 WHERE value = '厨房'");

    const restored = setup.getOne("SELECT deleted FROM category_config WHERE value = '厨房'");
    expect(restored.deleted).toBe(0);
  });

  test('UNIQUE 约束: 软删后同名插入不冲突', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '重复词', '')");
    setup.run("UPDATE category_config SET deleted = 1 WHERE value = '重复词'");

    // 同名插入应该因 UNIQUE 约束失败（deleted 列不参与 UNIQUE）
    expect(() => {
      setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '重复词', '')");
    }).toThrow();

    // 但复活应该成功
    setup.run("UPDATE category_config SET deleted = 0 WHERE value = '重复词'");
    const row = setup.getOne("SELECT deleted FROM category_config WHERE value = '重复词'");
    expect(row.deleted).toBe(0);
  });

  test('批量软删: 多条记录同时设 deleted=1', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '批量1', '')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '批量2', '')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('noise', '批量3', '')");

    const rows = setup.getAll("SELECT id FROM category_config WHERE value IN ('批量1', '批量2', '批量3')");
    const ids = rows.map(r => r.id);

    ids.forEach(id => {
      setup.run('UPDATE category_config SET deleted = 1 WHERE id = ?', [id]);
    });

    const remaining = setup.getAll("SELECT value FROM category_config WHERE type = 'noise' AND deleted = 0");
    expect(remaining.length).toBe(0);

    const deleted = setup.getAll("SELECT value FROM category_config WHERE type = 'noise' AND deleted = 1");
    expect(deleted.length).toBe(3);
  });

  test('互斥组查询过滤已删记录', () => {
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '厨房', '厨房用品')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '餐具', '厨房用品')");
    setup.run("INSERT INTO category_config (type, value, group_name) VALUES ('mutex', '刀具', '厨房用品')");
    setup.run("UPDATE category_config SET deleted = 1 WHERE value = '刀具'");

    const rows = setup.getAll("SELECT value, group_name FROM category_config WHERE type = 'mutex' AND deleted = 0 ORDER BY sort_order, id");
    expect(rows.length).toBe(2);
    const names = rows.map(r => r.value);
    expect(names).toContain('厨房');
    expect(names).toContain('餐具');
    expect(names).not.toContain('刀具');
  });

  test('过滤词查询过滤已删记录', () => {
    setup.run("INSERT INTO category_config (type, value) VALUES ('noise', '爆款')");
    setup.run("INSERT INTO category_config (type, value) VALUES ('noise', '热卖')");
    setup.run("UPDATE category_config SET deleted = 1 WHERE value = '爆款'");

    const rows = setup.getAll("SELECT value FROM category_config WHERE type = 'noise' AND deleted = 0 ORDER BY id");
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('热卖');
  });

  test('泛义词查询过滤已删记录', () => {
    setup.run("INSERT INTO category_config (type, value) VALUES ('generic', '跨境')");
    setup.run("INSERT INTO category_config (type, value) VALUES ('generic', '加厚')");
    setup.run("UPDATE category_config SET deleted = 1 WHERE value = '跨境'");

    const rows = setup.getAll("SELECT value FROM category_config WHERE type = 'generic' AND deleted = 0 ORDER BY id");
    expect(rows.length).toBe(1);
    expect(rows[0].value).toBe('加厚');
  });
});
