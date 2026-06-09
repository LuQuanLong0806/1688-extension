// batch-replace.test.js — SKU批量替换功能单元测试
const fs = require('fs');
const path = require('path');

// 读取 detail-modal.js 源码（Vue组件定义）
const src = fs.readFileSync(path.join(__dirname, '../../public/js/components/detail-modal.js'), 'utf8');

// 提取 doBatchReplace 方法体
function extractMethod(name) {
  var regex = new RegExp(name + ':\\s*function\\s*\\([^)]*\\)\\s*\\{');
  var match = src.match(regex);
  if (!match) return null;
  var start = src.indexOf('{', match.index) + 1;
  var depth = 1;
  var i = start;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.substring(start, i - 1);
}

describe('Batch Replace (SKU名称批量替换)', () => {

  // ===== doBatchReplace 逻辑测试 =====
  function createMockVm(skus, find, replace) {
    var messages = [];
    return {
      batchFind: find || '',
      batchReplace: replace || '',
      showBatchReplace: true,
      editable: { skus: skus },
      $Message: {
        warning: function (msg) { messages.push({ type: 'warning', msg: msg }); },
        success: function (msg) { messages.push({ type: 'success', msg: msg }); }
      },
      _messages: messages
    };
  }

  // 从源码提取并执行 doBatchReplace
  function runBatchReplace(vm) {
    var body = extractMethod('doBatchReplace');
    expect(body).not.toBeNull();
    var fn = new Function('return (function() {' + body + '});');
    fn().call(vm);
  }

  test('替换匹配的SKU名称', () => {
    var skus = [
      { name: '红色-M', customName: '红色-M' },
      { name: '红色-L', customName: '红色-L' },
      { name: '蓝色-M', customName: '蓝色-M' }
    ];
    var vm = createMockVm(skus, '红色', '黑');
    runBatchReplace(vm);
    expect(skus[0].customName).toBe('黑-M');
    expect(skus[1].customName).toBe('黑-L');
    expect(skus[2].customName).toBe('蓝色-M');
    expect(vm._messages[0].type).toBe('success');
    expect(vm._messages[0].msg).toContain('2');
  });

  test('无匹配时不修改', () => {
    var skus = [
      { name: '红色-M', customName: '红色-M' }
    ];
    var vm = createMockVm(skus, '绿色', '黄色');
    runBatchReplace(vm);
    expect(skus[0].customName).toBe('红色-M');
    expect(vm._messages[0].type).toBe('success');
    expect(vm._messages[0].msg).toContain('0');
  });

  test('查找为空时提示', () => {
    var skus = [{ name: 'A', customName: 'A' }];
    var vm = createMockVm(skus, '', '');
    runBatchReplace(vm);
    expect(vm._messages[0].type).toBe('warning');
  });

  test('替换后关闭弹窗并清空输入', () => {
    var skus = [{ name: '红色-M', customName: '红色-M' }];
    var vm = createMockVm(skus, '红色', '黑');
    runBatchReplace(vm);
    expect(vm.showBatchReplace).toBe(false);
    expect(vm.batchFind).toBe('');
    expect(vm.batchReplace).toBe('');
  });

  test('使用name字段当customName为空', () => {
    var skus = [
      { name: '大号-白色' },
      { name: '大号-黑色' }
    ];
    var vm = createMockVm(skus, '大号', '加粗');
    runBatchReplace(vm);
    expect(skus[0].customName).toBe('加粗-白色');
    expect(skus[1].customName).toBe('加粗-黑色');
  });

  test('同一字段多次出现全部替换', () => {
    var skus = [
      { name: 'A-B-A', customName: 'A-B-A' }
    ];
    var vm = createMockVm(skus, 'A', 'C');
    runBatchReplace(vm);
    expect(skus[0].customName).toBe('C-B-C');
  });

  test('editable或skus为空时不崩溃', () => {
    var vm = createMockVm(null, 'A', 'B');
    vm.editable = null;
    expect(function () { runBatchReplace(vm); }).not.toThrow();
  });

  // ===== syncVariantFromSku 测试 =====
  function createVariantVm(skus) {
    var names = {};
    skus.forEach(function (s) {
      var n = (s.customName || s.name || '').trim();
      if (n && !names[n]) names[n] = true;
    });
    return {
      editable: { skus: skus },
      variantAttrs: [
        { name: '颜色', values: Object.keys(names), images: {} }
      ]
    };
  }

  function extractSyncMethod() {
    return extractMethod('syncVariantFromSku');
  }

  function runSync(vm, idx) {
    var body = extractSyncMethod();
    expect(body).not.toBeNull();
    var fn = new Function('return (function(skuIndex) {' + body + '});');
    fn().call(vm, idx);
  }

  describe('syncVariantFromSku', () => {
    test('改名后变种属性值同步更新', () => {
      var skus = [
        { name: '款式1', customName: '款式1', image: 'img1.jpg' },
        { name: '款式2', customName: '款式2', image: 'img2.jpg' }
      ];
      var vm = createVariantVm(skus);
      expect(vm.variantAttrs[0].values).toEqual(['款式1', '款式2']);

      // 改名
      skus[0].customName = '南瓜';
      runSync(vm, 0);

      expect(vm.variantAttrs[0].values).toEqual(['南瓜', '款式2']);
    });

    test('改名后图片映射转移', () => {
      var skus = [
        { name: '红色', customName: '红色' },
        { name: '蓝色', customName: '蓝色' }
      ];
      var vm = createVariantVm(skus);
      vm.variantAttrs[0].images['红色'] = 'red.jpg';

      skus[0].customName = '黑色';
      runSync(vm, 0);

      expect(vm.variantAttrs[0].images['黑色']).toBe('red.jpg');
      expect(vm.variantAttrs[0].images['红色']).toBeUndefined();
    });

    test('未改名时不变', () => {
      var skus = [
        { name: '红色', customName: '红色' },
        { name: '蓝色', customName: '蓝色' }
      ];
      var vm = createVariantVm(skus);
      vm.variantAttrs[0].images['红色'] = 'red.jpg';

      runSync(vm, 0);

      expect(vm.variantAttrs[0].values).toEqual(['红色', '蓝色']);
      expect(vm.variantAttrs[0].images['红色']).toBe('red.jpg');
    });

    test('variantAttrs不存在时不崩溃', () => {
      var vm = { editable: { skus: [] }, variantAttrs: null };
      expect(function () { runSync(vm, 0); }).not.toThrow();
    });
  });

  // ===== CSS 类存在性检查 =====
  describe('CSS样式', () => {
    var cssContent;

    beforeAll(() => {
      cssContent = fs.readFileSync(path.join(__dirname, '../../public/css/app.css'), 'utf8');
    });

    test('batch-replace-panel 样式存在', () => {
      expect(cssContent).toContain('.batch-replace-panel');
    });

    test('batch-replace-field 样式存在', () => {
      expect(cssContent).toContain('.batch-replace-field');
    });

    test('batch-replace-label 样式存在', () => {
      expect(cssContent).toContain('.batch-replace-label');
    });

    test('使用项目CSS变量', () => {
      expect(cssContent.match(/\.batch-replace-label[^}]*/)).toBeTruthy();
      var match = cssContent.match(/\.batch-replace-label\s*\{([^}]+)\}/);
      expect(match).toBeTruthy();
      expect(match[1]).toContain('var(--text-secondary)');
    });
  });

  // ===== 模板检查 =====
  describe('模板结构', () => {
    test('使用 Poptip 组件', () => {
      expect(src).toContain('<Poptip');
      expect(src).toContain('</Poptip>');
    });

    test('Poptip 使用 transfer 属性（避免overflow裁剪）', () => {
      expect(src).toMatch(/Poptip[^>]*transfer/);
    });

    test('Poptip 使用 placement="top"', () => {
      expect(src).toMatch(/placement="top"/);
    });

    test('Poptip 使用 trigger="click"', () => {
      expect(src).toMatch(/trigger="click"/);
    });

    test('不再使用旧的 batch-popover-float', () => {
      expect(src).not.toContain('batch-popover-float');
    });

    test('不再使用 scheduleBatchHide', () => {
      expect(src).not.toContain('scheduleBatchHide');
    });

    test('不再使用 clearBatchHide', () => {
      expect(src).not.toContain('clearBatchHide');
    });

    test('使用 slot="content" 渲染内容', () => {
      expect(src).toContain('slot="content"');
    });
  });
});
