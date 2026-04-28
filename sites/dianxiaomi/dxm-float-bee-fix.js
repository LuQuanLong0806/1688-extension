(function () {
  if (window.__dxmFloatBee) return;
  window.__dxmFloatBee = true;

  // --- Cute Q-version Bee SVG ---
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

  // --- Detect page ---
  var isWorkPage = location.pathname === '/web/temu/add' || location.pathname === '/web/temu/edit';

  // --- DOM ---
  var wrapper = document.createElement('div');
  wrapper.id = '__dxm_bee';
  wrapper.innerHTML =
    '<div id="__dxm_bee_bubble">' +
    '<div id="__dxm_bee_bubble_text"></div>' +
    '<div id="__dxm_bee_bubble_arrow"></div>' +
    '</div>' +
    '<div id="__dxm_bee_icon" title="' + (isWorkPage ? '点击开始工作 / 拖动移动' : '小蜜蜂工具') + '">' + beeSVG + '</div>';

  var s = document.createElement('style');
  s.textContent =
    // Wrapper
    '#__dxm_bee{position:fixed;z-index:2147483647;left:0;top:30%;user-select:none;' +
    'display:flex;flex-direction:column;align-items:center}' +
    '#__dxm_bee *{margin:0;padding:0;box-sizing:border-box}' +

    // Bee icon
    '#__dxm_bee_icon{width:56px;height:56px;cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;' +
    'transition:transform .2s}' +
    '#__dxm_bee_icon:hover{transform:scale(1.1)}' +
    '#__dxm_bee_icon svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(255,202,40,.4))}' +

    // Flying animation
    '#__dxm_bee.flying #__dxm_bee_icon{animation:__dxm_fly 1s ease-in-out infinite}' +
    '@keyframes __dxm_fly{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}' +

    // Bubble
    '#__dxm_bee_bubble{display:none;margin-bottom:6px;position:relative;max-width:180px}' +
    '#__dxm_bee.show_bubble #__dxm_bee_bubble{display:block}' +
    '#__dxm_bee_bubble_text{background:#fff;border-radius:12px;padding:8px 12px;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'font:12px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;white-space:nowrap}' +
    '#__dxm_bee_bubble_text.ok{color:#52c41a}' +
    '#__dxm_bee_bubble_text.err{color:#ff4444}' +
    '#__dxm_bee_bubble_text.loading{color:#FFA000}' +
    // Bubble arrow
    '#__dxm_bee_bubble_arrow{width:0;height:0;margin:0 auto;' +
    'border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff}' +

    // Progress bar inside bubble
    '#__dxm_bee_progress{height:3px;background:#f0f0f0;border-radius:2px;margin-top:6px;overflow:hidden}' +
    '#__dxm_bee_progress_bar{height:100%;background:linear-gradient(90deg,#FFCA28,#FFA000);border-radius:2px;transition:width .3s;width:0}';

  document.head.appendChild(s);
  document.body.appendChild(wrapper);

  var icon = document.getElementById('__dxm_bee_icon');
  var bubbleText = document.getElementById('__dxm_bee_bubble_text');
  var isWorking = false;
  var totalSteps = 16;
  var currentStep = 0;

  // --- Bubble ---
  function showBubble(text, type) {
    bubbleText.className = type || '';
    bubbleText.innerHTML = text;
    wrapper.classList.add('show_bubble');
  }

  function hideBubble() {
    wrapper.classList.remove('show_bubble');
  }

  function updateProgress(step, text, type) {
    currentStep = step;
    var pct = Math.round((step / totalSteps) * 100);
    var progressHTML = '';
    if (isWorking) {
      progressHTML = '<div id="__dxm_bee_progress"><div id="__dxm_bee_progress_bar" style="width:' + pct + '%"></div></div>';
    }
    showBubble((type === 'err' ? '❌ ' : type === 'ok' ? '✅ ' : '⏳ ') + text + '<br><span style="color:#999;font-size:10px">' + step + '/' + totalSteps + '</span>' + progressHTML, type);
  }

  // --- Drag ---
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
    if (nearLeft) {
      wrapper.style.left = '0';
      wrapper.style.right = 'auto';
    } else {
      wrapper.style.left = 'auto';
      wrapper.style.right = '0';
    }
    wrapper.style.top = topY + 'px';
    setTimeout(function () {
      wrapper.style.transition = '';
    }, 260);
  }

  icon.addEventListener('mousedown', function (e) {
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
    var nx = origX + dx;
    var ny = origY + dy;
    ny = Math.max(0, Math.min(window.innerHeight - 56, ny));
    nx = Math.max(0, Math.min(window.innerWidth - 56, nx));
    setPosition(nx, ny);
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    icon.style.cursor = 'pointer';
    if (dragMoved) {
      snapToEdge();
      setTimeout(function () {
        dragMoved = false;
      }, 300);
    }
  });

  // --- Helpers ---
  function hoverElement(el) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }

  function waitForElement(selector, timeout, cb) {
    var start = Date.now();
    function check() {
      var el = document.querySelector(selector);
      if (el) return cb(el);
      if (Date.now() - start > timeout) return cb(null);
      requestAnimationFrame(check);
    }
    check();
  }

  function waitForProvinceSelect(cb) {
    var start = Date.now();
    function check() {
      var selectors = document.querySelectorAll('#productProductInfo .ant-select-selector');
      for (var i = 0; i < selectors.length; i++) {
        var placeholder = selectors[i].querySelector('.ant-select-selection-placeholder');
        if (placeholder && placeholder.textContent.includes('请选择省份')) {
          return cb(selectors[i]);
        }
      }
      if (Date.now() - start > 5000) return cb(null);
      requestAnimationFrame(check);
    }
    check();
  }

  // --- Auto fill ---
  if (isWorkPage) {
    icon.addEventListener('click', function () {
      if (dragMoved || isWorking) return;
      isWorking = true;
      currentStep = 0;
      wrapper.classList.add('flying');

      // Step 1: 点击「确认分类」按钮
      updateProgress(1, '正在点击分类按钮...', 'loading');
      var categoryBtn = document.querySelector(
        '#productBasicInfo .category-item .ant-form-item-control button'
      );
      if (!categoryBtn) {
        updateProgress(1, '未找到分类按钮', 'err');
        finishWork();
        return;
      }
      categoryBtn.click();
      updateProgress(1, '已点击分类按钮', 'ok');

      // Step 2: 点击弹窗中的「确认」按钮
      setTimeout(function () {
        updateProgress(2, '正在点击确认按钮...', 'loading');
        var confirmBtn = document.querySelector(
          '.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content .ant-modal-footer button.ant-btn-primary'
        );
        if (!confirmBtn) {
          updateProgress(2, '未找到确认按钮', 'err');
          finishWork();
          return;
        }
        confirmBtn.click();
        updateProgress(2, '分类确认完成！', 'ok');

        // Step 3: 悬浮「一键翻译」按钮，点击「中文→英文」
        setTimeout(function () {
          updateProgress(3, '正在触发一键翻译...', 'loading');
          var translateBtn = document.querySelector(
            '#app .product-add-layout .header .btn-box button.translation-btn'
          );
          if (!translateBtn) {
            updateProgress(3, '未找到一键翻译按钮', 'err');
            finishWork();
            return;
          }
          hoverElement(translateBtn);

          var translateSelector = '.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item span';
          waitForElement(translateSelector, 3000, function (translateOption) {
            if (!translateOption) {
              translateBtn.click();
              waitForElement(translateSelector, 3000, function (retryOption) {
                if (!retryOption) {
                  updateProgress(3, '未找到翻译菜单', 'err');
                  finishWork();
                  return;
                }
                retryOption.click();
                updateProgress(3, '已点击中文→英文', 'ok');
                doCheckTitle();
              });
              return;
            }
            translateOption.click();
            updateProgress(3, '已点击中文→英文', 'ok');
            doCheckTitle();
          });
        }, 800);
      }, 800);

      // Step 4: 翻译完成后检查标题长度并截取
      function doCheckTitle() {
        updateProgress(4, '等待翻译完成...', 'loading');
        setTimeout(function () {
          var titleInput = document.querySelector(
            '#productProductInfo .ant-form-item-has-error .ant-form-item-control-input input'
          );
          if (!titleInput) {
            updateProgress(4, '标题无报错，无需截取', 'ok');
            doSelectProvince();
            return;
          }

          var title = titleInput.value;
          if (title.length <= 250) {
            updateProgress(4, '标题长度 ' + title.length + '，无需截取', 'ok');
            doSelectProvince();
            return;
          }

          updateProgress(4, '标题超过250，正在截取...', 'loading');
          var truncated = title.substring(0, 250);
          var breakPoints = ['。', '，', ',', '.', '！', '？', '；', ';', '、', ' '];
          var cutIdx = -1;
          for (var ci = truncated.length - 1; ci >= 0; ci--) {
            if (breakPoints.indexOf(truncated[ci]) !== -1) { cutIdx = ci; break; }
          }
          if (cutIdx > 0) {
            truncated = truncated.substring(0, cutIdx);
          }

          titleInput.value = truncated;
          titleInput.dispatchEvent(new Event('input', { bubbles: true }));
          titleInput.dispatchEvent(new Event('change', { bubbles: true }));
          updateProgress(4, '标题已截取至 ' + truncated.length + ' 字符', 'ok');
          doSelectProvince();
        }, 4000);
      }
    });
  }
})();
