(function () {
  // 只持久化设置，不持久化图片
  var GRID_KEY = '__dxm_collage_grid';
  var FIT_KEY = '__dxm_collage_fit';
  var MODE_KEY = '__dxm_collage_mode';
  var BOARD_KEY = '__dxm_collage_board';
  var GRIDS = [
    { cols: 2, rows: 2, label: '4宫格' },
    { cols: 3, rows: 2, label: '6宫格' },
    { cols: 3, rows: 3, label: '9宫格' },
    { cols: 4, rows: 4, label: '16宫格' }
  ];

  // ========== State ==========
  var mode = 'grid';
  try { var sm = localStorage.getItem(MODE_KEY); if (sm === 'custom') mode = sm; } catch (e) {}
  var currentIdx = 0;
  try { var sg = parseInt(localStorage.getItem(GRID_KEY)); if (sg >= 0 && sg < GRIDS.length) currentIdx = sg; } catch (e) {}
  var fitMode = 'cover';
  try { var sf = localStorage.getItem(FIT_KEY); if (sf === 'cover' || sf === 'contain' || sf === 'fill') fitMode = sf; } catch (e) {}
  var cellImages = {};    // 不持久化
  var imagePool = [];     // 不持久化
  var canvasItems = [];   // 不持久化
  var boardW = 800, boardH = 800;
  try { var sb = JSON.parse(localStorage.getItem(BOARD_KEY)); if (sb && sb.w > 0 && sb.h > 0) { boardW = sb.w; boardH = sb.h; } } catch (e) {}

  var activeCell = -1;
  var nextId = 1;
  var selectedItemId = null;

  // ========== Toast ==========
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type || 'ok') + ' show';
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  // ========== Save (仅设置) ==========
  function saveGrid() {
    try { localStorage.setItem(GRID_KEY, String(currentIdx)); } catch (e) {}
    try { localStorage.setItem(FIT_KEY, fitMode); } catch (e) {}
  }
  function saveBoard() {
    try { localStorage.setItem(BOARD_KEY, JSON.stringify({ w: boardW, h: boardH })); } catch (e) {}
  }
  function saveMode() { try { localStorage.setItem(MODE_KEY, mode); } catch (e) {} }

  // ========== DOM refs ==========
  var modeGrid = document.getElementById('modeGrid');
  var modeCustom = document.getElementById('modeCustom');
  var gridArea = document.getElementById('gridArea');
  var customArea = document.getElementById('customArea');
  var gridOptsContainer = document.getElementById('gridOptsContainer');
  var canvasBoard = document.getElementById('canvasBoard');
  var canvasWrap = document.getElementById('canvasWrap');
  var canvasSizeEl = document.getElementById('canvasSize');
  var rightPanel = document.getElementById('rightPanel');
  var rpEmpty = document.getElementById('rpEmpty');
  var rpContent = document.getElementById('rpContent');
  var rpPreviewImg = document.getElementById('rpPreviewImg');
  var propW = document.getElementById('propW');
  var propH = document.getElementById('propH');
  var propRot = document.getElementById('propRot');

  // ========== Mode Switch ==========
  function applyMode() {
    modeGrid.classList.toggle('active', mode === 'grid');
    modeCustom.classList.toggle('active', mode === 'custom');
    gridArea.style.display = mode === 'grid' ? '' : 'none';
    customArea.classList.toggle('show', mode === 'custom');
    document.querySelectorAll('.grid-only').forEach(function (el) {
      el.style.display = mode === 'grid' ? '' : 'none';
    });
    rightPanel.classList.toggle('show', mode === 'custom');
    if (mode === 'grid') { buildGrid(); }
    else { applyBoardSize(); buildPool(); buildCanvasItems(); updatePropBar(); }
    saveMode();
  }
  modeGrid.addEventListener('click', function () { mode = 'grid'; applyMode(); });
  modeCustom.addEventListener('click', function () { mode = 'custom'; applyMode(); });

  // ========== Grid Options (左侧侧栏) ==========
  GRIDS.forEach(function (g, i) {
    var opt = document.createElement('div');
    opt.className = 'grid-opt' + (i === currentIdx ? ' active' : '');
    var preview = document.createElement('div');
    preview.className = 'grid-preview';
    preview.style.gridTemplateColumns = 'repeat(' + g.cols + ', 1fr)';
    preview.style.gridTemplateRows = 'repeat(' + g.rows + ', 1fr)';
    for (var j = 0; j < g.cols * g.rows; j++) preview.appendChild(document.createElement('span'));
    var label = document.createElement('div');
    label.className = 'grid-label';
    label.textContent = g.label;
    opt.appendChild(preview);
    opt.appendChild(label);
    opt.addEventListener('click', function () {
      currentIdx = i;
      try { localStorage.setItem(GRID_KEY, String(i)); } catch (e) {}
      document.querySelectorAll('.grid-opt').forEach(function (el, idx) { el.classList.toggle('active', idx === i); });
      activeCell = -1;
      buildGrid();
    });
    gridOptsContainer.appendChild(opt);
  });

  // ========== Fit Mode ==========
  document.getElementById('fitMode').value = fitMode;
  document.getElementById('fitMode').addEventListener('change', function () {
    fitMode = this.value;
    try { localStorage.setItem(FIT_KEY, fitMode); } catch (e) {}
    buildGrid();
  });

  // ========== Grid Mode ==========
  function getGrid() { return GRIDS[currentIdx]; }
  function buildGrid() {
    saveGrid();
    var g = getGrid(), grid = document.getElementById('grid');
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(' + g.cols + ', 180px)';
    var total = g.cols * g.rows;
    for (var i = 0; i < total; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = i;
      if (cellImages[i]) {
        cell.classList.add('has-img');
        var img = document.createElement('img');
        img.src = cellImages[i];
        img.style.objectFit = fitMode;
        cell.appendChild(img);
        var rm = document.createElement('button');
        rm.className = 'rm';
        rm.textContent = '×';
        (function (idx) {
          rm.addEventListener('click', function (e) {
            e.stopPropagation();
            delete cellImages[idx];
            buildGrid();
          });
        })(i);
        cell.appendChild(rm);
      } else {
        var ph = document.createElement('div');
        ph.className = 'ph';
        ph.textContent = '粘贴或拖入图片';
        cell.appendChild(ph);
      }
      (function (idx) {
        cell.addEventListener('mouseenter', function () {
          document.querySelectorAll('.cell').forEach(function (c) { c.classList.remove('cell-active'); });
          this.classList.add('cell-active');
          activeCell = idx;
        });
        cell.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('dragover'); });
        cell.addEventListener('dragleave', function () { this.classList.remove('dragover'); });
        cell.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('dragover'); handleDropGrid(e, idx); });
      })(i);
      grid.appendChild(cell);
    }
  }
  function handleDropGrid(e, cellIdx) {
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image/') === 0) { loadFile(files[i], cellIdx); return; }
      }
      return;
    }
    var html = e.dataTransfer.getData('text/html');
    if (html) { var m = html.match(/src=["']([^"']+)["']/); if (m) { loadURL(m[1], cellIdx); return; } }
    var text = e.dataTransfer.getData('text/plain');
    if (text && /^https?:\/\//.test(text)) loadURL(text, cellIdx);
  }

  // ========== Loaders ==========
  function loadFile(file, cellIdx, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var src = ev.target.result;
      if (mode === 'grid' && cellIdx !== undefined) { cellImages[cellIdx] = src; buildGrid(); }
      if (cb) cb(src);
    };
    reader.readAsDataURL(file);
  }
  function loadURL(url, cellIdx, cb) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      var dataUrl;
      try { dataUrl = c.toDataURL('image/png'); } catch (e) { dataUrl = url; }
      if (mode === 'grid' && cellIdx !== undefined) { cellImages[cellIdx] = dataUrl; buildGrid(); }
      if (cb) cb(dataUrl);
    };
    img.onerror = function () {
      if (mode === 'grid' && cellIdx !== undefined) { cellImages[cellIdx] = url; buildGrid(); }
      if (cb) cb(url);
    };
    img.src = url;
  }

  // ========== Custom — Board Size ==========
  function applyBoardSize() {
    canvasBoard.style.width = boardW + 'px';
    canvasBoard.style.height = boardH + 'px';
    canvasSizeEl.textContent = boardW + ' × ' + boardH;
    saveBoard();
  }
  function setupBoardResize(handle, dir) {
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var startX = e.clientX, startY = e.clientY, startW = boardW, startH = boardH;
      function onMove(ev) {
        if (dir === 'r' || dir === 'rb') boardW = Math.max(200, startW + (ev.clientX - startX));
        if (dir === 'b' || dir === 'rb') boardH = Math.max(200, startH + (ev.clientY - startY));
        applyBoardSize();
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  setupBoardResize(document.getElementById('resizeR'), 'r');
  setupBoardResize(document.getElementById('resizeB'), 'b');
  setupBoardResize(document.getElementById('resizeRB'), 'rb');

  // ========== Custom — Image Pool (右侧面板) ==========
  function computeNextId() {
    nextId = 1;
    imagePool.concat(canvasItems).forEach(function (p) { if (p.id >= nextId) nextId = p.id + 1; });
  }
  function buildPool() {
    var bar = document.getElementById('poolBar');
    bar.innerHTML = '';
    if (!imagePool.length) {
      var empty = document.createElement('div');
      empty.className = 'pool-empty';
      empty.textContent = '粘贴或拖入图片';
      bar.appendChild(empty);
    }
    imagePool.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'pool-item';
      div.draggable = true;
      div.dataset.poolId = item.id;
      var img = document.createElement('img');
      img.src = item.src;
      div.appendChild(img);
      var rm = document.createElement('button');
      rm.className = 'pool-rm';
      rm.textContent = '×';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        imagePool = imagePool.filter(function (p) { return p.id !== item.id; });
        canvasItems = canvasItems.filter(function (c) { return c.poolId !== item.id; });
        buildPool();
        buildCanvasItems();
      });
      div.appendChild(rm);
      div.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', String(item.id));
        e.dataTransfer.effectAllowed = 'copy';
      });
      bar.appendChild(div);
    });
    computeNextId();
  }
  function addToPool(src) {
    var id = nextId++;
    imagePool.push({ id: id, src: src });
    buildPool();
    return id;
  }

  // ========== Custom — Canvas Items ==========
  canvasBoard.addEventListener('dragover', function (e) { e.preventDefault(); });
  canvasBoard.addEventListener('drop', function (e) {
    e.preventDefault();
    var poolId = parseInt(e.dataTransfer.getData('text/plain'));
    if (!poolId) return;
    var poolItem = imagePool.find(function (p) { return p.id === poolId; });
    if (!poolItem) return;
    var rect = canvasBoard.getBoundingClientRect();
    var x = e.clientX - rect.left - 200;
    var y = e.clientY - rect.top - 200;
    var maxZ = canvasItems.reduce(function (m, c) { return Math.max(m, c.z || 0); }, 0);
    canvasItems.push({
      id: nextId++, poolId: poolItem.id, src: poolItem.src,
      x: Math.max(0, x), y: Math.max(0, y), w: 400, h: 400, rot: 0, z: maxZ + 1
    });
    buildCanvasItems();
  });
  canvasBoard.addEventListener('mousedown', function (e) { if (e.target === canvasBoard) selectItem(null); });

  function getSelectedItem() { return canvasItems.find(function (c) { return c.id === selectedItemId; }); }

  function selectItem(id) {
    selectedItemId = id;
    canvasBoard.querySelectorAll('.canvas-item').forEach(function (el) {
      el.classList.toggle('selected', parseInt(el.dataset.itemId) === id);
    });
    updatePropBar();
  }

  function updatePropBar() {
    var item = getSelectedItem();
    if (!item) {
      rpEmpty.style.display = '';
      rpContent.classList.remove('show');
      return;
    }
    rpEmpty.style.display = 'none';
    rpContent.classList.add('show');
    rpPreviewImg.src = item.src;
    propW.value = Math.round(item.w);
    propH.value = Math.round(item.h);
    propRot.textContent = Math.round(item.rot || 0) + '°';
  }

  // 属性输入
  propW.addEventListener('change', function () {
    var item = getSelectedItem(); if (!item) return;
    item.w = Math.max(10, parseInt(this.value) || 10);
    buildCanvasItems(); updatePropBar();
  });
  propH.addEventListener('change', function () {
    var item = getSelectedItem(); if (!item) return;
    item.h = Math.max(10, parseInt(this.value) || 10);
    buildCanvasItems(); updatePropBar();
  });

  // 图层控制
  document.getElementById('propUp').addEventListener('click', function () {
    var item = getSelectedItem(); if (!item) return;
    item.z = (item.z || 0) + 1; buildCanvasItems();
  });
  document.getElementById('propDown').addEventListener('click', function () {
    var item = getSelectedItem(); if (!item) return;
    item.z = Math.max(0, (item.z || 0) - 1); buildCanvasItems();
  });
  document.getElementById('propTop').addEventListener('click', function () {
    var item = getSelectedItem(); if (!item) return;
    var maxZ = canvasItems.reduce(function (m, c) { return Math.max(m, c.z || 0); }, 0);
    item.z = maxZ + 1; buildCanvasItems();
  });
  document.getElementById('propDelete').addEventListener('click', function () {
    var item = getSelectedItem(); if (!item) return;
    canvasItems = canvasItems.filter(function (c) { return c.id !== item.id; });
    selectedItemId = null;
    buildCanvasItems(); updatePropBar();
  });

  function buildCanvasItems() {
    canvasBoard.querySelectorAll('.canvas-item').forEach(function (el) { el.remove(); });
    var sorted = canvasItems.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    sorted.forEach(function (item) {
      var div = document.createElement('div');
      div.className = 'canvas-item' + (item.id === selectedItemId ? ' selected' : '');
      div.dataset.itemId = item.id;
      div.style.left = item.x + 'px';
      div.style.top = item.y + 'px';
      div.style.width = item.w + 'px';
      div.style.height = item.h + 'px';
      div.style.zIndex = (item.z || 0) + 1;
      div.style.transform = 'rotate(' + (item.rot || 0) + 'deg)';

      var img = document.createElement('img');
      img.src = item.src;
      div.appendChild(img);

      // 删除按钮
      var rm = document.createElement('button');
      rm.className = 'c-rm';
      rm.textContent = '×';
      rm.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        canvasItems = canvasItems.filter(function (c) { return c.id !== item.id; });
        if (selectedItemId === item.id) selectedItemId = null;
        buildCanvasItems(); updatePropBar();
      });
      div.appendChild(rm);

      // 缩放手柄
      var rh = document.createElement('div');
      rh.className = 'c-resize';
      rh.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault(); selectItem(item.id);
        var startX = e.clientX, startY = e.clientY, startW = item.w, startH = item.h;
        var ratio = startW / startH;
        function onMove(ev) {
          var newW = Math.max(30, startW + (ev.clientX - startX));
          var newH = newW / ratio;
          item.w = newW; item.h = newH;
          div.style.width = newW + 'px';
          div.style.height = newH + 'px';
          updatePropBar();
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      div.appendChild(rh);

      // 旋转手柄
      var rotLine = document.createElement('div');
      rotLine.className = 'c-rot-line';
      div.appendChild(rotLine);
      var rotHandle = document.createElement('div');
      rotHandle.className = 'c-rot';
      rotHandle.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault(); selectItem(item.id);
        var boardRect = canvasBoard.getBoundingClientRect();
        var cx = boardRect.left + item.x + item.w / 2;
        var cy = boardRect.top + item.y + item.h / 2;
        function onMove(ev) {
          var angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90;
          item.rot = Math.round(angle);
          div.style.transform = 'rotate(' + item.rot + 'deg)';
          updatePropBar();
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      div.appendChild(rotHandle);

      // 拖动移动
      div.addEventListener('mousedown', function (e) {
        if (e.target.classList.contains('c-rm') || e.target.classList.contains('c-resize') ||
            e.target.classList.contains('c-rot') || e.target.classList.contains('c-rot-line')) return;
        e.preventDefault(); selectItem(item.id);
        var startX = e.clientX, startY = e.clientY, origX = item.x, origY = item.y;
        function onMove(ev) {
          item.x = origX + (ev.clientX - startX);
          item.y = origY + (ev.clientY - startY);
          div.style.left = item.x + 'px';
          div.style.top = item.y + 'px';
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      canvasBoard.appendChild(div);
    });
  }

  // ========== Paste ==========
  document.addEventListener('paste', function (e) {
    if (mode === 'grid') {
      var target = activeCell;
      if (target < 0) { showToast('请先将鼠标移到目标格子', 'err'); return; }
      var items = e.clipboardData && e.clipboardData.items;
      if (items) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            e.preventDefault();
            loadFile(items[i].getAsFile(), target);
            return;
          }
        }
      }
      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text && /^https?:\/\//.test(text)) { e.preventDefault(); loadURL(text, target); }
    } else {
      var items2 = e.clipboardData && e.clipboardData.items;
      if (items2) {
        for (var j = 0; j < items2.length; j++) {
          if (items2[j].type.indexOf('image/') === 0) {
            e.preventDefault();
            loadFile(items2[j].getAsFile(), undefined, function (src) { addToPool(src); });
            return;
          }
        }
      }
      var text2 = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text2 && /^https?:\/\//.test(text2)) {
        e.preventDefault();
        loadURL(text2, undefined, function (src) { addToPool(src); });
      }
    }
  });

  // ========== Batch Paste ==========
  document.getElementById('btnPasteUrl').addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) { doBatchFill(text); }).catch(function () { showToast('无法读取剪贴板', 'err'); });
    } else { showToast('浏览器不支持自动读取剪贴板', 'err'); }
  });
  function doBatchFill(text) {
    text = (text || '').trim();
    if (!text) { showToast('剪贴板为空', 'err'); return; }
    var urls = text.split(/[\r\n]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s && /^https?:\/\//i.test(s); });
    if (urls.length === 0) { showToast('剪贴板中未识别到图片地址', 'err'); return; }
    if (mode === 'grid') {
      var g = getGrid(), total = g.cols * g.rows, emptyCells = [];
      for (var i = 0; i < total; i++) { if (!cellImages[i]) emptyCells.push(i); }
      var fillCount = Math.min(urls.length, emptyCells.length);
      if (fillCount === 0) { showToast('所有格子已满', 'err'); return; }
      showToast('正在加载 ' + fillCount + ' 张图片...', 'ok');
      var loaded = 0;
      for (var j = 0; j < fillCount; j++) {
        (function (idx, url) {
          loadURL(url, idx, function () {
            loaded++;
            if (loaded >= fillCount) showToast('已填充 ' + fillCount + ' 张图片', 'ok');
          });
        })(emptyCells[j], urls[j]);
      }
    } else {
      showToast('正在加载 ' + urls.length + ' 张图片...', 'ok');
      var loaded2 = 0;
      urls.forEach(function (url) {
        loadURL(url, undefined, function (src) {
          addToPool(src);
          loaded2++;
          if (loaded2 >= urls.length) showToast('已添加 ' + urls.length + ' 张图片', 'ok');
        });
      });
    }
  }

  // ========== Preview ==========
  var previewMask = document.getElementById('previewMask');
  var previewImg = document.getElementById('previewImg');
  document.getElementById('btnPreview').addEventListener('click', function () {
    if (mode === 'grid') {
      var g = getGrid(), total = g.cols * g.rows;
      var hasAny = false;
      for (var k in cellImages) { hasAny = true; break; }
      if (!hasAny) { showToast('请先添加图片', 'err'); return; }
      renderGridCanvas(g, total, function (canvas) {
        previewImg.src = canvas.toDataURL('image/png');
        previewMask.classList.add('show');
      });
    } else {
      if (!canvasItems.length) { showToast('请先添加图片到画布', 'err'); return; }
      renderCustomCanvas(function (canvas) {
        previewImg.src = canvas.toDataURL('image/png');
        previewMask.classList.add('show');
      });
    }
  });
  document.getElementById('previewClose').addEventListener('click', function () { previewMask.classList.remove('show'); });
  previewMask.addEventListener('click', function (e) { if (e.target === previewMask) previewMask.classList.remove('show'); });

  // ========== Clear ==========
  document.getElementById('btnClear').addEventListener('click', function () {
    if (mode === 'grid') { cellImages = {}; activeCell = -1; buildGrid(); }
    else { imagePool = []; canvasItems = []; selectedItemId = null; buildPool(); buildCanvasItems(); updatePropBar(); }
  });

  // ========== Export ==========
  document.getElementById('btnExport').addEventListener('click', function () {
    if (mode === 'grid') {
      var g = getGrid(), total = g.cols * g.rows;
      var hasAny = false;
      for (var k in cellImages) { hasAny = true; break; }
      if (!hasAny) { showToast('请先添加图片', 'err'); return; }
      renderGridCanvas(g, total, function (canvas) { downloadCanvas(canvas); });
    } else {
      if (!canvasItems.length) { showToast('请先添加图片到画布', 'err'); return; }
      renderCustomCanvas(function (canvas) { downloadCanvas(canvas); });
    }
  });
  function downloadCanvas(canvas) {
    try {
      var a = document.createElement('a');
      a.download = 'collage_' + Date.now() + '.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('导出成功!', 'ok');
    } catch (e) { showToast('导出失败: ' + e.message, 'err'); }
  }

  // ========== Render — Grid ==========
  function renderGridCanvas(g, total, onDone) {
    var cellSize = 600, gap = 12, pad = 16;
    var cw = pad * 2 + g.cols * cellSize + (g.cols - 1) * gap;
    var ch = pad * 2 + g.rows * cellSize + (g.rows - 1) * gap;
    var canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    var loaded = 0, needed = 0;
    for (var i = 0; i < total; i++) { if (cellImages[i]) needed++; }
    if (needed === 0) { onDone(canvas); return; }
    function done() { loaded++; if (loaded >= needed) onDone(canvas); }
    function drawImg(idx, img) {
      var col = idx % g.cols, row = Math.floor(idx / g.cols);
      var x = pad + col * (cellSize + gap), y = pad + row * (cellSize + gap);
      if (fitMode === 'fill') {
        ctx.drawImage(img, x, y, cellSize, cellSize);
      } else if (fitMode === 'contain') {
        var sc = Math.min(cellSize / img.width, cellSize / img.height);
        var w = img.width * sc, h = img.height * sc;
        ctx.drawImage(img, x + (cellSize - w) / 2, y + (cellSize - h) / 2, w, h);
      } else {
        var sc2 = Math.max(cellSize / img.width, cellSize / img.height);
        var w2 = img.width * sc2, h2 = img.height * sc2;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, cellSize, cellSize); ctx.clip();
        ctx.drawImage(img, x + (cellSize - w2) / 2, y + (cellSize - h2) / 2, w2, h2);
        ctx.restore();
      }
    }
    for (var j = 0; j < total; j++) {
      if (!cellImages[j]) continue;
      (function (idx) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { drawImg(idx, img); done(); };
        img.onerror = function () { done(); };
        img.src = cellImages[idx];
      })(j);
    }
  }

  // ========== Render — Custom ==========
  function renderCustomCanvas(onDone) {
    var canvas = document.createElement('canvas');
    canvas.width = boardW; canvas.height = boardH;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, boardW, boardH);
    var sorted = canvasItems.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    var loaded = 0, needed = sorted.length;
    if (needed === 0) { onDone(canvas); return; }
    function done() { loaded++; if (loaded >= needed) onDone(canvas); }
    sorted.forEach(function (item) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        ctx.save();
        var cx = item.x + item.w / 2, cy = item.y + item.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate((item.rot || 0) * Math.PI / 180);
        ctx.drawImage(img, -item.w / 2, -item.h / 2, item.w, item.h);
        ctx.restore();
        done();
      };
      img.onerror = function () { done(); };
      img.src = item.src;
    });
  }

  // ========== Init ==========
  applyMode();
})();
