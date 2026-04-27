(function () {
  if (window.__dxmSku) return;
  window.__dxmSku = true;

  var C = window.BeeConfig;
  var skuEl = document.getElementById('__dxm_bee_sku');
  if (!skuEl) return;

  var filterDone = false;
  var filterSuccess = false;

  skuEl.addEventListener('click', function () {
    var skuSection = document.querySelector('#skuAttrsInfo');
    if (skuSection) skuSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    filterDone = false;
    filterSuccess = false;
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
        filterDone = true;
        filterSuccess = true;
        if (C.loadAutoSkuNo()) {
          setTimeout(doAutoSkuNo, 300);
        } else {
          setTimeout(C.hideBubble, 2000);
        }
        return;
      }

      var current = idx + 1;
      idx++;
      C.showBubble('⏳ 检查 ' + current + '/' + total, 'loading');

      var label = labels[current - 1];
      var textEl = label.querySelector('.theme-value-text'); // .theme-value-text: SKU属性值的显示文本
      if (!textEl) { setTimeout(processNext, 50); return; }

      var text = textEl.getAttribute('title') || textEl.textContent || '';
      var result = C.applyFilters(text, filters);

      if (!result.changed) {
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

        C.setInputValue(input, result.text);

        setTimeout(function () {
          var saveBtn = label.querySelector('.btn-save'); // .btn-save: 保存图标按钮
          if (!saveBtn) { setTimeout(processNext, 50); return; }

          saveBtn.click();
          changed++;
          console.log('%c[小蜜蜂-SKU] 替换: "' + text + '" → "' + result.text + '"', 'color:#00838F;font-weight:bold');

          setTimeout(processNext, 65);
        }, 65);
      }, 65);
    }

    processNext();
  }

  // ========== 高级SKU货号 ==========
  function doAutoSkuNo() {
    console.log('%c[小蜜蜂-SKU] 自动高级SKU货号 开始', 'color:#00838F;font-weight:bold;font-size:14px');

    var table = document.querySelector('#skuDataInfo table');
    if (!table) {
      C.showBubble('❌ 未找到SKU表格', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var ths = table.querySelectorAll('th');
    var skuNoTh = null;
    for (var i = 0; i < ths.length; i++) {
      if ((ths[i].textContent || '').indexOf('SKU货号') !== -1) {
        skuNoTh = ths[i];
        break;
      }
    }
    if (!skuNoTh) {
      C.showBubble('❌ 未找到SKU货号列', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var links = skuNoTh.querySelectorAll('span.link');
    var link = null;
    for (var j = 0; j < links.length; j++) {
      if ((links[j].textContent || '').indexOf('高级') !== -1) {
        link = links[j];
        break;
      }
    }
    if (!link) {
      C.showBubble('❌ 未找到高级链接', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    C.showBubble('⏳ 打开高级SKU货号...', 'loading');
    link.click();

    setTimeout(function () {
      var modal = C.findVisibleModal('SKU高级生成规则');
      if (!modal) {
        C.showBubble('❌ 未找到SKU高级生成规则弹窗', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      var genBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (!genBtn) {
        C.showBubble('❌ 未找到生成按钮', 'err');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      genBtn.click();
      console.log('%c[小蜜蜂-SKU] 已点击生成', 'color:#00838F;font-weight:bold');
      C.showBubble('✅ 高级SKU货号已生成', 'ok');
      setTimeout(C.hideBubble, 2000);
    }, 200);
  }

})();
