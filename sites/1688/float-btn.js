(function () {
  if (window.__1688FloatBtn) return;
  window.__1688FloatBtn = true;

  var panel = document.createElement('div');
  panel.id = '__1688_grab_panel';
  panel.innerHTML =
    '<div id="__1688_grab_bubble"></div>' +
    '<div id="__1688_grab_toggle" title="点击抓取图片 / 拖动移动"><svg viewBox="0 0 40 44" fill="none"><path d="M10 26L3 35l5-1z" fill="#1565C0"/><path d="M12 27L5 35l4.5-.5z" fill="#C62828"/><path d="M13.5 27.5L8 35l3.5-.5z" fill="#B71C1C"/><ellipse cx="20" cy="18" rx="10" ry="11" fill="#4CAF50"/><path d="M24 10c3 1 5 5 5 9s-2 8-5 9c-2-2-3-7-3-13s1-5 3-5z" fill="#C5E1A5"/><ellipse cx="24" cy="25" rx="3.5" ry="3" fill="#E57373" opacity=".5"/><path d="M12 15c-2.5 3-3.5 7-2 9.5 1.5-3 4-5.5 7-6.5" fill="#2E7D32"/><path d="M10.5 22l-1.5 2.5 2-1.5" fill="#1976D2" opacity=".7"/><circle cx="30" cy="9" r="6.5" fill="#757575"/><ellipse cx="32" cy="10.5" rx="3" ry="2.5" fill="#A1887F"/><ellipse cx="31" cy="11" rx="2.5" ry="2" fill="#81C784" opacity=".55"/><circle cx="33" cy="8.5" r="2" fill="#fff"/><circle cx="33.5" cy="8.2" r="1" fill="#4E342E"/><circle cx="33.2" cy="7.8" r=".3" fill="#fff"/><path d="M33.5 9.5c1.5 0 4 .5 4.5 1.8c.3 1-.5 2-1.8 2c-1.2 0-2.5-.8-3-1.5z" fill="#9E9E9E"/><path d="M34 11c1.5.5 3 1 3.5 1.5" stroke="#757575" stroke-width=".5" fill="none"/><g stroke="#8D6E63" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M18 28l-1 4"/><path d="M17 32l-2.5-.8"/><path d="M17 32l-1.5 2"/><path d="M17 32l1.8 1.5"/><path d="M21 28.5l-.8 4"/><path d="M20.2 32.5l-2.5-.8"/><path d="M20.2 32.5l-1.5 2"/><path d="M20.2 32.5l1.8 1.5"/></g><rect x="5" y="34.5" width="30" height="3.5" rx="1.75" fill="#8B6914"/><rect x="5" y="34.5" width="30" height="1.2" rx=".6" fill="#A07B28" opacity=".4"/><text x="20" y="43" text-anchor="middle" fill="#8B6914" font-size="7" font-weight="bold" font-family="Arial,sans-serif">1688</text></svg></div>' +
    '<div id="__1688_grab_collect" title="采集商品数据到服务器">采集</div>';

  var s = document.createElement('style');
  s.textContent =
    '#__1688_grab_panel{position:fixed;z-index:2147483647;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'left:0;top:25%;user-select:none;font-size:14px;line-height:1.5}' +
    '#__1688_grab_panel *{margin:0;padding:0;box-sizing:border-box}' +
    '#__1688_grab_bubble{display:none;position:absolute;bottom:100%;left:0;margin-bottom:10px;' +
    'background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'font:13px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;white-space:nowrap;max-width:220px;z-index:1}' +
    '#__1688_grab_bubble::after{content:"";position:absolute;bottom:-6px;left:16px;width:0;height:0;' +
    'border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff}' +
    '#__1688_grab_panel.at-right #__1688_grab_bubble{left:auto;right:0}' +
    '#__1688_grab_panel.at-right #__1688_grab_bubble::after{left:auto;right:16px}' +
    '#__1688_grab_panel.show_bubble #__1688_grab_bubble{display:block}' +
    '#__1688_grab_bubble.loading{color:#FFA000}' +
    '#__1688_grab_bubble.ok{color:#52c41a}' +
    '#__1688_grab_bubble.err{color:#ff4444}' +
    '#__1688_grab_toggle{width:58px;height:58px;flex-shrink:0;' +
    'background:transparent;' +
    'display:flex;align-items:center;justify-content:center;cursor:grab;' +
    'will-change:transform;transition:transform .2s}' +
    '#__1688_grab_toggle:hover{transform:scale(1.15)}' +
    '#__1688_grab_toggle svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(76,175,80,.3))}' +
    '#__1688_grab_collect{margin-top:4px;padding:4px 0;width:42px;text-align:center;font-size:12px;font-weight:600;' +
    'color:#fff;background:linear-gradient(135deg,#43A047,#2E7D32);border-radius:6px;cursor:pointer;' +
    'letter-spacing:1px;box-shadow:0 2px 6px rgba(46,125,50,.3);transition:transform .2s}' +
    '#__1688_grab_collect:hover{transform:scale(1.08)}';

  document.head.appendChild(s);
  document.body.appendChild(panel);

  var toggle = document.getElementById('__1688_grab_toggle');
  var bubble = document.getElementById('__1688_grab_bubble');
  var isWorking = false;

  // ========== Bubble ==========
  function showBubble(text, type) {
    bubble.className = type || '';
    bubble.textContent = text;
    var rect = panel.getBoundingClientRect();
    panel.classList.toggle('at-right', rect.left + rect.width / 2 >= window.innerWidth / 2);
    panel.classList.add('show_bubble');
  }

  function hideBubble() {
    panel.classList.remove('show_bubble');
  }

  // ========== Drag ==========
  var dragging = false;
  var dragMoved = false;
  var startX, startY, origX, origY;

  function setPosition(x, y) {
    panel.style.left = x + 'px';
    panel.style.right = 'auto';
    panel.style.top = y + 'px';
    panel.style.transform = 'none';
  }

  function snapToEdge() {
    var rect = panel.getBoundingClientRect();
    var topY = parseInt(panel.style.top) || 0;
    var nearLeft = rect.left < 100;
    var nearRight = window.innerWidth - rect.right < 100;
    if (nearLeft || nearRight) {
      panel.style.transition = 'left .25s ease, right .25s ease';
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
    var ny = Math.max(0, Math.min(window.innerHeight - 58, origY + dy));
    nx = Math.max(0, Math.min(window.innerWidth - 58, nx));
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

  // ========== Click to grab ==========
  toggle.addEventListener('click', function () {
    if (dragMoved || isWorking) return;
    isWorking = true;

    showBubble('⏳ 滚动加载中...', 'loading');

    autoScroll(function () {
      showBubble('⏳ 抓取中...', 'loading');
      setTimeout(function () {
        var count = GrabCore.scanImages();
        isWorking = false;
        if (count) {
          showBubble('✅ 抓取 ' + count + ' 张图片！', 'ok');
        } else {
          showBubble('❌ 未找到图片', 'err');
        }
        setTimeout(hideBubble, 3000);
      }, 200);
    });
  });

  function autoScroll(cb) {
    var maxRounds = 4;
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
        window.scrollTo({ top: 0, behavior: 'auto' });
        setTimeout(cb, 300);
        return;
      }
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
      });
      setTimeout(doRound, 500);
    }
    doRound();
  }

  // ========== Collect button ==========
  var collectBtn = document.getElementById('__1688_grab_collect');
  var isCollecting = false;

  collectBtn.addEventListener('click', function () {
    if (isCollecting) return;
    isCollecting = true;

    // 先检查是否已采集
    showBubble('⏳ 检查中...', 'loading');
    CollectData.checkExists(function (checkRes) {
      if (checkRes.exists) {
        var statusText = checkRes.status === 1 ? '已用' : '未用';
        if (!confirm('该商品已采集过 (ID:' + checkRes.id + ' ' + statusText + ')\n是否重新采集覆盖？')) {
          isCollecting = false;
          hideBubble();
          return;
        }
      }
      doCollect();
    });
  });

  function doCollect() {
    showBubble('⏳ 滚动加载中...', 'loading');

    autoScroll(function () {
      showBubble('⏳ 采集数据中...', 'loading');
      setTimeout(function () {
        try {
          CollectData.collect(function (data) {
            var imgCount = data.mainImages.length + data.descImages.length;
            var skuCount = data.skus.length;
            var attrCount = data.attrs.length;

            if (imgCount === 0 && skuCount === 0 && !data.title) {
              showBubble('❌ 未采集到数据', 'err');
              isCollecting = false;
              setTimeout(hideBubble, 3000);
              return;
            }

            showBubble('⏳ 保存到服务器...', 'loading');
            CollectData.save(data, function (err, res) {
              isCollecting = false;
              if (err || !res || !res.ok) {
                showBubble('❌ 保存失败: ' + (err ? err.message : '服务器错误'), 'err');
              } else {
                showBubble('✅ ' + imgCount + '张图片 + ' + skuCount + '个SKU + ' + attrCount + '个属性', 'ok');
              }
              setTimeout(hideBubble, 4000);
            });
          });
        } catch (e) {
          showBubble('❌ 采集出错: ' + e.message, 'err');
          isCollecting = false;
          setTimeout(hideBubble, 3000);
        }
      }, 200);
    });
  }
})();
