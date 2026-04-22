(function () {
  if (window.__1688FloatBtn) return;
  window.__1688FloatBtn = true;

  var panel = document.createElement('div');
  panel.id = '__1688_grab_panel';
  panel.innerHTML =
    '<div id="__1688_grab_body">' +
    '<div id="__1688_grab_title">1688 图片抓取</div>' +
    '<button id="__1688_grab_btn">🚀 抓取图片</button>' +
    '<div id="__1688_grab_status"></div>' +
    '</div>' +
    '<div id="__1688_grab_toggle" title="拖动 / 悬浮展开"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>';

  var s = document.createElement('style');
  s.textContent =
    '#__1688_grab_panel{position:fixed;z-index:2147483647;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'left:0;top:25%;user-select:none;font-size:14px;line-height:1.5;' +
    'display:flex;align-items:center}' +
    '#__1688_grab_panel *{margin:0;padding:0;box-sizing:border-box}' +
    '#__1688_grab_body{background:#fff;border-radius:12px;padding:16px;width:180px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'transition:width .25s,padding .25s,opacity .25s,margin .25s;overflow:hidden}' +
    '#__1688_grab_panel:not(:hover) #__1688_grab_body{width:0;padding:0;opacity:0;margin:0;border:0}' +
    '#__1688_grab_toggle{width:48px;height:48px;flex-shrink:0;border-radius:50%;' +
    'background:linear-gradient(135deg,#ff6a00,#ff4444);color:#fff;font-size:20px;font-weight:bold;' +
    'display:flex;align-items:center;justify-content:center;cursor:grab;' +
    'box-shadow:0 4px 16px rgba(255,68,68,.4);transition:transform .2s,box-shadow .2s}' +
    '#__1688_grab_toggle:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(255,68,68,.5)}' +
    '#__1688_grab_title{font-size:15px;font-weight:bold;color:#333;margin-bottom:10px;text-align:center;white-space:nowrap}' +
    '#__1688_grab_btn{width:100%;padding:10px;border:none;border-radius:8px;' +
    'background:linear-gradient(135deg,#ff6a00,#ff4444);color:#fff;font-size:15px;font-weight:bold;' +
    'cursor:pointer;transition:opacity .2s;white-space:nowrap}' +
    '#__1688_grab_btn:hover{opacity:.9}' +
    '#__1688_grab_btn:disabled{background:#ccc;cursor:not-allowed}' +
    '#__1688_grab_status{margin-top:8px;font-size:13px;text-align:center;min-height:20px;white-space:nowrap}';

  document.head.appendChild(s);
  document.body.appendChild(panel);

  var toggle = document.getElementById('__1688_grab_toggle');
  var btn = document.getElementById('__1688_grab_btn');
  var statusEl = document.getElementById('__1688_grab_status');

  // --- Drag ---
  var dragging = false;
  var dragMoved = false;
  var startX, startY, origX, origY;

  function setPosition(x, y) {
    panel.style.left = x + 'px';
    panel.style.right = 'auto';
    panel.style.top = y + 'px';
    panel.style.transform = 'none';
    panel.style.flexDirection = 'row';
  }

  function snapToEdge() {
    var rect = panel.getBoundingClientRect();
    var nearLeft = rect.left < window.innerWidth / 2;
    var topY = parseInt(panel.style.top) || 0;
    panel.style.transition = 'left .25s ease, right .25s ease';
    panel.style.flexDirection = 'row';
    if (nearLeft) {
      panel.style.left = '0';
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = '0';
    }
    panel.style.top = topY + 'px';
    panel.style.transform = 'none';
    setTimeout(function () {
      panel.style.transition = '';
    }, 260);
  }

  toggle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    var rect = panel.getBoundingClientRect();
    origX = rect.left;
    origY = rect.top;
    toggle.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
    if (!dragMoved) return;
    var nx = origX + dx;
    var ny = origY + dy;
    ny = Math.max(0, Math.min(window.innerHeight - 48, ny));
    nx = Math.max(0, Math.min(window.innerWidth - 48, nx));
    setPosition(nx, ny);
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    toggle.style.cursor = 'grab';
    if (dragMoved) {
      snapToEdge();
      setTimeout(function () {
        dragMoved = false;
      }, 300);
    }
  });

  // --- Grab logic (auto-scroll then grab) ---
  btn.addEventListener('click', function () {
    if (dragMoved) return;
    btn.disabled = true;
    btn.textContent = '⏳ 滚动加载中...';
    statusEl.className = '';
    statusEl.textContent = '';

    autoScroll(function () {
      btn.textContent = '⏳ 抓取中...';
      setTimeout(function () {
        var count = GrabCore.scanImages();
        btn.disabled = false;
        btn.textContent = '🚀 抓取图片';
        if (count) {
          statusEl.className = 'ok';
          statusEl.textContent = '✅ 抓取 ' + count + ' 张图片！';
        } else {
          statusEl.className = 'err';
          statusEl.textContent = '❌ 未找到图片';
        }
      }, 200);
    });
  });

  function autoScroll(cb) {
    var maxRounds = 8;
    var round = 0;
    var lastH = 0;
    var stableCount = 0;
    function doRound() {
      round++;
      var h = document.documentElement.scrollHeight;
      if (h === lastH) {
        stableCount++;
      } else {
        stableCount = 0;
        lastH = h;
      }
      if (stableCount >= 2 || round >= maxRounds) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        setTimeout(cb, 300);
        return;
      }
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      setTimeout(doRound, 500);
    }
    doRound();
  }
})();
