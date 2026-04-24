(function () {
  if (window.__dxmFloatBee) return;
  window.__dxmFloatBee = true;

  var Config = window.BeeConfig;

  // ========== SVG ==========
  var beeSVG =
    '<svg viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="22" cy="42" rx="16" ry="22" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="58" cy="42" rx="16" ry="22" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="22" cy="38" rx="8" ry="10" fill="#E1F5FE" opacity="0.5"/>' +
    '<ellipse cx="58" cy="38" rx="8" ry="10" fill="#E1F5FE" opacity="0.5"/>' +
    '<ellipse cx="40" cy="60" rx="24" ry="28" fill="#FFCA28"/>' +
    '<path d="M18 52 Q40 48 62 52" stroke="#5D4037" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M16 62 Q40 58 64 62" stroke="#5D4037" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M18 72 Q40 68 62 72" stroke="#5D4037" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<circle cx="40" cy="32" r="24" fill="#FFCA28"/>' +
    '<ellipse cx="40" cy="26" rx="16" ry="8" fill="#FFE082" opacity="0.5"/>' +
    '<ellipse cx="31" cy="30" rx="8" ry="9" fill="white"/>' +
    '<ellipse cx="49" cy="30" rx="8" ry="9" fill="white"/>' +
    '<circle cx="33" cy="31" r="5.5" fill="#3E2723"/>' +
    '<circle cx="51" cy="31" r="5.5" fill="#3E2723"/>' +
    '<circle cx="35" cy="28" r="2.8" fill="white"/>' +
    '<circle cx="53" cy="28" r="2.8" fill="white"/>' +
    '<circle cx="31" cy="33" r="1.3" fill="white"/>' +
    '<circle cx="49" cy="33" r="1.3" fill="white"/>' +
    '<ellipse cx="20" cy="38" rx="6" ry="3.5" fill="#FF8A80" opacity="0.45"/>' +
    '<ellipse cx="60" cy="38" rx="6" ry="3.5" fill="#FF8A80" opacity="0.45"/>' +
    '<path d="M33 40 Q40 47 47 40" stroke="#5D4037" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    '<path d="M30 12 Q26 4 22 2" stroke="#5D4037" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<circle cx="22" cy="2" r="3.5" fill="#FFCA28" stroke="#5D4037" stroke-width="1.5"/>' +
    '<path d="M50 12 Q54 4 58 2" stroke="#5D4037" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<circle cx="58" cy="2" r="3.5" fill="#FFCA28" stroke="#5D4037" stroke-width="1.5"/>' +
    '<path d="M36 88 L40 96 L44 88" fill="#5D4037"/>' +
    '</svg>';

  // ========== Constants ==========
  var isWorkPage = location.pathname === '/web/temu/add' || location.pathname === '/web/temu/edit';
  var totalSteps = 17;

  // ========== Create DOM ==========
  var wrapper = document.createElement('div');
  wrapper.id = '__dxm_bee';
  wrapper.innerHTML =
    '<div id="__dxm_bee_bubble"><div id="__dxm_bee_bubble_text"></div><div id="__dxm_bee_bubble_arrow"></div></div>' +
    '<div id="__dxm_bee_icon" title="' + (isWorkPage ? '点击开始工作 / 拖动移动' : '小蜜蜂工具') + '">' + beeSVG + '</div>';

  // ========== Styles ==========
  var s = document.createElement('style');
  s.textContent =
    '#__dxm_bee{position:fixed;z-index:2147483647;left:0;top:30%;user-select:none;display:flex;flex-direction:column;align-items:center}' +
    '#__dxm_bee *{margin:0;padding:0;box-sizing:border-box}' +
    '#__dxm_bee_icon{width:56px;height:56px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s}' +
    '#__dxm_bee_icon:hover{transform:scale(1.1)}' +
    '#__dxm_bee_icon svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(255,202,40,.4))}' +
    '#__dxm_bee.flying #__dxm_bee_icon{animation:__dxm_fly 1s ease-in-out infinite}' +
    '@keyframes __dxm_fly{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}' +
    '#__dxm_bee_bubble{display:none;margin-bottom:6px;position:relative;max-width:200px}' +
    '#__dxm_bee.show_bubble #__dxm_bee_bubble{display:block}' +
    '#__dxm_bee_bubble_text{background:#fff;border-radius:12px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,.15);border:1px solid #f0f0f0;font:12px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333}' +
    '#__dxm_bee_bubble_text.ok{color:#52c41a}' +
    '#__dxm_bee_bubble_text.err{color:#ff4444}' +
    '#__dxm_bee_bubble_text.loading{color:#FFA000}' +
    '#__dxm_bee_bubble_arrow{width:0;height:0;margin:0 auto;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff}' +
    '#__dxm_bee_progress{height:3px;background:#f0f0f0;border-radius:2px;margin-top:6px;overflow:hidden}' +
    '#__dxm_bee_progress_bar{height:100%;background:linear-gradient(90deg,#FFCA28,#FFA000);border-radius:2px;transition:width .3s;width:0}';

  document.head.appendChild(s);
  document.body.appendChild(wrapper);

  // ========== State ==========
  var icon = document.getElementById('__dxm_bee_icon');
  var bubbleText = document.getElementById('__dxm_bee_bubble_text');
  var isWorking = false;

  // ========== Bubble ==========
  function showBubble(text, type) {
    bubbleText.className = type || '';
    bubbleText.innerHTML = text;
    wrapper.classList.add('show_bubble');
  }

  function hideBubble() {
    wrapper.classList.remove('show_bubble');
  }

  function updateProgress(step, text, type) {
    var pct = Math.round((step / totalSteps) * 100);
    var bar = isWorking ? '<div id="__dxm_bee_progress"><div id="__dxm_bee_progress_bar" style="width:' + pct + '%"></div></div>' : '';
    var prefix = type === 'err' ? '❌ ' : type === 'ok' ? '✅ ' : '⏳ ';
    showBubble(prefix + text + '<br><span style="color:#999;font-size:10px">' + step + '/' + totalSteps + '</span>' + bar, type);
  }

  function log(stepNum, msg, el) {
    var args = ['%c[小蜜蜂] Step ' + stepNum + ': ' + msg, 'color:#FFA000;font-weight:bold'];
    if (el !== undefined) args.push(el);
    console.log.apply(console, args);
  }

  // ========== Drag ==========
  var dragging = false;
  var dragMoved = false;
  var startX, startY, origX, origY;

  function setPosition(x, y) {
    wrapper.style.left = x + 'px';
    wrapper.style.right = 'auto';
    wrapper.style.top = y + 'px';
  }

  function snapToEdge() {
    var rect = wrapper.getBoundingClientRect();
    var nearLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
    var topY = parseInt(wrapper.style.top) || 0;
    wrapper.style.transition = 'left .25s ease, right .25s ease';
    if (nearLeft) { wrapper.style.left = '0'; wrapper.style.right = 'auto'; }
    else { wrapper.style.left = 'auto'; wrapper.style.right = '0'; }
    wrapper.style.top = topY + 'px';
    setTimeout(function () { wrapper.style.transition = ''; }, 260);
  }

  icon.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    var rect = wrapper.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    icon.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    if (!dragMoved) return;
    setPosition(
      Math.max(0, Math.min(window.innerWidth - 56, origX + dx)),
      Math.max(0, Math.min(window.innerHeight - 56, origY + dy))
    );
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    icon.style.cursor = 'pointer';
    if (dragMoved) {
      snapToEdge();
      setTimeout(function () { dragMoved = false; }, 300);
    }
  });

  // ========== DOM Helpers ==========
  function hoverElement(el) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }

  function waitForElement(selector, timeout, cb) {
    var start = Date.now();
    (function check() {
      var el = document.querySelector(selector);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function waitForProvinceSelect(cb) {
    var start = Date.now();
    (function check() {
      var all = document.querySelectorAll('#productProductInfo .ant-select-selector');
      for (var i = 0; i < all.length; i++) {
        var ph = all[i].querySelector('.ant-select-selection-placeholder');
        var item = all[i].querySelector('.ant-select-selection-item');
        if ((ph && ph.textContent.includes('请选择省份')) || (item && item.textContent.includes('省'))) {
          return cb(all[i]);
        }
      }
      if (Date.now() - start > 5000) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  function forceOpenAntSelect(selector) {
    var rect = selector.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    selector.dispatchEvent(new PointerEvent('pointerdown', opts));
    selector.dispatchEvent(new MouseEvent('mousedown', opts));
    selector.dispatchEvent(new PointerEvent('pointerup', opts));
    selector.dispatchEvent(new MouseEvent('mouseup', opts));
    selector.dispatchEvent(new MouseEvent('click', opts));
  }

  function waitForAntSelect(labelText, cb) {
    var start = Date.now();
    (function check() {
      var labels = document.querySelectorAll('#packageInfo .ant-form-item-label label');
      for (var i = 0; i < labels.length; i++) {
        if (labels[i].textContent.includes(labelText)) {
          var formItem = labels[i].closest('.ant-form-item');
          if (formItem) {
            var sel = formItem.querySelector('.ant-select-selector');
            if (sel) return cb(sel);
          }
        }
      }
      if (Date.now() - start > 5000) return cb(null);
      requestAnimationFrame(check);
    })();
  }

  // ========== Step Chain ==========
  function step(stepNum, loadingText, okText, action, nextFn) {
    log(stepNum, loadingText);
    updateProgress(stepNum, loadingText, 'loading');
    var result = action();
    if (result === false) {
      log(stepNum, '❌ 失败 - ' + okText.replace('已', '未找到'));
      updateProgress(stepNum, okText.replace('已', '未找到'), 'err');
      finishWork();
      return;
    }
    log(stepNum, '✅ ' + okText);
    updateProgress(stepNum, okText, 'ok');
    if (nextFn) setTimeout(nextFn, 800);
  }

  function finishWork() {
    isWorking = false;
    wrapper.classList.remove('flying');
    console.log('%c[小蜜蜂] ===== 工作结束 =====', 'color:#52c41a;font-weight:bold;font-size:14px');
    setTimeout(hideBubble, 3000);
  }

  // ========== Auto Fill Steps ==========
  if (isWorkPage) {
    icon.addEventListener('click', function () {
      if (dragMoved || isWorking) return;
      isWorking = true;
      wrapper.classList.add('flying');
      console.log('%c[小蜜蜂] ===== 开始工作 =====', 'color:#FFCA28;font-weight:bold;font-size:14px');

      // Step 1: 点击「确认分类」按钮
      step(1, '正在点击分类按钮...', '已点击分类按钮', function () {
        var btn = document.querySelector('#productBasicInfo .category-item .ant-form-item-control button');
        log(1, '分类按钮', btn);
        if (!btn) return false;
        btn.click();
        return true;
      }, function () {

      // Step 2: 点击弹窗「确认」按钮
      step(2, '正在点击确认按钮...', '分类确认完成！', function () {
        var btn = document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content .ant-modal-footer button.ant-btn-primary');
        log(2, '弹窗确认按钮', btn);
        if (!btn) return false;
        btn.click();
        return true;
      }, doStep3);

      }); // end step 1
    });

    // Step 3: 过滤标题违规字样
    function doStep3() {
      log(3, '正在过滤标题违规字样...');
      updateProgress(3, '正在过滤标题...', 'loading');
      var input = document.querySelector('#productProductInfo form .ant-form-item input');
      log(3, '标题输入框', input);
      if (!input || !input.value) {
        log(3, '⚠️ 未找到标题输入框或值为空，跳过过滤');
        updateProgress(3, '标题为空，跳过过滤', 'ok');
        setTimeout(doStep4, 3000);
        return;
      }
      var title = input.value;
      log(3, '原标题: "' + title + '"');
      var filters = Config.loadFilters().filter(function (f) { return f.enabled && f.from; });
      var changed = false;
      for (var i = 0; i < filters.length; i++) {
        var f = filters[i];
        if (title.indexOf(f.from) === -1) continue;
        title = title.split(f.from).join(f.to);
        log(3, '命中规则: "' + f.from + '" → "' + f.to + '"');
        changed = true;
      }
      if (changed) {
        log(3, '过滤后: "' + title + '"');
        Config.setInputValue(input, title);
        log(3, '✅ 标题已过滤');
        updateProgress(3, '标题已过滤', 'ok');
      } else {
        log(3, '✅ 标题无违规字样');
        updateProgress(3, '标题无违规字样', 'ok');
      }
      setTimeout(doStep4, 3000);
    }

    // Step 4: 悬浮「一键翻译」，点击「中文→英文」
    function doStep4() {
      log(4, '正在触发一键翻译...');
      updateProgress(4, '正在触发一键翻译...', 'loading');
      var translateBtn = document.querySelector('#app .product-add-layout .header .btn-box button.translation-btn');
      log(4, '翻译按钮', translateBtn);
      if (!translateBtn) { updateProgress(4, '未找到一键翻译按钮', 'err'); finishWork(); return; }
      hoverElement(translateBtn);
      var ts = '.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item span';
      waitForElement(ts, 3000, function (opt) {
        if (!opt) {
          translateBtn.click();
          waitForElement(ts, 3000, function (opt2) {
            if (!opt2) { log(4, '❌ 未找到翻译菜单'); updateProgress(4, '未找到翻译菜单', 'err'); finishWork(); return; }
            log(4, '翻译菜单项', opt2);
            opt2.click();
            log(4, '✅ 已点击中文→英文');
            updateProgress(4, '已点击中文→英文', 'ok');
            doStep5();
          });
          return;
        }
        log(4, '翻译菜单项', opt);
        opt.click();
        log(4, '✅ 已点击中文→英文');
        updateProgress(4, '已点击中文→英文', 'ok');
        doStep5();
      });
    }

    // Step 5: 省份下拉框
    function doStep5() {
      log(5, '正在打开省份选择...');
      updateProgress(5, '正在打开省份选择...', 'loading');
      waitForProvinceSelect(function (sel) {
        log(5, '省份下拉框', sel);
        if (!sel) { updateProgress(5, '未找到省份下拉框', 'err'); finishWork(); return; }
        var input = sel.querySelector('.ant-select-selection-search-input');
        if (input) input.focus();
        forceOpenAntSelect(sel);
        log(5, '✅ 已打开省份下拉框');
        updateProgress(5, '已打开省份下拉框', 'ok');
        setTimeout(doStep6, 800);
      });
    }

    // Step 6: 选择福建省
    function doStep6() {
      step(6, '正在选择福建省...', '已选择福建省', function () {
        var o = document.querySelector('.ant-select-item-option[title="福建省"]');
        log(6, '福建省选项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep7);
    }

    // Step 7: 外包装形状
    function doStep7() {
      log(7, '正在打开外包装形状...');
      updateProgress(7, '正在打开外包装形状...', 'loading');
      waitForAntSelect('外包装形状', function (sel) {
        log(7, '外包装形状下拉框', sel);
        if (!sel) { updateProgress(7, '未找到外包装形状', 'err'); finishWork(); return; }
        sel.scrollIntoView({ block: 'center' });
        setTimeout(function () {
          forceOpenAntSelect(sel);
          log(7, '✅ 已打开外包装形状');
          updateProgress(7, '已打开外包装形状', 'ok');
          setTimeout(doStep8, 800);
        }, 300);
      });
    }

    // Step 8: 选择不规则
    function doStep8() {
      step(8, '正在选择不规则...', '已选择不规则', function () {
        var o = document.querySelector('.ant-select-item-option[title="不规则"]');
        log(8, '不规则选项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep9);
    }

    // Step 9: 外包装类型
    function doStep9() {
      log(9, '正在打开外包装类型...');
      updateProgress(9, '正在打开外包装类型...', 'loading');
      waitForAntSelect('外包装类型', function (sel) {
        log(9, '外包装类型下拉框', sel);
        if (!sel) { updateProgress(9, '未找到外包装类型', 'err'); finishWork(); return; }
        sel.scrollIntoView({ block: 'center' });
        setTimeout(function () {
          forceOpenAntSelect(sel);
          log(9, '✅ 已打开外包装类型');
          updateProgress(9, '已打开外包装类型', 'ok');
          setTimeout(doStep10, 800);
        }, 300);
      });
    }

    // Step 10: 选择软包装+硬物
    function doStep10() {
      step(10, '正在选择软包装+硬物...', '已选择软包装+硬物', function () {
        var o = document.querySelector('.ant-select-item-option[title="软包装+硬物"]');
        log(10, '软包装+硬物选项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep11);
    }

    // Step 11: 悬浮选择图片
    function doStep11() {
      step(11, '正在触发选择图片...', '已悬浮选择图片', function () {
        var btn = document.querySelector('#packageInfo .header button');
        log(11, '选择图片按钮', btn);
        if (!btn || !btn.textContent.includes('选择图片')) return false;
        hoverElement(btn);
        return true;
      }, doStep12);
    }

    // Step 12: 引用采集图片
    function doStep12() {
      step(12, '正在点击引用采集图片...', '已点击引用采集图片', function () {
        var o = document.querySelector('.ant-dropdown-menu-item[data-menu-id="crawl"]');
        log(12, '引用采集图片菜单项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep13);
    }

    // Step 13: 勾选第一张图片
    function doStep13() {
      step(13, '正在选择采集图片...', '已勾选第一张图片', function () {
        var modals = document.querySelectorAll('.ant-modal-wrap');
        var targetModal = null;
        for (var i = 0; i < modals.length; i++) {
          var title = modals[i].querySelector('.ant-modal-title');
          if (title && title.textContent.includes('引用采集图片')) {
            targetModal = modals[i];
            break;
          }
        }
        log(13, '引用采集图片弹窗', targetModal);
        if (!targetModal) return false;
        var o = targetModal.querySelector('.img-box .ant-checkbox-wrapper .ant-checkbox-input');
        log(13, '图片复选框', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep14);
    }

    // Step 14: 确认选择
    function doStep14() {
      step(14, '正在确认选择...', '已确认选择图片', function () {
        var modals = document.querySelectorAll('.ant-modal-wrap');
        var targetModal = null;
        for (var i = 0; i < modals.length; i++) {
          var title = modals[i].querySelector('.ant-modal-title');
          if (title && title.textContent.includes('引用采集图片')) {
            targetModal = modals[i];
            break;
          }
        }
        log(14, '确认按钮所在弹窗', targetModal);
        if (!targetModal) return false;
        var o = targetModal.querySelector('.ant-modal-footer button.ant-btn-primary');
        log(14, '确认按钮', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep15);
    }

    // Step 15: 悬浮发布按钮
    function doStep15() {
      step(15, '正在触发发布菜单...', '已悬浮发布按钮', function () {
        var btn = document.querySelector('.footer .btn-box button.btn-green');
        log(15, '发布按钮', btn);
        if (!btn || !btn.textContent.includes('发布')) return false;
        hoverElement(btn);
        return true;
      }, doStep16);
    }

    // Step 16: 检查标题长度
    function doStep16() {
      log(16, '正在检查标题长度...');
      updateProgress(16, '正在检查标题长度...', 'loading');
      var input = document.querySelector('#productProductInfo form .ant-form-item input');
      log(16, '标题输入框', input);
      if (!input || !input.value) {
        log(16, '⚠️ 未找到标题输入框或值为空，跳过截取');
        updateProgress(16, '标题无需截取', 'ok');
        doStep17();
        return;
      }

      var container = input.closest('.inputContainer');
      var limitEl = container ? container.querySelector('.color-gray') : null;
      var limit = 200;
      if (limitEl) {
        var match = limitEl.textContent.match(/\/\s*(\d+)/);
        if (match) limit = parseInt(match[1], 10);
      }

      var title = input.value;
      log(16, '标题长度: ' + title.length + ', 限制: ' + limit + ', 标题内容: "' + title.substring(0, 60) + (title.length > 60 ? '...' : '"'));

      if (title.length <= limit) {
        log(16, '✅ 标题长度 ' + title.length + ' ≤ ' + limit + '，无需截取');
        updateProgress(16, '标题长度 ' + title.length + '，无需截取', 'ok');
        doStep17();
        return;
      }

      log(16, '标题超限 ' + title.length + ' > ' + limit + '，开始截取...');
      updateProgress(16, '标题超过' + limit + '，正在截取...', 'loading');
      var t = title.substring(0, limit);
      var bps = ['。','，',',','.','!','!','?','?','；',';','、',' ','-','–','—','(',')','[',']','/','\\','&','+'];
      var last = -1;
      for (var i = 0; i < bps.length; i++) { var idx = t.lastIndexOf(bps[i]); if (idx > last) last = idx; }
      if (last > 0) t = t.substring(0, last + 1);

      log(16, '截取后长度: ' + t.length + ', 内容: "' + t.substring(0, 60) + (t.length > 60 ? '...' : '"'));
      Config.setInputValue(input, t);
      log(16, '✅ 标题已截取至 ' + t.length + ' 字符');
      updateProgress(16, '标题已截取至 ' + t.length + ' 字符', 'ok');
      doStep17();
    }

    // Step 17: 立即发布（根据自动发布配置决定是否执行）
    function doStep17() {
      if (!Config.loadAutoPublish()) {
        log(17, '⏭️ 自动发布已关闭，跳过发布步骤');
        updateProgress(17, '自动发布已关闭，跳过', 'ok');
        finishWork();
        return;
      }
      step(17, '正在点击立即发布...', '全部操作完成！', function () {
        var o = document.querySelector('.ant-dropdown-menu-item[data-menu-id="2"]');
        log(17, '立即发布菜单项', o);
        if (!o || !o.textContent.includes('立即发布')) return false;
        o.click();
        return true;
      }, null);
      finishWork();
    }
  }
})();
