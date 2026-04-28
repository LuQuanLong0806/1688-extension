(function () {
  if (window.__dxmAutoFill) return;
  window.__dxmAutoFill = true;

  // ========== 检测 collectId ==========
  var params = new URLSearchParams(location.search);
  var collectId = params.get('collectId');
  if (!collectId) return;

  var SERVER_KEY = '1688_server_url';
  var C = window.BeeConfig;

  // ========== Step log ==========
  var autoStep = 0;
  var autoTotal = 0;
  function autoLog(msg) {
    autoStep++;
    var tag = '[自动填表] ' + autoStep + '/' + autoTotal + ' ' + msg;
    console.log('%c' + tag, 'color:#E65100;font-weight:bold');
    if (C && C.showBubble) {
      C.showBubble(autoStep + '/' + autoTotal + ' ' + msg, 'loading');
    }
  }

  function autoFinish(msg) {
    console.log('%c[自动填表] ✅ ' + msg, 'color:#52c41a;font-weight:bold;font-size:14px');
    if (C && C.showBubble) {
      C.showBubble('✅ ' + msg, 'ok');
      setTimeout(C.hideBubble, 3000);
    }
  }

  function autoError(msg) {
    console.log('%c[自动填表] ❌ ' + msg, 'color:#ff4444;font-weight:bold;font-size:14px');
    if (C && C.showBubble) {
      C.showBubble('❌ ' + msg, 'err');
      setTimeout(C.hideBubble, 3000);
    }
  }

  // ========== DOM Helpers ==========
  function setInputValue(input, val) {
    if (C && C.setInputValue) {
      C.setInputValue(input, val);
      return;
    }
    var proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(input, val);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function hoverElement(el) {
    if (C && C.hoverElement) { C.hoverElement(el); return; }
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }

  function waitForElement(selector, timeout, cb) {
    if (C && C.waitForElement) { C.waitForElement(selector, timeout, cb); return; }
    var start = Date.now();
    (function check() {
      var el = document.querySelector(selector);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function waitForVisibleLi(textFragment, timeout, cb) {
    if (C && C.waitForVisibleLi) { C.waitForVisibleLi(textFragment, timeout, cb); return; }
    var start = Date.now();
    (function check() {
      var allLi = document.querySelectorAll('li');
      for (var i = 0; i < allLi.length; i++) {
        if (allLi[i].offsetParent === null) continue;
        if ((allLi[i].textContent || '').indexOf(textFragment) !== -1) return cb(allLi[i]);
      }
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function findVisibleModal(titleText) {
    if (C && C.findVisibleModal) return C.findVisibleModal(titleText);
    var titles = document.querySelectorAll('.ant-modal-title');
    for (var t = 0; t < titles.length; t++) {
      if ((titles[t].textContent || '').indexOf(titleText) !== -1) {
        var wrap = titles[t];
        while (wrap && !wrap.classList.contains('ant-modal-wrap')) { wrap = wrap.parentElement; }
        if (wrap && getComputedStyle(wrap).display !== 'none') return wrap;
      }
    }
    return null;
  }

  function focusSetBlur(input, val) {
    input.focus();
    setInputValue(input, val);
    input.blur();
  }

  // ========== 获取采集数据 ==========
  function fetchCollectedData(cb) {
    var serverUrl = localStorage.getItem(SERVER_KEY) || 'http://localhost:3000';

    console.log('%c[自动填表] 检测到 collectId=' + collectId + '，正在获取数据...', 'color:#E65100;font-weight:bold;font-size:14px');

    fetch(serverUrl + '/api/product/' + collectId)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        window.__collectedProduct = data;
        console.log('%c[自动填表] 数据获取成功: ' + (data.title || '无标题'), 'color:#52c41a;font-weight:bold');
        console.log('%c[自动填表] 主图: ' + (data.main_images || []).length + '张, 描述图: ' + (data.desc_images || []).length + '张, SKU: ' + (data.skus || []).length + '个', 'color:#52c41a;font-weight:bold');
        cb(data);
      })
      .catch(function (err) {
        autoError('获取采集数据失败: ' + err.message);
      });
  }

  // ========== 自动填表主流程 ==========
  function startAutoFill(data) {
    // 计算总步骤
    autoTotal = 1; // 填标题
    if (data.main_images && data.main_images.length) autoTotal += 3; // 贴主图（打开菜单+网络图片+填入添加）
    if (data.desc_images && data.desc_images.length) autoTotal += 1; // 描述图（仅存储到全局）
    if (data.skus && data.skus.length) autoTotal += 2; // SKU表格填充
    autoTotal += 1; // 外包装图片

    autoStep = 0;
    console.log('%c[自动填表] ===== 开始自动填表 =====', 'color:#E65100;font-weight:bold;font-size:14px');

    // Step 1: 填入标题
    fillTitle(data, function () {
      // Step 2: 贴主图
      if (data.main_images && data.main_images.length) {
        pasteMainImages(data.main_images, function () {
          // Step 3: 外包装图片
          updatePackageImage(data, function () {
            // Step 4: 描述图（存储到全局，供描述按钮使用）
            if (data.desc_images && data.desc_images.length) {
              autoLog('描述图已加载 (' + data.desc_images.length + '张)');
            }
            // Step 5: SKU 填充
            if (data.skus && data.skus.length) {
              fillSkuTable(data.skus, function () {
                autoFinish('自动填表完成');
              });
            } else {
              autoFinish('自动填表完成（无SKU数据）');
            }
          });
        });
      } else {
        autoFinish('自动填表完成（无主图数据）');
      }
    });
  }

  // ========== Step 1: 填入标题 ==========
  function fillTitle(data, cb) {
    if (!data.title) { cb(); return; }

    autoLog('填入标题...');
    waitForElement('#productProductInfo form .ant-form-item input', 5000, function (input) {
      if (!input) { autoError('未找到标题输入框'); cb(); return; }

      // 标题为空时才填入
      if (!input.value.trim()) {
        setInputValue(input, data.title);
        autoLog('标题已填入');
      } else {
        autoLog('标题已有内容，跳过');
      }
      setTimeout(cb, 200);
    });
  }

  // ========== Step 2: 贴主图 ==========
  function pasteMainImages(urls, cb) {
    autoLog('打开选择图片菜单...');

    var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
    var mainImageLabel = null;
    for (var i = 0; i < labels.length; i++) {
      if ((labels[i].textContent || '').indexOf('产品轮播图') !== -1) {
        mainImageLabel = labels[i];
        break;
      }
    }
    if (!mainImageLabel) { autoError('未找到产品轮播图'); cb(); return; }

    var formItem = mainImageLabel.closest('.ant-form-item');
    var selectBtn = null;
    var btns = formItem.querySelectorAll('.img-module .header button');
    for (var j = 0; j < btns.length; j++) {
      if ((btns[j].textContent || '').indexOf('选择图片') !== -1) {
        selectBtn = btns[j];
        break;
      }
    }
    if (!selectBtn) { autoError('未找到选择图片按钮'); cb(); return; }

    hoverElement(selectBtn);

    waitForVisibleLi('网络图片', 3000, function (webImgItem) {
      if (!webImgItem) { autoError('未找到网络图片选项'); cb(); return; }

      autoLog('点击网络图片');
      webImgItem.click();

      var start = Date.now();
      (function checkModal() {
        var modal = findVisibleModal('从网络地址');
        if (modal) {
          fillImageModal(modal, urls.join('\n'), cb);
          return;
        }
        if (Date.now() - start > 5000) { autoError('未找到网络图片弹窗'); cb(); return; }
        requestAnimationFrame(checkModal);
      })();
    });
  }

  function fillImageModal(modal, urlText, cb) {
    autoLog('填入图片地址');

    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) { autoError('未找到图片输入框'); cb(); return; }

    setInputValue(textarea, urlText);

    setTimeout(function () {
      autoLog('添加图片');
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (!addBtn) { autoError('未找到添加按钮'); cb(); return; }
      addBtn.click();
      setTimeout(cb, 500);
    }, 250);
  }

  // ========== Step 3: 外包装图片 ==========
  function updatePackageImage(data, cb) {
    // 使用主图第一张作为外包装图片
    var imgUrl = (data.main_images && data.main_images.length) ? data.main_images[0] : null;
    if (!imgUrl) { autoLog('无主图，跳过外包装'); cb(); return; }

    autoLog('打开外包装选择图片...');

    // 先删除外包装旧图片
    var pkgImgs = document.querySelectorAll('#packageInfo .img-list .img-item a.icon_delete');
    if (pkgImgs.length > 0) {
      (function deleteNext() {
        var btn = document.querySelector('#packageInfo .img-list .img-item a.icon_delete');
        if (!btn) { openPkgSelect(imgUrl, cb); return; }
        btn.click();
        setTimeout(deleteNext, 50);
      })();
      return;
    }

    openPkgSelect(imgUrl, cb);
  }

  function openPkgSelect(imgUrl, cb) {
    var pkgBtn = document.querySelector('#packageInfo .header button');
    if (!pkgBtn || (pkgBtn.textContent || '').indexOf('选择图片') === -1) {
      autoLog('未找到外包装选择图片按钮，跳过');
      cb();
      return;
    }
    hoverElement(pkgBtn);

    waitForVisibleLi('网络图片', 3000, function (webImgItem) {
      if (!webImgItem) { autoLog('未找到外包装网络图片选项'); cb(); return; }

      webImgItem.click();

      var start = Date.now();
      (function checkModal() {
        var modal = findVisibleModal('从网络地址');
        if (modal) {
          fillPkgImageModal(modal, imgUrl, cb);
          return;
        }
        if (Date.now() - start > 5000) { autoLog('外包装图片弹窗超时'); cb(); return; }
        requestAnimationFrame(checkModal);
      })();
    });
  }

  function fillPkgImageModal(modal, imgUrl, cb) {
    autoLog('填入外包装图片地址');

    var textarea = modal.querySelector('textarea.ant-input');
    if (!textarea) { cb(); return; }

    setInputValue(textarea, imgUrl);

    setTimeout(function () {
      var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
      if (addBtn) addBtn.click();
      autoLog('外包装图片已更新');
      setTimeout(cb, 300);
    }, 250);
  }

  // ========== Step 5: SKU 填充（先加变种属性，再填表格行） ==========
  function fillSkuTable(skus, cb) {
    // 筛选已勾选的 SKU
    var selectedSkus = skus.filter(function (s) { return s._selected !== false; });
    if (!selectedSkus.length) { autoLog('无已选SKU，跳过'); cb(); return; }

    // 提取自定义名称作为变种属性值
    var attrValues = [];
    selectedSkus.forEach(function (s) {
      var name = s.customName || s.name || s.sku || '';
      if (name) attrValues.push(name);
    });

    autoLog('取消现有变种属性勾选...');

    // Step 1: 取消所有现有变种属性勾选
    uncheckAllAttrs(function () {

      // Step 2: 添加新的变种属性值
      if (attrValues.length) {
        autoLog('添加 ' + attrValues.length + ' 个变种属性...');
        addAttrValues(attrValues, function () {

          // Step 3: 等待表格重新渲染后填充数据
          setTimeout(function () {
            fillSkuTableRows(selectedSkus, cb);
          }, 500);
        });
      } else {
        fillSkuTableRows(selectedSkus, cb);
      }
    });
  }

  // 取消所有变种属性勾选
  function uncheckAllAttrs(cb) {
    var form = document.querySelector('#skuAttrsInfo form');
    if (!form) { cb(); return; }

    var labels = form.querySelectorAll('.options-module label.d-checkbox');
    var toUncheck = [];
    for (var i = 0; i < labels.length; i++) {
      var checkbox = labels[i].querySelector('input[type="checkbox"]');
      if (checkbox && checkbox.checked) toUncheck.push(checkbox);
    }

    if (!toUncheck.length) { cb(); return; }

    autoLog('取消 ' + toUncheck.length + ' 个现有属性勾选');
    var idx = 0;
    (function next() {
      if (idx >= toUncheck.length) { setTimeout(cb, 200); return; }
      toUncheck[idx].click();
      idx++;
      setTimeout(next, 50);
    })();
  }

  // 添加变种属性值
  function addAttrValues(values, cb) {
    var addBox = document.querySelector('#skuAttrsInfo form .theme-value-add');
    if (!addBox) { cb(); return; }

    var input = addBox.querySelector('input[type="text"]');
    var addBtn = addBox.querySelector('button');
    if (!input || !addBtn) { cb(); return; }

    var idx = 0;
    (function next() {
      if (idx >= values.length) {
        autoLog('已添加 ' + values.length + ' 个变种属性');
        setTimeout(cb, 300);
        return;
      }

      var val = values[idx];
      idx++;

      input.focus();
      setInputValue(input, val);

      setTimeout(function () {
        var btn = addBox.querySelector('button');
        if (btn && !btn.disabled) btn.click();
        setTimeout(next, 100);
      }, 80);
    })();
  }

  // 填充 SKU 表格行数据
  function fillSkuTableRows(selectedSkus, cb) {
    autoLog('定位SKU表格...');

    var table = document.querySelector('#skuDataInfo table');
    if (!table) { autoError('未找到SKU表格'); cb(); return; }

    var rows = table.querySelectorAll('tbody tr');
    if (!rows.length) { autoError('SKU表格无数据行'); cb(); return; }

    var total = Math.min(rows.length, selectedSkus.length);
    var idx = 0;

    function processNext() {
      if (idx >= total) {
        autoLog('SKU表格已填充 ' + total + ' 行');
        cb();
        return;
      }

      idx++;
      autoLog('填充SKU第 ' + idx + '/' + total + ' 行...');

      var tr = rows[idx - 1];
      var sku = selectedSkus[idx - 1];

      fillSkuRow(tr, sku, function () {
        setTimeout(processNext, 150);
      });
    }

    processNext();
  }

  function fillSkuRow(tr, skuData, cb) {
    // 1. 预览图
    if (skuData.image) {
      fillSkuImage(tr, skuData.image, function () {
        fillSkuFields(tr, skuData);
        setTimeout(cb, 200);
      });
      return;
    }

    fillSkuFields(tr, skuData);
    setTimeout(cb, 100);
  }

  function fillSkuImage(tr, imgUrl, cb) {
    var hasImage = !!tr.querySelector('.sku-image-box');
    var triggerEl = hasImage
      ? tr.querySelector('.sku-image-box')
      : tr.querySelector('td.min-w-70 .img-box');
    if (!triggerEl) { cb(); return; }

    triggerEl.scrollIntoView({ behavior: 'instant', block: 'center' });

    setTimeout(function () {
      hoverElement(triggerEl);

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

          var modalStart = Date.now();
          (function checkModal() {
            var modal = findVisibleModal('从网络地址');
            if (modal) {
              var textarea = modal.querySelector('textarea.ant-input');
              if (textarea) setInputValue(textarea, imgUrl);
              setTimeout(function () {
                var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
                if (addBtn) addBtn.click();
                setTimeout(cb, 300);
              }, 200);
              return;
            }
            if (Date.now() - modalStart > 5000) { cb(); return; }
            requestAnimationFrame(checkModal);
          })();
          return;
        }

        if (Date.now() - start > 3000) { cb(); return; }
        requestAnimationFrame(checkDropdown);
      })();
    }, 300);
  }

  function fillSkuFields(tr, skuData) {
    // SKU货号
    if (skuData.customName || skuData.name || skuData.sku) {
      var skuInput = tr.querySelector('input[name="variationSku"]');
      var skuVal = skuData.customName || skuData.name || skuData.sku || '';
      if (skuInput && !skuInput.value.trim()) focusSetBlur(skuInput, skuVal);
    }

    // 申报价格
    if (skuData.price) {
      var priceInput = tr.querySelector('input[name="price"]');
      if (priceInput && !priceInput.value.trim()) focusSetBlur(priceInput, String(skuData.price));
    }

    // 尺寸
    if (skuData.dimensions && skuData.dimensions.length === 3) {
      var sorted = skuData.dimensions.slice().sort(function (a, b) { return b - a; });
      var lenInput = tr.querySelector('input[name="skuLength"]');
      var widInput = tr.querySelector('input[name="skuWidth"]');
      var heiInput = tr.querySelector('input[name="skuHeight"]');
      if (lenInput && !lenInput.value.trim()) focusSetBlur(lenInput, String(sorted[0]));
      if (widInput && !widInput.value.trim()) focusSetBlur(widInput, String(sorted[1]));
      if (heiInput && !heiInput.value.trim()) focusSetBlur(heiInput, String(sorted[2]));
    }

    // 重量
    if (skuData.weight) {
      var weightInput = tr.querySelector('input[name="weight"]');
      if (weightInput && !weightInput.value.trim()) focusSetBlur(weightInput, String(skuData.weight));
    }
  }

  // ========== 启动 ==========
  // 等待页面加载完成后开始
  waitForElement('#productProductInfo', 10000, function (el) {
    if (!el) {
      console.log('%c[自动填表] 页面未就绪，放弃自动填表', 'color:#ff4444;font-weight:bold');
      return;
    }

    fetchCollectedData(function (data) {
      if (!data) return;
      // 延迟一秒确保页面完全渲染
      setTimeout(function () {
        startAutoFill(data);
      }, 1000);
    });
  });

})();
