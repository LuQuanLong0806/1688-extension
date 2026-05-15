(function () {
  var GRID_KEY = '__dxm_collage_grid';
  var FIT_KEY = '__dxm_collage_fit';
  var MODE_KEY = '__dxm_collage_mode';
  var BOARD_KEY = '__dxm_collage_board';
  var SERVER_KEY = '__dxm_collage_server';
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
  var cellImages = {};
  var imagePool = [];
  var canvasItems = [];
  var boardW = 800, boardH = 800;
  try { var sb = JSON.parse(localStorage.getItem(BOARD_KEY)); if (sb && sb.w > 0 && sb.h > 0) { boardW = sb.w; boardH = sb.h; } } catch (e) {}

  var activeCell = -1;
  var nextId = 1;
  var selectedItemId = null;
  var selectedPoolId = null;

  var serverBase = '';
  try { serverBase = localStorage.getItem(SERVER_KEY) || ''; } catch (e) {}

  // ========== Toast ==========
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type || 'ok') + ' show';
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  // ========== Save settings ==========
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
  var btnEditImage = document.getElementById('btnEditImage');
  var editHint = document.getElementById('editHint');

  // ========== Helpers ==========
  function getServerBase() {
    if (serverBase) return serverBase;
    return 'http://localhost:3000';
  }

  function urlToBase64(url) {
    return new Promise(function (resolve, reject) {
      if (url.indexOf('data:') === 0) { resolve(url); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = function () { reject(new Error('图片加载失败')); };
      img.src = url;
    });
  }

  // ========== Mode Switch ==========
  function applyMode() {
    modeGrid.classList.toggle('active', mode === 'grid');
    modeCustom.classList.toggle('active', mode === 'custom');
    gridArea.style.display = mode === 'grid' ? '' : 'none';
    customArea.classList.toggle('show', mode === 'custom');
    document.querySelectorAll('.grid-only').forEach(function (el) {
      el.style.display = mode === 'grid' ? '' : 'none';
    });
    document.querySelectorAll('.custom-only').forEach(function (el) {
      el.style.display = mode === 'custom' ? '' : 'none';
    });
    buildPool();
    if (mode === 'grid') { buildGrid(); }
    else { applyBoardSize(); buildCanvasItems(); updatePropBar(); }
    saveMode();
  }
  modeGrid.addEventListener('click', function () { mode = 'grid'; applyMode(); });
  modeCustom.addEventListener('click', function () { mode = 'custom'; applyMode(); });

  // ========== Grid Options ==========
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
          selectedPoolId = null;
          clearPoolSelection();
          updatePropBar();
          updateEditBtn();
        });
        cell.addEventListener('dragover', function (e) { e.preventDefault(); this.classList.add('dragover'); });
        cell.addEventListener('dragleave', function () { this.classList.remove('dragover'); });
        cell.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); this.classList.remove('dragover'); handleDropGrid(e, idx); });
      })(i);
      grid.appendChild(cell);
    }
  }
  function handleDropGrid(e, cellIdx) {
    var poolId = parseInt(e.dataTransfer.getData('text/plain'));
    if (poolId) {
      var poolItem = imagePool.find(function (p) { return p.id === poolId; });
      if (poolItem) { cellImages[cellIdx] = poolItem.src; buildGrid(); return; }
    }
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

  // ========== Custom — Image Pool ==========
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
      div.className = 'pool-item' + (item.id === selectedPoolId ? ' active' : '');
      div.draggable = true;
      div.dataset.poolId = item.id;
      var img = document.createElement('img');
      img.src = item.src;
      div.appendChild(img);
      var ck = document.createElement('div');
      ck.className = 'pool-check';
      ck.addEventListener('click', function (e) {
        e.stopPropagation();
        ck.classList.toggle('checked');
        updatePoolDelBtn();
      });
      div.appendChild(ck);
      var onCanvas = canvasItems.some(function (c) { return c.poolId === item.id; });
      if (onCanvas) div.classList.add('on-canvas');
      var rm = document.createElement('button');
      rm.className = 'pool-rm';
      rm.textContent = '×';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        imagePool = imagePool.filter(function (p) { return p.id !== item.id; });
        canvasItems = canvasItems.filter(function (c) { return c.poolId !== item.id; });
        if (selectedPoolId === item.id) selectedPoolId = null;
        buildPool();
        if (mode === 'custom') buildCanvasItems();
        updatePropBar(); updateEditBtn();
      });
      div.appendChild(rm);
      div.addEventListener('click', function (e) {
        if (e.target.classList.contains('pool-check') || e.target.classList.contains('pool-rm')) return;
        selectPoolItem(item.id);
      });
      div.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', String(item.id));
        e.dataTransfer.effectAllowed = 'copyMove';
        div.classList.add('pool-dragging');
      });
      div.addEventListener('dragend', function () {
        div.classList.remove('pool-dragging');
        bar.querySelectorAll('.pool-item').forEach(function (p) { p.classList.remove('pool-drop-before', 'pool-drop-after'); });
      });
      div.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        bar.querySelectorAll('.pool-item').forEach(function (p) { p.classList.remove('pool-drop-before', 'pool-drop-after'); });
        var rect = div.getBoundingClientRect();
        var mid = rect.left + rect.width / 2;
        if (e.clientX < mid) div.classList.add('pool-drop-before');
        else div.classList.add('pool-drop-after');
      });
      div.addEventListener('dragleave', function () {
        div.classList.remove('pool-drop-before', 'pool-drop-after');
      });
      div.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        bar.querySelectorAll('.pool-item').forEach(function (p) { p.classList.remove('pool-drop-before', 'pool-drop-after'); });
        var dragId = parseInt(e.dataTransfer.getData('text/plain'));
        if (!dragId || dragId === item.id) return;
        var fromIdx = imagePool.findIndex(function (p) { return p.id === dragId; });
        var toIdx = imagePool.findIndex(function (p) { return p.id === item.id; });
        if (fromIdx < 0 || toIdx < 0) return;
        var rect = div.getBoundingClientRect();
        var mid = rect.left + rect.width / 2;
        var [moved] = imagePool.splice(fromIdx, 1);
        var insertIdx = imagePool.findIndex(function (p) { return p.id === item.id; });
        if (e.clientX >= mid) insertIdx++;
        imagePool.splice(insertIdx, 0, moved);
        buildPool();
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
  var canvasArea = document.querySelector('.canvas-area');
  if (canvasArea) {
    canvasArea.addEventListener('mousedown', function (e) {
      if (!e.target.closest('.canvas-item') && !e.target.closest('.canvas-text-item') &&
          !e.target.closest('.board-resize')) {
        selectItem(null);
      }
    });
  }

  function getSelectedItem() { return canvasItems.find(function (c) { return c.id === selectedItemId; }); }

  function selectPoolItem(poolId) {
    selectedPoolId = poolId;
    selectedItemId = null;
    activeCell = -1;
    document.querySelectorAll('.cell').forEach(function (c) { c.classList.remove('cell-active'); });
    canvasBoard.querySelectorAll('.canvas-item,.canvas-text-item').forEach(function (el) { el.classList.remove('selected'); });
    buildPool();
    updatePropBar();
    updateEditBtn();
  }

  function clearPoolSelection() {
    selectedPoolId = null;
    document.querySelectorAll('.pool-item').forEach(function (el) { el.classList.remove('active'); });
  }

  function selectItem(id) {
    selectedItemId = id;
    selectedPoolId = null;
    activeCell = -1;
    clearPoolSelection();
    canvasBoard.querySelectorAll('.canvas-item,.canvas-text-item').forEach(function (el) {
      var itemId = parseInt(el.dataset.itemId);
      var isSel = itemId === id;
      el.classList.toggle('selected', isSel);
      var item = canvasItems.find(function (c) { return c.id === itemId; });
      if (item) el.style.zIndex = isSel ? 9999 : (item.z || 0) + 1;
    });
    updatePropBar();
    updateEditBtn();
  }

  function updatePropBar() {
    var src = getSelectedImageSrc();
    if (!src) {
      rpEmpty.style.display = '';
      rpContent.classList.remove('show');
      return;
    }
    rpEmpty.style.display = 'none';
    rpContent.classList.add('show');
    rpPreviewImg.src = src;
    var item = getSelectedItem();
    if (item && item.type !== 'text') {
      propW.value = Math.round(item.w);
      propH.value = Math.round(item.h);
      propRot.textContent = Math.round(item.rot || 0) + '°';
    }
  }

  function updateEditBtn() {
    var hasAny = imagePool.length > 0 || Object.keys(cellImages).length > 0 || canvasItems.some(function (c) { return c.src && c.type !== 'text'; });
    btnEditImage.disabled = !hasAny;
    editHint.style.display = hasAny ? 'none' : '';
  }

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
    if (selectedPoolId) {
      imagePool = imagePool.filter(function (p) { return p.id !== selectedPoolId; });
      canvasItems = canvasItems.filter(function (c) { return c.poolId !== selectedPoolId; });
      selectedPoolId = null;
      buildPool();
      if (mode === 'custom') buildCanvasItems();
      updatePropBar(); updateEditBtn();
      return;
    }
    var item = getSelectedItem(); if (!item) return;
    canvasItems = canvasItems.filter(function (c) { return c.id !== item.id; });
    selectedItemId = null;
    buildCanvasItems(); updatePropBar(); updateEditBtn();
  });

  function buildCanvasItems() {
    canvasBoard.querySelectorAll('.canvas-item,.canvas-text-item').forEach(function (el) { el.remove(); });
    var sorted = canvasItems.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    sorted.forEach(function (item) {
      if (item.type === 'text') {
        buildTextElement(item);
      } else {
        buildImageElement(item);
      }
    });
  }

  function buildImageElement(item) {
    var isSelected = item.id === selectedItemId;
    var div = document.createElement('div');
    div.className = 'canvas-item' + (isSelected ? ' selected' : '');
    div.dataset.itemId = item.id;
    div.style.left = item.x + 'px';
    div.style.top = item.y + 'px';
    div.style.width = item.w + 'px';
    div.style.height = item.h + 'px';
    div.style.zIndex = isSelected ? 9999 : (item.z || 0) + 1;
    div.style.transform = 'rotate(' + (item.rot || 0) + 'deg)';

    var img = document.createElement('img');
    img.src = item.src;
    div.appendChild(img);

    var rm = document.createElement('button');
    rm.className = 'c-rm';
    rm.textContent = '×';
    rm.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      canvasItems = canvasItems.filter(function (c) { return c.id !== item.id; });
      if (selectedItemId === item.id) selectedItemId = null;
      buildCanvasItems(); updatePropBar(); updateEditBtn();
    });
    div.appendChild(rm);

    ['tl','tr','bl','br'].forEach(function (corner) {
      var handle = document.createElement('div');
      handle.className = 'c-resize c-resize-' + corner;
      handle.addEventListener('mousedown', function (e) {
        e.stopPropagation(); e.preventDefault(); selectItem(item.id);
        var startX = e.clientX, startY = e.clientY;
        var startW = item.w, startH = item.h, startXPos = item.x, startYPos = item.y;
        var ratio = startW / startH;
        function onMove(ev) {
          var dx = ev.clientX - startX, dy = ev.clientY - startY;
          var newW, newH, newX, newY;
          if (corner === 'br') {
            newW = Math.max(30, startW + dx); newH = newW / ratio; newX = startXPos; newY = startYPos;
          } else if (corner === 'bl') {
            newW = Math.max(30, startW - dx); newH = newW / ratio; newX = startXPos + startW - newW; newY = startYPos;
          } else if (corner === 'tr') {
            newW = Math.max(30, startW + dx); newH = newW / ratio; newX = startXPos; newY = startYPos + startH - newH;
          } else {
            newW = Math.max(30, startW - dx); newH = newW / ratio; newX = startXPos + startW - newW; newY = startYPos + startH - newH;
          }
          item.w = newW; item.h = newH; item.x = newX; item.y = newY;
          div.style.width = newW + 'px'; div.style.height = newH + 'px';
          div.style.left = newX + 'px'; div.style.top = newY + 'px';
          updatePropBar();
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      div.appendChild(handle);
    });

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
  }

  function buildTextElement(item) {
    var div = document.createElement('div');
    div.className = 'canvas-text-item' + (item.id === selectedItemId ? ' selected' : '');
    div.dataset.itemId = item.id;
    div.style.left = item.x + 'px';
    div.style.top = item.y + 'px';
    div.style.zIndex = (item.z || 0) + 1;
    div.style.transform = 'rotate(' + (item.rot || 0) + 'deg)';

    var textDiv = document.createElement('div');
    textDiv.className = 'text-content';
    textDiv.textContent = item.text || '文字';
    textDiv.style.fontSize = (item.fontSize || 24) + 'px';
    textDiv.style.color = item.color || '#ffffff';
    textDiv.style.fontWeight = 'bold';
    textDiv.contentEditable = true;

    textDiv.addEventListener('blur', function () {
      item.text = this.textContent || '文字';
    });

    textDiv.addEventListener('mousedown', function (e) {
      if (document.activeElement === this) { e.stopPropagation(); }
    });

    div.appendChild(textDiv);

    var rm = document.createElement('button');
    rm.className = 'c-rm';
    rm.textContent = '×';
    rm.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      canvasItems = canvasItems.filter(function (c) { return c.id !== item.id; });
      if (selectedItemId === item.id) selectedItemId = null;
      buildCanvasItems(); updatePropBar(); updateEditBtn();
    });
    div.appendChild(rm);

    div.addEventListener('mousedown', function (e) {
      if (e.target.classList.contains('c-rm') || e.target === textDiv) return;
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
  }

  // ========== Paste ==========
  document.addEventListener('paste', function (e) {
    if (mode === 'grid') {
      var items = e.clipboardData && e.clipboardData.items;
      if (items) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image/') === 0) {
            e.preventDefault();
            loadFile(items[i].getAsFile(), undefined, function (src) {
              addToPool(src);
              if (activeCell >= 0) { cellImages[activeCell] = src; buildGrid(); }
            });
            return;
          }
        }
      }
      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text && /^https?:\/\//.test(text)) {
        e.preventDefault();
        loadURL(text, undefined, function (src) {
          addToPool(src);
          if (activeCell >= 0) { cellImages[activeCell] = src; buildGrid(); }
        });
      }
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
      var g = getGrid(), total = g.cols * g.rows;
      showToast('正在加载 ' + urls.length + ' 张图片...', 'ok');
      var loaded = 0;
      urls.forEach(function (url, i) {
        loadURL(url, undefined, function (src) {
          addToPool(src);
          if (i < total) { cellImages[i] = src; }
          loaded++;
          if (loaded >= urls.length) {
            buildGrid();
            showToast('已加载 ' + urls.length + ' 张图片', 'ok');
          }
        });
      });
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
    if (mode === 'custom') selectItem(null);
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
    else { canvasItems = []; selectedItemId = null; buildCanvasItems(); }
    selectedPoolId = null; buildPool(); updatePropBar(); updateEditBtn();
  });

  // ========== 生成拼图（生成图片并push到图片列表）==========
  document.getElementById('btnGenCollage').addEventListener('click', function () {
    if (mode === 'grid') {
      var g = getGrid(), total = g.cols * g.rows;
      var hasAny = false;
      for (var k in cellImages) { hasAny = true; break; }
      if (!hasAny) { showToast('请先添加图片', 'err'); return; }
      renderGridCanvas(g, total, function (canvas) {
        addToPool(canvas.toDataURL('image/png'));
        showToast('拼图已生成并添加到图片列表', 'ok');
      });
    } else {
      if (!canvasItems.length) { showToast('请先添加图片到画布', 'err'); return; }
      renderCustomCanvas(function (canvas) {
        addToPool(canvas.toDataURL('image/png'));
        showToast('拼图已生成并添加到图片列表', 'ok');
      });
    }
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

  // ========== 全选/取消 ==========
  document.getElementById('poolToggleAll').addEventListener('click', function () {
    var checks = document.querySelectorAll('.pool-check');
    var allChecked = true;
    checks.forEach(function (c) { if (!c.classList.contains('checked')) allChecked = false; });
    checks.forEach(function (c) {
      if (allChecked) c.classList.remove('checked');
      else c.classList.add('checked');
    });
    updatePoolDelBtn();
  });

  function updatePoolDelBtn() {
    var btn = document.getElementById('poolDelSel');
    if (!btn) return;
    var hasChecked = document.querySelector('.pool-check.checked');
    btn.style.display = hasChecked ? '' : 'none';
  }

  // ========== 删除选中 ==========
  document.getElementById('poolDelSel').addEventListener('click', function () {
    var ids = [];
    document.querySelectorAll('.pool-check.checked').forEach(function (ck) {
      ids.push(parseInt(ck.parentElement.dataset.poolId));
    });
    if (!ids.length) return;
    ids.forEach(function (pid) {
      imagePool = imagePool.filter(function (p) { return p.id !== pid; });
      canvasItems = canvasItems.filter(function (c) { return c.poolId !== pid; });
    });
    buildPool();
    renderCanvas();
    updatePoolDelBtn();
  });

  // ========== 清空列表 ==========
  document.getElementById('poolClear').addEventListener('click', function () {
    if (!imagePool.length) return;
    imagePool = [];
    canvasItems = [];
    buildPool();
    renderCanvas();
    updatePoolDelBtn();
  });

  // ========== 一键拼图 — 排版选项 ==========
  document.getElementById('autoLayoutOpts').addEventListener('click', function (e) {
    var btn = e.target.closest('.al-opt');
    if (!btn) return;
    this.querySelectorAll('.al-opt').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
  });

  // ========== 一键拼图（自定义模式自动排版）==========
  document.getElementById('btnAutoLayout').addEventListener('click', function () {
    // 收集勾选的图片
    var checkedItems = [];
    document.querySelectorAll('.pool-check.checked').forEach(function (ck) {
      var poolId = parseInt(ck.parentElement.dataset.poolId);
      var p = imagePool.find(function (p) { return p.id === poolId; });
      if (p) checkedItems.push(p);
    });

    // 收集已在画布中的图片（通过 poolId）
    var canvasPoolIds = [];
    canvasItems.forEach(function (c) {
      if (c.poolId && canvasPoolIds.indexOf(c.poolId) === -1) canvasPoolIds.push(c.poolId);
    });
    var canvasItems_list = canvasPoolIds.map(function (pid) {
      return imagePool.find(function (p) { return p.id === pid; });
    }).filter(Boolean);

    // 确定排版图片：勾选 > 已在画布 > 全部
    var images;
    if (checkedItems.length > 0) {
      images = checkedItems;
    } else if (canvasItems_list.length > 0) {
      images = canvasItems_list;
    } else {
      images = imagePool.slice();
    }

    if (!images.length) { showToast('没有可排版的图片', 'err'); return; }

    // 移除画布中这些图片的旧位置
    var imgIds = images.map(function (img) { return img.id; });
    canvasItems = canvasItems.filter(function (c) {
      return !c.poolId || imgIds.indexOf(c.poolId) === -1;
    });

    // 读取排版选项
    var activeOpt = document.querySelector('.al-opt.active');
    var selCols = parseInt(activeOpt.dataset.cols) || 0;
    var selRows = parseInt(activeOpt.dataset.rows) || 0;
    var n = images.length;

    // 计算布局
    var cols, rows;
    if (selCols > 0 && selRows > 0) {
      cols = selCols;
      rows = selRows;
    } else {
      var ratio = boardW / boardH;
      cols = Math.ceil(Math.sqrt(n * ratio));
      rows = Math.ceil(n / cols);
    }

    var gap = 4;
    var cellW = (boardW - gap * (cols + 1)) / cols;
    var cellH = (boardH - gap * (rows + 1)) / rows;

    // 排列图片（只排n张，不填满多余格子）
    var maxZ = canvasItems.reduce(function (m, c) { return Math.max(m, c.z || 0); }, 0);
    var count = Math.min(n, cols * rows);
    for (var idx = 0; idx < count; idx++) {
      var col = idx % cols;
      var row = Math.floor(idx / cols);
      canvasItems.push({
        id: nextId++,
        poolId: images[idx].id,
        src: images[idx].src,
        x: Math.round(gap + col * (cellW + gap)),
        y: Math.round(gap + row * (cellH + gap)),
        w: Math.round(cellW),
        h: Math.round(cellH),
        rot: 0,
        z: maxZ + idx + 1
      });
    }

    buildCanvasItems();
    buildPool();
    showToast('已排版 ' + count + ' 张图片', 'ok');
  });

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
    var loaded = 0, needed = 0;
    sorted.forEach(function (item) { if (item.type !== 'text') needed++; });
    var textItems = sorted.filter(function (item) { return item.type === 'text'; });

    function drawTexts() {
      textItems.forEach(function (item) {
        ctx.save();
        var cx = item.x + 100, cy = item.y + 20;
        ctx.translate(cx, cy);
        ctx.rotate((item.rot || 0) * Math.PI / 180);
        ctx.font = 'bold ' + (item.fontSize || 24) + 'px "Microsoft YaHei", Arial, sans-serif';
        ctx.fillStyle = item.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text || '文字', 0, 0);
        ctx.restore();
      });
    }

    if (needed === 0) { drawTexts(); onDone(canvas); return; }
    function done() { loaded++; if (loaded >= needed) { drawTexts(); onDone(canvas); } }
    sorted.forEach(function (item) {
      if (item.type === 'text') return;
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

  // ========== Selected image helpers ==========
  function getSelectedImageSrc() {
    if (selectedPoolId) {
      var poolItem = imagePool.find(function (p) { return p.id === selectedPoolId; });
      if (poolItem) return poolItem.src;
    }
    if (mode === 'grid' && activeCell >= 0 && cellImages[activeCell]) {
      return cellImages[activeCell];
    }
    if (mode === 'custom') {
      var item = getSelectedItem();
      if (item && item.src) return item.src;
    }
    return null;
  }

  function updateSelectedImage(newSrc) {
    if (selectedPoolId) {
      var poolItem = imagePool.find(function (p) { return p.id === selectedPoolId; });
      if (poolItem) {
        poolItem.src = newSrc;
        canvasItems.forEach(function (c) {
          if (c.poolId === poolItem.id) c.src = newSrc;
        });
        buildPool();
        if (mode === 'custom') buildCanvasItems();
        updatePropBar();
        return;
      }
    }
    if (mode === 'grid' && activeCell >= 0) {
      cellImages[activeCell] = newSrc;
      buildGrid();
    } else if (mode === 'custom') {
      var item = getSelectedItem();
      if (item && item.src) {
        item.src = newSrc;
        imagePool.forEach(function (p) {
          if (p.id === item.poolId) p.src = newSrc;
        });
        buildCanvasItems();
        updatePropBar();
      }
    }
  }

  // ========== 文字工具 ==========
  var fontSizeRange = document.getElementById('fontSizeRange');
  var fontSizeVal = document.getElementById('fontSizeVal');
  fontSizeRange.addEventListener('input', function () { fontSizeVal.textContent = this.value; });

  document.getElementById('btnAddText').addEventListener('click', function () {
    if (mode !== 'custom') { showToast('仅自定义模式可用', 'err'); return; }
    var text = document.getElementById('textContent').value.trim();
    if (!text) { showToast('请输入文字内容', 'err'); return; }
    var fontSize = parseInt(fontSizeRange.value) || 24;
    var color = document.getElementById('textColor').value || '#ffffff';
    var maxZ = canvasItems.reduce(function (m, c) { return Math.max(m, c.z || 0); }, 0);
    canvasItems.push({
      id: nextId++, type: 'text', text: text, fontSize: fontSize, color: color,
      x: boardW / 2 - 100, y: boardH / 2 - 20, rot: 0, z: maxZ + 1
    });
    buildCanvasItems();
    showToast('文字已添加', 'ok');
  });

  // ========== AI 文生图 (hidden but functional) ==========
  var aiProcessing = document.getElementById('aiProcessing');
  var aiProcessText = document.getElementById('aiProcessText');

  function showAiLoading(text) {
    aiProcessText.textContent = text || 'AI处理中...';
    aiProcessing.style.display = '';
  }
  function hideAiLoading() {
    aiProcessing.style.display = 'none';
  }

  document.getElementById('btnAiGen').addEventListener('click', function () {
    var prompt = document.getElementById('aiPrompt').value.trim();
    if (!prompt) { showToast('请输入图片描述', 'err'); return; }
    showAiLoading('AI 文生图中...');
    fetch(getServerBase() + '/api/ai/text-to-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt, size: '1024x1024' })
    }).then(function (res) { return res.json(); }).then(function (data) {
      hideAiLoading();
      if (data.error) { showToast(data.error, 'err'); return; }
      var newUrl = data.url;
      if (newUrl && !newUrl.startsWith('data:')) {
        newUrl = getServerBase() + newUrl;
      }
      if (mode === 'custom') {
        urlToBase64(newUrl).then(function (base64) {
          addToPool(base64);
          showToast('AI图片已加入图片池', 'ok');
        });
      } else {
        var g = getGrid(), total = g.cols * g.rows;
        var target = -1;
        for (var i = 0; i < total; i++) { if (!cellImages[i]) { target = i; break; } }
        if (target < 0) {
          urlToBase64(newUrl).then(function (base64) { addToPool(base64); });
          showToast('格子已满，图片已缓存', 'ok');
        } else {
          urlToBase64(newUrl).then(function (base64) {
            cellImages[target] = base64;
            buildGrid();
            showToast('AI图片已填充', 'ok');
          });
        }
      }
    }).catch(function (err) {
      hideAiLoading();
      showToast('AI处理失败: ' + err.message, 'err');
    });
  });

  // ============================================================
  // ========== 图片编辑弹窗 ==========
  // ============================================================

  var editorModal = document.getElementById('editorModal');
  var editorImgCanvas = document.getElementById('editorImgCanvas');
  var editorMaskCanvas = document.getElementById('editorMaskCanvas');
  var editorImgCtx = editorImgCanvas.getContext('2d');
  var editorMaskCtx = editorMaskCanvas.getContext('2d');
  var editorStatus = document.getElementById('editorStatus');
  var editorProcessing = document.getElementById('editorProcessing');
  var editorProcessText = document.getElementById('editorProcessText');
  var editorCenter = document.querySelector('.editor-center');
  var editorCanvasWrap = document.getElementById('editorCanvasWrap');

  // 点击画布外部区域时退出涂抹模式
  document.querySelector('.editor-body').addEventListener('click', function (e) {
    if (!editorDrawMode) return;
    if (editorCenter.contains(e.target)) return;
    exitDrawMode();
  });

  // Filter DOM refs
  var edBright = document.getElementById('edBright');
  var edContrast = document.getElementById('edContrast');
  var edSaturate = document.getElementById('edSaturate');
  var edBrightVal = document.getElementById('edBrightVal');
  var edContrastVal = document.getElementById('edContrastVal');
  var edSaturateVal = document.getElementById('edSaturateVal');

  // Editor state — copy-on-edit
  var editorImages = [];   // [{ id, src, originalSrc, type, refId, label }]
  var editorCurrentIdx = 0;
  var editorSrc = null;
  var editorOriginalSrc = null;
  var editorNatW = 0, editorNatH = 0;
  var editorScale = 1;
  var editorDrawMode = '';
  var editorTool = 'brush';
  var editorDrawing = false;
  var editorLastX = 0, editorLastY = 0;
  var editorBoxStart = null;
  var editorMaskSnapshot = null;

  // ===== Editor loading =====
  function showEditorLoading(text) {
    editorProcessText.textContent = text || '处理中...';
    editorProcessing.classList.add('show');
  }
  function hideEditorLoading() {
    editorProcessing.classList.remove('show');
  }

  // ===== Editor undo/redo =====
  var editorHistory = [];
  var editorRedoStack = [];
  var MAX_EDITOR_HISTORY = 30;

  function saveEditorHistory(oldSrc) {
    var src = oldSrc || editorSrc;
    if (!src) return;
    editorHistory.push(src);
    if (editorHistory.length > MAX_EDITOR_HISTORY) editorHistory.shift();
    editorRedoStack = [];
    updateUndoRedoBtns();
  }

  function restoreEditorSrc(src) {
    editorSrc = src;
    var img = new Image();
    img.onload = function () {
      editorNatW = img.naturalWidth;
      editorNatH = img.naturalHeight;
      fitEditorCanvas();
      editorImgCtx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
      editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
      editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
    };
    img.src = src;
  }

  function editorUndo() {
    if (editorHistory.length <= 0) return;
    editorRedoStack.push(editorSrc);
    var prev = editorHistory.pop();
    restoreEditorSrc(prev);
    updateUndoRedoBtns();
  }

  function editorRedo() {
    if (!editorRedoStack.length) return;
    editorHistory.push(editorSrc);
    var next = editorRedoStack.pop();
    restoreEditorSrc(next);
    updateUndoRedoBtns();
  }

  function updateUndoRedoBtns() {
    var undoBtn = document.getElementById('edUndo');
    var redoBtn = document.getElementById('edRedo');
    if (undoBtn) undoBtn.disabled = editorHistory.length <= 0;
    if (redoBtn) redoBtn.disabled = !editorRedoStack.length;
  }

  document.getElementById('edUndo').addEventListener('click', editorUndo);
  document.getElementById('edRedo').addEventListener('click', editorRedo);

  // Keyboard shortcuts
  document.addEventListener('keydown', function (e) {
    if (!editorModal.classList.contains('show')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); editorUndo(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); editorRedo(); }
  });

  // ===== Open editor — collect all images =====
  btnEditImage.addEventListener('click', function () {
    var src = getSelectedImageSrc();
    openEditor(src);
  });

  function openEditor(selectedSrc) {
    var images = [];
    var srcSet = {};
    imagePool.forEach(function (p) {
      images.push({ id: 'p-' + p.id, src: p.src, originalSrc: p.src, type: 'pool', refId: p.id, label: '图片池 #' + p.id });
      srcSet[p.src] = true;
    });
    if (mode === 'grid') {
      for (var k in cellImages) {
        if (!srcSet[cellImages[k]]) {
          images.push({ id: 'c-' + k, src: cellImages[k], originalSrc: cellImages[k], type: 'cell', refId: parseInt(k), label: '格子 ' + (parseInt(k) + 1) });
        }
      }
    }
    if (mode === 'custom') {
      canvasItems.forEach(function (c) {
        if (c.src && c.type !== 'text' && !srcSet[c.src]) {
          images.push({ id: 'cv-' + c.id, src: c.src, originalSrc: c.src, type: 'canvas', refId: c.id, label: '画布 #' + c.id });
        }
      });
    }
    if (!images.length) { showToast('没有可编辑的图片', 'err'); return; }

    var startIdx = 0;
    if (selectedSrc) {
      for (var i = 0; i < images.length; i++) {
        if (images[i].src === selectedSrc) { startIdx = i; break; }
      }
    }

    editorImages = images;
    editorCurrentIdx = startIdx;
    editorDrawMode = '';
    editorTool = 'brush';
    editorHistory = [];
    editorRedoStack = [];
    editorMaskCanvas.classList.remove('show');
    // Reset tool button states to match editorTool='brush'
    resetToolButtons();

    loadEditorImage(startIdx);
    buildEditorImageList();
    applyFloatPos();
    editorModal.classList.add('show');
  }

  function resetToolButtons() {
    var eb = document.getElementById('edEraseBrush');
    var ebox = document.getElementById('edEraseBox');
    var mb = document.getElementById('edMosBrush');
    var mbox = document.getElementById('edMosBox');
    if (eb) { eb.classList.add('active'); }
    if (ebox) { ebox.classList.remove('active'); }
    if (mb) { mb.classList.add('active'); }
    if (mbox) { mbox.classList.remove('active'); }
    // Top toolbar buttons
    updateTopToolbar();
  }

  function updateTopToolbar() {
    var bar = document.getElementById('edFloatBtns');
    if (!bar) return;
    bar.querySelectorAll('.ed-float-btn').forEach(function (btn) {
      var action = btn.dataset.btnId;
      var isActive = false;
      if (action === 'eraseBrush') isActive = (editorTool === 'brush' && editorDrawMode === 'erase');
      else if (action === 'eraseBox') isActive = (editorTool === 'box' && editorDrawMode === 'erase');
      btn.classList.toggle('active', isActive);
    });
  }

  function loadEditorImage(idx) {
    editorCurrentIdx = idx;
    var imgData = editorImages[idx];
    editorSrc = imgData.src;
    editorOriginalSrc = imgData.originalSrc;
    resetFilterSliders();

    var img = new Image();
    img.onload = function () {
      editorNatW = img.naturalWidth;
      editorNatH = img.naturalHeight;
      fitEditorCanvas();
      editorImgCtx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
      editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
      editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
      restoreDrawMode();
      updateEditorStatus();
      // Set initial history for this image (clear old)
      editorHistory = [];
      editorRedoStack = [];
      updateUndoRedoBtns();
    };
    img.src = editorSrc;
  }

  function switchEditorImage(newIdx) {
    if (newIdx === editorCurrentIdx) return;
    if (editorProcessing.classList.contains('show')) return; // prevent switch during AI processing
    // Save current edits to copy
    editorImages[editorCurrentIdx].src = editorSrc;
    exitDrawMode();
    loadEditorImage(newIdx);
    buildEditorImageList();
  }

  function buildEditorImageList() {
    var list = document.getElementById('editorImageList');
    list.innerHTML = '';
    document.getElementById('erCount').textContent = editorImages.length;
    editorImages.forEach(function (imgData, i) {
      var item = document.createElement('div');
      item.className = 'er-item' + (i === editorCurrentIdx ? ' active' : '');
      item.draggable = true;
      var thumb = document.createElement('img');
      thumb.src = imgData.src;
      item.appendChild(thumb);
      var info = document.createElement('div');
      info.className = 'er-info';
      var label = document.createElement('div');
      label.className = 'er-label';
      label.textContent = imgData.label;
      info.appendChild(label);
      var dot = document.createElement('span');
      dot.className = 'er-dot' + (imgData.src !== imgData.originalSrc ? ' modified' : '');
      info.appendChild(dot);
      item.appendChild(info);
      var rm = document.createElement('button');
      rm.className = 'er-rm';
      rm.textContent = '×';
      rm.addEventListener('click', function (e) {
        e.stopPropagation();
        var removed = editorImages.splice(i, 1)[0];
        if (!editorImages.length) { closeEditor(); return; }
        if (i === editorCurrentIdx) {
          editorCurrentIdx = Math.min(i, editorImages.length - 1);
          loadEditorImage(editorCurrentIdx);
        } else if (i < editorCurrentIdx) {
          editorCurrentIdx--;
        }
        buildEditorImageList();
      });
      item.appendChild(rm);
      item.addEventListener('click', function () { switchEditorImage(i); });
      // 拖拽排序
      item.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', 'er-' + i);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('pool-dragging');
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('pool-dragging');
        list.querySelectorAll('.er-item').forEach(function (el) { el.classList.remove('pool-drop-before', 'pool-drop-after'); });
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.querySelectorAll('.er-item').forEach(function (el) { el.classList.remove('pool-drop-before', 'pool-drop-after'); });
        var rect = item.getBoundingClientRect();
        var mid = rect.top + rect.height / 2;
        if (e.clientY < mid) item.classList.add('pool-drop-before');
        else item.classList.add('pool-drop-after');
      });
      item.addEventListener('dragleave', function () {
        item.classList.remove('pool-drop-before', 'pool-drop-after');
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        list.querySelectorAll('.er-item').forEach(function (el) { el.classList.remove('pool-drop-before', 'pool-drop-after'); });
        var data = e.dataTransfer.getData('text/plain');
        if (!data || !data.startsWith('er-')) return;
        var fromIdx = parseInt(data.substring(3));
        if (fromIdx === i) return;
        var [moved] = editorImages.splice(fromIdx, 1);
        var toIdx = editorImages.indexOf(imgData);
        var rect = item.getBoundingClientRect();
        var mid = rect.top + rect.height / 2;
        if (e.clientY >= mid) toIdx++;
        editorImages.splice(toIdx, 0, moved);
        // 修正 currentIdx
        if (editorCurrentIdx === fromIdx) {
          editorCurrentIdx = toIdx > fromIdx ? toIdx - 1 : toIdx;
        } else if (fromIdx < editorCurrentIdx && toIdx >= editorCurrentIdx) {
          editorCurrentIdx--;
        } else if (fromIdx > editorCurrentIdx && toIdx <= editorCurrentIdx) {
          editorCurrentIdx++;
        }
        buildEditorImageList();
      });
      list.appendChild(item);
    });
  }

  function closeEditor() {
    editorModal.classList.remove('show');
    exitDrawMode();
    hideEditorLoading();
    editorImages = [];
    editorCurrentIdx = 0;
  }

  // Cancel
  document.getElementById('editorCancel').addEventListener('click', closeEditor);

  // Save and close — sync edited copies back to originals
  document.getElementById('editorSave').addEventListener('click', function () {
    editorImages[editorCurrentIdx].src = editorSrc;

    editorImages.forEach(function (img) {
      if (img.src !== img.originalSrc) {
        if (img.type === 'pool') {
          var p = imagePool.find(function (p) { return p.id === img.refId; });
          if (p) {
            p.src = img.src;
            canvasItems.forEach(function (c) { if (c.poolId === p.id) c.src = img.src; });
          }
        } else if (img.type === 'cell') {
          cellImages[img.refId] = img.src;
        } else if (img.type === 'canvas') {
          var c = canvasItems.find(function (c) { return c.id === img.refId; });
          if (c) c.src = img.src;
        }
      }
    });
    buildPool();
    if (mode === 'grid') buildGrid();
    if (mode === 'custom') { buildCanvasItems(); updatePropBar(); }
    closeEditor();
    showToast('所有修改已保存', 'ok');
  });

  // Push current edited image to external pool
  document.getElementById('edAddToPool').addEventListener('click', function () {
    if (!editorSrc) return;
    if (editorProcessing.classList.contains('show')) return;
    editorImages[editorCurrentIdx].src = editorSrc;
    addToPool(editorSrc);
    showToast('已推送当前图片', 'ok');
  });

  // Batch push all edited images to external pool
  document.getElementById('edBatchPush').addEventListener('click', function () {
    if (editorProcessing.classList.contains('show')) return;
    editorImages[editorCurrentIdx].src = editorSrc;
    var count = 0;
    editorImages.forEach(function (img) {
      if (img.src !== img.originalSrc) {
        addToPool(img.src);
        count++;
      }
    });
    if (count === 0) { showToast('没有编辑过的图片', 'err'); return; }
    showToast('已批量推送 ' + count + ' 张图片', 'ok');
  });

  // 导出当前编辑图片（下载）
  document.getElementById('edExportImg').addEventListener('click', function () {
    if (!editorSrc) return;
    if (editorProcessing.classList.contains('show')) return;
    editorImages[editorCurrentIdx].src = editorSrc;
    try {
      var a = document.createElement('a');
      a.download = 'edited_' + Date.now() + '.png';
      a.href = editorSrc;
      a.click();
      showToast('导出成功', 'ok');
    } catch (e) { showToast('导出失败: ' + e.message, 'err'); }
  });

  // 批量导出右侧图片列表所有图片
  document.getElementById('edBatchExport').addEventListener('click', function () {
    if (editorProcessing.classList.contains('show')) return;
    editorImages[editorCurrentIdx].src = editorSrc;
    var exported = 0;
    editorImages.forEach(function (img, i) {
      setTimeout(function () {
        try {
          var a = document.createElement('a');
          a.download = 'edited_' + (i + 1) + '_' + Date.now() + '.png';
          a.href = img.src;
          a.click();
          exported++;
        } catch (e) {}
      }, i * 200);
    });
    showToast('正在导出 ' + editorImages.length + ' 张图片...', 'ok');
  });

  // ===== 复制图片地址 =====
  function uploadToSmms(base64) {
    return fetch(getServerBase() + '/api/ai/smms-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64 })
    }).then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) throw new Error(d.error);
      return d.url;
    });
  }

  document.getElementById('edCopyImgUrl').addEventListener('click', function () {
    if (editorProcessing.classList.contains('show')) return;
    editorImages[editorCurrentIdx].src = editorSrc;

    // 收集要上传的图片
    var targets = [];
    editorImages.forEach(function (img) {
      if (img.src !== img.originalSrc) targets.push(img.src);
    });
    if (!targets.length && editorSrc) targets = [editorSrc];
    if (!targets.length) targets = editorImages.map(function (img) { return img.src; });

    if (!targets.length) { showToast('没有可复制的图片', 'err'); return; }

    showEditorLoading('上传图片到图床...');
    var urls = [];
    var chain = Promise.resolve();
    targets.forEach(function (src, idx) {
      chain = chain.then(function () {
        showEditorLoading('上传图片到图床 (' + (idx + 1) + '/' + targets.length + ')...');
        return uploadToSmms(src).then(function (url) { urls.push(url); });
      });
    });
    chain.then(function () {
      hideEditorLoading();
      return navigator.clipboard.writeText(urls.join('\n'));
    }).then(function () {
      showToast('已复制 ' + urls.length + ' 个图片地址', 'ok');
    }).catch(function (err) {
      hideEditorLoading();
      showToast('复制失败: ' + err.message, 'err');
    });
  });

  // ===== Editor canvas helpers =====
  function fitEditorCanvas() {
    var maxW = window.innerWidth - 200 - 120 - 80;
    var maxH = window.innerHeight - 50 - 50;
    editorScale = Math.min(maxW / editorNatW, maxH / editorNatH, 1);
    var cw = Math.round(editorNatW * editorScale);
    var ch = Math.round(editorNatH * editorScale);
    editorImgCanvas.width = cw; editorImgCanvas.height = ch;
    editorMaskCanvas.width = cw; editorMaskCanvas.height = ch;
  }

  function refreshEditorCanvas() {
    var img = new Image();
    img.onload = function () {
      editorImgCtx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
      editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
    };
    img.src = editorSrc;
  }

  function updateEditorStatus() {
    if (editorDrawMode === 'mosaic') editorStatus.textContent = '马赛克模式 — 松手自动应用';
    else if (editorDrawMode === 'erase') editorStatus.textContent = 'AI消除模式 — 松手自动调用';
    else editorStatus.textContent = '就绪 — 从左侧选择工具编辑图片';
  }

  function resetFilterSliders() {
    edBright.value = 100; edContrast.value = 100; edSaturate.value = 100;
    edBrightVal.textContent = '100'; edContrastVal.textContent = '100'; edSaturateVal.textContent = '100';
  }

  function restoreDrawMode() {
    // 不再自动激活涂抹模式，仅保留面板展开状态
  }

  // ===== Accordion =====
  editorModal.querySelectorAll('.acc-header').forEach(function (header) {
    header.addEventListener('click', function () {
      var section = this.parentElement;
      var wasOpen = section.classList.contains('open');
      editorModal.querySelectorAll('.acc-section').forEach(function (s) { s.classList.remove('open'); });
      if (!wasOpen) {
        section.classList.add('open');
      }
    });
  });

  // ===== Transform helper =====
  function transformEditorImage(fn) {
    var oldSrc = editorSrc;
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      var ctx = c.getContext('2d');
      fn(ctx, img, c);
      editorSrc = c.toDataURL('image/png');
      editorNatW = c.width; editorNatH = c.height;
      fitEditorCanvas();
      editorImgCtx.drawImage(c, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
      editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
      exitDrawMode();
      saveEditorHistory(oldSrc);
    };
    img.src = editorSrc;
  }

  // ===== Rotate / Flip =====
  document.getElementById('edRotate90').addEventListener('click', function () {
    transformEditorImage(function (ctx, img, c) {
      c.width = img.height; c.height = img.width;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    });
    showToast('旋转成功', 'ok');
  });

  document.getElementById('edFlipH').addEventListener('click', function () {
    transformEditorImage(function (ctx, img, c) {
      ctx.translate(c.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
    });
    showToast('翻转成功', 'ok');
  });

  // ===== Filters =====
  function onEdSliderInput() {
    edBrightVal.textContent = edBright.value;
    edContrastVal.textContent = edContrast.value;
    edSaturateVal.textContent = edSaturate.value;
  }
  edBright.addEventListener('input', onEdSliderInput);
  edContrast.addEventListener('input', onEdSliderInput);
  edSaturate.addEventListener('input', onEdSliderInput);

  document.getElementById('edFilterReset').addEventListener('click', function () {
    resetFilterSliders();
    if (editorSrc !== editorOriginalSrc) {
      editorSrc = editorOriginalSrc;
      var img = new Image();
      img.onload = function () {
        editorNatW = img.naturalWidth; editorNatH = img.naturalHeight;
        fitEditorCanvas();
        editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
      };
      img.src = editorSrc;
    }
    showToast('滤镜已重置', 'ok');
  });

  document.getElementById('edFilterApply').addEventListener('click', function () {
    var b = edBright.value, c = edContrast.value, s = edSaturate.value;
    if (b == 100 && c == 100 && s == 100) { showToast('未做任何调整', 'err'); return; }
    transformEditorImage(function (ctx, img, canvas) {
      ctx.filter = 'brightness(' + b + '%) contrast(' + c + '%) saturate(' + s + '%)';
      ctx.drawImage(img, 0, 0);
    });
    resetFilterSliders();
    showToast('滤镜已应用', 'ok');
  });

  // ===== Draw mode management =====
  function startDrawMode(type) {
    editorDrawMode = type;
    editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
    editorMaskCanvas.classList.add('show');
    editorCenter.style.cursor = 'crosshair';
    updateEditorStatus();
    updateTopToolbar();
  }

  function exitDrawMode() {
    editorDrawMode = '';
    editorMaskCanvas.classList.remove('show');
    editorCenter.style.cursor = '';
    updateEditorStatus();
    updateTopToolbar();
  }

  // ===== Mosaic brush/box controls =====
  document.getElementById('edMosBrush').addEventListener('click', function () {
    editorTool = 'brush';
    this.classList.add('active');
    document.getElementById('edMosBox').classList.remove('active');
    startDrawMode('mosaic');
    updateTopToolbar();
  });
  document.getElementById('edMosBox').addEventListener('click', function () {
    editorTool = 'box';
    this.classList.add('active');
    document.getElementById('edMosBrush').classList.remove('active');
    startDrawMode('mosaic');
    updateTopToolbar();
  });
  document.getElementById('edMosBrushSize').addEventListener('input', function () {
    document.getElementById('edMosBrushVal').textContent = this.value;
  });

  // ===== AI erase brush/box controls =====
  document.getElementById('edEraseBrush').addEventListener('click', function () {
    editorTool = 'brush';
    this.classList.add('active');
    document.getElementById('edEraseBox').classList.remove('active');
    startDrawMode('erase');
    updateTopToolbar();
  });
  document.getElementById('edEraseBox').addEventListener('click', function () {
    editorTool = 'box';
    this.classList.add('active');
    document.getElementById('edEraseBrush').classList.remove('active');
    startDrawMode('erase');
    updateTopToolbar();
  });
  document.getElementById('edEraseBrushSize').addEventListener('input', function () {
    document.getElementById('edEraseBrushVal').textContent = this.value;
  });

  // ===== Floating quick bar — draggable buttons + position drag =====
  var QUICK_ORDER_KEY = '__dxm_collage_quick_order';
  var FLOAT_POS_KEY = '__dxm_collage_float_pos';
  var QUICK_BTNS = [
    { id: 'eraseBrush', label: '画笔消除', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14l2-2L13 3l1 1L5 13l-2 1z"/><path d="M11 2l2 2"/></svg>' },
    { id: 'eraseBox', label: '框选消除', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M5 5l6 6M11 5l-6 6"/></svg>' },
    { id: 'cutout', label: 'AI抠图', icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 2v2M8 12v2M2 8h2M12 8h2"/></svg>' }
  ];

  function loadQuickOrder() {
    try {
      var saved = JSON.parse(localStorage.getItem(QUICK_ORDER_KEY));
      if (saved && saved.length) return saved;
    } catch (e) {}
    return QUICK_BTNS.map(function (b) { return b.id; });
  }
  function saveQuickOrder() {
    var bar = document.getElementById('edFloatBtns');
    if (!bar) return;
    var order = [];
    bar.querySelectorAll('.ed-float-btn').forEach(function (b) { order.push(b.dataset.btnId); });
    try { localStorage.setItem(QUICK_ORDER_KEY, JSON.stringify(order)); } catch (e) {}
  }

  function loadFloatPos() {
    try {
      var saved = JSON.parse(localStorage.getItem(FLOAT_POS_KEY));
      if (saved && saved.top !== undefined) return saved;
    } catch (e) {}
    return null;
  }
  function saveFloatPos() {
    var bar = document.getElementById('edFloatingBar');
    if (!bar) return;
    try {
      localStorage.setItem(FLOAT_POS_KEY, JSON.stringify({ top: bar.style.top, left: bar.style.left }));
    } catch (e) {}
  }
  function applyFloatPos() {
    var bar = document.getElementById('edFloatingBar');
    if (!bar) return;
    var pos = loadFloatPos();
    if (pos && pos.left) {
      bar.style.top = pos.top;
      bar.style.left = pos.left;
      bar.style.transform = 'none';
    }
  }

  function buildQuickBar() {
    var bar = document.getElementById('edFloatBtns');
    if (!bar) return;
    bar.innerHTML = '';
    var order = loadQuickOrder();
    order.forEach(function (id, idx) {
      if (idx > 0) {
        var sep = document.createElement('div');
        sep.className = 'ed-float-sep';
        bar.appendChild(sep);
      }
      var config = QUICK_BTNS.find(function (b) { return b.id === id; });
      if (!config) return;
      var btn = document.createElement('div');
      btn.className = 'ed-float-btn';
      btn.dataset.btnId = config.id;
      btn.draggable = true;
      btn.title = config.label;
      btn.innerHTML = config.icon + '<span>' + config.label + '</span>';
      bar.appendChild(btn);
    });
    // Bind click events
    bar.querySelectorAll('.ed-float-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.btnId;
        if (id === 'eraseBrush') triggerEraseBrush();
        else if (id === 'eraseBox') triggerEraseBox();
        else if (id === 'cutout') document.getElementById('edAiCutout').click();
      });
    });
    // Drag reorder within bar
    bar.addEventListener('dragstart', function (e) {
      var btn = e.target.closest('.ed-float-btn');
      if (!btn) return;
      e.dataTransfer.setData('text/plain', btn.dataset.btnId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(function () { btn.classList.add('dragging'); });
    });
    bar.addEventListener('dragend', function (e) {
      var btn = e.target.closest('.ed-float-btn');
      if (btn) btn.classList.remove('dragging');
      bar.querySelectorAll('.ed-float-btn').forEach(function (b) { b.classList.remove('drag-over'); });
    });
    bar.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      var target = e.target.closest('.ed-float-btn');
      bar.querySelectorAll('.ed-float-btn').forEach(function (b) { b.classList.remove('drag-over'); });
      if (target && !target.classList.contains('dragging')) target.classList.add('drag-over');
    });
    bar.addEventListener('drop', function (e) {
      e.preventDefault();
      var target = e.target.closest('.ed-float-btn');
      if (!target) return;
      var sourceId = e.dataTransfer.getData('text/plain');
      var source = bar.querySelector('[data-btn-id="' + sourceId + '"]');
      if (!source || source === target) { target.classList.remove('drag-over'); return; }
      var allItems = Array.prototype.slice.call(bar.children);
      var sourceIdx = allItems.indexOf(source);
      var targetIdx = allItems.indexOf(target);
      var sourceSep = sourceIdx > 0 && allItems[sourceIdx - 1].classList.contains('ed-float-sep') ? allItems[sourceIdx - 1] : null;
      if (sourceIdx < targetIdx) {
        if (sourceSep) bar.insertBefore(sourceSep, target.nextSibling);
        bar.insertBefore(source, target.nextSibling);
      } else {
        if (sourceSep) bar.insertBefore(sourceSep, target);
        bar.insertBefore(source, target);
      }
      target.classList.remove('drag-over');
      saveQuickOrder();
    });
  }

  // Float bar position drag (handle)
  var edFloatHandle = document.getElementById('edFloatHandle');
  if (edFloatHandle) {
    edFloatHandle.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var bar = document.getElementById('edFloatingBar');
      if (!bar) return;
      var rect = bar.getBoundingClientRect();
      var startX = e.clientX - rect.left;
      var startY = e.clientY - rect.top;
      bar.style.transform = 'none';
      bar.style.left = rect.left + 'px';
      bar.style.top = rect.top + 'px';
      function onMove(ev) {
        var newLeft = Math.max(0, Math.min(window.innerWidth - bar.offsetWidth, ev.clientX - startX));
        var newTop = Math.max(0, Math.min(window.innerHeight - bar.offsetHeight, ev.clientY - startY));
        bar.style.left = newLeft + 'px';
        bar.style.top = newTop + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveFloatPos();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function triggerEraseBrush() {
    editorTool = 'brush';
    editorModal.querySelectorAll('.acc-section').forEach(function (s) { s.classList.remove('open'); });
    var eraseSection = editorModal.querySelector('.acc-section[data-mode="erase"]');
    if (eraseSection) eraseSection.classList.add('open');
    startDrawMode('erase');
    var eb = document.getElementById('edEraseBrush');
    var ebox = document.getElementById('edEraseBox');
    if (eb) eb.classList.add('active');
    if (ebox) ebox.classList.remove('active');
    updateTopToolbar();
  }

  function triggerEraseBox() {
    editorTool = 'box';
    editorModal.querySelectorAll('.acc-section').forEach(function (s) { s.classList.remove('open'); });
    var eraseSection = editorModal.querySelector('.acc-section[data-mode="erase"]');
    if (eraseSection) eraseSection.classList.add('open');
    startDrawMode('erase');
    var eb = document.getElementById('edEraseBrush');
    var ebox = document.getElementById('edEraseBox');
    if (eb) eb.classList.remove('active');
    if (ebox) ebox.classList.add('active');
    updateTopToolbar();
  }

  buildQuickBar();

  // ===== Mask drawing =====
  function getEditorBrushSize() {
    if (editorDrawMode === 'mosaic') return parseInt(document.getElementById('edMosBrushSize').value) || 20;
    return parseInt(document.getElementById('edEraseBrushSize').value) || 20;
  }

  function getMaskColor() {
    return editorDrawMode === 'mosaic' ? 'rgba(128,0,255,0.45)' : 'rgba(255,60,60,0.45)';
  }

  // Map page coordinates to image-canvas coordinates (even outside the image)
  function getEditorPos(e) {
    var imgRect = editorCanvasWrap.getBoundingClientRect();
    return { x: e.clientX - imgRect.left, y: e.clientY - imgRect.top };
  }

  function drawBrushAt(x, y) {
    var size = getEditorBrushSize();
    editorMaskCtx.fillStyle = getMaskColor();
    editorMaskCtx.beginPath();
    editorMaskCtx.arc(x, y, size / 2, 0, Math.PI * 2);
    editorMaskCtx.fill();
  }

  function drawBrushLine(x0, y0, x1, y1) {
    var size = getEditorBrushSize();
    editorMaskCtx.strokeStyle = getMaskColor();
    editorMaskCtx.lineWidth = size;
    editorMaskCtx.lineCap = 'round';
    editorMaskCtx.lineJoin = 'round';
    editorMaskCtx.beginPath();
    editorMaskCtx.moveTo(x0, y0);
    editorMaskCtx.lineTo(x1, y1);
    editorMaskCtx.stroke();
  }

  function drawBoxPreview(x0, y0, x1, y1) {
    var sx = Math.min(x0, x1), sy = Math.min(y0, y1);
    var sw = Math.abs(x1 - x0), sh = Math.abs(y1 - y0);
    editorMaskCtx.fillStyle = getMaskColor();
    editorMaskCtx.fillRect(sx, sy, sw, sh);
  }

  // Mousedown on editorCenter — supports starting from outside the image
  editorCenter.addEventListener('mousedown', function (e) {
    if (!editorDrawMode) return;
    // Ignore clicks on processing overlay or non-canvas areas
    if (e.target.closest('.editor-processing') || e.target.closest('.editor-status')) return;
    e.preventDefault();
    var pos = getEditorPos(e);
    editorDrawing = true;
    editorLastX = pos.x; editorLastY = pos.y;
    if (editorTool === 'brush') {
      // Clamp brush to image bounds
      var cx = Math.max(0, Math.min(editorMaskCanvas.width, pos.x));
      var cy = Math.max(0, Math.min(editorMaskCanvas.height, pos.y));
      drawBrushAt(cx, cy);
      editorLastX = cx; editorLastY = cy;
    } else {
      editorBoxStart = { x: pos.x, y: pos.y };
      editorMaskSnapshot = editorMaskCtx.getImageData(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
    }
  });

  // Mousemove on document — tracks even outside editorCenter for box mode
  document.addEventListener('mousemove', function (e) {
    if (!editorDrawing || !editorDrawMode) return;
    var pos = getEditorPos(e);
    if (editorTool === 'brush') {
      var cx = Math.max(0, Math.min(editorMaskCanvas.width, pos.x));
      var cy = Math.max(0, Math.min(editorMaskCanvas.height, pos.y));
      drawBrushLine(editorLastX, editorLastY, cx, cy);
      editorLastX = cx; editorLastY = cy;
    } else if (editorBoxStart) {
      // Clamp box coordinates for drawing on mask canvas
      var sx = Math.max(0, Math.min(editorMaskCanvas.width, pos.x));
      var sy = Math.max(0, Math.min(editorMaskCanvas.height, pos.y));
      var bx = Math.max(0, Math.min(editorMaskCanvas.width, editorBoxStart.x));
      var by = Math.max(0, Math.min(editorMaskCanvas.height, editorBoxStart.y));
      if (editorMaskSnapshot) editorMaskCtx.putImageData(editorMaskSnapshot, 0, 0);
      drawBoxPreview(bx, by, sx, sy);
    }
  });

  function stopEditorDraw() {
    var wasDrawing = editorDrawing;
    editorDrawing = false;
    editorBoxStart = null;
    editorMaskSnapshot = null;
    if (wasDrawing && editorDrawMode && hasMaskData()) {
      if (editorDrawMode === 'mosaic') {
        applyEditorMosaic();
      } else if (editorDrawMode === 'erase') {
        applyEditorInpaint();
      }
    }
  }
  // Mouseup on document — always captures
  document.addEventListener('mouseup', function (e) {
    if (editorDrawing) stopEditorDraw();
  });

  function hasMaskData() {
    var md = editorMaskCtx.getImageData(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
    var count = 0;
    for (var i = 3; i < md.data.length; i += 4) {
      if (md.data[i] > 0) { count++; if (count >= 50) return true; }
    }
    return false;
  }

  function buildOrigMask() {
    var mc = document.createElement('canvas');
    mc.width = editorNatW; mc.height = editorNatH;
    var mCtx = mc.getContext('2d');
    mCtx.drawImage(editorMaskCanvas, 0, 0, editorNatW, editorNatH);
    var md = mCtx.getImageData(0, 0, editorNatW, editorNatH);
    for (var i = 0; i < md.data.length; i += 4) {
      var alpha = md.data[i + 3];
      if (alpha > 10) { md.data[i] = 255; md.data[i + 1] = 255; md.data[i + 2] = 255; md.data[i + 3] = 255; }
      else { md.data[i] = 0; md.data[i + 1] = 0; md.data[i + 2] = 0; md.data[i + 3] = 255; }
    }
    mCtx.putImageData(md, 0, 0);
    return mCtx;
  }

  function getOrigImageCanvas() {
    var img = new Image();
    img.src = editorSrc;
    var c = document.createElement('canvas');
    c.width = editorNatW; c.height = editorNatH;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  // ===== Mosaic apply =====
  function applyEditorMosaic() {
    var oldSrc = editorSrc;
    var origCanvas = getOrigImageCanvas();
    var maskCtx = buildOrigMask();
    var w = origCanvas.width, h = origCanvas.height;
    var imgCtx = origCanvas.getContext('2d');
    var imgData = imgCtx.getImageData(0, 0, w, h);
    var maskData = maskCtx.getImageData(0, 0, w, h);
    var blockSize = Math.max(8, Math.round(Math.min(w, h) / 60));

    for (var by = 0; by < h; by += blockSize) {
      for (var bx = 0; bx < w; bx += blockSize) {
        var hit = false;
        for (var dy = 0; dy < blockSize && by + dy < h; dy++) {
          for (var dx = 0; dx < blockSize && bx + dx < w; dx++) {
            var mi = ((by + dy) * w + (bx + dx)) * 4;
            if (maskData.data[mi] > 128) { hit = true; break; }
          }
          if (hit) break;
        }
        if (!hit) continue;
        var r = 0, g = 0, b = 0, count = 0;
        for (var dy2 = 0; dy2 < blockSize && by + dy2 < h; dy2++) {
          for (var dx2 = 0; dx2 < blockSize && bx + dx2 < w; dx2++) {
            var idx = ((by + dy2) * w + (bx + dx2)) * 4;
            r += imgData.data[idx]; g += imgData.data[idx + 1]; b += imgData.data[idx + 2]; count++;
          }
        }
        r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
        for (var dy3 = 0; dy3 < blockSize && by + dy3 < h; dy3++) {
          for (var dx3 = 0; dx3 < blockSize && bx + dx3 < w; dx3++) {
            var idx2 = ((by + dy3) * w + (bx + dx3)) * 4;
            imgData.data[idx2] = r; imgData.data[idx2 + 1] = g; imgData.data[idx2 + 2] = b;
          }
        }
      }
    }
    imgCtx.putImageData(imgData, 0, 0);
    editorSrc = origCanvas.toDataURL('image/png');
    editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
    refreshEditorCanvas();
    showToast('马赛克已应用', 'ok');
    saveEditorHistory(oldSrc);
  }

  // ===== AI inpaint =====
  function applyEditorInpaint() {
    var oldSrc = editorSrc;
    var origCanvas = getOrigImageCanvas();
    var maskCtx = buildOrigMask();
    var imageBase64 = origCanvas.toDataURL('image/png');
    var maskBase64 = maskCtx.canvas.toDataURL('image/png');

    editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
    editorStatus.textContent = 'AI消除中...';
    showEditorLoading('AI消除中...');
    fetch(getServerBase() + '/api/ai/inpaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, mask_base64: maskBase64 })
    }).then(function (res) { return res.json(); }).then(function (data) {
      hideEditorLoading();
      if (data.error) { showToast('AI消除失败: ' + data.error, 'err'); updateEditorStatus(); return; }
      var newUrl = data.url;
      if (newUrl && !newUrl.startsWith('data:')) {
        newUrl = getServerBase() + newUrl;
      }
      urlToBase64(newUrl).then(function (base64) {
        editorSrc = base64;
        var img = new Image();
        img.onload = function () {
          editorNatW = img.naturalWidth; editorNatH = img.naturalHeight;
          fitEditorCanvas();
          editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
          editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
          updateEditorStatus();
        };
        img.src = base64;
        showToast('AI消除完成', 'ok');
        saveEditorHistory(oldSrc);
      });
    }).catch(function (err) {
      hideEditorLoading();
      showToast('AI消除失败: ' + err.message, 'err');
      updateEditorStatus();
    });
  }

  // ===== AI white bg =====
  document.getElementById('edAiWhiteBg').addEventListener('click', function () {
    if (!editorSrc) return;
    var oldSrc = editorSrc;
    showEditorLoading('AI 白底图生成中...');
    urlToBase64(editorSrc).then(function (base64) {
      return fetch(getServerBase() + '/api/ai/white-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      });
    }).then(function (res) { return res.json(); }).then(function (data) {
      hideEditorLoading();
      if (data.error) { showToast(data.error, 'err'); return; }
      var newUrl = data.url;
      if (newUrl && !newUrl.startsWith('data:')) newUrl = getServerBase() + newUrl;
      urlToBase64(newUrl).then(function (base64) {
        editorSrc = base64;
        var img = new Image();
        img.onload = function () {
          editorNatW = img.naturalWidth; editorNatH = img.naturalHeight;
          fitEditorCanvas();
          editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
        };
        img.src = base64;
        showToast('AI白底图生成成功', 'ok');
        saveEditorHistory(oldSrc);
      });
    }).catch(function (err) {
      hideEditorLoading();
      showToast('AI处理失败: ' + err.message, 'err');
    });
  });

  // ===== AI enhance =====
  document.getElementById('edAiEnhance').addEventListener('click', function () {
    if (!editorSrc) return;
    var oldSrc = editorSrc;
    showEditorLoading('AI 画质增强中...');
    urlToBase64(editorSrc).then(function (base64) {
      return fetch(getServerBase() + '/api/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      });
    }).then(function (res) { return res.json(); }).then(function (data) {
      hideEditorLoading();
      if (data.error) { showToast(data.error, 'err'); return; }
      var newUrl = data.url;
      if (newUrl && !newUrl.startsWith('data:')) newUrl = getServerBase() + newUrl;
      urlToBase64(newUrl).then(function (base64) {
        editorSrc = base64;
        var img = new Image();
        img.onload = function () {
          editorNatW = img.naturalWidth; editorNatH = img.naturalHeight;
          fitEditorCanvas();
          editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
        };
        img.src = base64;
        showToast('AI画质增强成功', 'ok');
        saveEditorHistory(oldSrc);
      });
    }).catch(function (err) {
      hideEditorLoading();
      showToast('AI处理失败: ' + err.message, 'err');
    });
  });

  // ===== AI cutout (抠图) — server-side =====
  document.getElementById('edAiCutout').addEventListener('click', function () {
    if (!editorSrc) return;
    var oldSrc = editorSrc;
    showEditorLoading('AI 抠图中，请耐心等待...');
    urlToBase64(editorSrc).then(function (base64) {
      return fetch(getServerBase() + '/api/ai/remove-bg-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      });
    }).then(function (res) { return res.json(); }).then(function (data) {
      hideEditorLoading();
      if (data.error) { showToast(data.error, 'err'); return; }
      var newUrl = data.url;
      if (newUrl && !newUrl.startsWith('data:')) newUrl = getServerBase() + newUrl;
      urlToBase64(newUrl).then(function (base64) {
        editorSrc = base64;
        var img = new Image();
        img.onload = function () {
          editorNatW = img.naturalWidth; editorNatH = img.naturalHeight;
          fitEditorCanvas();
          editorImgCtx.clearRect(0, 0, editorImgCanvas.width, editorImgCanvas.height);
          editorImgCtx.drawImage(img, 0, 0, editorImgCanvas.width, editorImgCanvas.height);
          editorMaskCtx.clearRect(0, 0, editorMaskCanvas.width, editorMaskCanvas.height);
        };
        img.src = base64;
        showToast('AI抠图完成', 'ok');
        saveEditorHistory(oldSrc);
      });
    }).catch(function (err) {
      hideEditorLoading();
      showToast('AI抠图失败: ' + err.message, 'err');
    });
  });

  // ========== ImgBB API Key 管理 ==========
  var smmsStatus = document.getElementById('smmsStatus');
  var smmsTokenInput = document.getElementById('smmsTokenInput');
  var smmsTokenSave = document.getElementById('smmsTokenSave');
  var smmsTokenDel = document.getElementById('smmsTokenDel');

  function loadSmmsStatus() {
    fetch(getServerBase() + '/api/ai/smms-token').then(function (r) { return r.json(); }).then(function (d) {
      if (d.configured) {
        smmsStatus.textContent = '已配置 (' + d.masked + ')';
        smmsStatus.style.color = '#52c41a';
        smmsTokenInput.style.display = 'none';
        smmsTokenSave.style.display = 'none';
        smmsTokenDel.style.display = '';
      } else {
        smmsStatus.textContent = '未配置 — 复制图片地址需要图床';
        smmsStatus.style.color = '#ff9800';
        smmsTokenInput.style.display = '';
        smmsTokenSave.style.display = '';
        smmsTokenDel.style.display = 'none';
      }
    }).catch(function () {
      smmsStatus.textContent = '无法连接服务器';
      smmsStatus.style.color = '#ff4444';
    });
  }
  smmsTokenSave.addEventListener('click', function () {
    var token = smmsTokenInput.value.trim();
    if (!token) { showToast('请输入 Token', 'err'); return; }
    fetch(getServerBase() + '/api/ai/smms-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok) { showToast('Token 已保存', 'ok'); loadSmmsStatus(); }
      else showToast(d.error || '保存失败', 'err');
    });
  });
  smmsTokenDel.addEventListener('click', function () {
    if (!confirm('确定删除 ImgBB API Key？')) return;
    fetch(getServerBase() + '/api/ai/smms-token-delete', { method: 'POST' })
    .then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok) { showToast('Token 已删除', 'ok'); loadSmmsStatus(); }
    });
  });
  loadSmmsStatus();

  // ========== Init ==========
  applyMode();
  updateEditBtn();
})();
