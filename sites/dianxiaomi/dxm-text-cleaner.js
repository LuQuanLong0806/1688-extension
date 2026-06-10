/**
 * dxm-text-cleaner.js — 去中文工具测试页面
 * 独立于现有功能，用于验证 OCR 检测 + LaMa 修复流水线
 */
(function () {
  // ========== State ==========
  var serverBase = '';
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
  function getServerBase() {
    if (serverBase) return serverBase;
    var p = new URLSearchParams(window.location.search);
    var s = p.get('server');
    if (s) { serverBase = s; return s; }
    return 'http://localhost:3000';
  }

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
        lamaStatusEl.textContent = 'LaMa ✅';
        lamaStatusEl.className = 'status ok';
      } else {
        lamaStatusEl.textContent = 'LaMa ❌';
        lamaStatusEl.className = 'status err';
      }
    }).catch(function () {
      ocrStatusEl.textContent = 'OCR ❌ 离线';
      ocrStatusEl.className = 'status err';
      lamaStatusEl.textContent = 'LaMa ❌ 离线';
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

    fetch(base + '/api/ai/auto-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: currentImageBuf,
        chinese_only: chineseOnly,
        min_confidence: minConfidence,
        dilate_px: dilatePx,
        enable_vision: false
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

    if (!imageQueue.length) {
      hint.textContent = '尚未添加图片';
      btn.disabled = true;
      imageQueueEl.innerHTML = '<div class="sb-hint">暂无图片</div>';
      return;
    }

    hint.textContent = imageQueue.length + ' 张图片';
    btn.disabled = false;

    var html = '';
    imageQueue.forEach(function (item, i) {
      var statusIcon = item.status === 'done' ? '✅' : item.status === 'error' ? '❌' : item.status === 'processing' ? '⏳' : '⬜';
      html += '<div class="region-item" data-idx="' + i + '">' +
        '<span class="dot ' + (item.status === 'done' ? 'cn' : 'en') + '"></span>' +
        '<span class="text">' + statusIcon + ' 图片 ' + (i + 1) + ' (' + item.status + ')</span>' +
        '</div>';
    });
    imageQueueEl.innerHTML = html;
  }

  // ========== 批量处理 ==========
  function batchClean() {
    if (!imageQueue.length) return;

    var base = getServerBase();
    var progress = document.getElementById('batchProgress');
    var btn = document.getElementById('btnBatchClean');
    btn.disabled = true;

    var images = imageQueue.filter(function (item) { return item.status === 'pending'; })
      .map(function (item) { return { base64: item.base64 }; });

    if (!images.length) {
      showToast('没有待处理的图片', 'loading');
      btn.disabled = false;
      return;
    }

    progress.textContent = '0/' + images.length + ' 处理中...';
    showToast('批量处理 ' + images.length + ' 张图片...', 'loading');

    fetch(base + '/api/ai/batch-clean-chinese', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: images, enable_vision: false })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      btn.disabled = false;
      if (!data.ok) {
        showToast('批量处理失败', 'err');
        return;
      }

      var done = 0;
      var results = data.results || [];
      var pendingItems = imageQueue.filter(function (item) { return item.status === 'pending'; });

      results.forEach(function (r, i) {
        if (pendingItems[i]) {
          pendingItems[i].status = r.ok ? 'done' : 'error';
          pendingItems[i].result = r;
          if (r.ok && r.cleaned) done++;
        }
      });

      progress.textContent = done + '/' + results.length + ' 已清理';
      updateImageQueue();
      showToast('批量处理完成: ' + done + '/' + results.length + ' 张已去中文', 'ok');
    }).catch(function (err) {
      btn.disabled = false;
      progress.textContent = '';
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
  document.addEventListener('paste', function (e) {
    var items = e.clipboardData.items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === 0) {
        var file = items[i].getAsFile();
        loadFromFile(file);
        return;
      }
    }
  });

  // ========== 初始化 ==========
  checkServices();
})();
