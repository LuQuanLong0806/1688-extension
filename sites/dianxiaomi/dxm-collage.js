(function () {
  var GRID_KEY = '__dxm_collage_grid';
  var FIT_KEY = '__dxm_collage_fit';
  var IMG_KEY = '__dxm_collage_images';
  var GRIDS = [
    { cols: 2, rows: 2, label: '4宫格' },
    { cols: 3, rows: 2, label: '6宫格' },
    { cols: 3, rows: 3, label: '9宫格' },
    { cols: 4, rows: 4, label: '16宫格' }
  ];

  var currentIdx = 0;
  try {
    var saved = parseInt(localStorage.getItem(GRID_KEY));
    if (saved >= 0 && saved < GRIDS.length) currentIdx = saved;
  } catch (e) {}

  var fitMode = 'cover';
  try {
    var sf = localStorage.getItem(FIT_KEY);
    if (sf === 'cover' || sf === 'contain' || sf === 'fill') fitMode = sf;
  } catch (e) {}
  document.getElementById('fitMode').value = fitMode;

  document.getElementById('fitMode').addEventListener('change', function () {
    fitMode = this.value;
    try { localStorage.setItem(FIT_KEY, fitMode); } catch (e) {}
    buildGrid();
  });

  var cellImages = {};
  try {
    var savedImg = localStorage.getItem(IMG_KEY);
    if (savedImg) cellImages = JSON.parse(savedImg);
  } catch (e) {}
  var activeCell = -1;

  function saveImages() {
    try { localStorage.setItem(IMG_KEY, JSON.stringify(cellImages)); } catch (e) {}
  }

  // ========== Toast ==========
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type || 'ok') + ' show';
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
  }

  // ========== Sidebar ==========
  var sidebar = document.querySelector('.sidebar');
  GRIDS.forEach(function (g, i) {
    var opt = document.createElement('div');
    opt.className = 'grid-opt' + (i === currentIdx ? ' active' : '');
    var preview = document.createElement('div');
    preview.className = 'grid-preview';
    preview.style.gridTemplateColumns = 'repeat(' + g.cols + ', 1fr)';
    preview.style.gridTemplateRows = 'repeat(' + g.rows + ', 1fr)';
    var total = g.cols * g.rows;
    for (var j = 0; j < total; j++) {
      preview.appendChild(document.createElement('span'));
    }
    var label = document.createElement('div');
    label.className = 'grid-label';
    label.textContent = g.label;
    opt.appendChild(preview);
    opt.appendChild(label);
    opt.addEventListener('click', function () { selectGrid(i); });
    sidebar.appendChild(opt);
  });

  function selectGrid(i) {
    currentIdx = i;
    try { localStorage.setItem(GRID_KEY, String(i)); } catch (e) {}
    document.querySelectorAll('.grid-opt').forEach(function (el, idx) {
      el.classList.toggle('active', idx === i);
    });
    activeCell = -1;
    buildGrid();
  }

  // ========== Grid ==========
  function getGrid() { return GRIDS[currentIdx]; }

  function buildGrid() {
    saveImages();
    var g = getGrid();
    var grid = document.getElementById('grid');
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
      })(i);

      (function (idx) {
        cell.addEventListener('dragover', function (e) {
          e.preventDefault();
          this.classList.add('dragover');
        });
        cell.addEventListener('dragleave', function () {
          this.classList.remove('dragover');
        });
        cell.addEventListener('drop', function (e) {
          e.preventDefault();
          e.stopPropagation();
          this.classList.remove('dragover');
          handleDrop(e, idx);
        });
      })(i);

      grid.appendChild(cell);
    }
  }

  function handleDrop(e, cellIdx) {
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf('image/') === 0) {
          loadFile(files[i], cellIdx);
          return;
        }
      }
      return;
    }
    var html = e.dataTransfer.getData('text/html');
    if (html) {
      var m = html.match(/src=["']([^"']+)["']/);
      if (m) loadURL(m[1], cellIdx);
      return;
    }
    var text = e.dataTransfer.getData('text/plain');
    if (text && /^https?:\/\//.test(text)) loadURL(text, cellIdx);
  }

  function loadFile(file, cellIdx) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      cellImages[cellIdx] = ev.target.result;
      buildGrid();
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
      try {
        cellImages[cellIdx] = c.toDataURL('image/png');
      } catch (e) {
        cellImages[cellIdx] = url;
      }
      buildGrid();
      if (cb) cb();
    };
    img.onerror = function () {
      cellImages[cellIdx] = url;
      buildGrid();
      if (cb) cb();
    };
    img.src = url;
  }

  // ========== Paste ==========
  document.addEventListener('paste', function (e) {
    var target = activeCell;
    if (target < 0) {
      showToast('请先将鼠标移到目标格子', 'err');
      return;
    }
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
    if (text && /^https?:\/\//.test(text)) {
      e.preventDefault();
      loadURL(text, target);
    }
  });

  // ========== 批量贴图 ==========
  document.getElementById('btnPasteUrl').addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (text) {
        doBatchFill(text);
      }).catch(function () {
        showToast('无法读取剪贴板，请检查浏览器权限', 'err');
      });
    } else {
      showToast('浏览器不支持自动读取剪贴板', 'err');
    }
  });

  function doBatchFill(text) {
    text = (text || '').trim();
    if (!text) { showToast('剪贴板为空', 'err'); return; }

    var urls = text.split(/[\r\n]+/).map(function (s) { return s.trim(); }).filter(function (s) {
      return s && /^https?:\/\//i.test(s);
    });
    if (urls.length === 0) { showToast('剪贴板中未识别到图片地址', 'err'); return; }

    var g = getGrid();
    var total = g.cols * g.rows;
    var emptyCells = [];
    for (var i = 0; i < total; i++) {
      if (!cellImages[i]) emptyCells.push(i);
    }

    var fillCount = Math.min(urls.length, emptyCells.length);
    if (fillCount === 0) {
      showToast('所有格子已满', 'err');
      return;
    }

    showToast('正在加载 ' + fillCount + ' 张图片...', 'ok');
    var loaded = 0;

    for (var j = 0; j < fillCount; j++) {
      (function (idx, url) {
        loadURL(url, idx, function () {
          loaded++;
          if (loaded >= fillCount) {
            showToast('已填充 ' + fillCount + ' 张图片' + (urls.length > fillCount ? '（多余 ' + (urls.length - fillCount) + ' 张已跳过）' : ''), 'ok');
          }
        });
      })(emptyCells[j], urls[j]);
    }
  }

  // ========== 预览 ==========
  var previewMask = document.getElementById('previewMask');
  var previewImg = document.getElementById('previewImg');

  document.getElementById('btnPreview').addEventListener('click', function () {
    var g = getGrid();
    var total = g.cols * g.rows;
    var hasAny = false;
    for (var k in cellImages) { hasAny = true; break; }
    if (!hasAny) { showToast('请先添加图片', 'err'); return; }
    renderCanvas(g, total, function (canvas) {
      previewImg.src = canvas.toDataURL('image/png');
      previewMask.classList.add('show');
    });
  });

  document.getElementById('previewClose').addEventListener('click', function () {
    previewMask.classList.remove('show');
  });
  previewMask.addEventListener('click', function (e) {
    if (e.target === previewMask) previewMask.classList.remove('show');
  });

  // ========== Clear ==========
  document.getElementById('btnClear').addEventListener('click', function () {
    cellImages = {};
    activeCell = -1;
    buildGrid();
  });

  // ========== Export ==========
  document.getElementById('btnExport').addEventListener('click', function () {
    var g = getGrid();
    var total = g.cols * g.rows;
    var hasAny = false;
    for (var k in cellImages) { hasAny = true; break; }
    if (!hasAny) { showToast('请先添加图片', 'err'); return; }
    renderCanvas(g, total, function (canvas) {
      try {
        var a = document.createElement('a');
        a.download = 'collage_' + Date.now() + '.png';
        a.href = canvas.toDataURL('image/png');
        a.click();
        showToast('导出成功!', 'ok');
      } catch (e) {
        showToast('导出失败: ' + e.message, 'err');
      }
    });
  });

  // ========== 渲染到 Canvas（共享逻辑） ==========
  function renderCanvas(g, total, onDone) {
    var cellSize = 600;
    var gap = 12;
    var pad = 16;
    var cw = pad * 2 + g.cols * cellSize + (g.cols - 1) * gap;
    var ch = pad * 2 + g.rows * cellSize + (g.rows - 1) * gap;

    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);

    var loaded = 0;
    var needed = 0;
    for (var i = 0; i < total; i++) {
      if (cellImages[i]) needed++;
    }

    if (needed === 0) { onDone(canvas); return; }

    function done() {
      loaded++;
      if (loaded >= needed) onDone(canvas);
    }

    function drawImg(idx, img) {
      var col = idx % g.cols;
      var row = Math.floor(idx / g.cols);
      var x = pad + col * (cellSize + gap);
      var y = pad + row * (cellSize + gap);
      var w, h, ox, oy;

      if (fitMode === 'fill') {
        w = cellSize; h = cellSize; ox = x; oy = y;
      } else if (fitMode === 'contain') {
        var scale = Math.min(cellSize / img.width, cellSize / img.height);
        w = img.width * scale; h = img.height * scale;
        ox = x + (cellSize - w) / 2; oy = y + (cellSize - h) / 2;
        // contain 不需要 clip，直接画
        ctx.drawImage(img, ox, oy, w, h);
        return;
      } else {
        // cover
        var scale = Math.max(cellSize / img.width, cellSize / img.height);
        w = img.width * scale; h = img.height * scale;
        ox = x + (cellSize - w) / 2; oy = y + (cellSize - h) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellSize, cellSize);
        ctx.clip();
        ctx.drawImage(img, ox, oy, w, h);
        ctx.restore();
        return;
      }
      // fill: 直接拉伸
      ctx.drawImage(img, x, y, cellSize, cellSize);
    }

    for (var j = 0; j < total; j++) {
      if (!cellImages[j]) continue;
      (function (idx) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () { drawImg(idx, img); done(); };
        img.onerror = function () {
          var col = idx % g.cols;
          var row = Math.floor(idx / g.cols);
          var x = pad + col * (cellSize + gap);
          var y = pad + row * (cellSize + gap);
          ctx.fillStyle = '#f5f5f5';
          ctx.fillRect(x, y, cellSize, cellSize);
          done();
        };
        img.src = cellImages[idx];
      })(j);
    }
  }

  // ========== Init ==========
  buildGrid();
})();
