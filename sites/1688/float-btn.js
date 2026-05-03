(function () {
  if (window.__1688FloatBtn) return;
  window.__1688FloatBtn = true;

  var panel = document.createElement('div');
  panel.id = '__1688_grab_panel';
  panel.innerHTML =
    '<div id="__1688_grab_bubble"></div>' +
    '<div id="__1688_grab_toggle" title="点击抓取图片 / 拖动移动"><svg viewBox="0 0 40 44" fill="none"><path d="M10 26L3 35l5-1z" fill="#1565C0"/><path d="M12 27L5 35l4.5-.5z" fill="#C62828"/><path d="M13.5 27.5L8 35l3.5-.5z" fill="#B71C1C"/><ellipse cx="20" cy="18" rx="10" ry="11" fill="#4CAF50"/><path d="M24 10c3 1 5 5 5 9s-2 8-5 9c-2-2-3-7-3-13s1-5 3-5z" fill="#C5E1A5"/><ellipse cx="24" cy="25" rx="3.5" ry="3" fill="#E57373" opacity=".5"/><path d="M12 15c-2.5 3-3.5 7-2 9.5 1.5-3 4-5.5 7-6.5" fill="#2E7D32"/><path d="M10.5 22l-1.5 2.5 2-1.5" fill="#1976D2" opacity=".7"/><circle cx="30" cy="9" r="6.5" fill="#757575"/><ellipse cx="32" cy="10.5" rx="3" ry="2.5" fill="#A1887F"/><ellipse cx="31" cy="11" rx="2.5" ry="2" fill="#81C784" opacity=".55"/><circle cx="33" cy="8.5" r="2" fill="#fff"/><circle cx="33.5" cy="8.2" r="1" fill="#4E342E"/><circle cx="33.2" cy="7.8" r=".3" fill="#fff"/><path d="M33.5 9.5c1.5 0 4 .5 4.5 1.8c.3 1-.5 2-1.8 2c-1.2 0-2.5-.8-3-1.5z" fill="#9E9E9E"/><path d="M34 11c1.5.5 3 1 3.5 1.5" stroke="#757575" stroke-width=".5" fill="none"/><g stroke="#8D6E63" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M18 28l-1 4"/><path d="M17 32l-2.5-.8"/><path d="M17 32l-1.5 2"/><path d="M17 32l1.8 1.5"/><path d="M21 28.5l-.8 4"/><path d="M20.2 32.5l-2.5-.8"/><path d="M20.2 32.5l-1.5 2"/><path d="M20.2 32.5l1.8 1.5"/></g><rect x="5" y="34.5" width="30" height="3.5" rx="1.75" fill="#8B6914"/><rect x="5" y="34.5" width="30" height="1.2" rx=".6" fill="#A07B28" opacity=".4"/><text x="20" y="43" text-anchor="middle" fill="#8B6914" font-size="7" font-weight="bold" font-family="Arial,sans-serif">1688</text></svg></div>' +
    '<div id="__1688_grab_sign">' +
      '<div id="__1688_grab_chain_l"></div>' +
      '<div id="__1688_grab_chain_r"></div>' +
      '<div id="__1688_grab_collect" title="采集商品数据到服务器">采集</div>' +
    '</div>' +
    '<div id="__1688_grab_settings" title="服务器地址设置" style="position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:#607D8B;color:#fff;text-align:center;line-height:18px;font-size:11px;cursor:pointer;opacity:.6">⚙</div>';

  var dialogEl = document.createElement('div');
  dialogEl.id = '__1688_dialog_overlay';
  dialogEl.innerHTML =
    '<div id="__1688_dialog_box">' +
      '<div id="__1688_dialog_icon">⚠️</div>' +
      '<div id="__1688_dialog_title">提示</div>' +
      '<div id="__1688_dialog_msg"></div>' +
      '<div id="__1688_dialog_btns">' +
        '<div class="__1688_dbtn __1688_dbtn_cancel">取消</div>' +
        '<div class="__1688_dbtn __1688_dbtn_ok">确认采集</div>' +
      '</div>' +
    '</div>';

  var s = document.createElement('style');
  s.textContent =
    '#__1688_grab_panel{position:fixed;z-index:2147483647;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'left:0;top:25%;user-select:none;font-size:14px;line-height:1.5;display:flex;flex-direction:column;align-items:center}' +
    '#__1688_grab_panel *{margin:0;padding:0;box-sizing:border-box}' +

    '#__1688_grab_bubble{display:none;position:absolute;bottom:100%;left:0;margin-bottom:10px;' +
    'background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.15);border:1px solid #f0f0f0;' +
    'font:13px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;white-space:nowrap;max-width:260px;z-index:1}' +
    '#__1688_grab_bubble::after{content:"";position:absolute;bottom:-6px;left:16px;width:0;height:0;' +
    'border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff}' +
    '#__1688_grab_panel.at-right #__1688_grab_bubble{left:auto;right:0}' +
    '#__1688_grab_panel.at-right #__1688_grab_bubble::after{left:auto;right:16px}' +
    '#__1688_grab_panel.show_bubble #__1688_grab_bubble{display:block}' +
    '#__1688_grab_bubble.loading{color:#FFA000}' +
    '#__1688_grab_bubble.ok{color:#52c41a}' +
    '#__1688_grab_bubble.err{color:#ff4444}' +

    '#__1688_grab_toggle{width:58px;height:58px;flex-shrink:0;' +
    'background:transparent;display:flex;align-items:center;justify-content:center;cursor:grab;' +
    'will-change:transform;transition:transform .2s}' +
    '#__1688_grab_toggle:hover{transform:scale(1.15)}' +
    '#__1688_grab_toggle svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(76,175,80,.3))}' +

    '#__1688_grab_sign{position:relative;display:flex;flex-direction:column;align-items:center;' +
    'transform-origin:top center;animation:__1688_swing 3s ease-in-out infinite}' +
    '#__1688_grab_sign.no-swing{animation:none}' +

    '#__1688_grab_chain_l,#__1688_grab_chain_r{position:absolute;top:0;width:0;height:18px;' +
    'border-left:2.5px dashed #8B6914;opacity:.7}' +
    '#__1688_grab_chain_l{left:8px}' +
    '#__1688_grab_chain_r{right:8px}' +

    '@keyframes __1688_swing{0%,100%{transform:rotate(0deg)}30%{transform:rotate(3deg)}70%{transform:rotate(-2.5deg)}}' +

    '#__1688_grab_collect{margin-top:18px;padding:6px 14px;font-size:13px;font-weight:600;letter-spacing:1px;' +
    'color:#fff;background:linear-gradient(135deg,#43A047,#2E7D32);border-radius:14px;cursor:pointer;' +
    'box-shadow:0 2px 8px rgba(46,125,50,.35);transition:all .3s;min-width:50px;text-align:center}' +
    '#__1688_grab_collect:hover{box-shadow:0 4px 12px rgba(46,125,50,.45);filter:brightness(1.08)}' +

    '#__1688_grab_collect.loading{background:linear-gradient(135deg,#FFA000,#F57C00);' +
    'box-shadow:0 2px 8px rgba(255,160,0,.35);pointer-events:none}' +
    '#__1688_grab_collect.success{background:linear-gradient(135deg,#66BB6A,#43A047);pointer-events:none;' +
    'box-shadow:0 2px 8px rgba(102,187,106,.35)}' +

    '#__1688_dialog_overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;' +
    'align-items:center;justify-content:center;font-family:"Microsoft YaHei",Arial,sans-serif}' +
    '#__1688_dialog_overlay.show{display:flex}' +
    '#__1688_dialog_box{background:#fff;border-radius:16px;padding:28px 32px 24px;min-width:320px;max-width:400px;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.2);animation:__1688_dIn .25s ease}' +
    '@keyframes __1688_dIn{from{opacity:0;transform:scale(.9) translateY(10px)}to{opacity:1;transform:none}}' +
    '#__1688_dialog_icon{font-size:36px;text-align:center;margin-bottom:12px}' +
    '#__1688_dialog_title{font-size:16px;font-weight:600;color:#333;text-align:center;margin-bottom:10px}' +
    '#__1688_dialog_msg{font-size:14px;color:#666;text-align:center;line-height:1.6;margin-bottom:24px;white-space:pre-line}' +
    '#__1688_dialog_btns{display:flex;gap:12px;justify-content:center}' +
    '.__1688_dbtn{padding:8px 24px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}' +
    '.__1688_dbtn_cancel{background:#f5f5f5;color:#666;border:1px solid #e0e0e0}' +
    '.__1688_dbtn_cancel:hover{background:#eee}' +
    '.__1688_dbtn_ok{background:linear-gradient(135deg,#43A047,#2E7D32);color:#fff;border:1px solid #2E7D32}' +
    '.__1688_dbtn_ok:hover{opacity:.9}' +

    '#__1688_toast{position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-80px);' +
    'background:#fff;padding:12px 24px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15);' +
    'font-size:14px;color:#333;z-index:2147483646;transition:transform .3s ease,opacity .3s ease;' +
    'opacity:0;pointer-events:none;white-space:nowrap;font-family:"Microsoft YaHei",Arial,sans-serif;' +
    'display:flex;align-items:center;gap:8px;border-left:4px solid #43A047}' +
    '#__1688_toast.err{border-left-color:#e53935}' +
    '#__1688_toast.visible{transform:translateX(-50%) translateY(0);opacity:1}';

  document.head.appendChild(s);
  document.body.appendChild(panel);
  document.body.appendChild(dialogEl);

  var toastEl = document.createElement('div');
  toastEl.id = '__1688_toast';
  document.body.appendChild(toastEl);

  var toastTimer = null;
  function showToast(text, type) {
    clearTimeout(toastTimer);
    toastEl.className = type === 'err' ? 'err' : '';
    toastEl.innerHTML = (type === 'err' ? '<span style="color:#e53935">✕</span>' : '<span style="color:#43A047">✓</span>') + ' ' + text;
    requestAnimationFrame(function () { toastEl.classList.add('visible'); });
    toastTimer = setTimeout(function () { toastEl.classList.remove('visible'); }, 3500);
  }

  var toggle = document.getElementById('__1688_grab_toggle');
  var bubble = document.getElementById('__1688_grab_bubble');
  var collectBtn = document.getElementById('__1688_grab_collect');
  var signEl = document.getElementById('__1688_grab_sign');
  var isWorking = false;
  var isCollecting = false;

  function _log() {
    var args = ['%c[1688采集]', 'color:#ff6a00;font-weight:bold'];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.log.apply(console, args);
  }

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

  function setCollectState(cls, text) {
    collectBtn.className = cls;
    collectBtn.textContent = text;
  }

  function showConfirm(msg, onOk, onCancel) {
    var overlay = document.getElementById('__1688_dialog_overlay');
    overlay.querySelector('#__1688_dialog_msg').textContent = msg;
    overlay.classList.add('show');
    var okBtn = overlay.querySelector('.__1688_dbtn_ok');
    var cancelBtn = overlay.querySelector('.__1688_dbtn_cancel');
    function cleanup() {
      overlay.classList.remove('show');
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    }
    function handleOk() { cleanup(); if (onOk) onOk(); }
    function handleCancel() { cleanup(); if (onCancel) onCancel(); }
    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
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
      showBubble('⏳ 预加载图片...', 'loading');
      // 等待页面就绪 + 预加载主图（悬浮缩略图触发懒加载）
      if (typeof waitForPageReady === 'function') {
        waitForPageReady(function () {
          if (typeof preloadGalleryImages === 'function') {
            preloadGalleryImages(function () {
              doGrab();
            });
          } else {
            doGrab();
          }
        });
      } else {
        doGrab();
      }
    });
  });

  function doGrab() {
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
  }

  function autoScroll(cb) {
    var maxRounds = 4;
    var i = 0;
    var lastH = 0;
    var stableCount = 0;
    function doRound() {
      if (i >= maxRounds || stableCount >= 2) {
        window.scrollTo(0, 0);
        setTimeout(cb, 300);
        return;
      }
      i++;
      smoothTo(document.documentElement.scrollHeight, 250, function () {
        var curH = document.documentElement.scrollHeight;
        if (curH === lastH) stableCount++;
        else stableCount = 0;
        lastH = curH;
        setTimeout(doRound, 200);
      });
    }
    doRound();
  }

  function smoothTo(target, duration, done) {
    var start = window.scrollY;
    var distance = target - start;
    var startTime = null;
    function frame(time) {
      if (!startTime) startTime = time;
      var progress = Math.min((time - startTime) / duration, 1);
      var eased = 1 - (1 - progress) * (1 - progress);
      window.scrollTo(0, start + distance * eased);
      if (progress < 1) requestAnimationFrame(frame);
      else done();
    }
    requestAnimationFrame(frame);
  }

  // ========== Settings button ==========
  var settingsBtn = document.getElementById('__1688_grab_settings');
  settingsBtn.addEventListener('click', function () {
    var current = localStorage.getItem('1688_server_url') || 'http://localhost:3000';
    var url = prompt('设置服务器地址：', current);
    if (url !== null) {
      url = url.trim().replace(/\/+$/, '');
      localStorage.setItem('1688_server_url', url);
      _log('服务器地址已保存: ' + url);
    }
  });

  // ========== Collect button ==========
  collectBtn.addEventListener('click', function () {
    if (isCollecting) return;
    isCollecting = true;
    signEl.classList.add('no-swing');

    _log('开始采集流程');
    showBubble('⏳ 检查中...', 'loading');
    setCollectState('loading', '采集中...');

    CollectData.checkExists(function (checkRes) {
      _log('检查结果:', checkRes);
      if (checkRes.exists) {
        var statusText = checkRes.status === 1 ? '已用' : '未用';
        showConfirm(
          '该商品已采集过 (ID: ' + checkRes.id + '，状态: ' + statusText + ')\n是否重新采集覆盖？',
          function () {
            _log('用户确认重新采集');
            doCollect();
          },
          function () {
            _log('用户取消采集');
            isCollecting = false;
            signEl.classList.remove('no-swing');
            setCollectState('', '采集');
            hideBubble();
          }
        );
      } else {
        doCollect();
      }
    });
  });

  function doCollect() {
    _log('开始滚动加载页面');
    showBubble('⏳ 滚动加载中...', 'loading');
    setCollectState('loading', '采集中...');

    autoScroll(function () {
      _log('滚动完成，开始采集数据');
      showBubble('⏳ 采集数据中...', 'loading');

      setTimeout(function () {
        try {
          CollectData.collect(function (data) {
            _log('采集完成');
            _log('  标题:', data.title);
            _log('  来源:', data.sourceUrl);
            _log('  主图:', data.mainImages.length + '张', data.mainImages);
            _log('  描述图:', data.descImages.length + '张', data.descImages);
            _log('  详情图:', (data.detailImages || []).length + '张', data.detailImages || []);
            _log('  属性:', data.attrs.length + '个', data.attrs);
            _log('  SKU:', data.skus.length + '个', JSON.parse(JSON.stringify(data.skus)));

            var imgCount = data.mainImages.length + data.descImages.length + (data.detailImages || []).length;
            var skuCount = data.skus.length;
            var attrCount = data.attrs.length;

            if (imgCount === 0 && skuCount === 0 && !data.title) {
              _log('未采集到任何数据');
              showBubble('❌ 未采集到数据', 'err');
              isCollecting = false;
              signEl.classList.remove('no-swing');
              setCollectState('', '采集');
              setTimeout(hideBubble, 3000);
              return;
            }

            _log('保存到服务器:', CollectData.getServerUrl());
            showBubble('⏳ 保存到服务器...', 'loading');
            setCollectState('loading', '保存中...');

            CollectData.save(data, function (err, res) {
              if (err || !res || !res.ok) {
                _log('保存失败:', err, res);
                showBubble('❌ 保存失败: ' + (err ? err.message : '服务器错误'), 'err');
                showToast('采集失败: ' + (err ? err.message : '服务器错误'), 'err');
                isCollecting = false;
                signEl.classList.remove('no-swing');
                setCollectState('', '采集');
              } else {
                _log('保存成功:', res);
                _log('汇总: ' + imgCount + '张图片 + ' + skuCount + '个SKU + ' + attrCount + '个属性');
                showBubble('✅ ' + imgCount + '张图片 + ' + skuCount + '个SKU + ' + attrCount + '个属性', 'ok');
                showToast('采集成功: ' + imgCount + '张图片 + ' + skuCount + '个SKU + ' + attrCount + '个属性');
                setCollectState('success', '✓ 已采');
              }
              setTimeout(hideBubble, 4000);
            });
          });
        } catch (e) {
          _log('采集出错:', e);
          showBubble('❌ 采集出错: ' + e.message, 'err');
          isCollecting = false;
          signEl.classList.remove('no-swing');
          setCollectState('', '采集');
          setTimeout(hideBubble, 3000);
        }
      }, 200);
    });
  }
})();
