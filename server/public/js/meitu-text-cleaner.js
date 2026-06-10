/**
 * meitu-text-cleaner.js — 去中文工具
 * OCR 检测 + LaMa 修复流水线
 */
function initMeituTextCleaner() {
  if (initMeituTextCleaner._init) return;
  initMeituTextCleaner._init = true;
  // ========== State ==========
  var serverBase = '';

  function getServerBase() {
    if (serverBase) return serverBase;
    return '';
  }
  var currentImageSrc = null;    // 当前显示的图片 src（base64 或 URL）
  var currentImageBuf = null;    // 当前图片的 base64（无前缀）
  var detectedRegions = [];      // 检测到的文字区域
  var cleanedImageSrc = null;    // 清理后的图片 src
  var imageQueue = [];           // 批量图片队列 [{id, src, base64, status, result}]
  var nextQueueId = 1;

  // ========== DOM refs ==========
  var toastEl = document.getElementById('toast');
  var ocrStatusEl = document.getElementById('ocrStatus');
  var lamaStatusEl = document.getElementById('lamaStatus');
  var emptyState = document.getElementById('emptyState');
  var canvasWrap = document.getElementById('canvasWrap');
  var canvasBoard = document.getElementById('canvasBoard');
  var mainImage = document.getElementById('mainImage');
  var overlayCanvas = document.getElementById('overlayCanvas');
  var loadingOverlay = document.getElementById('loadingOverlay');
  var compareWrap = document.getElementById('compareWrap');
  var compareOrig = document.getElementById('compareOrig');
  var compareClean = document.getElementById('compareClean');
  var imageUrlInput = document.getElementById('imageUrlInput');
  var fileInput = document.getElementById('fileInput');
  var regionList = document.getElementById('regionList');
  var imageQueueEl = document.getElementById('imageQueue');

  // ========== Server URL ==========
  // getServerBase defined above

  // ========== Toast ==========
  var toastTimer = null;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type || 'ok') + ' show';
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2500);
  }

  // ========== Loading ==========
  function showLoading() { loadingOverlay.style.display = 'flex'; }
  function hideLoading() { loadingOverlay.style.display = 'none'; }

  // ========== 服务状态检查 ==========
  function checkServices() {
    var base = getServerBase();
    // OCR
    fetch(base + '/api/ai/ocr-status').then(function (r) { return r.json(); }).then(function (d) {
      if (d.ocr && d.ocr.status === 'ok') {
        ocrStatusEl.textContent = 'OCR ✅';
        ocrStatusEl.className = 'status ok';
      } else {
        ocrStatusEl.textContent = 'OCR ❌';
        ocrStatusEl.className = 'status err';
      }
      if (d.lama && d.lama.available) {
        var inpaintInfo = d.inpaint ? ('Inpaint: ' + d.inpaint.backend) : 'LaMa';
        lamaStatusEl.textContent = inpaintInfo + ' ✅';
        lamaStatusEl.className = 'status ok';
        lamaStatusEl.title = inpaintInfo + ' 后端已就绪';
      } else {
        lamaStatusEl.textContent = 'Inpaint ❌';
        lamaStatusEl.className = 'status err';
        lamaStatusEl.title = '无可用修复模型';
      }
    }).catch(function () {
      ocrStatusEl.textContent = 'OCR ❌ 离线';
      ocrStatusEl.className = 'status err';
      lamaStatusEl.textContent = 'Inpaint ❌ 离线';
      lamaStatusEl.className = 'status err';
    });
  }

  // ========== 图片加载 ==========
  function loadImageSrc(src) {
    currentImageSrc = src;
    cleanedImageSrc = null;
    detectedRegions = [];
    mainImage.src = src;
    emptyState.style.display = 'none';
    canvasWrap.style.display = 'inline-block';
    compareWrap.style.display = 'none';
    updateRegionList();
    updateStats();

    mainImage.onload = function () {
      // 调整 overlay canvas 尺寸
      overlayCanvas.width = mainImage.naturalWidth;
      overlayCanvas.height = mainImage.naturalHeight;
      overlayCanvas.style.width = mainImage.clientWidth + 'px';
      overlayCanvas.style.height = mainImage.clientHeight + 'px';
      clearOverlay();
      manualHasMask = false;
      manualMode = '';
      updateManualUI();
    };
  }

  function loadFromUrl(url) {
    var base = getServerBase();
    // 通过 proxy 获取图片避免 CORS
    var proxyUrl = base + '/api/proxy-image?url=' + encodeURIComponent(url);
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      var b64 = c.toDataURL('image/png');
      currentImageBuf = b64.replace(/^data:image\/\w+;base64,/, '');
      loadImageSrc(b64);
      showToast('图片加载成功', 'ok');
    };
    img.onerror = function () {
      // 试试直接加载
      loadImageSrc(url);
      showToast('图片加载（直连模式）', 'loading');
    };
    img.src = proxyUrl;
  }

  function loadFromFile(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var b64 = e.target.result;
      currentImageBuf = b64.replace(/^data:image\/\w+;base64,/, '');
      loadImageSrc(b64);
      showToast('图片加载成功', 'ok');
    };
    reader.readAsDataURL(file);
  }

  function loadFromBase64(b64) {
    currentImageBuf = b64.replace(/^data:image\/\w+;base64,/, '');
    loadImageSrc('data:image/png;base64,' + currentImageBuf);
  }

  // ========== Overlay 绘制 ==========
  function clearOverlay() {
    var ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  // ========== 手动涂抹消除 ==========
  var manualMode = '';      // '' | 'brush' | 'box'
  var manualDrawing = false;
  var manualBoxStart = null;
  var manualBrushSize = 30;
  var manualHasMask = false;

  function updateManualUI() {
    var brush = document.getElementById('edManualBrush');
    var box = document.getElementById('edManualBox');
    var clear = document.getElementById('edManualClear');
    var apply = document.getElementById('edManualApply');
    var hint = document.getElementById('manualHint');
    var status = document.getElementById('manualStatus');
    if (brush) brush.className = 'sb-btn' + (manualMode === 'brush' ? ' active' : '');
    if (box) box.className = 'sb-btn' + (manualMode === 'box' ? ' active' : '');
    if (apply) apply.disabled = !manualHasMask;
    if (hint) hint.style.display = manualMode ? 'none' : '';
    // 开启/关闭 overlay canvas 的鼠标事件
    if (manualMode) {
      overlayCanvas.classList.add('manual-active');
    } else {
      overlayCanvas.classList.remove('manual-active');
    }
    if (status && manualMode) {
      status.textContent = manualMode === 'brush' ? '🖌️ 画笔模式 — 在图片上涂抹' : '🔲 框选模式 — 拖拽选择区域';
    } else if (status) {
      status.textContent = '';
    }
  }

  function checkManualMask() {
    var ctx = overlayCanvas.getContext('2d');
    var md = ctx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
    var count = 0;
    for (var i = 3; i < md.data.length; i += 4) {
      if (md.data[i] > 0) { count++; if (count >= 50) { manualHasMask = true; updateManualUI(); return; } }
    }
    manualHasMask = false;
    updateManualUI();
  }

  function getCanvasCoords(e) {
    var rect = overlayCanvas.getBoundingClientRect();
    var scaleX = overlayCanvas.width / rect.width;
    var scaleY = overlayCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  function onManualMouseDown(e) {
    if (!manualMode || !currentImageSrc) return;
    e.preventDefault();
    manualDrawing = true;
    var pos = getCanvasCoords(e);
    if (manualMode === 'box') {
      manualBoxStart = pos;
    } else if (manualMode === 'brush') {
      var ctx = overlayCanvas.getContext('2d');
      ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, manualBrushSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function onManualMouseMove(e) {
    if (!manualDrawing || !manualMode) return;
    e.preventDefault();
    var pos = getCanvasCoords(e);
    var ctx = overlayCanvas.getContext('2d');
    if (manualMode === 'brush') {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, manualBrushSize, 0, Math.PI * 2);
      ctx.fill();
    } else if (manualMode === 'box' && manualBoxStart) {
      // 实时预览框
      clearOverlay();
      ctx.fillStyle = 'rgba(255, 60, 60, 0.45)';
      var x = Math.min(manualBoxStart.x, pos.x);
      var y = Math.min(manualBoxStart.y, pos.y);
      var w = Math.abs(pos.x - manualBoxStart.x);
      var h = Math.abs(pos.y - manualBoxStart.y);
      ctx.fillRect(x, y, w, h);
    }
  }

  function onManualMouseUp(e) {
    if (!manualDrawing || !manualMode) return;
    manualDrawing = false;
    manualBoxStart = null;
    checkManualMask();
  }

  function applyManualInpaint() {
    if (!manualHasMask || !currentImageBuf) {
      showToast('请先涂抹要消除的区域', 'err');
      return;
    }
    var base = getServerBase();
    var status = document.getElementById('manualStatus');
    if (status) status.textContent = '⏳ AI消除中...';

    // 从 overlay 生成 mask：红色区域 → 白色mask
    var maskCtx = overlayCanvas.getContext('2d');
    var w = overlayCanvas.width, h = overlayCanvas.height;
    var imgData = maskCtx.getImageData(0, 0, w, h);
    var maskCanvas = document.createElement('canvas');
    maskCanvas.width = w; maskCanvas.height = h;
    var maskOutCtx = maskCanvas.getContext('2d');
    var maskData = maskOutCtx.createImageData(w, h);
    for (var i = 0; i < imgData.data.length; i += 4) {
      var alpha = imgData.data[i + 3];
      if (alpha > 10) {
        maskData.data[i] = 255; maskData.data[i+1] = 255; maskData.data[i+2] = 255; maskData.data[i+3] = 255;
      } else {
        maskData.data[i] = 0; maskData.data[i+1] = 0; maskData.data[i+2] = 0; maskData.data[i+3] = 255;
      }
    }
    maskOutCtx.putImageData(maskData, 0, 0);
    var maskBase64 = maskCanvas.toDataURL('image/png');

    // 如果有原始base64就直接用，否则用 data URL
    var imageBase64 = 'data:image/png;base64,' + currentImageBuf;

    fetch(base + '/api/ai/inpaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, mask_base64: maskBase64 })
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (status) status.textContent = '';
      if (data.error) { showToast('消除失败: ' + data.error, 'err'); return; }
      var newUrl = data.url;
      if (newUrl && !newUrl.startsWith('data:')) {
        newUrl = base + newUrl;
      }
      // 更新当前图片
      urlToBase64(newUrl).then(function (b64) {
        currentImageBuf = b64.replace(/^data:image\/\w+;base64,/, '');
        cleanedImageSrc = newUrl;
        // 清除mask
        clearOverlay();
        manualHasMask = false;
        manualMode = '';
        updateManualUI();
        showCompare(currentImageSrc, newUrl);
        showToast('✅ 手动消除完成', 'ok');
      });
    }).catch(function (err) {
      if (status) status.textContent = '';
      showToast('消除失败: ' + err.message, 'err');
    });
  }

  // 绑定手动涂抹事件
  var _manualBound = false;
  function bindManualEvents() {
    if (_manualBound) return;
    _manualBound = true;

    overlayCanvas.addEventListener('mousedown', onManualMouseDown);
    overlayCanvas.addEventListener('mousemove', onManualMouseMove);
    overlayCanvas.addEventListener('mouseup', onManualMouseUp);
    document.addEventListener('mouseup', function () {
      if (manualDrawing) onManualMouseUp();
    });

    var brushBtn = document.getElementById('edManualBrush');
    var boxBtn = document.getElementById('edManualBox');
    var clearBtn = document.getElementById('edManualClear');
    var applyBtn = document.getElementById('edManualApply');
    var brushSlider = document.getElementById('edManualBrushSize');

    if (brushBtn) brushBtn.addEventListener('click', function () {
      if (!currentImageSrc) { showToast('请先加载图片', 'err'); return; }
      manualMode = manualMode === 'brush' ? '' : 'brush';
      if (!manualMode) clearOverlay();
      updateManualUI();
    });
    if (boxBtn) boxBtn.addEventListener('click', function () {
      if (!currentImageSrc) { showToast('请先加载图片', 'err'); return; }
      manualMode = manualMode === 'box' ? '' : 'box';
      if (!manualMode) clearOverlay();
      updateManualUI();
    });
    if (clearBtn) clearBtn.addEventListener('click', function () {
      clearOverlay(); manualHasMask = false; manualMode = ''; updateManualUI();
    });
    if (applyBtn) applyBtn.addEventListener('click', applyManualInpaint);
    if (brushSlider) brushSlider.addEventListener('input', function () {
      manualBrushSize = parseInt(this.value) || 30;
      var valEl = document.getElementById('edManualBrushVal');
      if (valEl) valEl.textContent = manualBrushSize;
    });
  }
  bindManualEvents();

  function drawRegions(regions) {
    var ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // 缩放比例
    var scaleX = overlayCanvas.width / (mainImage.naturalWidth || 1);
    var scaleY = overlayCanvas.height / (mainImage.naturalHeight || 1);

    regions.forEach(function (r) {
      var isCN = r.is_chinese;
      var color = isCN ? 'rgba(233, 69, 96, 0.3)' : 'rgba(79, 195, 247, 0.2)';
      var borderColor = isCN ? '#e94560' : '#4fc3f7';

      // 画 polygon（更精确）
      if (r.polygon && r.polygon.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(r.polygon[0][0] * scaleX, r.polygon[0][1] * scaleY);
        for (var i = 1; i < r.polygon.length; i++) {
          ctx.lineTo(r.polygon[i][0] * scaleX, r.polygon[i][1] * scaleY);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        // fallback: 矩形
        ctx.fillStyle = color;
        ctx.fillRect(r.x * scaleX, r.y * scaleY, r.width * scaleX, r.height * scaleY);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x * scaleX, r.y * scaleY, r.width * scaleX, r.height * scaleY);
      }

      // 标注文字内容
      if (r.text) {
        ctx.font = '12px "Microsoft YaHei"';
        ctx.fillStyle = borderColor;
        var labelX = (r.polygon ? r.polygon[0][0] : r.x) * scaleX;
        var labelY = (r.polygon ? r.polygon[0][1] : r.y) * scaleY - 4;
        ctx.fillText(r.text.substring(0, 15) + (r.text.length > 15 ? '...' : ''), labelX, labelY);
      }
    });
  }

  // ========== 检测 ==========
  function detectText() {
    if (!currentImageBuf) {
      showToast('请先加载图片', 'err');
      return;
    }

    showLoading();
    var chineseOnly = document.getElementById('chkChineseOnly').checked;
    var confidence = parseFloat(document.getElementById('confSlider').value);
    var expandPx = parseInt(document.getElementById('expandSlider').value);
    var base = getServerBase();

    fetch(base + '/api/ai/detect-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: currentImageBuf,
        chinese_only: chineseOnly,
        min_confidence: confidence,
        expand_px: expandPx
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      hideLoading();
      if (!data.ok) {
        showToast('检测失败: ' + (data.error || '未知错误'), 'err');
        return;
      }

      detectedRegions = data.regions || [];
      drawRegions(detectedRegions);
      updateRegionList();
      updateStats();

      var cnCount = detectedRegions.filter(function (r) { return r.is_chinese; }).length;
      showToast('检测完成: ' + detectedRegions.length + ' 个区域，' + cnCount + ' 个含中文', 'ok');

      if (data.elapsed_ms) {
        document.getElementById('detectTime').textContent = '耗时: ' + data.elapsed_ms + 'ms';
      }
    }).catch(function (err) {
      hideLoading();
      showToast('检测失败: ' + err.message, 'err');
    });
  }

  // ========== 一键去中文 ==========
  function cleanAll() {
    if (!currentImageBuf) {
      showToast('请先加载图片', 'err');
      return;
    }

    showLoading();
    var base = getServerBase();
    var chineseOnly = document.getElementById('chkChineseOnly').checked;
    var minConfidence = parseFloat(document.getElementById('confSlider').value);
    var dilatePx = parseInt(document.getElementById('expandSlider').value) || 20;
    var enableVision = document.getElementById('chkVisionDetect').checked;

    fetch(base + '/api/ai/auto-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: currentImageBuf,
        chinese_only: chineseOnly,
        min_confidence: minConfidence,
        dilate_px: dilatePx,
        enable_vision: enableVision
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      hideLoading();
      if (!data.ok) {
        showToast('处理失败: ' + (data.error || '未知错误'), 'err');
        return;
      }

      // 更新检测结果
      detectedRegions = data.regions || [];
      updateRegionList();
      updateStats();

      if (data.cleaned && data.url) {
        // 显示对比视图
        var fullUrl = base + data.url;
        cleanedImageSrc = fullUrl;
        showCompare(currentImageSrc, fullUrl);
        showToast('✅ 去中文完成! ' + data.regionCount + ' 个区域已修复', 'ok');
      } else if (data.detected) {
        // 仅检测（LaMa不可用）
        drawRegions(data.regions || []);
        showToast('⚠️ 仅检测完成，LaMa修复不可用', 'loading');
      } else {
        showToast('✅ 未检测到中文文字', 'ok');
      }
    }).catch(function (err) {
      hideLoading();
      showToast('处理失败: ' + err.message, 'err');
    });
  }

  // ========== 对比视图 ==========
  function showCompare(origSrc, cleanSrc) {
    canvasWrap.style.display = 'none';
    compareWrap.style.display = 'flex';
    compareOrig.src = origSrc;
    compareClean.src = cleanSrc;
  }

  // ========== UI 更新 ==========
  function updateStats() {
    var total = detectedRegions.length;
    var cnCount = detectedRegions.filter(function (r) { return r.is_chinese; }).length;
    var enCount = total - cnCount;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statChinese').textContent = cnCount;
    document.getElementById('statEnglish').textContent = enCount;
  }

  function updateRegionList() {
    if (!detectedRegions.length) {
      regionList.innerHTML = '<div class="sb-hint">暂无检测结果</div>';
      return;
    }

    var html = '';
    detectedRegions.forEach(function (r, i) {
      var dotClass = r.is_chinese ? 'cn' : 'en';
      var text = (r.text || '').substring(0, 20);
      html += '<div class="region-item" data-idx="' + i + '">' +
        '<span class="dot ' + dotClass + '"></span>' +
        '<span class="text">' + escapeHtml(text) + '</span>' +
        '<span class="conf">' + (r.confidence * 100).toFixed(0) + '%</span>' +
        '</div>';
    });
    regionList.innerHTML = html;

    // 点击高亮
    regionList.querySelectorAll('.region-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.dataset.idx);
        highlightRegion(idx);
      });
    });
  }

  function highlightRegion(idx) {
    var region = detectedRegions[idx];
    if (!region) return;
    clearOverlay();
    drawRegions([region]);
  }

  function updateImageQueue() {
    var hint = document.getElementById('batchHint');
    var btn = document.getElementById('btnBatchClean');
    var btnFull = document.getElementById('btnBatchCleanFull');

    if (!imageQueue.length) {
      hint.textContent = '尚未添加图片';
      if (btn) btn.disabled = true;
      if (btnFull) btnFull.disabled = true;
      imageQueueEl.innerHTML = '<div class="sb-hint">暂无图片</div>';
      return;
    }

    hint.textContent = imageQueue.length + ' 张图片';
    if (btn) btn.disabled = false;
    if (btnFull) btnFull.disabled = false;

    var html = '';
    imageQueue.forEach(function (item, i) {
      var statusIcon = item.status === 'done' ? '✅' : item.status === 'error' ? '❌' : item.status === 'processing' ? '⏳' : '⬜';
      var urlHint = '';
      if (item.status === 'done' && item.result && item.result.url) {
        urlHint = ' 📎';
      }
      var activeClass = (currentImageSrc === item.src) ? ' queue-item-active' : '';
      html += '<div class="region-item queue-item' + activeClass + '" data-idx="' + i + '" style="cursor:pointer">' +
        '<span class="dot ' + (item.status === 'done' ? 'cn' : 'en') + '"></span>' +
        '<span class="text">' + statusIcon + ' 图片 ' + (i + 1) + urlHint + '</span>' +
        '</div>';
    });
    imageQueueEl.innerHTML = html;

    // 点击切换图片
    imageQueueEl.querySelectorAll('.queue-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(this.dataset.idx);
        var item = imageQueue[idx];
        if (!item) return;
        // 显示清理后的图片（如果有）
        if (item.status === 'done' && item.result && item.result.url) {
          var base = getServerBase();
          var cleanUrl = item.result.url;
          if (cleanUrl.indexOf('http') !== 0) cleanUrl = base + cleanUrl;
          cleanedImageSrc = cleanUrl;
          showCompare(item.src, cleanUrl);
        } else {
          // 显示原图
          currentImageBuf = item.base64;
          loadImageSrc(item.src);
        }
        updateImageQueue();
      });
    });
  }

  // ========== 批量处理（去中文）==========
  function batchClean() {
    if (!imageQueue.length) return;

    var base = getServerBase();
    var progress = document.getElementById('batchProgress');
    var btn = document.getElementById('btnBatchClean');
    btn.disabled = true;
    showLoading();

    var images = imageQueue.filter(function (item) { return item.status === 'pending'; })
      .map(function (item) { return { base64: item.base64, url: item.base64 ? null : item.src }; });

    if (!images.length) {
      showToast('没有待处理的图片', 'loading');
      btn.disabled = false;
      hideLoading();
      return;
    }

    progress.textContent = '⏳ 0/' + images.length + ' 处理中...';
    showToast('开始批量处理 ' + images.length + ' 张图片...', 'loading');

    fetch(base + '/api/ai/batch-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: images,
        enable_vision: document.getElementById('chkVisionDetect').checked
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      hideLoading();
      btn.disabled = false;
      if (!data.ok && !data.results) {
        showToast('批量处理失败', 'err');
        progress.textContent = '❌ 处理失败';
        return;
      }

      var done = 0;
      var errors = 0;
      var results = data.results || [];
      var pendingItems = imageQueue.filter(function (item) { return item.status === 'pending'; });

      results.forEach(function (r, i) {
        if (pendingItems[i]) {
          pendingItems[i].status = r.ok ? 'done' : 'error';
          pendingItems[i].result = r;
          if (r.ok && r.cleaned) done++;
          if (!r.ok) errors++;
        }
      });

      var summary = '✅ ' + done + '/' + results.length + ' 已清理';
      if (errors) summary += '，❌ ' + errors + ' 失败';
      if (data.elapsed_ms) summary += '，耗时 ' + (data.elapsed_ms / 1000).toFixed(1) + 's';
      progress.textContent = summary;
      updateImageQueue();

      // 如果有清理成功的，显示第一张结果
      if (done > 0) {
        var firstDone = imageQueue.find(function (item) { return item.status === 'done' && item.result && item.result.url; });
        if (firstDone) {
          var cleanUrl = firstDone.result.url;
          if (cleanUrl.indexOf('http') !== 0) cleanUrl = base + cleanUrl;
          cleanedImageSrc = cleanUrl;
          showCompare(firstDone.src, cleanUrl);
        }
      }

      showToast(summary, done > 0 ? 'ok' : 'err');
    }).catch(function (err) {
      hideLoading();
      btn.disabled = false;
      progress.textContent = '❌ ' + err.message;
      showToast('批量处理失败: ' + err.message, 'err');
    });
  }

  // ========== 批量清理（水印+去中文，OCR+AI视觉）==========
  function batchCleanFull() {
    if (!imageQueue.length) return;

    var base = getServerBase();
    var progress = document.getElementById('batchFullProgress');
    var btn = document.getElementById('btnBatchCleanFull');
    btn.disabled = true;

    var enableVision = document.getElementById('chkVisionDetect').checked;
    var visionType = document.getElementById('selVisionType').value;
    var chineseOnly = document.getElementById('chkChineseOnly').checked;
    var minConf = parseFloat(document.getElementById('confSlider').value);
    var dilatePx = parseInt(document.getElementById('expandSlider').value) || 20;

    var images = imageQueue.filter(function (item) { return item.status === 'pending'; })
      .map(function (item) { return { base64: item.base64, url: item.base64 ? null : item.src }; });

    if (!images.length) {
      showToast('没有待处理的图片', 'loading');
      btn.disabled = false;
      return;
    }

    var modeLabel = enableVision ? '水印+去中文（AI视觉+OCR）' : '去中文（OCR only）';
    progress.textContent = '⏳ 0/' + images.length + ' ' + modeLabel + ' 处理中...';
    showToast('开始批量处理 ' + images.length + ' 张图片 [' + modeLabel + ']', 'loading');
    showLoading();

    fetch(base + '/api/ai/batch-clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: images,
        enable_ocr: true,
        enable_vision: enableVision,
        vision_type: visionType,
        chinese_only: chineseOnly,
        min_confidence: minConf,
        dilate_px: dilatePx,
        concurrency: 2,
        upload_to_smms: true
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      hideLoading();
      btn.disabled = false;
      if (!data.ok && !data.results) {
        showToast('批量处理失败', 'err');
        progress.textContent = '❌ 处理失败';
        return;
      }

      var done = 0;
      var totalOcr = 0, totalVision = 0;
      var results = data.results || [];
      var pendingItems = imageQueue.filter(function (item) { return item.status === 'pending'; });

      results.forEach(function (r, i) {
        if (pendingItems[i]) {
          pendingItems[i].status = r.ok ? 'done' : 'error';
          pendingItems[i].result = r;
          if (r.ok && r.cleaned) done++;
          totalOcr += (r.ocrCount || 0);
          totalVision += (r.visionCount || 0);
        }
      });

      var summary = '完成: ' + done + '/' + results.length + ' 已清理';
      if (enableVision) summary += ' (OCR:' + totalOcr + '区域, 视觉:' + totalVision + '区域)';
      summary += ', 耗时: ' + (data.elapsed_ms / 1000).toFixed(1) + 's';
      progress.textContent = summary;
      updateImageQueue();
      showToast('✅ ' + summary, 'ok');
    }).catch(function (err) {
      hideLoading();
      btn.disabled = false;
      progress.textContent = '❌ ' + err.message;
      showToast('批量处理失败: ' + err.message, 'err');
    });
  }

  // ========== 导出 ==========
  function downloadResult() {
    if (!cleanedImageSrc) {
      showToast('请先执行去中文操作', 'err');
      return;
    }
    var a = document.createElement('a');
    a.href = cleanedImageSrc;
    a.download = 'cleaned_' + Date.now() + '.png';
    a.click();
  }

  function copyToSmms() {
    if (!cleanedImageSrc) {
      showToast('请先执行去中文操作', 'err');
      return;
    }
    showToast('上传中...', 'loading');
    // TODO: 实现 smms 上传
  }

  // ========== 工具 ==========
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      img.onerror = function () {
        var proxyUrl = getServerBase() + '/api/proxy-image?url=' + encodeURIComponent(url);
        var img2 = new Image();
        img2.crossOrigin = 'anonymous';
        img2.onload = function () {
          var c = document.createElement('canvas');
          c.width = img2.naturalWidth; c.height = img2.naturalHeight;
          c.getContext('2d').drawImage(img2, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        img2.onerror = function () { reject(new Error('图片加载失败')); };
        img2.src = proxyUrl;
      };
      img.src = url;
    });
  }

  // ========== 事件绑定 ==========
  document.getElementById('btnLoadUrl').addEventListener('click', function () {
    var urls = imageUrlInput.value.trim().split(/[\r\n]+/).filter(function (s) { return s && /^https?:\/\//.test(s); });
    if (!urls.length) { showToast('请输入有效的图片URL', 'err'); return; }

    if (urls.length === 1) {
      loadFromUrl(urls[0]);
    } else {
      // 批量模式
      showToast('添加 ' + urls.length + ' 张图片到队列', 'loading');
      var loaded = 0;
      urls.forEach(function (url) {
        urlToBase64(url).then(function (b64) {
          imageQueue.push({
            id: nextQueueId++,
            src: b64,
            base64: b64.replace(/^data:image\/\w+;base64,/, ''),
            status: 'pending',
            result: null
          });
          loaded++;
          if (loaded === urls.length) {
            // 第一张显示
            loadFromBase64(imageQueue[0].base64);
            updateImageQueue();
          }
        }).catch(function () {
          loaded++;
        });
      });
    }
  });

  document.getElementById('btnUpload').addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    if (!fileInput.files.length) return;
    var file = fileInput.files[0];
    loadFromFile(file);

    // 多文件加入队列
    if (fileInput.files.length > 1) {
      for (var i = 1; i < fileInput.files.length; i++) {
        (function (f) {
          var reader = new FileReader();
          reader.onload = function (e) {
            var b64 = e.target.result;
            imageQueue.push({
              id: nextQueueId++,
              src: b64,
              base64: b64.replace(/^data:image\/\w+;base64,/, ''),
              status: 'pending',
              result: null
            });
            updateImageQueue();
          };
          reader.readAsDataURL(f);
        })(fileInput.files[i]);
      }
    }
  });

  document.getElementById('btnPasteClipboard').addEventListener('click', function () {
    navigator.clipboard.readText().then(function (text) {
      var url = text.trim();
      if (/^https?:\/\//.test(url)) {
        loadFromUrl(url);
      } else {
        showToast('剪贴板不是有效URL', 'err');
      }
    }).catch(function () {
      showToast('无法读取剪贴板', 'err');
    });
  });

  document.getElementById('btnDetect').addEventListener('click', detectText);
  document.getElementById('btnCleanAll').addEventListener('click', cleanAll);
  document.getElementById('btnDownload').addEventListener('click', downloadResult);
  document.getElementById('btnCopyUrl').addEventListener('click', copyToSmms);
  document.getElementById('btnBatchClean').addEventListener('click', batchClean);
  var btnBatchCleanFull = document.getElementById('btnBatchCleanFull');
  if (btnBatchCleanFull) btnBatchCleanFull.addEventListener('click', batchCleanFull);

  // 滑块
  document.getElementById('confSlider').addEventListener('input', function () {
    document.getElementById('confVal').textContent = parseFloat(this.value).toFixed(2);
  });
  document.getElementById('expandSlider').addEventListener('input', function () {
    document.getElementById('expandVal').textContent = this.value;
  });

  // 拖拽
  var canvasArea = document.getElementById('canvasArea');
  canvasArea.addEventListener('dragover', function (e) { e.preventDefault(); });
  canvasArea.addEventListener('drop', function (e) {
    e.preventDefault();
    var files = e.dataTransfer.files;
    if (files.length) {
      loadFromFile(files[0]);
    } else {
      var url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && /^https?:\/\//.test(url)) loadFromUrl(url);
    }
  });

  // 粘贴
  function onCleanerPaste(e) {
    if (!document.getElementById('canvasArea')) return;
    var items = e.clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === 0) {
        var file = items[i].getAsFile();
        loadFromFile(file);
        return;
      }
    }
  }
  document.removeEventListener('paste', onCleanerPaste);
  document.addEventListener('paste', onCleanerPaste);

  // ========== 从拼图导入 ==========
  document.getElementById('btnImportFromCollage').addEventListener('click', function () {
    if (typeof window._meituGetPool !== 'function') { showToast('拼图模块未加载', 'err'); return; }
    var pool = window._meituGetPool();
    if (!pool || !pool.length) { showToast('拼图列表为空', 'err'); return; }
    showToast('导入 ' + pool.length + ' 张图片...', 'loading');
    var loaded = 0;
    pool.forEach(function (item) {
      var src = item.src || item;
      urlToBase64(src).then(function (b64) {
        imageQueue.push({
          id: nextQueueId++,
          src: b64,
          base64: b64.replace(/^data:image\/\w+;base64,/, ''),
          status: 'pending',
          result: null
        });
        loaded++;
        if (loaded === 1) loadFromBase64(imageQueue[0].base64);
        if (loaded >= pool.length) {
          updateImageQueue();
          showToast('已导入 ' + pool.length + ' 张图片', 'ok');
        }
      }).catch(function () { loaded++; });
    });
  });

  // ========== 添加到拼图列表 ==========
  document.getElementById('btnAddToCollage').addEventListener('click', function () {
    if (!cleanedImageSrc) { showToast('请先执行去中文操作', 'err'); return; }
    if (typeof window._meituAddToPool !== 'function') { showToast('拼图模块未加载', 'err'); return; }
    window._meituAddToPool(cleanedImageSrc);
    showToast('已添加到拼图列表', 'ok');
  });

  // 暴露获取清理后图片接口
  window._meituGetCleanedImages = function () {
    var results = [];
    var base = getServerBase();
    imageQueue.forEach(function (item, queueIdx) {
      if (item.status === 'done' && item.result && !item._replaced) {
        var src = null;
        if (item.result.url && item.result.url.indexOf('http') === 0) {
          src = item.result.url;
        } else if (item.result.url) {
          src = base + item.result.url;
        }
        if (src) {
          results.push({ src: src, original: item.src, base64: item.result.base64 || null, _slot: item._slot || null, ocrCount: item.result.ocrCount, visionCount: item.result.visionCount });
        }
      }
    });
    if (cleanedImageSrc && results.length === 0) {
      results.push({ src: cleanedImageSrc });
    }
    return results;
  };

  // 标记已替换，防止重复处理
  window._meituMarkReplaced = function () {
    imageQueue.forEach(function (item) {
      if (item.status === 'done' && !item._replaced) item._replaced = true;
    });
  };

  // 暴露批量导入接口（供"一键去中文"使用）
  window._meituImportToCleaner = function (urls, slots) {
    if (!urls || !urls.length) return;
    urls.forEach(function (url, i) {
      imageQueue.push({
        id: nextQueueId++,
        src: url,
        base64: null,
        status: 'pending',
        result: null,
        _slot: slots ? slots[i] : null
      });
    });
    updateImageQueue();
    showToast('已导入 ' + urls.length + ' 张图片到批量队列', 'ok');
    if (imageQueue.length > 0 && !currentImageSrc) {
      loadImageSrc(imageQueue[0].src);
    }
  };

  // ========== 初始化 ==========
  checkServices();
}
