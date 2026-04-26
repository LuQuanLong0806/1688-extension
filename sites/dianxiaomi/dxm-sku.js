(function () {
  if (window.__dxmSku) return;
  window.__dxmSku = true;

  var C = window.BeeConfig;
  var skuEl = document.getElementById('__dxm_bee_sku');
  if (!skuEl) return;

  skuEl.addEventListener('click', function () {
    doSkuFilter();
  });

  // ========== Main flow ==========
  function doSkuFilter() {
    console.log('%c[小蜜蜂-SKU] 一键SKU变种属性过滤 开始', 'color:#00838F;font-weight:bold;font-size:14px');

    if (!C.loadSkuFilterEnabled()) {
      C.showBubble('SKU过滤未开启', 'ok');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var filters = C.loadSkuFilters().filter(function (f) { return f.enabled && f.from; });
    if (!filters.length) {
      C.showBubble('无SKU过滤规则', 'ok');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var form = document.querySelector('#skuAttrsInfo form'); // #skuAttrsInfo: SKU变种属性区域; form: 属性表单
    if (!form) {
      C.showBubble('❌ 未找到SKU变种属性', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var modules = form.querySelectorAll('.options-module'); // .options-module: 每个属性名下的选项列表容器
    var labels = [];
    for (var m = 0; m < modules.length; m++) {
      var lbs = modules[m].querySelectorAll('label'); // label: 每个SKU变种属性选项(如颜色值、数量值)
      for (var l = 0; l < lbs.length; l++) {
        labels.push(lbs[l]);
      }
    }

    if (!labels.length) {
      C.showBubble('无SKU属性', 'ok');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var total = labels.length;
    var idx = 0;
    var changed = 0;
    console.log('%c[小蜜蜂-SKU] 共 ' + total + ' 个SKU属性待检查', 'color:#00838F;font-weight:bold');

    function processNext() {
      if (idx >= labels.length) {
        var msg = changed > 0 ? '✅ 已过滤 ' + changed + '/' + total + ' 个SKU属性' : '✅ SKU属性无需过滤';
        console.log('%c[小蜜蜂-SKU] ' + msg, 'color:#00838F;font-weight:bold;font-size:14px');
        C.showBubble(msg, 'ok');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      var current = idx + 1;
      idx++;
      C.showBubble('⏳ 检查 ' + current + '/' + total, 'loading');

      var label = labels[current - 1];
      var textEl = label.querySelector('.theme-value-text'); // .theme-value-text: SKU属性值的显示文本
      if (!textEl) { setTimeout(processNext, 50); return; }

      var text = textEl.getAttribute('title') || textEl.textContent || '';
      var newText = text;
      var hit = false;

      for (var i = 0; i < filters.length; i++) {
        if (newText.indexOf(filters[i].from) === -1) continue;
        newText = newText.split(filters[i].from).join(filters[i].to);
        hit = true;
      }

      if (!hit || newText === text) {
        setTimeout(processNext, 50);
        return;
      }

      // 需要编辑：点击编辑按钮 → 等待输入框显示 → 替换值 → 点击保存
      var editBtn = label.querySelector('.btn-edit'); // .btn-edit: 编辑图标按钮
      if (!editBtn) { setTimeout(processNext, 50); return; }

      editBtn.click();

      setTimeout(function () {
        var input = label.querySelector('.edit-inp'); // .edit-inp: 编辑输入框(点击编辑后显示)
        if (!input) { setTimeout(processNext, 50); return; }

        C.setInputValue(input, newText);

        setTimeout(function () {
          var saveBtn = label.querySelector('.btn-save'); // .btn-save: 保存图标按钮
          if (!saveBtn) { setTimeout(processNext, 50); return; }

          saveBtn.click();
          changed++;
          console.log('%c[小蜜蜂-SKU] 替换: "' + text + '" → "' + newText + '"', 'color:#00838F;font-weight:bold');

          setTimeout(processNext, 65);
        }, 65);
      }, 65);
    }

    processNext();
  }
})();
