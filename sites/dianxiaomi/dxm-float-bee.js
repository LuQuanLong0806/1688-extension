(function () {
  if (window.__dxmFloatBee) return;
  window.__dxmFloatBee = true;

  var Config = window.BeeConfig;

  // ========== SVG ==========
  var beeSVG =
    '<svg viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<ellipse cx="22" cy="38" rx="17" ry="20" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="58" cy="38" rx="17" ry="20" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="22" cy="54" rx="14" ry="16" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="58" cy="54" rx="14" ry="16" fill="#B3E5FC" opacity="0.7" stroke="#81D4FA" stroke-width="1.5"/>' +
    '<ellipse cx="22" cy="33" rx="8" ry="10" fill="#E1F5FE" opacity="0.5"/>' +
    '<ellipse cx="58" cy="33" rx="8" ry="10" fill="#E1F5FE" opacity="0.5"/>' +
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
  var isWorkPage = location.pathname === '/web/temu/add' || location.pathname === '/web/temu/edit' || location.pathname === '/web/temu/quoteEdit';
  var totalSteps = 19;

  // ========== Create DOM ==========
  var wrapper = document.createElement('div');
  wrapper.id = '__dxm_bee';
  wrapper.innerHTML =
    '<div id="__dxm_bee_bubble"></div>' +
    '<div id="__dxm_bee_icon" title="' + (isWorkPage ? '点击开始工作 / 拖动移动' : '小蜜蜂工具') + '">' + beeSVG + '</div>' +
    '<div id="__dxm_bee_btns">' +
    '<div id="__dxm_bee_translate" title="一键翻译">翻译</div>' +
    '<div class="__dxm_bee_line"></div>' +
    '<div id="__dxm_bee_delete" title="一键清空图片+视频">删图</div>' +
    '<div class="__dxm_bee_line"></div>' +
    '<div id="__dxm_bee_paste" title="一键粘贴图片URL">贴图</div>' +
    '<div class="__dxm_bee_line" id="__dxm_bee_line_sku_table"></div>' +
    '<div id="__dxm_bee_sku_table" title="SKU表格填充">填表</div>' +
    '<div class="__dxm_bee_line" id="__dxm_bee_line_after_sku_table"></div>' +
    '<div id="__dxm_bee_sku" title="一键SKU过滤">SKU</div>' +
    '<div class="__dxm_bee_line"></div>' +
    '<div id="__dxm_bee_package" title="自动设置外包装">包装</div>' +
    '<div class="__dxm_bee_line"></div>' +
    '<div id="__dxm_bee_edit" title="一键编辑描述">描述</div>' +
    '</div>';

  // ========== Styles ==========
  var s = document.createElement('style');
  s.textContent =
    '#__dxm_bee{position:fixed;z-index:2147483647;left:0;top:45%;user-select:none;display:flex;flex-direction:column;align-items:center}' +
    '#__dxm_bee *{margin:0;padding:0;box-sizing:border-box}' +
    '#__dxm_bee_icon{width:56px;height:56px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .2s;overflow:visible;position:relative;z-index:2}' +
    '#__dxm_bee_icon:hover{transform:scale(1.1)}' +
    '#__dxm_bee_btns{display:flex;flex-direction:column;align-items:center;position:relative;z-index:1}' +
    '.__dxm_bee_line{width:1px;height:5px;background:linear-gradient(to bottom,rgba(0,0,0,.12),rgba(0,0,0,.06));border-radius:1px;margin-top:3px}' +
    '#__dxm_bee_icon svg{width:100%;height:auto;filter:drop-shadow(0 2px 6px rgba(255,202,40,.4))}' +
    '#__dxm_bee.flying #__dxm_bee_icon{animation:__dxm_fly 1s ease-in-out infinite}' +
    '@keyframes __dxm_fly{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}' +
    '#__dxm_bee_bubble{display:none;position:absolute;bottom:100%;left:0;margin-bottom:10px;background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.15);border:1px solid #f0f0f0;font:12px/1.6 "Microsoft YaHei",Arial,sans-serif;color:#333;white-space:nowrap}' +
    '#__dxm_bee_bubble::after{content:"";position:absolute;bottom:-6px;left:16px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #fff}' +
    '#__dxm_bee.at-right #__dxm_bee_bubble{left:auto;right:0}' +
    '#__dxm_bee.at-right #__dxm_bee_bubble::after{left:auto;right:16px}' +
    '#__dxm_bee.show_bubble #__dxm_bee_bubble{display:block}' +
    '#__dxm_bee_bubble.ok{color:#52c41a}' +
    '#__dxm_bee_bubble.err{color:#ff4444}' +
    '#__dxm_bee_bubble.loading{color:#FFA000}' +
    '#__dxm_bee_bubble.warn{color:#FF9800;font-weight:bold;background:#FFF8E1;border-color:#FFE082}' +
    '#__dxm_bee_bar{height:3px;background:#f0f0f0;border-radius:2px;margin-top:6px;overflow:hidden}' +
    '#__dxm_bee_bar_fill{height:100%;width:0;background:linear-gradient(90deg,#FFCA28,#FFA000);border-radius:2px;transition:width .3s}' +
    '#__dxm_bee_translate{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#FFCA28,#FFA000);color:#fff;font:bold 12px/1 "楷体","KaiTi","STKaiti",serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(255,160,0,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_translate:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(255,160,0,.5)}' +
    '#__dxm_bee_edit{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#66BB6A,#43A047);color:#fff;font:bold 12px/1 "楷体","KaiTi","STKaiti",serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(67,160,71,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_edit:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(67,160,71,.5)}' +
    '#__dxm_bee_paste{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#AB47BC,#8E24AA);color:#fff;font:bold 12px/1 "楷体","KaiTi","STKaiti",serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(142,36,170,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_paste:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(142,36,170,.5)}' +
    '#__dxm_bee_sku{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#26C6DA,#00838F);color:#fff;font-size:10px;font-weight:bold;letter-spacing:.5px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,131,143,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_sku:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(0,131,143,.5)}' +
    '#__dxm_bee_delete{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#EF5350,#C62828);color:#fff;font:bold 12px/1 "楷体","KaiTi","STKaiti",serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(198,40,40,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_delete:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(198,40,40,.5)}' +
    '#__dxm_bee_sku_table{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#5C6BC0,#283593);color:#fff;font:bold 12px/1 "楷体","KaiTi","STKaiti",serif;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(40,53,147,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_sku_table:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(40,53,147,.5)}' +
    '#__dxm_bee_line_sku_table{display:block}' +
    '#__dxm_bee_line_after_sku_table{display:none}' +
    '#__dxm_bee_package{margin-top:3px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#8D6E63,#4E342E);color:#fff;font:bold 12px/1 "楷体","KaiTi","STKaiti",serif;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(78,52,46,.35);transition:box-shadow .2s;user-select:none;text-shadow:0 1px 2px rgba(0,0,0,.15)}' +
    '#__dxm_bee_package:hover{transform:scale(1.15)!important;box-shadow:0 4px 12px rgba(78,52,46,.5)}' +
    // ========== 便签样式 ==========
    '#__dxm_bee_note{position:fixed;z-index:2147483646;font:12px/1.6 "Microsoft YaHei",Arial,sans-serif}' +
    '#__dxm_bee_note_drag{display:flex;align-items:center;justify-content:space-between;cursor:move;padding:4px}' +
    '#__dxm_bee_note_toggle{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#FF8A65,#E64A19);color:#fff;font-size:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(230,74,25,.4);transition:transform .2s,box-shadow .2s}' +
    '#__dxm_bee_note_toggle:hover{transform:scale(1.1);box-shadow:0 4px 12px rgba(230,74,25,.6)}' +
    '#__dxm_bee_note_panel{display:none;margin-top:8px;width:300px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);border:1px solid #f0f0f0;overflow:hidden}' +
    '#__dxm_bee_note.show #__dxm_bee_note_panel{display:block}' +
    '#__dxm_bee_note_header{padding:10px 14px;background:linear-gradient(135deg,#FF8A65,#E64A19);color:#fff;font-weight:bold;font-size:13px;letter-spacing:1px}' +
    '#__dxm_bee_note_body{padding:10px 14px;max-height:400px;overflow-y:auto}' +
    '.note-item{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;color:#333;cursor:pointer;transition:background .15s;border-radius:4px;padding-left:4px;padding-right:4px}' +
    '.note-item:last-child{border-bottom:none}' +
    '.note-item:hover{background:#FFF3E0}' +
    '.note-item.checked{color:#999;text-decoration:line-through}' +
    '.note-cb{width:16px;height:16px;flex-shrink:0;margin-top:1px;accent-color:#E64A19}' +
    '.note-text{flex:1;line-height:1.5}' +
    '.note-tip{margin-top:8px;padding:8px 10px;background:#FFF8E1;border-radius:8px;font-size:11px;color:#795548;line-height:1.6}' +
    '.note-tip b{color:#E64A19}' +
    '.note-reset{display:block;margin:8px auto 4px;padding:4px 16px;border:1px solid #e0e0e0;border-radius:6px;background:#fff;color:#666;font-size:11px;cursor:pointer;transition:all .15s}' +
    '.note-reset:hover{border-color:#E64A19;color:#E64A19}';

  document.head.appendChild(s);
  document.body.appendChild(wrapper);

  // ========== 检查便签（仅工作页面） ==========
  if (isWorkPage) {
    var NOTE_KEY = '__dxm_bee_note_checked';
    var NOTE_POS_KEY = '__dxm_bee_note_pos';
    var noteItems = [
      '分类是否正确',
      '分类材料类别等属性有无问题',
      '标题是否违规',
      'SKU列表预览图检查',
      '变种属性是否存在特殊符号',
      '轮播图/标题不要出现儿童字样或图片',
      '编辑描述'
    ];

    var noteDiv = document.createElement('div');
    noteDiv.id = '__dxm_bee_note';
    document.body.appendChild(noteDiv);

    // 恢复位置
    function loadNotePos() {
      try {
        var pos = JSON.parse(localStorage.getItem(NOTE_POS_KEY));
        if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') {
          noteDiv.style.left = pos.left + 'px';
          noteDiv.style.top = pos.top + 'px';
          return;
        }
      } catch (e) {}
      // 默认右下角
      noteDiv.style.right = '16px';
      noteDiv.style.bottom = '16px';
    }

    function saveNotePos() {
      var rect = noteDiv.getBoundingClientRect();
      localStorage.setItem(NOTE_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
    }

    function getChecked() {
      try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '{}'); } catch (e) { return {}; }
    }
    function saveChecked(obj) {
      localStorage.setItem(NOTE_KEY, JSON.stringify(obj));
    }

    function renderNote() {
      var checked = getChecked();
      var itemsHtml = '';
      noteItems.forEach(function (text, i) {
        var c = checked[i] ? ' checked' : '';
        itemsHtml += '<div class="note-item' + c + '" data-idx="' + i + '">' +
          '<input type="checkbox" class="note-cb"' + c + '>' +
          '<span class="note-text">' + text + '</span></div>';
      });

      noteDiv.innerHTML =
        '<div id="__dxm_bee_note_drag">' +
        '<div id="__dxm_bee_note_toggle" title="检查清单（可拖动）">&#x2714;</div>' +
        '</div>' +
        '<div id="__dxm_bee_note_panel">' +
        '<div id="__dxm_bee_note_header">检查清单</div>' +
        '<div id="__dxm_bee_note_body">' +
        itemsHtml +
        '<div class="note-tip">' +
        '<b>材料优选:</b> 锌合金、铝合金<br>' +
        '<b>食品接触:</b> 不锈钢、硅胶、PP<br>' +
        '<b>其他优先:</b> 塑料、涤纶、尼龙、树脂、亚克力（根据产品选择）' +
        '</div>' +
        '<button class="note-reset">重置勾选</button>' +
        '</div></div>';

      loadNotePos();

      // 展开/收起
      noteDiv.querySelector('#__dxm_bee_note_toggle').addEventListener('click', function (e) {
        if (noteDragMoved) return;
        noteDiv.classList.toggle('show');
      });

      // 勾选项
      noteDiv.querySelectorAll('.note-item').forEach(function (el) {
        el.addEventListener('click', function () {
          var idx = el.getAttribute('data-idx');
          var checked = getChecked();
          checked[idx] = !checked[idx];
          saveChecked(checked);
          el.classList.toggle('checked', checked[idx]);
          el.querySelector('.note-cb').checked = checked[idx];
        });
      });

      // 重置
      noteDiv.querySelector('.note-reset').addEventListener('click', function () {
        saveChecked({});
        renderNote();
      });

      // 拖动
      setupNoteDrag();
    }

    var noteDragMoved = false;
    function setupNoteDrag() {
      var dragEl = document.getElementById('__dxm_bee_note_drag');
      if (!dragEl) return;
      var dragging = false;
      var startX, startY, origLeft, origTop;

      dragEl.addEventListener('mousedown', function (e) {
        dragging = true;
        noteDragMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        // 固定 left/top，清除 right/bottom
        var rect = noteDiv.getBoundingClientRect();
        noteDiv.style.left = rect.left + 'px';
        noteDiv.style.top = rect.top + 'px';
        noteDiv.style.right = '';
        noteDiv.style.bottom = '';
        origLeft = rect.left;
        origTop = rect.top;
        e.preventDefault();
      });

      document.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) noteDragMoved = true;
        var newLeft = Math.max(0, Math.min(window.innerWidth - 60, origLeft + dx));
        var newTop = Math.max(0, Math.min(window.innerHeight - 60, origTop + dy));
        noteDiv.style.left = newLeft + 'px';
        noteDiv.style.top = newTop + 'px';
      });

      document.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        if (noteDragMoved) saveNotePos();
        setTimeout(function () { noteDragMoved = false; }, 50);
      });
    }

    renderNote();
  }

  // ========== State ==========
  var icon = document.getElementById('__dxm_bee_icon');
  var bubble = document.getElementById('__dxm_bee_bubble');
  var isWorking = false;

  // ========== Bubble ==========
  function showBubble(text, type) {
    bubble.className = type || '';
    bubble.innerHTML = text;
    var rect = wrapper.getBoundingClientRect();
    wrapper.classList.toggle('at-right', rect.left + rect.width / 2 >= window.innerWidth / 2);
    wrapper.classList.add('show_bubble');
  }

  function hideBubble() {
    wrapper.classList.remove('show_bubble');
  }

  function updateProgress(stepNum, text, type) {
    var pct = Math.round((stepNum / totalSteps) * 100);
    var prefix = type === 'err' ? '❌ ' : type === 'ok' ? '✅ ' : '⏳ ';
    var bar = isWorking ? '<div id="__dxm_bee_bar"><div id="__dxm_bee_bar_fill" style="width:' + pct + '%"></div></div>' : '';
    showBubble(prefix + text + ' <span style="color:#bbb;font-size:10px">' + stepNum + '/' + totalSteps + '</span>' + bar, type);
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

  // -- Swing state --
  var swingRAF = null;
  var swingWindX = 0;
  var swingDecayAmp = 0;
  var swingDecayPhase = 0;
  var swingDecayT = 0;
  var swingPrevMX = 0;
  var swingPrevMT = 0;
  var swingMode = 'idle'; // 'drag' | 'decay' | 'idle'
  var idleTime = 0;

  // 每个按钮独立的频率和相位
  var chimeFreqs = [1, 1.3, 1.6, 1.15, 1.45];
  var chimePhases = [0, 1.8, 3.5, 5.2, 0.9];

  function getSwingButtons() {
    var btns = document.getElementById('__dxm_bee_btns');
    if (!btns) return [];
    var result = [];
    for (var i = 0; i < btns.children.length; i++) {
      if (btns.children[i].id) result.push(btns.children[i]);
    }
    return result;
  }

  function startSwing() {
    if (swingRAF) cancelAnimationFrame(swingRAF);
    swingRAF = null;
    swingWindX = 0;
    swingDecayAmp = 0;
    swingPrevMX = startX;
    swingPrevMT = performance.now();
    swingDecayT = performance.now();
    swingMode = 'drag';
    tickSwing();
  }

  function tickSwing() {
    var now = performance.now();
    var dt = (now - swingDecayT) / 1000;
    swingDecayT = now;

    var buttons = getSwingButtons();

    if (swingMode !== 'drag') {
      // 非 drag 模式下跳过 hover 的按钮
      for (var h = buttons.length - 1; h >= 0; h--) {
        if (buttons[h].matches(':hover')) {
          buttons[h].style.transform = 'scale(1.15)';
          buttons.splice(h, 1);
        }
      }
    }

    if (swingMode === 'drag') {
      for (var i = 0; i < buttons.length; i++) {
        var scale = 1.0 + i * 0.5;
        var offsetX = -swingWindX * scale;
        offsetX = Math.max(-65, Math.min(65, offsetX));
        var arcY = -(Math.abs(offsetX) / 65) * (4 + i * 4);
        var rot = offsetX * 0.3;
        buttons[i].style.transform = 'translateX(' + offsetX + 'px) translateY(' + arcY + 'px) rotate(' + rot + 'deg)';
        buttons[i].style.transformOrigin = 'center top';
      }
    } else if (swingMode === 'decay') {
      swingDecayPhase += dt * 4.5;
      swingDecayAmp *= Math.pow(0.96, dt * 60);
      if (swingDecayAmp < 0.15) {
        swingMode = 'idle';
        idleTime = 0;
      }
      for (var j = 0; j < buttons.length; j++) {
        var s = 0.7 + j * 0.35;
        var f = chimeFreqs[j] || 1;
        var p = chimePhases[j] || 0;
        var osc = swingDecayAmp * s * Math.sin(swingDecayPhase * f + p);
        var arcY2 = -(Math.abs(osc) / 30) * (2 + j * 2);
        var rot2 = osc * 0.3;
        buttons[j].style.transform = 'translateX(' + osc + 'px) translateY(' + arcY2 + 'px) rotate(' + rot2 + 'deg)';
      }
    } else if (swingMode === 'idle') {
      idleTime += dt;
      for (var k = 0; k < buttons.length; k++) {
        var amp = 0.8 + k * 0.5;
        var fr = chimeFreqs[k] || 1;
        var ph = chimePhases[k] || 0;
        var x = amp * Math.sin(idleTime * 1.6 * fr + ph);
        var arcY3 = -(Math.abs(x) / 4) * (0.5 + k * 0.3);
        var r = x * 0.3;
        buttons[k].style.transform = 'translateX(' + x + 'px) translateY(' + arcY3 + 'px) rotate(' + r + 'deg)';
      }
    }

    swingRAF = requestAnimationFrame(tickSwing);
  }

  function stopDrag() {
    swingDecayT = performance.now();
    swingDecayPhase = 0;
    swingDecayAmp = Math.min(50, Math.abs(swingWindX) * 4);
    swingMode = 'decay';
  }

  // 页面加载后启动微风动画
  function startIdleSwing() {
    if (swingRAF) return;
    swingMode = 'idle';
    idleTime = 0;
    swingDecayT = performance.now();
    tickSwing();
  }

  startIdleSwing();

  function setPosition(x, y) {
    wrapper.style.left = x + 'px';
    wrapper.style.right = 'auto';
    wrapper.style.top = y + 'px';
  }

  function snapToEdge() {
    var rect = wrapper.getBoundingClientRect();
    var topY = parseInt(wrapper.style.top) || 0;
    var nearLeft = rect.left < 30;
    var nearRight = window.innerWidth - rect.right < 30;
    if (nearLeft || nearRight) {
      wrapper.style.transition = 'left .25s ease, right .25s ease';
      if (nearLeft) { wrapper.style.left = '0'; wrapper.style.right = 'auto'; }
      else { wrapper.style.left = 'auto'; wrapper.style.right = '0'; }
      wrapper.style.top = topY + 'px';
      setTimeout(function () { wrapper.style.transition = ''; }, 260);
    }
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
    startSwing();
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

    // 根据水平速度更新风向（按钮反向飘动）
    var now = performance.now();
    var dt = now - swingPrevMT;
    if (dt > 0) {
      var mx = e.clientX - swingPrevMX;
      var vx = mx / dt * 16;
      swingWindX = swingWindX * 0.5 + vx * 0.5;
    }
    swingPrevMX = e.clientX;
    swingPrevMT = now;
  });

  document.addEventListener('mouseup', function () {
    if (!dragging) return;
    dragging = false;
    icon.style.cursor = 'pointer';
    if (swingRAF && swingMode === 'drag') stopDrag();
    if (dragMoved) {
      snapToEdge();
      setTimeout(function () { dragMoved = false; }, 300);
    }
  });

  // ========== DOM Helpers ==========
  function hoverElement(el) {
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
  }

  function unhoverElement(el) {
    el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
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

  // 暴露给其他脚本使用
  Config.hoverElement = hoverElement;
  Config.unhoverElement = unhoverElement;
  Config.waitForElement = waitForElement;
  Config.showBubble = showBubble;
  Config.hideBubble = hideBubble;

  function waitForProvinceSelect(cb) {
    var start = Date.now();
    (function check() {
      var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label'); // #productProductInfo: 产品信息区域; 通过 label "产地" 定位省份下拉
      for (var i = 0; i < labels.length; i++) {
        if (labels[i].textContent.includes('产地')) {
          var formItem = labels[i].closest('.ant-form-item');
          if (formItem) {
            var origin = formItem.querySelector('.productOrigin'); // .productOrigin: 产地表单项内的 Select 容器(国家+省份两个下拉)
            if (origin) {
              var selects = origin.querySelectorAll('.ant-select-selector');
              if (selects.length >= 2) return cb(selects[1]); // 第二个 .ant-select-selector 即为省份下拉
            }
          }
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
      var labels = document.querySelectorAll('#packageInfo .ant-form-item-label label'); // #packageInfo: 包裹信息区域; 通过 label 文字定位对应的 Select(外包装形状/类型)
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
    if (nextFn) setTimeout(nextFn, 150);
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
      doStep1();
    });

    // 译 按钮：单独触发翻译
    var translateEl = document.getElementById('__dxm_bee_translate');
    if (translateEl) {
      translateEl.addEventListener('click', function () {
        if (isWorking) return;
        doTranslateOnly();
      });
    }

    var skuTableEl = document.getElementById('__dxm_bee_sku_table');
    if (skuTableEl) {
      skuTableEl.addEventListener('click', function () {
        if (isWorking) return;
        var skuSection = document.querySelector('#skuDataInfo');
        if (skuSection) skuSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        Config.doSkuTableFill();
      });
    }

    function watchTitleChange(input) {
      var before = input.value;
      var timer = setInterval(function () {
        if (input.value !== before) {
          input.setAttribute('data-bee-translated-title', input.value);
          clearInterval(timer);
        }
      }, 300);
      setTimeout(function () { clearInterval(timer); }, 15000);
    }

    // 标题是否无实质变化（考虑自动截断）
    function isTitleUnchanged(current, stored) {
      if (!stored) return false;
      if (current === stored) return true;
      // 自动截断：current 更短且是 stored 的前缀
      return stored.length > current.length && stored.indexOf(current) === 0;
    }

    function doTranslateOnly() {
      console.log('%c[小蜜蜂] 一键翻译', 'color:#FFCA28;font-weight:bold;font-size:14px');

      // 先展示标题气泡
      var input = document.querySelector('#productProductInfo form .ant-form-item input');
      if (input && input.value) {
        var currentTitle = input.value;
        var snapshot = input.getAttribute('data-bee-title-snapshot');
        var translated = input.getAttribute('data-bee-translated-title');

        if (!isTitleUnchanged(currentTitle, snapshot) && !isTitleUnchanged(currentTitle, translated)) {
          // 标题有实质变化（或首次），过滤并更新气泡
          var filterEnabled = Config.loadFilterEnabled();
          var filters = Config.loadFilters().filter(function (f) { return f.enabled && f.from; });

          if (filterEnabled) {
            var result = Config.applyFilters(currentTitle, filters);
            if (result.changed) Config.setInputValue(input, result.text);
          }

          showTitleBubble(currentTitle, null, null, input);
          input.setAttribute('data-bee-title-snapshot', input.value);
        }
      }

      showBubble('⏳ 正在触发一键翻译...', 'loading');
      var translateBtn = document.querySelector('#app .product-add-layout .header .btn-box button.translation-btn'); // 页面顶部操作栏的”一键翻译”按钮(悬浮展开翻译下拉)
      if (!translateBtn) {
        console.log('%c[小蜜蜂] ❌ 未找到翻译按钮', 'color:#ff4444;font-weight:bold');
        showBubble('❌ 未找到翻译按钮', 'err');
        setTimeout(hideBubble, 2000);
        return;
      }

      function findTranslateMenuItem() {
        var items = document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item'); // 当前可见的 Dropdown 菜单项(翻译选项: 中文→英文)
        for (var i = 0; i < items.length; i++) {
          var t = items[i].textContent || '';
          if (t.indexOf('中文') !== -1 && t.indexOf('英文') !== -1) return items[i];
        }
        return null;
      }

      function onTranslateClicked() {
        if (input) watchTitleChange(input);
      }

      hoverElement(translateBtn);

      var start = Date.now();
      (function tryMenu() {
        var item = findTranslateMenuItem();
        if (item) {
          item.click();
          unhoverElement(translateBtn);
          onTranslateClicked();
          console.log('%c[小蜜蜂] ✅ 翻译完成', 'color:#52c41a;font-weight:bold');
          showBubble('✅ 翻译完成', 'ok');
          setTimeout(hideBubble, 2000);
          return;
        }
        if (Date.now() - start > 3000) {
          translateBtn.click();
          var start2 = Date.now();
          (function tryMenu2() {
            var item2 = findTranslateMenuItem();
            if (item2) {
              item2.click();
              unhoverElement(translateBtn);
              onTranslateClicked();
              console.log('%c[小蜜蜂] ✅ 翻译完成', 'color:#52c41a;font-weight:bold');
              showBubble('✅ 翻译完成', 'ok');
              setTimeout(hideBubble, 2000);
              return;
            }
            if (Date.now() - start2 > 3000) {
              unhoverElement(translateBtn);
              console.log('%c[小蜜蜂] ❌ 未找到翻译菜单', 'color:#ff4444;font-weight:bold');
              showBubble('❌ 未找到翻译菜单', 'err');
              setTimeout(hideBubble, 2000);
              return;
            }
            requestAnimationFrame(tryMenu2);
          })();
          return;
        }
        requestAnimationFrame(tryMenu);
      })();
    }

    // Step 1: 检查店铺名称
    function doStep1() {
      log(1, '正在检查店铺名称...');
      updateProgress(1, '正在检查店铺名称...', 'loading');

      var labels = document.querySelectorAll('#productBasicInfo .ant-form-item-label label'); // #productBasicInfo: 产品基本信息区域; .ant-form-item-label label: 表单项标签(店铺名称等)
      var storeFormItem = null;
      for (var i = 0; i < labels.length; i++) {
        if (labels[i].textContent.includes('店铺名称')) {
          storeFormItem = labels[i].closest('.ant-form-item');
          break;
        }
      }
      log(1, '店铺表单项', storeFormItem);

      if (!storeFormItem) {
        log(1, '⚠️ 未找到店铺表单项，跳过');
        updateProgress(1, '未找到店铺选择', 'ok');
        doStep2();
        return;
      }

      var selectionItem = storeFormItem.querySelector('.ant-select-selection-item'); // .ant-select-selection-item: Select组件当前已选中的值显示元素
      var currentStore = selectionItem ? (selectionItem.getAttribute('title') || selectionItem.textContent.trim()) : '';
      log(1, '当前店铺: "' + currentStore + '"');

      if (currentStore) {
        log(1, '✅ 店铺已选择: ' + currentStore);
        updateProgress(1, '店铺: ' + currentStore, 'ok');
        doStep2();
        return;
      }

      // 店铺为空，尝试选择配置的店铺
      var configStore = Config.loadSelectedStore();
      log(1, '配置店铺: "' + configStore + '"');
      if (!configStore) {
        log(1, '⚠️ 未配置店铺，跳过');
        updateProgress(1, '未配置店铺，跳过', 'ok');
        doStep2();
        return;
      }

      log(1, '店铺为空，正在选择: ' + configStore);
      updateProgress(1, '正在选择店铺 ' + configStore + '...', 'loading');

      var storeSelector = storeFormItem.querySelector('.ant-select-selector'); // .ant-select-selector: Select组件的触发区域(点击开下拉)
      log(1, '店铺下拉框', storeSelector);
      var searchInput = storeFormItem.querySelector('.ant-select-selection-search-input'); // .ant-select-selection-search-input: Select可搜索时的输入框
      if (searchInput) searchInput.focus();
      forceOpenAntSelect(storeSelector);

      waitForElement('.ant-select-item-option[title="' + configStore + '"]', 3000, function (opt) { // .ant-select-item-option[title=...]: 下拉菜单中匹配店铺名称的选项
        log(1, '店铺选项', opt);
        if (!opt) {
          log(1, '❌ 未找到店铺选项: ' + configStore);
          updateProgress(1, '未找到店铺 ' + configStore, 'err');
          doStep2();
          return;
        }
        opt.click();
        log(1, '✅ 已选择店铺: ' + configStore + '（跳过分类步骤）');
        updateProgress(1, '已选择店铺: ' + configStore, 'ok');
        // 店铺变更后分类会清空，跳过 Step 2(分类按钮) 和 Step 3(确认弹窗)
        setTimeout(doStep4, 150);
      });
    }

    // Step 2: 点击「确认分类」按钮
    function doStep2() {
      if (!Config.loadAutoCategory()) {
        log(2, '⏭️ 自动点击分类已关闭，跳过');
        updateProgress(2, '跳过分类步骤', 'ok');
        doStep4();
        return;
      }
      step(2, '正在点击分类按钮...', '已点击分类按钮', function () {
        var btn = document.querySelector('#productBasicInfo .category-item .ant-form-item-control button'); // #productBasicInfo .category-item: 产品基本信息中的分类区域; button: 确认分类按钮
        log(2, '分类按钮', btn);
        if (!btn) return false;
        btn.click();
        return true;
      }, function () {

      // Step 3: 点击弹窗「确认」按钮
      step(3, '正在点击确认按钮...', '分类确认完成！', function () {
        var btn = document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-content .ant-modal-footer button.ant-btn-primary'); // 可见的模态弹窗底部的主按钮(确认分类弹窗)
        log(3, '弹窗确认按钮', btn);
        if (!btn) return false;
        btn.click();
        return true;
      }, doStep4);

      }); // end step 2
    }

    // Step 4: 过滤标题违规字样
    function doStep4() {
      log(4, '正在过滤标题违规字样...');
      updateProgress(4, '正在过滤标题...', 'loading');
      var input = document.querySelector('#productProductInfo form .ant-form-item input'); // #productProductInfo: 产品信息区域; 第一个 input 即为标题输入框
      log(4, '标题输入框', input);
      if (!input || !input.value) {
        log(4, '⚠️ 未找到标题输入框或值为空，跳过过滤');
        updateProgress(4, '标题为空，跳过过滤', 'ok');
        setTimeout(doStep5, 150);
        return;
      }
      var title = input.value;
      log(4, '原标题: "' + title + '"');
      var filterEnabled = Config.loadFilterEnabled();
      var filters = Config.loadFilters().filter(function (f) { return f.enabled && f.from; });

      if (filterEnabled) {
        var result = Config.applyFilters(title, filters);
        var filtered = result.text;
        var hits = result.hits;
        var changed = result.changed;
        if (changed) {
          log(4, '过滤后: "' + filtered + '"');
          Config.setInputValue(input, filtered);
          log(4, '✅ 标题已过滤');
          updateProgress(4, '标题已过滤', 'ok');
        } else {
          log(4, '✅ 标题无违规字样');
          updateProgress(4, '标题无违规字样', 'ok');
        }
        showTitleBubble(title, changed ? filtered : null, changed ? hits : [], input);
        input.setAttribute('data-bee-title-snapshot', input.value);
      } else {
        var forbidden = [];
        for (var j = 0; j < filters.length; j++) {
          if (title.indexOf(filters[j].from) !== -1) forbidden.push(filters[j].from);
        }
        showTitleBubble(title, null, forbidden, input);
        input.setAttribute('data-bee-title-snapshot', input.value);
        if (forbidden.length) {
          log(4, '⚠️ 文字过滤已关闭，存在违禁字符: ' + forbidden.join(', '));
          updateProgress(4, '存在违禁字符（过滤已关闭）', 'ok');
        } else {
          log(4, '✅ 标题无违规字样');
          updateProgress(4, '标题无违规字样', 'ok');
        }
      }
      setTimeout(doStep5, 200);
    }

    // 标题气泡：显示在产品标题上方
    function showTitleBubble(original, filtered, hits, inputEl) {
      var old = document.getElementById('__dxm_bee_title_bubble');
      if (old) old.remove();

      var bubble = document.createElement('div');
      bubble.id = '__dxm_bee_title_bubble';

      var html = '<div style="margin-bottom:4px;color:#666">原标题：' + escHtml(original) + '</div>';
      if (filtered !== null) {
        html += '<div style="color:#52c41a">过滤后标题：' + escHtml(filtered) + '</div>';
      } else if (hits && hits.length) {
        html += '<div style="color:#ff4d4f">存在违禁字符：' + escHtml(hits.join('、')) + '</div>';
      }
      bubble.innerHTML = html;

      if (!document.getElementById('__dxm_bee_title_bubble_style')) {
        var bs = document.createElement('style');
        bs.id = '__dxm_bee_title_bubble_style';
        bs.textContent =
          '#__dxm_bee_title_bubble{position:absolute;z-index:2147483640;left:50%;transform:translateX(-50%);background:#fff;border-radius:10px;padding:10px 14px;box-shadow:0 6px 20px rgba(100,149,237,.22),0 2px 6px rgba(100,149,237,.1);border:1.5px solid #b8d4f0;font:12px/1.6 "Microsoft YaHei",Arial,sans-serif;white-space:normal;word-break:break-all;pointer-events:none}' +
          '#__dxm_bee_title_bubble::after{content:"";position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid #b8d4f0}' +
          '#__dxm_bee_title_bubble::before{content:"";position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid #fff}';
        document.head.appendChild(bs);
      }

      var formItem = inputEl && inputEl.closest('.ant-form-item');
      if (formItem) {
        formItem.style.position = 'relative';
        bubble.style.bottom = '100%';
        bubble.style.maxWidth = Math.round(window.innerWidth * 0.6) + 'px';
        bubble.style.marginBottom = '16px';
        formItem.appendChild(bubble);
      }
    }

    function escHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Step 5: 悬浮「一键翻译」，点击「中文→英文」
    function doStep5() {
      if (!Config.loadAutoTranslate()) {
        log(5, '⏭️ 自动翻译已关闭，跳过');
        updateProgress(5, '自动翻译已关闭，跳过', 'ok');
        doStep6();
        return;
      }
      log(5, '正在触发一键翻译...');
      updateProgress(5, '正在触发一键翻译...', 'loading');
      var translateBtn = document.querySelector('#app .product-add-layout .header .btn-box button.translation-btn');
      log(5, '翻译按钮', translateBtn);
      if (!translateBtn) { updateProgress(5, '未找到一键翻译按钮', 'err'); finishWork(); return; }
      hoverElement(translateBtn);

      function findTranslateMenuItem() {
        var items = document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden) li.menu-item');
        for (var i = 0; i < items.length; i++) {
          var t = items[i].textContent || '';
          if (t.indexOf('中文') !== -1 && t.indexOf('英文') !== -1) return items[i];
        }
        return null;
      }

      var start = Date.now();
      (function tryMenu() {
        var item = findTranslateMenuItem();
        if (item) {
          item.click();
          unhoverElement(translateBtn);
          log(5, '✅ 已点击中文→英文');
          updateProgress(5, '已点击中文→英文', 'ok');
          var input5 = document.querySelector('#productProductInfo form .ant-form-item input');
          if (input5) watchTitleChange(input5);
          setTimeout(doStep6, 300);
          return;
        }
        if (Date.now() - start > 3000) {
          translateBtn.click();
          var start2 = Date.now();
          (function tryMenu2() {
            var item2 = findTranslateMenuItem();
            if (item2) {
              item2.click();
              unhoverElement(translateBtn);
              log(5, '✅ 已点击中文→英文');
              updateProgress(5, '已点击中文→英文', 'ok');
              var input5b = document.querySelector('#productProductInfo form .ant-form-item input');
              if (input5b) watchTitleChange(input5b);
              setTimeout(doStep6, 200);
              return;
            }
            if (Date.now() - start2 > 3000) {
              unhoverElement(translateBtn);
              log(5, '❌ 未找到翻译菜单');
              updateProgress(5, '未找到翻译菜单', 'err');
              finishWork();
              return;
            }
            requestAnimationFrame(tryMenu2);
          })();
          return;
        }
        requestAnimationFrame(tryMenu);
      })();
    }

    // Step 6: 省份下拉框
    function doStep6() {
      log(6, '正在打开省份选择...');
      updateProgress(6, '正在打开省份选择...', 'loading');
      waitForProvinceSelect(function (sel) {
        log(6, '省份下拉框', sel);
        if (!sel) { updateProgress(6, '未找到省份下拉框', 'err'); finishWork(); return; }
        var input = sel.querySelector('.ant-select-selection-search-input');
        if (input) input.focus();
        forceOpenAntSelect(sel);
        log(6, '✅ 已打开省份下拉框');
        updateProgress(6, '已打开省份下拉框', 'ok');
        setTimeout(doStep7, 200);
      });
    }

    // Step 7: 选择配置的省份
    function doStep7() {
      var province = Config.loadProvince();
      step(7, '正在选择' + province + '...', '已选择' + province, function () {
        var o = document.querySelector('.ant-select-item-option[title="' + province + '"]');
        log(7, province + '选项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStepDelVideo);
    }

    // Step 8: 删除产品视频
    function doStepDelVideo() {
      if (!Config.loadDelVideo()) {
        log(8, '⏭️ 删除产品视频已关闭，跳过');
        updateProgress(8, '删除视频已关闭，跳过', 'ok');
        setTimeout(doStep8, 150);
        return;
      }

      log(8, '正在检查产品视频...');
      updateProgress(8, '正在检查产品视频...', 'loading');

      var labels = document.querySelectorAll('#productProductInfo .ant-form-item-label label');
      var videoLabel = null;
      for (var vi = 0; vi < labels.length; vi++) {
        if ((labels[vi].textContent || '').indexOf('产品视频') !== -1) {
          videoLabel = labels[vi];
          break;
        }
      }

      if (!videoLabel) {
        log(8, '⚠️ 未找到产品视频区域，跳过');
        updateProgress(8, '无产品视频，跳过', 'ok');
        setTimeout(doStep8, 150);
        return;
      }

      var videoFormItem = videoLabel.closest('.ant-form-item');
      deleteNextVideo(videoFormItem, 0);
    }

    function deleteNextVideo(formItem, count) {
      // 只查找可见的视频容器（隐藏的跳过）
      var videoImgs = formItem.querySelectorAll('.video-operate-img');
      var visibleBox = null;
      for (var v = 0; v < videoImgs.length; v++) {
        if (videoImgs[v].offsetParent !== null && videoImgs[v].querySelector('.video-operate-img-box')) {
          visibleBox = videoImgs[v];
          break;
        }
      }

      if (!visibleBox) {
        if (count > 0) {
          log(8, '✅ 已删除 ' + count + ' 个产品视频');
          updateProgress(8, '已删除 ' + count + ' 个产品视频', 'ok');
        } else {
          log(8, '✅ 无产品视频，跳过');
          updateProgress(8, '无产品视频，跳过', 'ok');
        }
        setTimeout(doStep8, 150);
        return;
      }

      var delLinks = visibleBox.querySelectorAll('.video-operate-box a.link');
      var delBtn = null;
      for (var d = 0; d < delLinks.length; d++) {
        if ((delLinks[d].textContent || '').indexOf('删除') !== -1) {
          delBtn = delLinks[d];
          break;
        }
      }

      if (!delBtn) {
        log(8, '✅ 无可删除的视频');
        updateProgress(8, '无产品视频，跳过', 'ok');
        setTimeout(doStep8, 150);
        return;
      }

      count++;
      log(8, '正在删除产品视频 ' + count + '...');
      updateProgress(8, '正在删除产品视频 ' + count + '...', 'loading');
      delBtn.click();

      // 点击删除后检查是否有确认弹窗
      setTimeout(function () {
        var confirmBtn = document.querySelector('.ant-popconfirm-buttons .ant-btn-primary');
        if (confirmBtn) confirmBtn.click();
        setTimeout(function () { deleteNextVideo(formItem, count); }, 200);
      }, 150);
    }

    // Step 9: 外包装形状
    function doStep8() {
      log(9, '正在打开外包装形状...');
      updateProgress(9, '正在打开外包装形状...', 'loading');
      waitForAntSelect('外包装形状', function (sel) {
        log(9, '外包装形状下拉框', sel);
        if (!sel) { updateProgress(9, '未找到外包装形状', 'err'); finishWork(); return; }
        sel.scrollIntoView({ block: 'center' });
        setTimeout(function () {
          forceOpenAntSelect(sel);
          log(9, '✅ 已打开外包装形状');
          updateProgress(9, '已打开外包装形状', 'ok');
          setTimeout(doStep9, 150);
        }, 300);
      });
    }

    // Step 9: 选择不规则
    function doStep9() {
      step(10, '正在选择不规则...', '已选择不规则', function () {
        var o = document.querySelector('.ant-select-item-option[title="不规则"]');
        log(10, '不规则选项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep10);
    }

    // Step 10: 外包装类型
    function doStep10() {
      log(11, '正在打开外包装类型...');
      updateProgress(11, '正在打开外包装类型...', 'loading');
      waitForAntSelect('外包装类型', function (sel) {
        log(11, '外包装类型下拉框', sel);
        if (!sel) { updateProgress(11, '未找到外包装类型', 'err'); finishWork(); return; }
        sel.scrollIntoView({ block: 'center' });
        setTimeout(function () {
          forceOpenAntSelect(sel);
          log(11, '✅ 已打开外包装类型');
          updateProgress(11, '已打开外包装类型', 'ok');
          setTimeout(doStep11, 150);
        }, 300);
      });
    }

    // Step 11: 选择软包装+硬物
    function doStep11() {
      step(12, '正在选择软包装+硬物...', '已选择软包装+硬物', function () {
        var o = document.querySelector('.ant-select-item-option[title="软包装+硬物"]');
        log(12, '软包装+硬物选项', o);
        if (!o) return false;
        o.click();
        return true;
      }, doStep12);
    }

    // Step 12: 获取产品轮播图首图 + 打开外包装选择图片
    function doStep12() {
      log(13, '正在获取产品首图...');
      updateProgress(13, '正在获取产品首图...', 'loading');

      var firstImg = document.querySelector('#productProductInfo .mainImage .img-list .img-item img.img-css'); // 产品轮播图列表中的第一张图片
      if (!firstImg || !firstImg.src) {
        log(13, '⚠️ 未找到产品轮播图图片，跳过外包装');
        updateProgress(13, '无产品图片，跳过外包装', 'ok');
        doStep16();
        return;
      }

      var imgUrl = firstImg.src;
      log(13, '✅ 产品首图: ' + imgUrl.substring(0, 60));
      updateProgress(13, '已获取产品首图', 'ok');

      // 先删除外包装旧图片
      var pkgImgs = document.querySelectorAll('#packageInfo .img-list .img-item a.icon_delete');
      if (pkgImgs.length > 0) {
        log(14, '清空外包装旧图片...');
        updateProgress(14, '清空外包装旧图片...', 'loading');
        var delIdx = 0;
        (function deleteNext() {
          var btn = document.querySelector('#packageInfo .img-list .img-item a.icon_delete');
          if (!btn) {
            log(14, '✅ 已清空外包装旧图片');
            updateProgress(14, '已清空外包装旧图片', 'ok');
            openPkgSelect(imgUrl);
            return;
          }
          delIdx++;
          btn.click();
          setTimeout(deleteNext, 50);
        })();
        return;
      }

      openPkgSelect(imgUrl);
    }

    function openPkgSelect(imgUrl) {
      log(14, '正在打开外包装选择图片...');
      updateProgress(14, '正在打开外包装选择图片...', 'loading');

      var pkgBtn = document.querySelector('#packageInfo .header button'); // #packageInfo .header button: 包裹信息区域顶部的”选择图片”按钮
      if (!pkgBtn || (pkgBtn.textContent || '').indexOf('选择图片') === -1) {
        log(14, '❌ 未找到外包装选择图片按钮');
        updateProgress(14, '未找到选择图片按钮', 'err');
        finishWork();
        return;
      }
      hoverElement(pkgBtn);

      Config.waitForVisibleLi('网络图片', 3000, function (webImgItem) { // 外包装选择图片下拉菜单中的”网络图片”菜单项
        if (!webImgItem) {
          log(14, '❌ 未找到网络图片选项');
          updateProgress(14, '未找到网络图片选项', 'err');
          finishWork();
          return;
        }
        log(14, '✅ 已打开选择图片菜单');
        updateProgress(14, '已打开选择图片菜单', 'ok');

        // Step 14: 点击网络图片，填入URL
        log(15, '正在更新外包装图片...');
        updateProgress(15, '正在更新外包装图片...', 'loading');
        webImgItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = Config.findVisibleModal('从网络地址'); // 通过标题文字+可见性双重判断定位弹窗
          if (modal) {
            fillPackageImage(modal, imgUrl);
            return;
          }
          if (Date.now() - start > 5000) {
            log(15, '❌ 未找到网络图片弹窗');
            updateProgress(15, '未找到网络图片弹窗', 'err');
            finishWork();
            return;
          }
          requestAnimationFrame(checkModal);
        })();
      });
    }

    // Step 14 helper: 填入URL
    function fillPackageImage(modal, imgUrl) {
      var textarea = modal.querySelector('textarea.ant-input'); // 网络图片弹窗中的图片 URL 输入框
      if (!textarea) {
        log(15, '❌ 未找到输入框');
        updateProgress(15, '未找到输入框', 'err');
        finishWork();
        return;
      }
      Config.setInputValue(textarea, imgUrl);

      setTimeout(function () {
        // Step 15: 点击添加
        log(16, '正在确认外包装图片...');
        updateProgress(16, '正在确认外包装图片...', 'loading');

        var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary'); // 网络图片弹窗底部的”添加”按钮
        if (!addBtn) {
          log(16, '❌ 未找到添加按钮');
          updateProgress(16, '未找到添加按钮', 'err');
          finishWork();
          return;
        }
        addBtn.click();
        log(16, '✅ 外包装图片已更新');
        updateProgress(16, '外包装图片已更新', 'ok');
        setTimeout(doStep16, 150);
      }, 180);
    }

    // Step 16: 检查标题长度
    function doStep16() {
      log(17, '正在检查标题长度...');
      updateProgress(17, '正在检查标题长度...', 'loading');
      var input = document.querySelector('#productProductInfo form .ant-form-item input');
      log(17, '标题输入框', input);
      if (!input || !input.value) {
        log(17, '⚠️ 未找到标题输入框或值为空，跳过截取');
        updateProgress(17, '标题无需截取', 'ok');
        doStep17();
        return;
      }

      var container = input.closest('.inputContainer'); // .inputContainer: 标题输入框的外层容器
      var limitEl = container ? container.querySelector('.color-gray') : null;
      var limit = 200;
      if (limitEl) {
        var match = limitEl.textContent.match(/\/\s*(\d+)/);
        if (match) limit = parseInt(match[1], 10);
      }

      var title = input.value;
      log(17, '标题长度: ' + title.length + ', 限制: ' + limit + ', 标题内容: "' + title.substring(0, 60) + (title.length > 60 ? '...' : '"'));

      if (title.length <= limit) {
        log(17, '✅ 标题长度 ' + title.length + ' ≤ ' + limit + '，无需截取');
        updateProgress(17, '标题长度 ' + title.length + '，无需截取', 'ok');
        doStep17();
        return;
      }

      log(17, '标题超限 ' + title.length + ' > ' + limit + '，开始截取...');
      updateProgress(17, '标题超过' + limit + '，正在截取...', 'loading');
      var t = title.substring(0, limit);
      var bps = ['。','，',',','.','!','!','?','?','；',';','、',' ','-','–','—','(',')','[',']','/','\\','&','+'];
      var cutIdx = -1;
      for (var ci = t.length - 1; ci >= 0; ci--) {
        if (bps.indexOf(t[ci]) !== -1) { cutIdx = ci; break; }
      }
      if (cutIdx > 0) t = t.substring(0, cutIdx);

      log(17, '截取后长度: ' + t.length + ', 内容: "' + t.substring(0, 60) + (t.length > 60 ? '...' : '"'));
      Config.setInputValue(input, t);
      log(17, '✅ 标题已截取至 ' + t.length + ' 字符');
      updateProgress(17, '标题已截取至 ' + t.length + ' 字符', 'ok');
      doStep17();
    }

    // Step 17: 悬浮发布按钮（根据自动发布配置决定是否执行）
    function doStep17() {
      if (!Config.loadAutoPublish()) {
        log(18, '⏭️ 自动发布已关闭，跳过发布步骤');
        updateProgress(18, '自动发布已关闭，跳过', 'ok');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        finishWork();
        return;
      }
      step(17, '正在触发发布菜单...', '已悬浮发布按钮', function () {
        var btn = document.querySelector('.footer .btn-box button.btn-green'); // 页面底部操作栏的绿色“发布”按钮(悬浮展开发布下拉)
        log(18, '发布按钮', btn);
        if (!btn || !btn.textContent.includes('发布')) return false;
        hoverElement(btn);
        return true;
      }, doStep18);
    }

    // Step 18: 立即发布
    function doStep18() {
      step(19, '正在点击立即发布...', '全部操作完成！', function () {
        var o = document.querySelector('.ant-dropdown-menu-item[data-menu-id="2"]'); // 发布下拉菜单中的“立即发布”选项
        log(19, '立即发布菜单项', o);
        if (!o || !o.textContent.includes('立即发布')) return false;
        o.click();
        return true;
      }, null);
      finishWork();
    }
  }

  // ========== Cross-tab: notify 1688 to clear selections ==========
  function notifyClearResult() {
    try { chrome.runtime.sendMessage({ action: 'clearResultSelections' }); } catch (e) {}
    try { fetch('http://localhost:3000/api/clear-signal', { method: 'POST' }).catch(function () {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) notifyClearResult();
  });

  // ========== 自动收集店小秘类目 ==========
  var _lastCollectedCat = '';
  function collectDxmCategory() {
    var catList = document.querySelector('.category-list');
    if (!catList) return;
    var text = catList.textContent.trim();
    if (!text || text === _lastCollectedCat) return;
    _lastCollectedCat = text;
    var parts = text.split(/\s*>\s*/);
    try {
      var serverUrl = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000';
      fetch(serverUrl + '/api/dxm-category/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: parts.join('/'), leafName: parts[parts.length - 1] })
      }).catch(function () {});
    } catch (e) {}
  }
  // 页面加载后监听类目变化
  setTimeout(function () {
    var catList = document.querySelector('.category-list');
    if (!catList) return;
    collectDxmCategory();
    var observer = new MutationObserver(collectDxmCategory);
    observer.observe(catList, { childList: true, characterData: true, subtree: true });
  }, 3000);

  // ========== 包装按钮 ==========
  if (isWorkPage) {
    var pkgEl = document.getElementById('__dxm_bee_package');
    if (pkgEl) {
      pkgEl.addEventListener('click', function () {
        var pkgSection = document.querySelector('#packageInfo');
        if (pkgSection) pkgSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        doPackage();
      });
    }

    function doPackage() {
      var pkgStep = 0;
      var pkgTotal = 3;
      function pkgLog(msg) {
        pkgStep++;
        showBubble(pkgStep + '/' + pkgTotal + ' ' + msg, 'loading');
      }

      pkgLog('选择外包装形状...');
      waitForAntSelect('外包装形状', function (sel) {
        if (!sel) { showBubble('❌ 未找到外包装形状', 'err'); setTimeout(hideBubble, 2000); return; }
        sel.scrollIntoView({ block: 'center' });
        setTimeout(function () {
          forceOpenAntSelect(sel);
          waitForElement('.ant-select-item-option[title="不规则"]', 3000, function (opt) {
            if (!opt) { showBubble('❌ 未找到不规则选项', 'err'); setTimeout(hideBubble, 2000); return; }
            opt.click();

            setTimeout(function () {
              pkgLog('选择外包装类型...');
              waitForAntSelect('外包装类型', function (sel2) {
                if (!sel2) { showBubble('❌ 未找到外包装类型', 'err'); setTimeout(hideBubble, 2000); return; }
                forceOpenAntSelect(sel2);
                waitForElement('.ant-select-item-option[title="软包装+硬物"]', 3000, function (opt2) {
                  if (!opt2) { showBubble('❌ 未找到软包装+硬物', 'err'); setTimeout(hideBubble, 2000); return; }
                  opt2.click();

                  setTimeout(function () {
                    doUpdatePkgImage(pkgLog, function () {
                      showBubble('✅ 外包装设置完成', 'ok');
                      setTimeout(hideBubble, 2000);
                    });
                  }, 300);
                });
              });
            }, 300);
          });
        }, 300);
      });
    }

    function doUpdatePkgImage(pkgLog, cb) {
      var firstImg = document.querySelector('#productProductInfo .mainImage .img-list .img-item img.img-css');
      if (!firstImg || !firstImg.src) { pkgLog('无轮播图，跳过外包装图片'); cb(); return; }
      var imgUrl = firstImg.src;

      var pkgImg = document.querySelector('#packageInfo .img-list .img-item img');
      if (pkgImg && pkgImg.src === imgUrl) { pkgLog('外包装图片已是最新'); cb(); return; }

      // 删除旧图
      var pkgImgs = document.querySelectorAll('#packageInfo .img-list .img-item a.icon_delete');
      if (pkgImgs.length > 0) {
        pkgLog('更新外包装图片...');
        (function deleteNext() {
          var btn = document.querySelector('#packageInfo .img-list .img-item a.icon_delete');
          if (!btn) { setTimeout(function () { openPkgNetworkImage(imgUrl, cb); }, 300); return; }
          btn.click();
          setTimeout(deleteNext, 50);
        })();
        return;
      }

      pkgLog('更新外包装图片...');
      openPkgNetworkImage(imgUrl, cb);
    }

    function openPkgNetworkImage(imgUrl, cb) {
      var pkgBtn = document.querySelector('#packageInfo .header button');
      if (!pkgBtn || (pkgBtn.textContent || '').indexOf('选择图片') === -1) { cb(); return; }
      hoverElement(pkgBtn);

      Config.waitForVisibleLi('网络图片', 3000, function (webImgItem) {
        if (!webImgItem) { cb(); return; }
        webImgItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = Config.findVisibleModal('从网络地址');
          if (modal) {
            var textarea = modal.querySelector('textarea.ant-input');
            if (textarea) Config.setInputValue(textarea, imgUrl);
            setTimeout(function () {
              var addBtn = modal.querySelector('.ant-modal-footer .ant-btn-primary');
              if (addBtn) addBtn.click();
              cb();
            }, 200);
            return;
          }
          if (Date.now() - start > 5000) { cb(); return; }
          requestAnimationFrame(checkModal);
        })();
      });
    }
  }

  // ========== 同步类目（从配置面板触发） ==========
  var _syncCatRunning = false;

  function randomDelay(base, range) {
    return base + Math.floor(Math.random() * range);
  }

  // 请求间隔 1~3 秒，冷却 4~8 秒
  function getInterval() { return randomDelay(1000, 2000); }
  function getCoolDown() { return randomDelay(4000, 4000); }

  function doSyncTree(shopId, serverUrl, startCatId, startCatName, onDone) {
    var totalNodes = 0;
    var requestCount = 0;
    var batchBuffer = [];
    var BATCH_SIZE = 50;
    var BATCH_LIMIT = 20;

    function flushBatch(cb) {
      if (!batchBuffer.length) return cb();
      var items = batchBuffer.slice();
      batchBuffer = [];
      fetch(serverUrl + '/api/dxm-tree/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: items })
      }).then(function () { cb(); }).catch(function () { cb(); });
    }

    function fetchChildren(parentId, parentPath, depth, cb) {
      if (depth > 10) return cb();

      requestCount++;
      if (requestCount > 1 && (requestCount - 1) % BATCH_LIMIT === 0) {
        var coolDown = getCoolDown();
        showBubble(startCatName + ' 已采集 ' + totalNodes + ' 个，冷却 ' + Math.round(coolDown / 1000) + ' 秒...', 'loading');
        setTimeout(function () { doReq(parentId, parentPath, depth, cb); }, coolDown);
      } else {
        doReq(parentId, parentPath, depth, cb);
      }
    }

    function doReq(parentId, parentPath, depth, cb) {
      var body = 'shopId=' + encodeURIComponent(shopId);
      if (parentId) body += '&categoryParentId=' + parentId;

      fetch('https://www.dianxiaomi.com/api/pddkjCategory/list.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      }).then(function (r) { return r.json(); }).then(function (resp) {
        if (!resp || resp.code !== 0 || !Array.isArray(resp.data)) return cb();
        var list = resp.data;
        if (!list.length) return cb();

        var nonLeafItems = [];
        list.forEach(function (cat) {
          if (cat.isHidden || cat.deleted) return;

          var catId = cat.catId;
          var catName = cat.catName || '';
          var parentCatId = cat.parentCatId || parentId;
          var isLeaf = !!cat.isLeaf;
          var level = cat.catLevel || (depth + 1);
          var fullPath = parentPath ? parentPath + '/' + catName : catName;

          totalNodes++;
          batchBuffer.push({
            catId: catId,
            catName: catName,
            parentCatId: parentCatId,
            catLevel: level,
            isLeaf: isLeaf ? 1 : 0,
            path: fullPath
          });

          if (!isLeaf) nonLeafItems.push({ catId: catId, fullPath: fullPath, level: level });
        });

        showBubble(startCatName + ' 已采集 ' + totalNodes + ' 个（第 ' + requestCount + ' 次请求）', 'loading');

        if (batchBuffer.length >= BATCH_SIZE) {
          flushBatch(function () { processNonLeaf(nonLeafItems, 0, cb); });
        } else {
          processNonLeaf(nonLeafItems, 0, cb);
        }
      }).catch(function () {
        showBubble(startCatName + ' 请求失败（第 ' + requestCount + ' 次），跳过', 'loading');
        cb();
      });
    }

    function processNonLeaf(items, idx, doneCb) {
      if (idx >= items.length) return doneCb();
      var item = items[idx];
      setTimeout(function () {
        fetchChildren(item.catId, item.fullPath, item.level, function () {
          processNonLeaf(items, idx + 1, doneCb);
        });
      }, getInterval());
    }

    showBubble('开始同步 ' + startCatName + '...', 'loading');

    var initDepth = startCatId ? 1 : 0;
    fetchChildren(startCatId, startCatName, initDepth, function () {
      flushBatch(function () {
        showBubble(startCatName + ' 同步完成！共 ' + totalNodes + ' 个', 'ok');
        console.log('%c[小蜜蜂] ' + startCatName + ' 同步完成: ' + totalNodes + ' 个', 'color:#52c41a;font-weight:bold');
        if (onDone) onDone(totalNodes);
      });
    });
  }

  // 同步全部分类（依次同步每个大类）
  function syncDxmCategories(onDone) {
    var shopId = Config.loadShopId();
    if (!shopId) {
      showBubble('请先设置店铺ID', 'warn');
      setTimeout(hideBubble, 3000);
      return;
    }
    if (_syncCatRunning) return;
    _syncCatRunning = true;

    var serverUrl = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000';

    // 先获取全部一级分类，再依次同步
    fetch('https://www.dianxiaomi.com/api/pddkjCategory/list.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'shopId=' + encodeURIComponent(shopId)
    }).then(function (r) { return r.json(); }).then(function (resp) {
      if (!resp || resp.code !== 0 || !Array.isArray(resp.data)) {
        _syncCatRunning = false;
        showBubble('获取一级分类失败', 'err');
        return;
      }
      var roots = resp.data.filter(function (c) { return !c.isHidden && !c.deleted; });
      var totalAll = 0;
      var idx = 0;

      function syncNext() {
        if (idx >= roots.length) {
          _syncCatRunning = false;
          showBubble('全部分类同步完成！共 ' + totalAll + ' 个', 'ok');
          console.log('%c[小蜜蜂] 全部分类同步完成: ' + totalAll + ' 个', 'color:#52c41a;font-weight:bold;font-size:14px');
          setTimeout(hideBubble, 3000);
          if (onDone) onDone(totalAll);
          return;
        }
        var root = roots[idx];
        idx++;
        doSyncTree(shopId, serverUrl, root.catId, root.catName, function (cnt) {
          totalAll += cnt;
          syncNext();
        });
      }

      syncNext();
    }).catch(function () {
      _syncCatRunning = false;
      showBubble('获取一级分类失败', 'err');
    });
  }

  // 同步单个大类
  function syncSingleCategory(catId, catName, onDone) {
    var shopId = Config.loadShopId();
    if (!shopId) {
      showBubble('请先设置店铺ID', 'warn');
      setTimeout(hideBubble, 3000);
      return;
    }
    if (_syncCatRunning) {
      showBubble('正在同步中，请等待', 'warn');
      setTimeout(hideBubble, 2000);
      return;
    }
    _syncCatRunning = true;
    var serverUrl = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000';
    doSyncTree(shopId, serverUrl, catId, catName, function (cnt) {
      _syncCatRunning = false;
      if (onDone) onDone(cnt);
    });
  }

  // 获取一级分类列表
  function fetchRootCategories(cb) {
    var shopId = Config.loadShopId();
    if (!shopId) { cb(null, '请先设置店铺ID'); return; }
    fetch('https://www.dianxiaomi.com/api/pddkjCategory/list.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'shopId=' + encodeURIComponent(shopId)
    }).then(function (r) { return r.json(); }).then(function (resp) {
      if (!resp || resp.code !== 0 || !Array.isArray(resp.data)) {
        cb(null, resp && resp.msg || '获取失败');
        return;
      }
      var roots = resp.data.filter(function (c) { return !c.isHidden && !c.deleted; });
      cb(roots, null);
    }).catch(function () { cb(null, '网络错误'); });
  }

  Config.syncDxmCategories = syncDxmCategories;
  Config.syncSingleCategory = syncSingleCategory;
  Config.fetchRootCategories = fetchRootCategories;
})();
