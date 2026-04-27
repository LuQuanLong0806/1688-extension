(function () {
  if (window.__dxmSkuTable) return;
  window.__dxmSkuTable = true;

  var C = window.BeeConfig;

  // ========== 模拟数据（后续替换为实际数据来源） ==========
  function getMockData() {
    return [
      {
        image: 'https://img.cdnfe.com/product/open/967badad67ae4959b9aaebc3b9241f0b-goods.jpeg',
        sku: 'SKU-LIGHT-GREEN',
        price: '35.69',
        dimensions: [2.1, 1.8, 1],
        weight: '15'
      },
      {
        image: 'https://img.cdnfe.com/product/open/27f44620429148b5a6179cc31d027c90-goods.jpeg',
        sku: 'SKU-DARK-GREEN',
        price: '34.66',
        dimensions: [2.1, 1.8, 1],
        weight: '15'
      }
    ];
  }

  // ========== 日志 & 气泡 ==========
  var tableStep = 0;
  var tableTotal = 0;

  function tableLog(msg) {
    tableStep++;
    var tag = '[小蜜蜂-SKU表] ' + tableStep + '/' + tableTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#00838F;font-weight:bold');
    C.showBubble(tableStep + '/' + tableTotal + ' ' + msg, 'loading');
  }

  // ========== 带聚焦/失焦的赋值 ==========
  function focusSetBlur(input, val) {
    input.focus();
    C.setInputValue(input, val);
    input.blur();
  }

  // ========== 带坐标的 hover（用于无 ant-dropdown-trigger 的元素） ==========
  function hoverWithCoords(el) {
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var pOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy,
                  pointerId: 1, pointerType: 'mouse', isPrimary: true };
    var mOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    el.dispatchEvent(new PointerEvent('pointerover', pOpts));
    el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse' }));
    el.dispatchEvent(new PointerEvent('pointermove', pOpts));
    el.dispatchEvent(new MouseEvent('mouseover', mOpts));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: cx, clientY: cy }));
    el.dispatchEvent(new MouseEvent('mousemove', mOpts));
  }

  // ========== 预览图：hover → 等待下拉 → 点击网络图片 → 弹窗填 URL → 添加 ==========
  function fillImage(tr, imgUrl, cb) {
    var hasImage = !!tr.querySelector('.sku-image-box');
    var triggerEl = hasImage
      ? tr.querySelector('.sku-image-box')
      : tr.querySelector('td.min-w-70 .img-box');
    if (!triggerEl) { cb(); return; }

    triggerEl.scrollIntoView({ behavior: 'instant', block: 'center' });

    setTimeout(function () {
      if (hasImage) {
        C.hoverElement(triggerEl);
      } else {
        hoverWithCoords(triggerEl);
      }

      // 等待下拉菜单出现，通过 data-menu-id="net" 定位网络图片
      var start = Date.now();
      (function checkDropdown() {
        var netItem = null;
        var dropdowns = document.querySelectorAll('.ant-dropdown');
        for (var d = 0; d < dropdowns.length; d++) {
          var style = getComputedStyle(dropdowns[d]);
          if (style.display === 'none') continue;
          var item = dropdowns[d].querySelector('li[data-menu-id="net"]');
          if (item) { netItem = item; break; }
        }

        if (netItem) {
          netItem.click();

          // 等待网络图片弹窗
          var modalStart = Date.now();
          (function checkModal() {
            var modal = C.findVisibleModal('从网络地址');
            if (modal) {
              fillImageModal(modal, imgUrl, cb);
              return;
            }
            if (Date.now() - modalStart > 5000) {
              console.log('%c[小蜜蜂-SKU表] 网络图片弹窗超时，跳过预览图', 'color:#00838F;font-weight:bold');
              cb();
              return;
            }
            requestAnimationFrame(checkModal);
          })();
          return;
        }

        if (Date.now() - start > 3000) {
          console.log('%c[小蜜蜂-SKU表] 预览图下拉菜单超时，跳过预览图', 'color:#00838F;font-weight:bold');
          cb();
          return;
        }
        requestAnimationFrame(checkDropdown);
      })();
    }, 300);
  }

  function fillImageModal(modal, imgUrl, cb) {
    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) { cb(); return; }

    C.setInputValue(textarea, imgUrl);

    setTimeout(function () {
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (addBtn) addBtn.click();
      setTimeout(cb, 300);
    }, 200);
  }

  // ========== 填充单行 ==========
  function fillRow(tr, rowData, cb) {
    // 1. 预览图
    if (rowData.image) {
      fillImage(tr, rowData.image, function () {
        fillRowFields(tr, rowData);
        setTimeout(cb, 200);
      });
      return;
    }

    fillRowFields(tr, rowData);
    setTimeout(cb, 100);
  }

  function fillRowFields(tr, rowData) {
    // 2. SKU货号
    if (rowData.sku) {
      var skuInput = tr.querySelector('input[name="variationSku"]');
      if (skuInput && !skuInput.value.trim()) focusSetBlur(skuInput, rowData.sku);
    }

    // 3. 申报价格
    if (rowData.price) {
      var priceInput = tr.querySelector('input[name="price"]');
      if (priceInput && !priceInput.value.trim()) focusSetBlur(priceInput, rowData.price);
    }

    // 4. 尺寸（从大到小排序）
    if (rowData.dimensions && rowData.dimensions.length === 3) {
      var sorted = rowData.dimensions.slice().sort(function (a, b) { return b - a; });
      var lenInput = tr.querySelector('input[name="skuLength"]');
      var widInput = tr.querySelector('input[name="skuWidth"]');
      var heiInput = tr.querySelector('input[name="skuHeight"]');
      if (lenInput && !lenInput.value.trim()) focusSetBlur(lenInput, String(sorted[0]));
      if (widInput && !widInput.value.trim()) focusSetBlur(widInput, String(sorted[1]));
      if (heiInput && !heiInput.value.trim()) focusSetBlur(heiInput, String(sorted[2]));
    }

    // 5. 重量
    if (rowData.weight) {
      var weightInput = tr.querySelector('input[name="weight"]');
      if (weightInput && !weightInput.value.trim()) focusSetBlur(weightInput, rowData.weight);
    }
  }

  // ========== 取消所有变种属性勾选 ==========
  function uncheckAllAttrs(cb) {
    var form = document.querySelector('#skuAttrsInfo form');
    if (!form) { cb(); return; }

    var labels = form.querySelectorAll('.options-module label.d-checkbox');
    var toUncheck = [];
    for (var i = 0; i < labels.length; i++) {
      var cb2 = labels[i].querySelector('input[type="checkbox"]');
      if (cb2 && cb2.checked) toUncheck.push(cb2);
    }

    if (!toUncheck.length) { cb(); return; }

    console.log('%c[小蜜蜂-SKU表] 取消 ' + toUncheck.length + ' 个变种属性勾选', 'color:#00838F;font-weight:bold');
    var idx = 0;
    (function next() {
      if (idx >= toUncheck.length) {
        setTimeout(cb, 200);
        return;
      }
      toUncheck[idx].click();
      idx++;
      setTimeout(next, 50);
    })();
  }

  // ========== 主流程 ==========
  function doSkuTableFill(dataArray) {
    if (!dataArray) dataArray = getMockData();

    console.log('%c[小蜜蜂-SKU表] SKU表格自动填充 开始', 'color:#00838F;font-weight:bold;font-size:14px');

    // Step 1: 取消所有变种属性勾选
    tableLog('取消变种属性勾选...');
    uncheckAllAttrs(function () {

    var table = document.querySelector('#skuDataInfo table');
    if (!table) {
      C.showBubble('❌ 未找到SKU表格', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var rows = table.querySelectorAll('tbody tr');
    if (!rows.length) {
      C.showBubble('❌ SKU表格无数据行', 'err');
      setTimeout(C.hideBubble, 2000);
      return;
    }

    var total = Math.min(rows.length, dataArray.length);
    tableStep = 0;
    tableTotal = total;
    var idx = 0;

    function processNext() {
      if (idx >= total) {
        var msg = '✅ SKU表格已填充 ' + total + ' 行';
        console.log('%c[小蜜蜂-SKU表] ' + msg, 'color:#00838F;font-weight:bold;font-size:14px');
        C.showBubble(msg, 'ok');
        setTimeout(C.hideBubble, 2000);
        return;
      }

      idx++;
      tableLog('填充第 ' + idx + '/' + total + ' 行...');

      var tr = rows[idx - 1];
      var data = dataArray[idx - 1];

      fillRow(tr, data, function () {
        setTimeout(processNext, 150);
      });
    }

    processNext();
    }); // uncheckAllAttrs callback
  }

  // ========== 暴露到 BeeConfig ==========
  C.doSkuTableFill = doSkuTableFill;
})();
