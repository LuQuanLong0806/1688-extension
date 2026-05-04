(function () {
  if (window.__dxmImageEditor) return;
  window.__dxmImageEditor = true;

  var POS_KEY = '__dxm_editor_toolbar_pos';

  // ========== DOM ==========
  var toolbar = document.createElement('div');
  toolbar.id = '__dxm_editor_toolbar';
  toolbar.innerHTML = `
    <div class="__dxm_editor_drag" title="拖动移动位置">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="4" cy="3" r="1.5"/><circle cx="10" cy="3" r="1.5"/>
        <circle cx="4" cy="7" r="1.5"/><circle cx="10" cy="7" r="1.5"/>
        <circle cx="4" cy="11" r="1.5"/><circle cx="10" cy="11" r="1.5"/>
      </svg>
    </div>
    <div class="__dxm_editor_btn" data-action="crop" title="裁剪/旋转">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 1v12h12M13 15V3H1"/></svg>
      <span>裁剪</span>
    </div>
    <div class="__dxm_editor_sep"></div>
    <div class="__dxm_editor_btn" data-action="resize" title="调整尺寸">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1h6v6H1zM9 9h6v6H9z"/><path d="M7 4h5v5"/></svg>
      <span>调整尺寸</span>
    </div>
    <div class="__dxm_editor_sep"></div>
    <div class="__dxm_editor_btn" data-action="erase" title="AI消除笔 - 涂抹去除水印/文字">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14l2-2L13 3l1 1L5 13l-2 1z"/><path d="M11 2l2 2"/></svg>
      <span>消除笔</span>
    </div>
    <div class="__dxm_editor_sep"></div>
    <div class="__dxm_editor_btn" data-action="ruler" title="显示/隐藏标尺参考线">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="14" height="8" rx="1"/><path d="M4 4v3M7 4v5M10 4v3M13 4v5"/></svg>
      <span>标尺</span>
    </div>
    <div class="__dxm_editor_sep"></div>
    <div class="__dxm_editor_btn" data-action="watermark" title="我的水印 - 批量添加水印">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2C5 2 2 5 2 8s3 6 6 6 6-3 6-6-3-6-6-6z"/><path d="M6 8h4M8 6v4"/></svg>
      <span>我的水印</span>
    </div>
    <div class="__dxm_editor_sep"></div>
    <div class="__dxm_editor_btn" data-action="flip" title="批量水平翻转图片">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v14M5 4L2 8l3 4M11 4l3 4-3 4"/></svg>
      <span>批量翻转</span>
    </div>`;

  // ========== Styles ==========
  var style = document.createElement('style');
  style.textContent = `
    #__dxm_editor_toolbar {
      position: fixed; z-index: 2147483647;
      display: flex; align-items: center; gap: 2px;
      padding: 6px 8px;
      background: rgba(255,255,255,0.88);
      backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 28px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
      font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif;
      font-size: 13px; color: #333;
      user-select: none;
      transition: box-shadow .2s, transform .15s;
    }
    #__dxm_editor_toolbar:hover {
      box-shadow: 0 6px 28px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08);
    }
    #__dxm_editor_toolbar.__dxm_dragging {
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      transform: scale(1.02);
      cursor: grabbing;
    }
    #__dxm_editor_toolbar * { margin: 0; padding: 0; box-sizing: border-box; }
    #__dxm_editor_toolbar .__dxm_editor_sep { margin: 0 6px; }
    .__dxm_editor_drag {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px;
      border-radius: 50%;
      color: #aaa;
      cursor: grab;
      transition: background .15s, color .15s;
      flex-shrink: 0;
    }
    .__dxm_editor_drag:hover { background: rgba(0,0,0,0.06); color: #666; }
    .__dxm_editor_btn {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 14px;
      border-radius: 20px;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s, transform .15s, color .15s;
      font-size: 13px; font-weight: 500;
      color: #555;
    }
    .__dxm_editor_btn:hover {
      background: rgba(0,0,0,0.05);
      color: #222;
      transform: scale(1.04);
    }
    .__dxm_editor_btn:active {
      transform: scale(0.97);
      background: rgba(0,0,0,0.08);
    }
    .__dxm_editor_btn.__active {
      background: rgba(64,158,255,0.12);
      color: #409eff;
    }
    .__dxm_editor_btn.__working {
      background: rgba(255,160,0,0.12);
      color: #e6a23c;
      pointer-events: none;
    }
    .__dxm_editor_sep {
      width: 1px; height: 18px;
      background: rgba(0,0,0,0.10);
      margin: 0 6px;
      flex-shrink: 0;
    }
    .__dxm_editor_toast {
      position: fixed; top: 60px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647;
      padding: 10px 24px;
      background: rgba(48,48,48,0.88);
      backdrop-filter: blur(8px);
      color: #fff; font-size: 13px;
      border-radius: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      opacity: 0; transition: opacity .3s, top .3s;
      pointer-events: none;
    }
    .__dxm_editor_toast.show { opacity: 1; top: 52px; }
  `;

  document.head.appendChild(style);
  document.body.appendChild(toolbar);

  // ========== 位置恢复 ==========
  function applyPos(left, top) {
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    toolbar.style.transform = 'none';
  }

  function savePos() {
    var rect = toolbar.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch (e) {}
  }

  function restorePos() {
    try {
      var saved = JSON.parse(localStorage.getItem(POS_KEY));
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        applyPos(saved.left, saved.top);
        return;
      }
    } catch (e) {}
    // 默认顶部居中
    requestAnimationFrame(function () {
      var w = toolbar.offsetWidth;
      applyPos((window.innerWidth - w) / 2, 12);
    });
  }

  restorePos();

  // ========== 拖动 ==========
  var dragging = false, dragMoved = false;
  var startX, startY, origX, origY;

  var handle = toolbar.querySelector('.__dxm_editor_drag');

  handle.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    var rect = toolbar.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    toolbar.classList.add('__dxm_dragging');
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    if (!dragMoved) return;

    var maxX = window.innerWidth - toolbar.offsetWidth;
    var maxY = window.innerHeight - toolbar.offsetHeight;
    var nx = Math.max(0, Math.min(maxX, origX + dx));
    var ny = Math.max(0, Math.min(maxY, origY + dy));
    applyPos(nx, ny);
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    toolbar.classList.remove('__dxm_dragging');
    if (dragMoved) savePos();
  });

  // ========== Toast ==========
  var toastEl = document.createElement('div');
  toastEl.className = '__dxm_editor_toast';
  document.body.appendChild(toastEl);
  var toastTimer = null;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  // ========== Helpers ==========
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // 轮询等待元素出现，最多等 maxMs，每 intervalMs 检查一次
  function waitFor(selector, maxMs, intervalMs) {
    maxMs = maxMs || 3000;
    intervalMs = intervalMs || 100;
    return new Promise(function (resolve) {
      var el = document.querySelector(selector);
      if (el) return resolve(el);
      var start = Date.now();
      var timer = setInterval(function () {
        el = document.querySelector(selector);
        if (el || Date.now() - start > maxMs) {
          clearInterval(timer);
          resolve(el || null);
        }
      }, intervalMs);
    });
  }

  // 轮询等待模块出现
  function waitForModule(name, maxMs) {
    maxMs = maxMs || 3000;
    return new Promise(function (resolve) {
      var mod = findModuleByName(name);
      if (mod) return resolve(mod);
      var start = Date.now();
      var timer = setInterval(function () {
        mod = findModuleByName(name);
        if (mod || Date.now() - start > maxMs) {
          clearInterval(timer);
          resolve(mod || null);
        }
      }, 100);
    });
  }

  function click(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }

  // 等待编辑器页面渲染完成
  async function waitForEditor(maxMs) {
    maxMs = maxMs || 10000;
    var el = await waitFor('.side_tools .tools .tool', maxMs);
    if (!el) console.error(LOG, '等待编辑器超时(' + maxMs + 'ms)');
    return !!el;
  }

  // 等待图片切换完成（通过 body 的 loading 类判断）
  async function waitForImageLoad(maxMs) {
    maxMs = maxMs || 5000;
    var start = Date.now();
    // 先等 loading 出现
    while (!document.body.classList.contains('el-loading-parent--hidden')) {
      if (Date.now() - start > 1000) break; // 最多等1秒loading出现
      await wait(50);
    }
    // 再等 loading 消失
    while (document.body.classList.contains('el-loading-parent--hidden')) {
      if (Date.now() - start > maxMs) break;
      await wait(50);
    }
  }

  function findModuleByName(name) {
    var modules = $$('.side_tools .content .module');
    for (var i = 0; i < modules.length; i++) {
      var nameEl = modules[i].querySelector('.name');
      if (nameEl && nameEl.textContent.trim() === name) return modules[i];
    }
    return null;
  }

  // ========== 批量翻转 ==========
  var isWorking = false;
  var LOG = '[小秘美图]';

  function updateFlipProgress(current, total) {
    var btn = toolbar.querySelector('[data-action="flip"] span');
    if (btn) btn.textContent = current + '/' + total;
  }

  async function doBatchFlip() {
    if (isWorking) return;
    isWorking = true;
    var flipBtn = toolbar.querySelector('[data-action="flip"]');
    flipBtn.classList.add('__working');
    console.log(LOG, '===== 批量翻转开始 =====');

    if (!(await waitForEditor())) {
      toast('编辑器未加载完成');
      flipBtn.classList.remove('__working');
      isWorking = false;
      return;
    }

    // 调试：测试各种选择器
    console.log(LOG, 'querySelectorAll .side_tools:', document.querySelectorAll('.side_tools').length);
    console.log(LOG, 'querySelectorAll .side_tools .tools:', document.querySelectorAll('.side_tools .tools').length);
    console.log(LOG, 'querySelectorAll .side_tools .tools .tool:', document.querySelectorAll('.side_tools .tools .tool').length);
    console.log(LOG, 'querySelectorAll .tool.Adjust:', document.querySelectorAll('.tool.Adjust').length);
    console.log(LOG, 'querySelector .img_list:', document.querySelector('.img_list'));
    console.log(LOG, 'querySelectorAll .img_list img:', document.querySelectorAll('.img_list img').length);

    // 1. 点击左侧"调整"tab
    var adjustTab = $('.side_tools .tools .tool.Adjust');
    console.log(LOG, '调整tab:', adjustTab ? '找到' : '未找到', adjustTab && adjustTab.classList.contains('selected') ? '(已选中)' : '(未选中)');
    if (!adjustTab || !adjustTab.classList.contains('selected')) {
      click(adjustTab);
      console.log(LOG, '点击调整tab, 等待内容加载...');
      await waitFor('.side_tools .content .module', 3000);
    }

    // 2. 等待右侧图片列表出现
    console.log(LOG, '等待图片列表...');
    await waitFor('.img_list img', 5000);

    // 3. 获取右侧图片列表
    var imgs = $$('.img_list .type .value img');
    var total = imgs.length;
    console.log(LOG, '图片列表:', total, '张', imgs.length > 0 ? '第一张src=' + (imgs[0].src || '').substring(0, 60) + '...' : '');
    if (!total) {
      toast('未找到图片');
      flipBtn.classList.remove('__working');
      isWorking = false;
      return;
    }

    toast('开始批量翻转 ' + total + ' 张图片');

    for (var i = 0; i < total; i++) {
      updateFlipProgress(i + 1, total);

      // 重新获取图片列表（DOM可能刷新）
      var currentImgs = $$('.img_list .type .value img');
      if (i >= currentImgs.length) { console.warn(LOG, '图片列表变短, 跳出'); break; }

      // 点击第i张图片
      console.log(LOG, '[' + (i + 1) + '/' + total + '] 点击图片');
      click(currentImgs[i]);
      await waitForImageLoad(5000);
      await wait(100);

      // 等待"裁剪/旋转"出现
      var cropModule = await waitForModule('裁剪/旋转', 3000);
      if (!cropModule) { console.error(LOG, '未找到裁剪/旋转模块'); toast('未找到裁剪/旋转'); break; }
      var cropOpen = cropModule.querySelector('.open');
      console.log(LOG, '[' + (i + 1) + '/' + total + '] 点击裁剪/旋转');
      click(cropOpen);

      // 等待翻转按钮出现

      // 等待翻转按钮出现
      var flipIcon = await waitFor('.icon_btns .icon-flip_h', 3000);
      if (!flipIcon) {
        console.warn(LOG, 'icon-flip_h未找到, 尝试兜底');
        var iconBtns = $('.icon_btns');
        if (iconBtns) {
          var spans = iconBtns.querySelectorAll('span');
          console.log(LOG, 'icon_btns下span数量:', spans.length);
          if (spans.length >= 3) flipIcon = spans[2];
        }
      }
      if (flipIcon) {
        console.log(LOG, '[' + (i + 1) + '/' + total + '] 点击翻转');
        click(flipIcon);
        await wait(200);
      } else {
        console.warn(LOG, '[' + (i + 1) + '/' + total + '] 未找到翻转按钮');
      }
    }

    // 全部完成后关闭裁剪面板
    var lastCropModule = findModuleByName('裁剪/旋转');
    if (lastCropModule) {
      var lastCropOpen = lastCropModule.querySelector('.open');
      if (lastCropOpen) click(lastCropOpen);
    }

    updateFlipProgress();
    var flipBtnSpan = toolbar.querySelector('[data-action="flip"] span');
    if (flipBtnSpan) flipBtnSpan.textContent = '批量翻转';

    console.log(LOG, '===== 批量翻转完成 =====');
    toast('批量翻转完成 ' + total + ' 张');
    flipBtn.classList.remove('__working');
    isWorking = false;
  }

  // ========== 我的水印 ==========
  async function doMyWatermark() {
    console.log(LOG, '===== 我的水印 =====');
    if (!(await waitForEditor())) { toast('编辑器未加载完成'); return; }
    // 1. 点击"水印"tab
    var watermarkTab = $('.side_tools .tools .tool.Watermark');
    console.log(LOG, '水印tab:', watermarkTab ? '找到' : '未找到');
    if (!watermarkTab || !watermarkTab.classList.contains('selected')) {
      click(watermarkTab);
      await waitFor('.side_tools .content .el-radio-button', 3000);
      await wait(50);
    }

    // 2. 点击"我的" radio
    var radios = $$('.side_tools .content .el-radio-button');
    console.log(LOG, 'radio按钮数量:', radios.length);
    var myRadio = null;
    for (var i = 0; i < radios.length; i++) {
      var inner = radios[i].querySelector('.el-radio-button__inner');
      console.log(LOG, 'radio[' + i + ']:', inner ? inner.textContent.trim() : '(空)');
      if (inner && inner.textContent.trim() === '我的') {
        myRadio = radios[i];
        break;
      }
    }
    if (myRadio && !myRadio.classList.contains('is-active')) {
      console.log(LOG, '点击"我的"radio');
      click(myRadio.querySelector('.el-radio-button__inner'));
      await wait(50);
    } else {
      console.log(LOG, '"我的"已选中或未找到');
    }
  }

  // ========== 通用：点击左侧tab再点击子工具 ==========
  // toolName 模块名, action 按钮的 data-action
  async function clickAdjustTool(toolName, action) {
    console.log(LOG, '===== ' + toolName + ' =====');
    if (!(await waitForEditor())) { toast('编辑器未加载完成'); return; }
    var adjustTab = $('.side_tools .tools .tool.Adjust');
    console.log(LOG, '调整tab:', adjustTab ? '找到' : '未找到');
    if (!adjustTab || !adjustTab.classList.contains('selected')) {
      click(adjustTab);
      await waitFor('.side_tools .content .module', 3000);
      await wait(50);
    }
    var mod = await waitForModule(toolName, 3000);
    console.log(LOG, toolName + '模块:', mod ? '找到' : '未找到');
    if (!mod) { toast('未找到 ' + toolName); return; }
    var isOpen = !!mod.querySelector('.parameter');
    var toolbarBtn = toolbar.querySelector('[data-action="' + action + '"]');
    // 清除其他调整工具按钮的选中状态
    var adjustActions = ['crop', 'resize', 'erase', 'ruler'];
    adjustActions.forEach(function (a) {
      if (a !== action) {
        var otherBtn = toolbar.querySelector('[data-action="' + a + '"]');
        if (otherBtn) otherBtn.classList.remove('__active');
      }
    });
    var openEl = mod.querySelector('.open');
    click(openEl);
    if (isOpen) {
      if (toolbarBtn) toolbarBtn.classList.remove('__active');
    } else {
      if (toolbarBtn) toolbarBtn.classList.add('__active');
    }
    await wait(50);
    var content = $('.side_tools .content');
    if (content) {
      var contentTop = content.getBoundingClientRect().top;
      var modTop = mod.getBoundingClientRect().top;
      content.scrollTop += modTop - contentTop;
    }
    console.log(LOG, '已点击 ' + toolName);
  }

  // ========== 按钮事件 ==========
  var btns = toolbar.querySelectorAll('.__dxm_editor_btn');
  btns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = btn.getAttribute('data-action');

      switch (action) {
        case 'crop':
          clickAdjustTool('裁剪/旋转', 'crop');
          break;
        case 'resize':
          clickAdjustTool('调整尺寸', 'resize');
          break;
        case 'erase':
          clickAdjustTool('消除笔', 'erase');
          break;
        case 'ruler':
          clickAdjustTool('标尺', 'ruler');
          break;
        case 'watermark':
          doMyWatermark();
          break;
        case 'flip':
          doBatchFlip();
          break;
      }
    });
  });

})();
