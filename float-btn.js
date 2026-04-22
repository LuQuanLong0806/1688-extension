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
    '<div id="__1688_grab_toggle" title="拖动 / 悬浮展开"><svg viewBox="0 0 56 36" fill="none"><path d="M10 26L3 35l5-1z" fill="#1565C0"/><path d="M12 27L5 35l4.5-.5z" fill="#C62828"/><path d="M13.5 27.5L8 35l3.5-.5z" fill="#B71C1C"/><ellipse cx="20" cy="18" rx="10" ry="11" fill="#4CAF50"/><path d="M24 10c3 1 5 5 5 9s-2 8-5 9c-2-2-3-7-3-13s1-5 3-5z" fill="#C5E1A5"/><path d="M12 15c-2.5 3-3.5 7-2 9.5 1.5-3 4-5.5 7-6.5" fill="#2E7D32"/><path d="M10.5 22l-1.5 2.5 2-1.5" fill="#1976D2" opacity=".7"/><circle cx="30" cy="9" r="6.5" fill="#757575"/><ellipse cx="32" cy="10.5" rx="3" ry="2.5" fill="#A1887F"/><circle cx="33" cy="8.5" r="2" fill="#fff"/><circle cx="33.5" cy="8.2" r="1" fill="#4E342E"/><circle cx="33.2" cy="7.8" r=".3" fill="#fff"/><path d="M33.5 9.5c1.5 0 4 .5 4.5 1.8c.3 1-.5 2-1.8 2c-1.2 0-2.5-.8-3-1.5z" fill="#9E9E9E"/><path d="M34 11c1.5.5 3 1 3.5 1.5" stroke="#757575" stroke-width=".5" fill="none"/><g stroke="#8D6E63" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M18 28l-1 4"/><path d="M17 32l-2.5-.8"/><path d="M17 32l-1.5 2"/><path d="M17 32l1.8 1.5"/><path d="M21 28.5l-.8 4"/><path d="M20.2 32.5l-2.5-.8"/><path d="M20.2 32.5l-1.5 2"/><path d="M20.2 32.5l1.8 1.5"/></g><circle cx="35" cy="32.5" r="2" fill="#8BC34A"/><circle cx="34.2" cy="31.8" r=".4" fill="#333"/><path d="M33.5 30.5l-1-1.5" stroke="#7CB342" stroke-width=".5" stroke-linecap="round"/><path d="M34.8 30l-.2-1.5" stroke="#7CB342" stroke-width=".5" stroke-linecap="round"/><circle cx="39.5" cy="33" r="2" fill="#7CB342"/><text x="39.5" y="34" text-anchor="middle" fill="#fff" font-size="2.5" font-weight="bold" font-family="Arial,sans-serif">1</text><circle cx="44" cy="32.5" r="2" fill="#9CCC65"/><text x="44" y="33.5" text-anchor="middle" fill="#fff" font-size="2.5" font-weight="bold" font-family="Arial,sans-serif">6</text><circle cx="48.5" cy="33" r="2" fill="#7CB342"/><text x="48.5" y="34" text-anchor="middle" fill="#fff" font-size="2.5" font-weight="bold" font-family="Arial,sans-serif">8</text><circle cx="53" cy="32.5" r="2" fill="#9CCC65"/><text x="53" y="33.5" text-anchor="middle" fill="#fff" font-size="2.5" font-weight="bold" font-family="Arial,sans-serif">8</text><g stroke="#689F38" stroke-width=".4"><line x1="35" y1="34.5" x2="34" y2="35.8"/><line x1="39.5" y1="35" x2="38.5" y2="36.3"/><line x1="44" y1="34.5" x2="43" y2="35.8"/><line x1="48.5" y1="35" x2="47.5" y2="36.3"/><line x1="53" y1="34.5" x2="52" y2="35.8"/></g></svg></div>';

  var s = document.createElement('style');
  s.textContent =
    '#__1688_grab_panel{position:fixed;z-index:2147483647;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'left:0;top:25%;user-select:none;font-size:14px;line-height:1.5;' +
    'display:flex;align-items:center}' +
    '#__1688_grab_panel *{margin:0;padding:0;box-sizing:border-box}' +
    '#__1688_grab_body{background:#fff;border-radius:12px;padding:16px;width:180px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'will-change:width,padding,opacity;transition:width .25s,padding .25s,opacity .25s;overflow:hidden}' +
    '#__1688_grab_panel:not(:hover) #__1688_grab_body{width:0;padding:0;opacity:0;border:0}' +
    '#__1688_grab_toggle{width:48px;height:48px;flex-shrink:0;' +
    'background:transparent;' +
    'display:flex;align-items:center;justify-content:center;cursor:grab;' +
    'will-change:transform;transition:transform .2s}' +
    '#__1688_grab_toggle:hover{transform:scale(1.15)}' +
    '#__1688_grab_toggle svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(76,175,80,.3))}' +
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
