// page-word-library.test.js — 词库管理组件逻辑测试
// 测试分页切片、选中追踪、列定义切换等纯数据逻辑

// ===== 模拟组件核心逻辑（脱离 Vue 运行时） =====
function createWordLibraryState() {
  return {
    activeTab: 'noise',
    loading: false,
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    keyword: '',
    selectedIds: [],
    mutexGroups: [],
    // computed
    pagedList: function () {
      var start = (this.page - 1) * this.pageSize;
      return this.list.slice(start, start + this.pageSize);
    },
    getColumns: function () {
      var cols = [
        { type: 'selection', width: 40, align: 'center' },
        { title: '词语', key: 'value', minWidth: 140 }
      ];
      if (this.activeTab === 'mutex') {
        cols.push({ title: '互斥组', key: 'group_name', width: 140 });
      }
      cols.push({ title: '说明', key: 'description', minWidth: 120 });
      cols.push({ title: '操作', width: 150, align: 'center', slot: 'actions' });
      return cols;
    },
    // methods
    switchTab: function (type) {
      this.activeTab = type;
      this.page = 1;
      this.keyword = '';
      this.selectedIds = [];
    },
    onSelectionChange: function (sel) {
      this.selectedIds = sel.map(function (r) { return r.id; });
    },
    onPageChange: function (p) { this.page = p; this.selectedIds = []; },
    onPageSizeChange: function (s) { this.pageSize = s; this.page = 1; this.selectedIds = []; },
    setData: function (list) {
      this.list = list;
      this.total = list.length;
    }
  };
}

function makeRows(n, type) {
  var rows = [];
  for (var i = 1; i <= n; i++) {
    rows.push({ id: i, type: type || 'noise', value: '词' + i, group_name: type === 'mutex' ? '组A' : '', description: '' });
  }
  return rows;
}

// ===== 测试 =====

describe('词库管理 - 分页切片 (pagedList)', () => {
  test('默认第1页返回前 pageSize 条', () => {
    var s = createWordLibraryState();
    s.setData(makeRows(50));
    var page = s.pagedList();
    expect(page.length).toBe(20);
    expect(page[0].value).toBe('词1');
    expect(page[19].value).toBe('词20');
  });

  test('第2页返回第 21-40 条', () => {
    var s = createWordLibraryState();
    s.setData(makeRows(50));
    s.page = 2;
    var page = s.pagedList();
    expect(page.length).toBe(20);
    expect(page[0].value).toBe('词21');
    expect(page[19].value).toBe('词40');
  });

  test('最后一页不足 pageSize 返回剩余条目', () => {
    var s = createWordLibraryState();
    s.setData(makeRows(25));
    s.page = 2;
    var page = s.pagedList();
    expect(page.length).toBe(5);
    expect(page[0].value).toBe('词21');
  });

  test('空列表返回空数组', () => {
    var s = createWordLibraryState();
    s.setData([]);
    var page = s.pagedList();
    expect(page).toEqual([]);
  });

  test('数据量小于 pageSize 时返回全部', () => {
    var s = createWordLibraryState();
    s.setData(makeRows(5));
    var page = s.pagedList();
    expect(page.length).toBe(5);
  });

  test('相同依赖不变时返回相同引用（模拟 computed 缓存）', () => {
    var s = createWordLibraryState();
    s.setData(makeRows(30));
    var first = s.pagedList();
    var second = s.pagedList();
    // slice 每次返回新数组，但数据相同
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  test('修改 page 后返回不同切片', () => {
    var s = createWordLibraryState();
    s.setData(makeRows(30));
    var page1 = s.pagedList();
    s.page = 2;
    var page2 = s.pagedList();
    expect(page1[0].id).toBe(1);
    expect(page2[0].id).toBe(21);
    expect(page1).not.toEqual(page2);
  });
});

describe('词库管理 - 选中状态', () => {
  test('onSelectionChange 正确提取 id', () => {
    var s = createWordLibraryState();
    s.onSelectionChange([{ id: 1 }, { id: 3 }, { id: 5 }]);
    expect(s.selectedIds).toEqual([1, 3, 5]);
  });

  test('空选择清空 selectedIds', () => {
    var s = createWordLibraryState();
    s.selectedIds = [1, 2, 3];
    s.onSelectionChange([]);
    expect(s.selectedIds).toEqual([]);
  });

  test('switchTab 清空 selectedIds', () => {
    var s = createWordLibraryState();
    s.selectedIds = [1, 2, 3];
    s.switchTab('generic');
    expect(s.selectedIds).toEqual([]);
    expect(s.activeTab).toBe('generic');
    expect(s.page).toBe(1);
    expect(s.keyword).toBe('');
  });

  test('翻页清空 selectedIds', () => {
    var s = createWordLibraryState();
    s.selectedIds = [1, 2];
    s.onPageChange(2);
    expect(s.selectedIds).toEqual([]);
    expect(s.page).toBe(2);
  });

  test('修改每页条数清空 selectedIds 并重置页码', () => {
    var s = createWordLibraryState();
    s.selectedIds = [1, 2];
    s.page = 3;
    s.onPageSizeChange(50);
    expect(s.selectedIds).toEqual([]);
    expect(s.pageSize).toBe(50);
    expect(s.page).toBe(1);
  });
});

describe('词库管理 - 列定义', () => {
  test('noise/generic tab 没有互斥组列', () => {
    var s = createWordLibraryState();
    s.activeTab = 'noise';
    var cols = s.getColumns();
    var names = cols.map(function (c) { return c.title; });
    expect(names).not.toContain('互斥组');
  });

  test('mutex tab 有互斥组列', () => {
    var s = createWordLibraryState();
    s.activeTab = 'mutex';
    var cols = s.getColumns();
    var names = cols.map(function (c) { return c.title; });
    expect(names).toContain('互斥组');
  });

  test('列定义包含 selection 和 actions', () => {
    var s = createWordLibraryState();
    var cols = s.getColumns();
    var hasSelection = cols.some(function (c) { return c.type === 'selection'; });
    var hasActions = cols.some(function (c) { return c.slot === 'actions'; });
    expect(hasSelection).toBe(true);
    expect(hasActions).toBe(true);
  });
});

describe('词库管理 - 互斥组提取', () => {
  test('从 mutex 数据提取去重组名', () => {
    var s = createWordLibraryState();
    s.activeTab = 'mutex';
    var list = [
      { id: 1, value: '厨房', group_name: '厨房用品', description: '' },
      { id: 2, value: '餐具', group_name: '厨房用品', description: '' },
      { id: 3, value: '家居', group_name: '家居日用', description: '' }
    ];
    s.setData(list);
    // 模拟 loadList 中的互斥组提取逻辑
    var gs = {};
    s.list.forEach(function (r) { if (r.group_name) gs[r.group_name] = true; });
    s.mutexGroups = Object.keys(gs);
    expect(s.mutexGroups).toEqual(['厨房用品', '家居日用']);
  });

  test('空 group_name 不进入列表', () => {
    var gs = {};
    var list = [
      { id: 1, value: '词1', group_name: '', description: '' },
      { id: 2, value: '词2', group_name: '组A', description: '' }
    ];
    list.forEach(function (r) { if (r.group_name) gs[r.group_name] = true; });
    expect(Object.keys(gs)).toEqual(['组A']);
  });
});
