(function () {
  if (window.__dxmFloatBee) return;
  window.__dxmFloatBee = true;

  // --- Cute Q-version Bee SVG ---
  var beeSVG =
    '<svg viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    // Wings (behind body)
    '<ellipse cx="22" cy="42" rx="16" ry="22" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="58" cy="42" rx="16" ry="22" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="22" cy="38" rx="8" ry="10" fill="#E1F5FE" opacity="0.5"/>' +
    '<ellipse cx="58" cy="38" rx="8" ry="10" fill="#E1F5FE" opacity="0.5"/>' +
    // Body
    '<ellipse cx="40" cy="60" rx="24" ry="28" fill="#FFCA28"/>' +
    // Body stripes
    '<path d="M18 52 Q40 48 62 52" stroke="#5D4037" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M16 62 Q40 58 64 62" stroke="#5D4037" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M18 72 Q40 68 62 72" stroke="#5D4037" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    // Head
    '<circle cx="40" cy="32" r="24" fill="#FFCA28"/>' +
    // Face highlight
    '<ellipse cx="40" cy="26" rx="16" ry="8" fill="#FFE082" opacity="0.5"/>' +
    // Eyes
    '<ellipse cx="31" cy="30" rx="8" ry="9" fill="white"/>' +
    '<ellipse cx="49" cy="30" rx="8" ry="9" fill="white"/>' +
    '<circle cx="33" cy="31" r="5.5" fill="#3E2723"/>' +
    '<circle cx="51" cy="31" r="5.5" fill="#3E2723"/>' +
    '<circle cx="35" cy="28" r="2.8" fill="white"/>' +
    '<circle cx="53" cy="28" r="2.8" fill="white"/>' +
    '<circle cx="31" cy="33" r="1.3" fill="white"/>' +
    '<circle cx="49" cy="33" r="1.3" fill="white"/>' +
    // Cheeks
    '<ellipse cx="20" cy="38" rx="6" ry="3.5" fill="#FF8A80" opacity="0.45"/>' +
    '<ellipse cx="60" cy="38" rx="6" ry="3.5" fill="#FF8A80" opacity="0.45"/>' +
    // Smile
    '<path d="M33 40 Q40 47 47 40" stroke="#5D4037" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    // Antennae
    '<path d="M30 12 Q26 4 22 2" stroke="#5D4037" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<circle cx="22" cy="2" r="3.5" fill="#FFCA28" stroke="#5D4037" stroke-width="1.5"/>' +
    '<path d="M50 12 Q54 4 58 2" stroke="#5D4037" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<circle cx="58" cy="2" r="3.5" fill="#FFCA28" stroke="#5D4037" stroke-width="1.5"/>' +
    // Stinger
    '<path d="M36 88 L40 96 L44 88" fill="#5D4037"/>' +
    '</svg>';

  // --- Panel ---
  var panel = document.createElement('div');
  panel.id = '__dxm_bee_panel';
  panel.innerHTML =
    '<div id="__dxm_bee_body">' +
    '<div id="__dxm_bee_title">🐝 小蜜蜂工具</div>' +
    '<div id="__dxm_bee_desc">店小蜜 TEMU 辅助工具</div>' +
    '<div id="__dxm_bee_actions">' +
    '<button id="__dxm_bee_btn_test">✨ 功能开发中...</button>' +
    '</div>' +
    '<div id="__dxm_bee_status"></div>' +
    '</div>' +
    '<div id="__dxm_bee_icon" title="拖动 / 悬浮展开">' + beeSVG + '</div>';

  var s = document.createElement('style');
  s.textContent =
    // Panel container
    '#__dxm_bee_panel{position:fixed;z-index:2147483647;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'left:0;top:30%;user-select:none;font-size:14px;line-height:1.5;' +
    'display:flex;align-items:center}' +
    '#__dxm_bee_panel *{margin:0;padding:0;box-sizing:border-box}' +
    // Body (expandable panel)
    '#__dxm_bee_body{background:#fff;border-radius:14px;padding:16px;width:200px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'will-change:width,padding,opacity;transition:width .25s,padding .25s,opacity .25s;overflow:hidden}' +
    '#__dxm_bee_panel:not(:hover) #__dxm_bee_body{width:0;padding:0;opacity:0;border:0}' +
    // Bee icon
    '#__dxm_bee_icon{width:56px;height:56px;flex-shrink:0;' +
    'background:transparent;' +
    'display:flex;align-items:center;justify-content:center;cursor:grab;' +
    'will-change:transform;transition:transform .2s}' +
    '#__dxm_bee_icon:hover{transform:scale(1.15)}' +
    '#__dxm_bee_icon svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(255,202,40,.4))}' +
    // Title
    '#__dxm_bee_title{font-size:15px;font-weight:bold;color:#333;margin-bottom:4px;text-align:center;white-space:nowrap}' +
    // Description
    '#__dxm_bee_desc{font-size:12px;color:#999;text-align:center;margin-bottom:10px;white-space:nowrap}' +
    // Actions
    '#__dxm_bee_actions{display:flex;flex-direction:column;gap:6px}' +
    // Button
    '#__dxm_bee_btn_test{width:100%;padding:8px;border:none;border-radius:8px;' +
    'background:linear-gradient(135deg,#FFCA28,#FFA000);color:#fff;font-size:13px;font-weight:bold;' +
    'cursor:pointer;transition:opacity .2s;white-space:nowrap}' +
    '#__dxm_bee_btn_test:hover{opacity:.9}' +
    // Status
    '#__dxm_bee_status{margin-top:8px;font-size:13px;text-align:center;min-height:18px;white-space:nowrap;color:#666}';

  document.head.appendChild(s);
  document.body.appendChild(panel);

  var icon = document.getElementById('__dxm_bee_icon');
  var statusEl = document.getElementById('__dxm_bee_status');

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
    var nearLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
    var topY = parseInt(panel.style.top) || 0;
    panel.style.transition = 'left .25s ease, right .25s ease';
    panel.style.flexDirection = 'row';
    if (nearLeft) {
      panel.style.left = '0';
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = '0';
      panel.style.flexDirection = 'row-reverse';
    }
    panel.style.top = topY + 'px';
    panel.style.transform = 'none';
    setTimeout(function () {
      panel.style.transition = '';
    }, 260);
  }

  icon.addEventListener('mousedown', function (e) {
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    var rect = panel.getBoundingClientRect();
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
    icon.style.cursor = 'grab';
    if (dragMoved) {
      snapToEdge();
      setTimeout(function () {
        dragMoved = false;
      }, 300);
    }
  });

  // --- Button click placeholder ---
  document.getElementById('__dxm_bee_btn_test').addEventListener('click', function (e) {
    if (dragMoved) return;
    statusEl.textContent = '🎉 功能即将上线，敬请期待！';
  });
})();
