(function () {
  if (window.__dxmFloatBee) return;
  window.__dxmFloatBee = true;

  var Config = window.BeeConfig;

  var POS_KEY = '__dxm_bee_pos';

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
  var _stepCounter = 0;
  function nextStepNum() { return ++_stepCounter; }

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
    '<div class="__dxm_bee_line"></div>' +
    '<div id="__dxm_bee_resize" title="批量修改图片尺寸">尺寸</div>' +
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
    '#__dxm_bee{position:fixed;z-index:2147483647;left:0;top:35%;user-select:none;display:flex;flex-direction:column;align-items:center}' +
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

  // 恢复上次拖动位置
  try {
    var savedPos = JSON.parse(localStorage.getItem(POS_KEY));
    if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
      wrapper.style.left = savedPos.left + 'px';
      wrapper.style.top = savedPos.top + 'px';
    }
  } catch (e) {}

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
    var totalSteps = 3;
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

  function savePos() {
    var rect = wrapper.getBoundingClientRect();
    try { localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top })); } catch (e) {}
  }

  function setPosition(x, y) {
    wrapper.style.left = x + 'px';
    wrapper.style.right = 'auto';
    wrapper.style.top = y + 'px';
    savePos();
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
      setTimeout(function () {
        savePos();
        dragMoved = false;
      }, 300);
    }
  });

  // ========== DOM Helpers (shared via BeeConfig) ==========
  var hoverElement = Config.hoverElement;
  var unhoverElement = Config.unhoverElement;
  var waitForElement = Config.waitForElement;
  var forceOpenAntSelect = Config.forceOpenAntSelect;

  // 暴露给其他脚本使用
  Config.showBubble = showBubble;
  Config.hideBubble = hideBubble;

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
      _stepCounter = 0;
      wrapper.classList.add('flying');
      console.log('%c[小蜜蜂] ===== 开始工作 =====', 'color:#FFCA28;font-weight:bold;font-size:14px');
      doStep4();
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

    // Step 4: 过滤标题违规字样
    function doStep4() {
      var s = nextStepNum();
      log(s, '正在过滤标题违规字样...');
      updateProgress(s, '正在过滤标题...', 'loading');
      var input = document.querySelector('#productProductInfo form .ant-form-item input');
      log(s, '标题输入框', input);
      if (!input || !input.value) {
        log(s, '⚠️ 未找到标题输入框或值为空，跳过过滤');
        updateProgress(s, '标题为空，跳过过滤', 'ok');
        setTimeout(doStep11, 150);
        return;
      }
      var title = input.value;
      log(s, '原标题: "' + title + '"');
      var filterEnabled = Config.loadFilterEnabled();
      var filters = Config.loadFilters().filter(function (f) { return f.enabled && f.from; });

      if (filterEnabled) {
        var result = Config.applyFilters(title, filters);
        var filtered = result.text;
        var hits = result.hits;
        var changed = result.changed;
        if (changed) {
          log(s, '过滤后: "' + filtered + '"');
          Config.setInputValue(input, filtered);
          log(s, '✅ 标题已过滤');
          updateProgress(s, '标题已过滤', 'ok');
        } else {
          log(s, '✅ 标题无违规字样');
          updateProgress(s, '标题无违规字样', 'ok');
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
          log(s, '⚠️ 文字过滤已关闭，存在违禁字符: ' + forbidden.join(', '));
          updateProgress(s, '存在违禁字符（过滤已关闭）', 'ok');
        } else {
          log(s, '✅ 标题无违规字样');
          updateProgress(s, '标题无违规字样', 'ok');
        }
      }
      setTimeout(doStep11, 200);
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

    // Step: 检查标题长度
    function doStep11() {
      var s = nextStepNum();
      log(s, '正在检查标题长度...');
      updateProgress(s, '正在检查标题长度...', 'loading');
      var input = document.querySelector('#productProductInfo form .ant-form-item input');
      if (!input || !input.value) {
        log(s, '⚠️ 未找到标题输入框或值为空，跳过截取');
        updateProgress(s, '标题无需截取', 'ok');
        finishWork();
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
      log(s, '标题长度: ' + title.length + ', 限制: ' + limit);

      if (title.length <= limit) {
        log(s, '✅ 标题长度 ' + title.length + ' ≤ ' + limit + '，无需截取');
        updateProgress(s, '标题长度 ' + title.length + '，无需截取', 'ok');
        finishWork();
        return;
      }

      log(s, '标题超限 ' + title.length + ' > ' + limit + '，开始截取...');
      updateProgress(s, '标题超过' + limit + '，正在截取...', 'loading');
      var t = title.substring(0, limit);
      var bps = ['。','，',',','.','!','!','?','?','；',';','、',' ','-','–','—','(',')','[',']','/','\\','&','+'];
      var cutIdx = -1;
      for (var ci = t.length - 1; ci >= 0; ci--) {
        if (bps.indexOf(t[ci]) !== -1) { cutIdx = ci; break; }
      }
      if (cutIdx > 0) t = t.substring(0, cutIdx);

      Config.setInputValue(input, t);
      log(s, '✅ 标题已截取至 ' + t.length + ' 字符');
      updateProgress(s, '标题已截取至 ' + t.length + ' 字符', 'ok');
      finishWork();
    }
  }

  // ========== Cross-tab: notify 1688 to clear selections ==========
  var __sharedClientId = window.__sharedClientId = '';
  try { chrome.storage.local.get('__shared_client_id', function (r) {
    if (r.__shared_client_id) { __sharedClientId = window.__sharedClientId = r.__shared_client_id; }
    else { __sharedClientId = window.__sharedClientId = 'c' + Date.now() + Math.random().toString(36).slice(2, 8); chrome.storage.local.set({ __shared_client_id: __sharedClientId }); }
  }); } catch (e) {}
  function notifyClearResult() {
    try { chrome.runtime.sendMessage({ action: 'clearResultSelections' }); } catch (e) {}
    try { var _su = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000'; fetch(_su + '/api/clear-signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: __sharedClientId }) }).catch(function () {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) notifyClearResult();
  });


  // ========== 尺寸按钮（批量修改图片尺寸） ==========
  if (isWorkPage) {
    var resizeEl = document.getElementById('__dxm_bee_resize');
    if (resizeEl) {
      resizeEl.addEventListener('click', function () {
        var mainImg = document.querySelector('#productProductInfo .mainImage');
        if (mainImg) mainImg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        doResizeImages();
      });
    }

    function doResizeImages() {
      var rsStep = 0;
      var rsTotal = 3;
      function rsLog(msg) {
        rsStep++;
        showBubble(rsStep + '/' + rsTotal + ' ' + msg, 'loading');
      }

      rsLog('打开批量编辑...');
      var actionItems = document.querySelectorAll('#productProductInfo .mainImage .img-options .action-item');
      var editBtn = null;
      for (var i = 0; i < actionItems.length; i++) {
        var link = actionItems[i].querySelector('a.img-options-action-btn');
        if (link && (link.textContent || '').indexOf('编辑图片') !== -1) {
          editBtn = link;
          break;
        }
      }
      if (!editBtn) {
        showBubble('❌ 未找到编辑图片按钮', 'err');
        setTimeout(hideBubble, 2000);
        return;
      }

      Config.hoverElement(editBtn);
      Config.waitForVisibleLi('批量改图片尺寸', 3000, function (resizeItem) {
        if (!resizeItem) {
          showBubble('❌ 未找到批量改图片尺寸', 'err');
          setTimeout(hideBubble, 2000);
          return;
        }
        resizeItem.click();

        var start = Date.now();
        (function checkModal() {
          var modal = Config.findVisibleModal('批量改图片尺寸');
          if (modal) {
            rsLog('设置图片尺寸...');
            var widthInput = modal.querySelector('input[name="valueW"]');
            if (widthInput && !widthInput.value) {
              Config.setInputValue(widthInput, '800');
            }
            setTimeout(function () {
              rsLog('生成JPG图片...');
              var btns = modal.querySelectorAll('button');
              var jpgBtn = null;
              for (var b = 0; b < btns.length; b++) {
                if ((btns[b].textContent || '').indexOf('生成JPG图片') !== -1) {
                  jpgBtn = btns[b];
                  break;
                }
              }
              if (jpgBtn) {
                jpgBtn.click();
                showBubble('✅ 图片尺寸已修改', 'ok');
                setTimeout(hideBubble, 2000);
              } else {
                showBubble('❌ 未找到生成按钮', 'err');
                setTimeout(hideBubble, 2000);
              }
            }, 300);
            return;
          }
          if (Date.now() - start > 5000) {
            showBubble('❌ 未找到弹窗', 'err');
            setTimeout(hideBubble, 2000);
            return;
          }
          requestAnimationFrame(checkModal);
        })();
      });
    }
  }

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

  // ========== 同步类目（共享请求队列，支持多个大类并发） ==========
  var _syncQueue = [];
  var _syncProcessing = false;
  var _syncRequestCount = 0;
  var _syncTasks = {}; // catId → { totalNodes, onDone }
  var BATCH_LIMIT = 20;

  function randomDelay(base, range) {
    return base + Math.floor(Math.random() * range);
  }

  // 共享队列：所有同步任务的 API 请求都排队，串行执行
  function enqueueRequest(shopId, parentId, processCb) {
    _syncQueue.push({ shopId: shopId, parentId: parentId, processCb: processCb });
    if (!_syncProcessing) processQueue();
  }

  function processQueue() {
    if (!_syncQueue.length) { _syncProcessing = false; return; }
    _syncProcessing = true;

    var item = _syncQueue.shift();
    _syncRequestCount++;

    // 每 BATCH_LIMIT 次请求进入冷却
    if (_syncRequestCount > 1 && (_syncRequestCount - 1) % BATCH_LIMIT === 0) {
      var coolDown = randomDelay(3000, 2000);
      setTimeout(function () { execRequest(item); }, coolDown);
    } else {
      execRequest(item);
    }
  }

  function execRequest(item) {
    var body = 'shopId=' + encodeURIComponent(item.shopId);
    if (item.parentId) body += '&categoryParentId=' + item.parentId;

    fetch('https://www.dianxiaomi.com/api/pddkjCategory/list.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (r) { return r.json(); }).then(function (resp) {
      var list = (!resp || resp.code !== 0 || !Array.isArray(resp.data)) ? [] : resp.data;
      item.processCb(list, function () {
        setTimeout(processQueue, randomDelay(1000, 1000));
      });
    }).catch(function () {
      item.processCb([], function () {
        setTimeout(processQueue, randomDelay(1000, 1000));
      });
    });
  }

  function doSyncTree(shopId, serverUrl, startCatId, startCatName, onDone) {
    var task = { totalNodes: 0, onDone: onDone };
    _syncTasks[startCatId || 'root'] = task;
    var batchBuffer = [];
    var BATCH_SIZE = 50;
    var pendingCount = 0;

    function flushBatch() {
      if (!batchBuffer.length) return;
      var items = batchBuffer.slice();
      batchBuffer = [];
      fetch(serverUrl + '/api/dxm-tree/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: items })
      }).catch(function () {});
    }

    function checkDone() {
      if (pendingCount > 0) return;
      flushBatch();
      showBubble(startCatName + ' 同步完成！共 ' + task.totalNodes + ' 个', 'ok');
      console.log('%c[小蜜蜂] ' + startCatName + ' 同步完成: ' + task.totalNodes + ' 个', 'color:#52c41a;font-weight:bold');
      delete _syncTasks[startCatId || 'root'];
      if (onDone) onDone(task.totalNodes);
    }

    // 每个请求的 processCb：处理响应 + 立即 next 让队列继续
    function makeProcessCb(parentId, parentPath, depth) {
      return function (list, next) {
        if (list.length) {
          var nonLeafItems = [];
          list.forEach(function (cat) {
            if (cat.isHidden || cat.deleted) return;
            var catId = cat.catId;
            var catName = cat.catName || '';
            var parentCatId = cat.parentCatId || parentId;
            var isLeaf = !!cat.isLeaf;
            var level = cat.catLevel || (depth + 1);
            var fullPath = parentPath ? parentPath + '/' + catName : catName;

            task.totalNodes++;
            batchBuffer.push({
              catId: catId, catName: catName, parentCatId: parentCatId,
              catLevel: level, isLeaf: isLeaf ? 1 : 0, path: fullPath
            });

            if (!isLeaf) nonLeafItems.push({ catId: catId, fullPath: fullPath, level: level });
          });

          // 更新气泡
          var parts = [];
          for (var k in _syncTasks) {
            var t = _syncTasks[k];
            if (t.totalNodes > 0) parts.push(t._name + ' ' + t.totalNodes);
          }
          showBubble('采集中: ' + parts.join('、'), 'loading');

          // 批量保存 + 入队子请求
          if (batchBuffer.length >= BATCH_SIZE) flushBatch();

          nonLeafItems.forEach(function (item) {
            pendingCount++;
            enqueueRequest(shopId, item.catId, makeProcessCb(item.catId, item.fullPath, item.level));
          });
        }

        pendingCount--;
        next(); // 立即让队列继续处理下一个
        checkDone();
      };
    }

    task._name = startCatName;
    showBubble('开始同步 ' + startCatName + '...', 'loading');

    var initDepth = startCatId ? 1 : 0;
    pendingCount = 1;
    enqueueRequest(shopId, startCatId, makeProcessCb(startCatId, startCatName, initDepth));
  }

  // 同步全部分类（依次同步每个大类）
  function syncDxmCategories(onDone) {
    var shopId = Config.loadShopId();
    if (!shopId) {
      showBubble('请先设置店铺ID', 'warn');
      setTimeout(hideBubble, 3000);
      return;
    }
    var serverUrl = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000';

    fetch('https://www.dianxiaomi.com/api/pddkjCategory/list.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'shopId=' + encodeURIComponent(shopId)
    }).then(function (r) { return r.json(); }).then(function (resp) {
      if (!resp || resp.code !== 0 || !Array.isArray(resp.data)) {
        showBubble('获取一级分类失败', 'err');
        return;
      }
      var roots = resp.data.filter(function (c) { return !c.isHidden && !c.deleted; });
      var totalAll = 0;
      var idx = 0;

      function syncNext() {
        if (idx >= roots.length) {
          showBubble('全部分类同步完成！共 ' + totalAll + ' 个', 'ok');
          console.log('%c[小蜜蜂] 全部分类同步完成: ' + totalAll + ' 个', 'color:#52c41a;font-weight:bold;font-size:14px');
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
      showBubble('获取一级分类失败', 'err');
    });
  }

  // 同步单个大类（可同时启动多个）
  function syncSingleCategory(catId, catName, onDone) {
    var shopId = Config.loadShopId();
    if (!shopId) {
      showBubble('请先设置店铺ID', 'warn');
      setTimeout(hideBubble, 3000);
      return;
    }
    if (_syncTasks[catId]) {
      showBubble(catName + ' 正在同步中', 'warn');
      setTimeout(hideBubble, 2000);
      return;
    }
    var serverUrl = (Config && Config.getServerUrl ? Config.getServerUrl() : localStorage.getItem('1688_server_url')) || 'http://localhost:3000';
    doSyncTree(shopId, serverUrl, catId, catName, onDone);
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
