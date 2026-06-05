/**
 * meitu-size-annotate.js — 尺寸标注工具
 * OCR检测图片中的尺寸 → 自动填入输入框 → 用户选择/修改 → 生成标注图
 */
function initMeituSizeAnnotate() {
  if (initMeituSizeAnnotate._init) return;
  initMeituSizeAnnotate._init = true;

  // ========== State ==========
  var currentImageSrc = null;
  var currentImageBuf = null;     // base64 (无前缀)
  var detectedSizeGroups = [];    // OCR提取到的尺寸组
  var allDetectedTexts = [];      // OCR检测到的所有文字
  var annotatedImageSrc = null;   // 标注后的图
  var annotatedImageBuf = null;   // 标注后的图 base64
  var selectedGroupIndex = -1;     // 当前选中的尺寸组
  var imageQueue = [];            // 图片队列
  var nextQueueId = 1;
  var isProcessing = false;

  // ========== DOM refs ==========
  var toastEl = document.getElementById('annToast');
  var emptyState = document.getElementById('annEmptyState');
  var canvasWrap = document.getElementById('annCanvasWrap');
  var mainImage = document.getElementById('annMainImage');
  var imageQueueEl = document.getElementById('annImageQueue');
  var btnDetect = document.getElementById('annBtnDetect');
  var btnAdd = document.getElementById('annBtnAddUrl');
  var btnUpload = document.getElementById('annBtnUpload');
  var btnClipboard = document.getElementById('annBtnClipboard');
  var btnBatchAnnotate = document.getElementById('annBtnBatchAnnotate');
  var urlInput = document.getElementById('annUrlInput');
  var fileInput = document.getElementById('annFileInput');
  var sizeGroupsEl = document.getElementById('annSizeGroups');
  var btnGenerate = document.getElementById('annBtnGenerate');
  var btnDownload = document.getElementById('annBtnDownload');
  var btnUploadSmms = document.getElementById('annBtnUploadSmms');
  var btnAppendMain = document.getElementById('annBtnAppendMain');
  var btnReplaceOrig = document.getElementById('annBtnReplaceOrig');
  var progressEl = document.getElementById('annProgress');

  // ========== Toast ==========
  var toastTimer = null;
  function showToast(msg, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.className = 'toast ' + (type || 'ok') + ' show';
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2500);
  }

  // ========== 图片加载 ==========
  function loadImageSrc(src) {
    currentImageSrc = src;
    annotatedImageSrc = null;
    annotatedImageBuf = null;
    detectedSizeGroups = [];
    allDetectedTexts = [];
    selectedGroupIndex = -1;
    mainImage.src = src;
    emptyState.style.display = 'none';
    canvasWrap.style.display = 'inline-block';
    updateSizeGroupsUI();
    updateButtonStates();
  }

  function loadFromUrl(url) {
    var proxyUrl = '/api/proxy-image?url=' + encodeURIComponent(url);
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
      loadImageSrc(url);
    };
    img.src = proxyUrl;
  }

  function loadFromBase64(b64) {
    currentImageBuf = b64.replace(/^data:image\/\w+;base64,/, '');
    loadImageSrc('data:image/png;base64,' + currentImageBuf);
  }

  // ========== OCR 尺寸检测 ==========
  async function detectSizesFromImage() {
    if (!currentImageBuf) { showToast('请先加载图片', 'err'); return; }
    if (isProcessing) return;
    isProcessing = true;
    updateButtonStates();
    showToast('OCR 检测中...', 'loading');

    try {
      var res = await fetch('/api/ai/detect-sizes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'data:image/png;base64,' + currentImageBuf })
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || '检测失败');

      detectedSizeGroups = data.sizeGroups || [];
      allDetectedTexts = data.allTexts || [];

      if (detectedSizeGroups.length > 0) {
        selectedGroupIndex = 0;
        showToast('检测到 ' + detectedSizeGroups.length + ' 组尺寸', 'ok');
        // 自动填入第一组
        fillSizeGroupInputs(0);
      } else {
        showToast('未检测到尺寸文字', 'err');
      }

      updateSizeGroupsUI();
    } catch (e) {
      showToast('检测失败: ' + e.message, 'err');
    } finally {
      isProcessing = false;
      updateButtonStates();
    }
  }

  // ========== 填充尺寸组到输入框 ==========
  function fillSizeGroupInputs(index) {
    var group = detectedSizeGroups[index];
    if (!group) return;
    selectedGroupIndex = index;
    var inputs = sizeGroupsEl.querySelectorAll('.size-input-row');
    inputs.forEach(function (row) {
      var idx = parseInt(row.dataset.index);
      var wInput = row.querySelector('.size-w');
      var hInput = row.querySelector('.size-h');
      if (idx === 0) {
        wInput.value = group.width || '';
        hInput.value = group.height || '';
      }
    });
    // 高亮选中组
    var items = sizeGroupsEl.querySelectorAll('.size-group-item');
    items.forEach(function (item, i) {
      item.classList.toggle('selected', i === index);
    });
    updateButtonStates();
  }

  // ========== 更新尺寸组UI ==========
  function updateSizeGroupsUI() {
    var html = '';

    if (detectedSizeGroups.length > 0) {
      html += '<div style="font-size:11px;color:#999;margin-bottom:8px">OCR 检测到 ' + detectedSizeGroups.length + ' 组尺寸：</div>';
      detectedSizeGroups.forEach(function (group, i) {
        var label = group.label || (group.width + '×' + (group.height || '?'));
      var srcIdx = -1;
      if (group.imageId) {
        for (var qi = 0; qi < imageQueue.length; qi++) {
          if (imageQueue[qi].id === group.imageId) { srcIdx = qi + 1; break; }
        }
      }
        html += '<div class="size-group-item' + (i === selectedGroupIndex ? ' selected' : '') + '" data-index="' + i + '">' +
          '<span class="sgg-icon">📏</span>' +
          '<span class="sgg-label">' + label + '</span>' +
          '<span class="sgg-source" title="来源: ' + (group.source || '') + '">图' + srcIdx + '</span>' +
          '<button class="sgg-use" data-index="' + i + '">使用</button>' +
          '<button class="sgg-fill" data-index="' + i + '">标注</button>' +
          '</div>';
      });
    } else if (allDetectedTexts.length > 0) {
      html += '<div style="font-size:11px;color:#999;margin-bottom:8px">检测到文字但未识别出尺寸：</div>';
      allDetectedTexts.forEach(function (t) {
        html += '<div class="size-group-item"><span class="sgg-icon">📝</span><span class="sgg-label">' + t + '</span></div>';
      });
    } else {
      html += '<div class="sb-hint">加载图片后点击"OCR检测尺寸"自动提取<br>或手动输入尺寸</div>';
    }

    // 手动输入行（始终存在）
    html += '<div class="size-input-row" data-index="0">' +
      '<div class="sir-label">尺寸输入</div>' +
      '<div class="sir-fields">' +
      '<div class="sir-field"><span>长</span><input type="number" class="size-w" placeholder="如14" step="0.1" min="0.1"><span>cm</span></div>' +
      '<div class="sir-field"><span>宽</span><input type="number" class="size-h" placeholder="如5.5" step="0.1" min="0.1"><span>cm</span></div>' +
      '</div></div>';

    sizeGroupsEl.innerHTML = html;

    // 绑定事件
    sizeGroupsEl.querySelectorAll('.sgg-use').forEach(function (btn) {
      btn.onclick = function () {
        fillSizeGroupInputs(parseInt(btn.dataset.index));
        var group = detectedSizeGroups[parseInt(btn.dataset.index)];
        if (group && group.imageId) {
          var target = imageQueue.find(function (q) { return q.id === group.imageId; });
          if (target) selectQueueItem(target.id);
        }
      };
    });
    sizeGroupsEl.querySelectorAll('.sgg-fill').forEach(function (btn) {
      btn.onclick = function () {
        fillSizeGroupInputs(parseInt(btn.dataset.index));
        var group = detectedSizeGroups[parseInt(btn.dataset.index)];
        if (group && group.imageId) {
          var target = imageQueue.find(function (q) { return q.id === group.imageId; });
          if (target) selectQueueItem(target.id);
        }
        generateAnnotation();
      };
    });
    // 输入框变化时清除选中
    sizeGroupsEl.querySelectorAll('.size-input-row input').forEach(function (input) {
      input.addEventListener('input', function () {
        sizeGroupsEl.querySelectorAll('.size-group-item').forEach(function (item) {
          item.classList.remove('selected');
        });
        selectedGroupIndex = -1;
        updateButtonStates();
      });
    });
  }

  // ========== 生成标注图 ==========
  async function generateAnnotation() {
    if (!currentImageBuf) { showToast('请先加载图片', 'err'); return; }

    var wInput = sizeGroupsEl.querySelector('.size-w');
    var hInput = sizeGroupsEl.querySelector('.size-h');
    var widthCm = parseFloat(wInput.value);
    var heightCm = hInput.value ? parseFloat(hInput.value) : null;

    if (!widthCm || widthCm <= 0) { showToast('请输入宽度', 'err'); wInput.focus(); return; }

    isProcessing = true;
    updateButtonStates();
    showToast('生成标注图中...', 'loading');

    try {
      var res = await fetch('/api/ai/annotate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: 'data:image/png;base64,' + currentImageBuf,
          width_cm: widthCm,
          height_cm: heightCm,
          unit: 'cm'
        })
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.error || '生成失败');

      annotatedImageSrc = 'data:image/png;base64,' + data.base64;
      annotatedImageBuf = data.base64;
      mainImage.src = annotatedImageSrc;
      showToast('标注图生成成功', 'ok');
      updateButtonStates();
    } catch (e) {
      showToast('生成失败: ' + e.message, 'err');
    } finally {
      isProcessing = false;
      updateButtonStates();
    }
  }

  // ========== 添加图片到队列 ==========
  function addToQueue(src, base64) {
    var item = {
      id: nextQueueId++,
      src: src,
      base64: base64 || null,
      status: 'pending', // pending | annotated | error
      annotatedSrc: null
    };
    imageQueue.push(item);
    updateImageQueue();
    // 自动选中新添加的
    selectQueueItem(item.id);
    return item;
  }

  function selectQueueItem(id) {
    var item = imageQueue.find(function (q) { return q.id === id; });
    if (!item) return;
    if (item.base64) {
      loadFromBase64(item.base64);
    } else {
      loadFromUrl(item.src);
    }
    updateImageQueue();
  }

  function updateImageQueue() {
    if (!imageQueue.length) {
      imageQueueEl.innerHTML = '<div class="sb-hint">暂无图片</div>';
      return;
    }
    var html = '';
    imageQueue.forEach(function (item) {
      var cls = 'ann-queue-item';
      if (currentImageSrc === item.src || currentImageSrc === 'data:image/png;base64,' + item.base64) cls += ' active';
      if (item.status === 'annotated') cls += ' done';
      if (item.status === 'error') cls += ' error';

      html += '<div class="' + cls + '" data-id="' + item.id + '">' +
        '<img src="' + item.src + '" alt="">' +
        '<div class="aqi-status">' + (item.status === 'annotated' ? '✅' : item.status === 'error' ? '❌' : '') + '</div>' +
        '</div>';
    });
    imageQueueEl.innerHTML = html;

    imageQueueEl.querySelectorAll('.ann-queue-item').forEach(function (el) {
      el.onclick = function () { selectQueueItem(parseInt(el.dataset.id)); };
    });
  }

  // ========== 批量标注 ==========
  async function batchAnnotate() {
    var pending = imageQueue.filter(function (q) { return q.status !== 'annotated'; });
    if (!pending.length) { showToast('没有待标注的图片', 'err'); return; }

    isProcessing = true;
    updateButtonStates();

    var success = 0, fail = 0;
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      var wInput = sizeGroupsEl.querySelector('.size-w');
      var hInput = sizeGroupsEl.querySelector('.size-h');
      var widthCm = parseFloat(wInput.value);
      var heightCm = hInput.value ? parseFloat(hInput.value) : null;
      if (!widthCm || widthCm <= 0) {
        item.status = 'error';
        fail++;
        continue;
      }

      if (progressEl) progressEl.textContent = '标注中 ' + (i + 1) + '/' + pending.length;

      try {
        var buf = item.base64 ? Buffer.from(item.base64, 'base64') : null;
        var bodyData = { width_cm: widthCm, height_cm: heightCm, unit: 'cm' };
        if (item.base64) {
          bodyData.image_base64 = 'data:image/png;base64,' + item.base64;
        } else {
          bodyData.image_url = item.src;
        }
        var res = await fetch('/api/ai/annotate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData)
        });
        var data = await res.json();
        if (data.ok) {
          item.annotatedSrc = data.base64;
          item.status = 'annotated';
          success++;
        } else {
          item.status = 'error';
          fail++;
        }
      } catch (e) {
        item.status = 'error';
        fail++;
      }
    }

    if (progressEl) progressEl.textContent = '';
    updateImageQueue();
    showToast('批量标注完成: ' + success + ' 成功, ' + fail + ' 失败', success > 0 ? 'ok' : 'err');
    isProcessing = false;
    updateButtonStates();
  }

  // ========== 上传图床 ==========
  async function uploadToSmms() {
    if (!annotatedImageBuf) { showToast('请先生成标注图', 'err'); return; }
    showToast('上传中...', 'loading');
    try {
      var res = await fetch('/api/ai/smms-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: 'data:image/png;base64,' + annotatedImageBuf })
      });
      var data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        showToast('已上传并复制链接', 'ok');
      } else {
        showToast('上传失败', 'err');
      }
    } catch (e) {
      showToast('上传失败: ' + e.message, 'err');
    }
  }

  // ========== 下载标注图 ==========
  function downloadAnnotated() {
    if (!annotatedImageSrc) { showToast('请先生成标注图', 'err'); return; }
    var a = document.createElement('a');
    a.href = annotatedImageSrc;
    a.download = 'annotated_' + Date.now() + '.png';
    a.click();
  }

  // ========== 追加到主图 ==========
  function appendToMainImages() {
    if (!annotatedImageBuf) { showToast('请先生成标注图', 'err'); return; }
    if (typeof window._meituAppendToProduct === 'function') {
      window._meituAppendToProduct([annotatedImageSrc], 'main_images');
    } else {
      showToast('未找到商品来源', 'err');
    }
  }

  // ========== 替换原图 ==========
  function replaceOriginal() {
    if (!annotatedImageBuf) { showToast('请先生成标注图', 'err'); return; }
    // 找到当前显示的图片在队列中
    var currentQueueItem = imageQueue.find(function (q) {
      return q.src === currentImageSrc || (q.base64 && currentImageBuf === q.base64);
    });
    if (!currentQueueItem || !currentQueueItem._slot) {
      showToast('无位置信息，请使用"追加到主图"', 'err');
      return;
    }
    var slot = currentQueueItem._slot;
    // 先上传到图床
    showToast('上传中...', 'loading');
    fetch('/api/ai/smms-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: annotatedImageSrc })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.url) { showToast('上传失败', 'err'); return; }
      // 找到 detailModal 并替换
      var app = document.querySelector('#app');
      if (!app || !app.__vue__) { showToast('Vue app not found', 'err'); return; }
      var detailModal = app.__vue__.$root.$refs.detailModal;
      if (!detailModal || !detailModal.editable) { showToast('请先打开商品详情', 'err'); return; }

      var replaced = 0;
      if (slot.field === 'main_images') {
        var imgs = detailModal.editable.main_images;
        if (imgs && slot.index < imgs.length) {
          detailModal.$set(detailModal.editable.main_images, slot.index, d.url);
          replaced++;
        }
      } else if (slot.field === 'detail_images') {
        var imgs = detailModal.editable.detail_images;
        if (imgs && slot.index < imgs.length) {
          detailModal.$set(detailModal.editable.detail_images, slot.index, d.url);
          replaced++;
        }
      } else if (slot.field === 'sku') {
        var skus = detailModal.editable.skus || [];
        for (var si = 0; si < skus.length; si++) {
          if (skus[si].image === slot.url) {
            detailModal.$set(skus[si], 'image', d.url);
            replaced++;
            break;
          }
        }
      }
      if (replaced) showToast('已替换 ' + replaced + ' 张，请保存商品', 'ok');
      else showToast('未找到替换位置', 'err');
    }).catch(function (e) {
      showToast('上传失败: ' + e.message, 'err');
    });
  }

  // ========== 更新按钮状态 ==========
  function updateButtonStates() {
    var hasImage = !!currentImageBuf;
    var hasAnnotated = !!annotatedImageBuf;
    if (btnDetect) btnDetect.disabled = isProcessing || !hasImage;
    if (btnGenerate) btnGenerate.disabled = isProcessing || !hasImage;
    if (btnDownload) btnDownload.disabled = !hasAnnotated;
    if (btnUploadSmms) btnUploadSmms.disabled = !hasAnnotated;
    if (btnAppendMain) btnAppendMain.disabled = !hasAnnotated;
    if (btnReplaceOrig) btnReplaceOrig.disabled = !hasAnnotated;
    if (btnBatchAnnotate) {
      var pending = imageQueue.filter(function (q) { return q.status !== 'annotated'; });
      btnBatchAnnotate.disabled = isProcessing || !pending.length;
    }
  }

  // ========== 初始化 ==========
  updateButtonStates();
  updateSizeGroupsUI();
  updateImageQueue();

  // 绑定按钮
  if (btnDetect) btnDetect.onclick = detectSizesFromImage;
  if (btnGenerate) btnGenerate.onclick = generateAnnotation;
  if (btnDownload) btnDownload.onclick = downloadAnnotated;
  if (btnUploadSmms) btnUploadSmms.onclick = uploadToSmms;
  if (btnAppendMain) btnAppendMain.onclick = appendToMainImages;
  if (btnReplaceOrig) btnReplaceOrig.onclick = replaceOriginal;
  if (btnBatchAnnotate) btnBatchAnnotate.onclick = batchAnnotate;

  if (btnAdd) btnAdd.onclick = function () {
    var url = urlInput.value.trim();
    if (!url) { showToast('请输入URL', 'err'); return; }
    urlInput.value = '';
    addToQueue(url, null);
    showToast('已添加', 'ok');
  };

  if (btnUpload) btnUpload.onclick = function () { fileInput.click(); };
  if (fileInput) fileInput.onchange = function () {
    var files = fileInput.files;
    for (var i = 0; i < files.length; i++) {
      (function (file) {
        var reader = new FileReader();
        reader.onload = function () {
          var b64 = reader.result.replace(/^data:image\/\w+;base64,/, '');
          addToQueue(reader.result, b64);
        };
        reader.readAsDataURL(file);
      })(files[i]);
    }
    fileInput.value = '';
  };

  if (btnClipboard) btnClipboard.onclick = function () {
    navigator.clipboard.read().then(function (items) {
      for (var i = 0; i < items.length; i++) {
        for (var j = 0; j < items[i].types.length; j++) {
          if (items[i].types[j].indexOf('image') === 0) {
            items[i].getType(items[i].types[j]).then(function (blob) {
              var reader = new FileReader();
              reader.onload = function () {
                var b64 = reader.result.replace(/^data:image\/\w+;base64,/, '');
                addToQueue(reader.result, b64);
                showToast('已从剪贴板粘贴', 'ok');
              };
              reader.readAsDataURL(blob);
            });
            return;
          }
        }
      }
      showToast('剪贴板没有图片', 'err');
    }).catch(function () {
      showToast('无法读取剪贴板', 'err');
    });
  };

  // 公开方法供外部调用
  window._meituAnnotateInit = function (images) {
    images.forEach(function (img) {
      var item;
      if (img.base64) {
        item = addToQueue(img.src || '', img.base64);
      } else if (img.url || img.src) {
        item = addToQueue(img.url || img.src, null);
      }
      // 保存 slot 信息用于替换原图
      if (item && img._slot) {
        item._slot = img._slot;
      }
    });
  };

  // 批量 OCR 自动检测所有图片中的尺寸
  window._meituAnnotateAutoDetect = async function () {
    if (!imageQueue.length) { showToast('没有图片', 'err'); return; }
    if (isProcessing) return;
    isProcessing = true;
    updateButtonStates();
    showToast('正在对所有图片进行 OCR 尺寸检测...', 'loading');

    var allSizeGroups = []; // 汇总所有图片检测到的尺寸
    var allTexts = [];
    var processed = 0;
    var total = imageQueue.length;

    for (var i = 0; i < imageQueue.length; i++) {
      var item = imageQueue[i];
      if (progressEl) progressEl.textContent = 'OCR 检测 ' + (i + 1) + '/' + total;

      try {
        // 通过代理获取图片
        var proxyUrl = '/api/proxy-image?url=' + encodeURIComponent(item.src);
        var imgRes = await fetch(proxyUrl);
        var imgBlob = await imgRes.blob();

        // 转为 base64
        var reader = new FileReader();
 var b64 = await new Promise(function (resolve) {
          reader.onload = function () { resolve(reader.result); };
          reader.readAsDataURL(imgBlob);
        });
        var rawBase64 = b64.replace(/^data:image\/\w+;base64,/, '');

        // 保存 base64 以便后续生成标注图时用
        item.base64 = rawBase64;

        // 调用 OCR 检测尺寸
        var ocrRes = await fetch('/api/ai/detect-sizes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: b64 })
        });
        var ocrData = await ocrRes.json();

        if (ocrData.ok && ocrData.sizeGroups && ocrData.sizeGroups.length > 0) {
          ocrData.sizeGroups.forEach(function (g) {
            allSizeGroups.push({
              ...g,
              imageId: item.id,
              imageSrc: item.src
            });
          });
        }
        if (ocrData.allTexts) {
 allTexts = allTexts.concat(ocrData.allTexts);
        }
        processed++;
      } catch (e) {
        console.error('OCR failed for image', item.id, e);
        processed++;
      }
    }

    if (progressEl) progressEl.textContent = '';
    detectedSizeGroups = allSizeGroups;
    allDetectedTexts = allTexts;

    if (allSizeGroups.length > 0) {
      selectedGroupIndex = 0;
      fillSizeGroupInputs(0);
      // 自动选中包含该尺寸的图片
      var firstGroup = allSizeGroups[0];
      var targetItem = imageQueue.find(function (q) { return q.id === firstGroup.imageId; });
      if (targetItem) selectQueueItem(targetItem.id);
      showToast('共 ' + allSizeGroups.length + ' 组尺寸（来自 ' + processed + ' 张图）', 'ok');
    } else {
      showToast('所有图片均未检测到尺寸，请手动输入', 'err');
    }

    updateSizeGroupsUI();
    isProcessing = false;
    updateButtonStates();
  };

  // 追加到主图功能
  window._meituAppendToProduct = function (images, field) {
    var vm = window.__vueApp__ || document.querySelector('#app').__vue__;
    var sourceProduct = vm && vm.$children && vm.$children[0] && vm.$children[0].sourceProduct;
    if (!sourceProduct) { showToast('未检测到来源商品', 'err'); return; }

    showToast('上传中...', 'loading');
    var uploaded = 0;
    var uploadedUrls = [];

    images.forEach(function (src) {
      fetch('/api/ai/smms-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: src })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.url) uploadedUrls.push(d.url);
        uploaded++;
        if (uploaded >= images.length) {
          finishAppend(uploadedUrls, field);
        }
      }).catch(function () {
        uploaded++;
        if (uploaded >= images.length) finishAppend(uploadedUrls, field);
      });
    });

    function finishAppend(urls, field) {
      if (!urls.length) { showToast('上传失败', 'err'); return; }
      var detailModal = vm.$children[0].$root.$refs.detailModal;
      if (!detailModal || !detailModal.editable) { showToast('请先打开商品详情', 'err'); return; }

      var existing = detailModal.editable[field] || [];
      var normalized = existing.map(function (item) {
        return typeof item === 'string' ? item : (item && item.url) || '';
      }).filter(Boolean);
      var existingSet = {};
      normalized.forEach(function (u) { existingSet[u] = true; });
      var added = 0;
      urls.forEach(function (u) {
        if (!existingSet[u]) { normalized.push(u); added++; }
      });
      if (!added) { showToast('已存在', 'err'); return; }

      detailModal.$set(detailModal.editable, field, normalized);
      showToast('已追加 ' + added + ' 张到主图', 'ok');
    }
  };
}
