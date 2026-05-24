// 小秘美图 — 拼图 + 去中文双标签页
Vue.component('page-meitu', {
  data: function () {
    return { activeTab: 'collage', sourceProduct: null };
  },
  watch: {
    activeTab: function (tab) {
      var vm = this;
      // v-if 销毁重建 DOM，必须重置 _init 让 init 函数重新绑定事件
      if (tab === 'collage') {
        if (typeof initMeituCollage === 'function') initMeituCollage._init = false;
      } else {
        if (typeof initMeituTextCleaner === 'function') initMeituTextCleaner._init = false;
      }
      this.$nextTick(function () {
        if (tab === 'collage') {
          if (typeof initMeituCollage === 'function') initMeituCollage();
          vm.checkPendingImport();
        } else {
          if (typeof initMeituTextCleaner === 'function') initMeituTextCleaner();
        }
      });
    }
  },
  mounted: function () {
    var vm = this;
    try {
      var pid = sessionStorage.getItem('__meitu_source_product');
      if (pid) vm.sourceProduct = pid;
    } catch (e) {}
    this.$nextTick(function () {
      if (typeof initMeituCollage === 'function') {
        initMeituCollage._init = false;
        initMeituCollage();
      }
      vm.checkPendingImport();
      vm.checkPendingEditImage();
    });
  },
  beforeDestroy: function () {
    if (typeof initMeituCollage === 'function') initMeituCollage._init = false;
    if (typeof initMeituTextCleaner === 'function') initMeituTextCleaner._init = false;
  },
  methods: {
    checkPendingImport: function () {
      try {
        var raw = sessionStorage.getItem('__meitu_pending_import');
        if (!raw) return;
        sessionStorage.removeItem('__meitu_pending_import');
        var urls = JSON.parse(raw);
        if (urls && urls.length && typeof window._meituImportImages === 'function') {
          window._meituImportImages(urls);
        }
      } catch (e) {}
    },
    checkPendingEditImage: function () {
      try {
        var raw = sessionStorage.getItem('__meitu_edit_image');
        if (!raw) return;
        sessionStorage.removeItem('__meitu_edit_image');
        var data = JSON.parse(raw);
        if (data && data.url && typeof window._meituEditSingleImage === 'function') {
          window._meituEditSingleImage(data.url);
        }
      } catch (e) {}
    },
    replaceToProduct: function (images) {
      var vm = this;
      if (!vm.sourceProduct) { vm.$Message.warning('未检测到来源商品'); return; }
      if (!images || !images.length) { vm.$Message.warning('没有可替换的图片'); return; }
      var field = 'main_images';
      var uploaded = 0;
      var uploadedUrls = [];
      vm.$Message.loading({ content: '正在上传图片到图床...', duration: 0 });
      images.forEach(function (src) {
        // 优先使用缓存（"复制拼图地址"可能已上传过）
        var cached = typeof window._meituGetUploadedUrl === 'function' ? window._meituGetUploadedUrl(src) : null;
        if (cached) {
          uploadedUrls.push(cached);
          uploaded++;
          if (uploaded >= images.length) {
            vm.$Message.destroy();
            vm.appendImagesToProduct(field, uploadedUrls);
          }
          return;
        }
        var base64 = src.indexOf('data:') === 0 ? src.replace(/^data:image\/\w+;base64,/, '') : src;
        fetch('/api/ai/smms-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: src })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.url) {
            uploadedUrls.push(d.url);
            if (typeof window._meituCacheUploadedUrl === 'function') window._meituCacheUploadedUrl(src, d.url);
          }
          uploaded++;
          if (uploaded >= images.length) {
            vm.$Message.destroy();
            if (uploadedUrls.length) vm.appendImagesToProduct(field, uploadedUrls);
            else vm.$Message.error('上传失败');
          }
        }).catch(function () {
          uploaded++;
          if (uploaded >= images.length) {
            vm.$Message.destroy();
            if (uploadedUrls.length) vm.appendImagesToProduct(field, uploadedUrls);
            else vm.$Message.error('上传失败');
          }
        });
      });
    },
    appendImagesToProduct: function (field, urls) {
      var vm = this;
      // 直接更新详情弹窗的 editable 数据（不保存到数据库，用户确认后自行保存）
      var detailModal = vm.$root.$refs.detailModal;
      if (detailModal && detailModal.editable) {
        var existing = detailModal.editable[field] || [];
        // 归一化为 URL 数组
        var normalized = existing.map(function (item) {
          return typeof item === 'string' ? item : (item && item.url) || '';
        }).filter(Boolean);
        // 去重追加
        var existingSet = {};
        normalized.forEach(function (u) { existingSet[u] = true; });
        var added = 0;
        urls.forEach(function (u) {
          if (!existingSet[u]) { normalized.push(u); added++; }
        });
        if (!added) { vm.$Message.info('所有图片已存在，无需追加'); return; }
        // 更新详情弹窗数据
        vm.$set(detailModal.editable, field, normalized);
        // 默认选中新添加的图片
        var selectedField = field === 'main_images' ? 'selectedMainIndexes'
          : field === 'detail_images' ? 'selectedDetailIndexes' : null;
        if (selectedField) {
          var existing = detailModal[selectedField] || [];
          var newIndexes = existing.slice();
          for (var i = normalized.length - added; i < normalized.length; i++) {
            newIndexes.push(i);
          }
          detailModal[selectedField] = newIndexes;
        }
        vm.$Message.success('已添加 ' + added + ' 张图片到主图，请保存商品以生效');
      } else {
        vm.$Message.warning('请先打开商品详情');
      }
    },
    replaceFromCollage: function () {
      var vm = this;
      if (typeof window._meituExportCanvas !== 'function') { vm.$Message.warning('拼图模块未加载'); return; }
      vm.$Message.loading({ content: '正在生成拼图...', duration: 0 });
      window._meituExportCanvas(function (dataUrl) {
        if (!dataUrl) {
          vm.$Message.destroy();
          vm.$Message.warning('画布为空，请先拼图');
          return;
        }
        vm.$Message.destroy();
        vm.replaceToProduct([dataUrl]);
      });
    },
    replaceFromCleaner: function () {
      if (typeof window._meituGetCleanedImages !== 'function') { this.$Message.warning('请先执行去中文操作'); return; }
      var cleaned = window._meituGetCleanedImages();
      if (!cleaned || !cleaned.length) { this.$Message.warning('没有已清理的图片'); return; }
      this.replaceToProduct(cleaned.map(function (c) { return c.src; }));
    }
  },
  template: `
    <div class="meitu-page">
      <div class="meitu-tabs">
        <div class="meitu-tab" :class="{ active: activeTab === 'collage' }" @click="activeTab = 'collage'">拼图工具</div>
        <div class="meitu-tab" :class="{ active: activeTab === 'cleaner' }" @click="activeTab = 'cleaner'">去中文</div>
      </div>
      <div class="meitu-tab-body">
        <!-- 拼图工具 -->
        <div v-if="activeTab === 'collage'" class="collage-layout">
          <div class="collage-sidebar">
            <div class="sb-section">
              <div class="sb-title">操作</div>
              <button class="sb-btn primary" id="btnPasteUrl">贴图</button>
              <button class="sb-btn" id="btnPreview">预览</button>
            </div>
            <div class="sb-section">
              <button class="sb-btn primary big" id="btnEditImage">✏️ 编辑图片</button>
              <div class="sb-hint" id="editHint">添加图片后可用</div>
            </div>
            <div class="sb-section">
              <div class="sb-title">文字</div>
              <input type="text" class="sb-text-input" id="textContent" placeholder="输入文字内容">
              <div class="sb-slider">
                <div class="slider-header"><span>字号</span><span class="slider-val" id="fontSizeVal">24</span></div>
                <input type="range" id="fontSizeRange" min="12" max="72" value="24">
              </div>
              <div class="sb-color-row"><label>颜色</label><input type="color" id="textColor" value="#ffffff"></div>
              <button class="sb-btn primary" id="btnAddText">添加到画布</button>
            </div>
            <div class="sb-spacer"></div>
            <div class="sb-section">
              <button class="sb-btn primary" id="btnCopyCollage" style="background:linear-gradient(135deg,#ff6d00,#e65100);border-color:#e65100;font-weight:bold">复制拼图地址</button>
              <button class="sb-btn primary" id="btnGenCollage">生成拼图</button>
              <button class="sb-btn primary" id="btnExport">导出拼图</button>
              <button class="sb-btn danger" id="btnClear">清空画布</button>
            </div>
            <div class="sb-section" v-if="sourceProduct">
              <button class="sb-btn primary" style="background:linear-gradient(135deg,#2e7d32,#43a047);border-color:#2e7d32;font-weight:bold" @click="replaceFromCollage">添加到主图</button>
            </div>
          </div>
          <div class="collage-main">
            <div class="custom-area show" id="customArea">
              <div class="custom-body" style="position:relative">
                <div class="canvas-area">
                  <div class="canvas-wrap" id="canvasWrap">
                    <div class="canvas-board" id="canvasBoard"></div>
                    <div class="board-resize board-resize-r" id="resizeR"></div>
                    <div class="board-resize board-resize-b" id="resizeB"></div>
                    <div class="board-resize board-resize-rb" id="resizeRB"></div>
                  </div>
                  <div class="canvas-size" id="canvasSize">800 × 800</div>
                </div>
              </div>
            </div>
            <div class="collage-right-panel" id="rightPanel">
              <div class="rp-section">
                <div class="rp-title" style="display:flex;align-items:center;justify-content:space-between">图片列表 <span style="display:flex;gap:4px"><button class="pool-toggle-all" id="poolToggleAll" title="全选/取消">全选</button><button class="pool-del-sel" id="poolDelSel" title="删除选中" style="display:none">🗑 删</button><button class="pool-clear" id="poolClear" title="清空列表">清空</button></span></div>
                <div class="pool-grid" id="poolBar"></div>
              </div>
              <div class="rp-section">
                <div class="rp-title">一键拼图</div>
                <div class="auto-layout-opts" id="autoLayoutOpts">
                  <button class="al-opt" data-cols="1" data-rows="1">1×1</button>
                  <button class="al-opt" data-cols="2" data-rows="2">2×2</button>
                  <button class="al-opt" data-cols="3" data-rows="3">3×3</button>
                  <button class="al-opt active" data-cols="0" data-rows="0">自动</button>
                </div>
                <button class="sb-btn primary big" id="btnAutoLayout">一键拼图</button>
              </div>
              <div class="rp-empty" id="rpEmpty">粘贴或拖入图片<br>拖拽到画布/宫格</div>
              <div class="rp-content" id="rpContent">
                <div class="rp-section"><div class="rp-title">预览</div><div class="rp-preview"><img id="rpPreviewImg" src="" alt=""></div></div>
                <div class="rp-section"><div class="rp-title">尺寸</div>
                  <div class="rp-row"><span class="rp-label">宽</span><input class="rp-input" type="number" id="propW" min="10" max="4000"></div>
                  <div class="rp-row"><span class="rp-label">高</span><input class="rp-input" type="number" id="propH" min="10" max="4000"></div>
                </div>
                <div class="rp-section"><div class="rp-title">旋转</div><div class="rp-row"><span class="rp-val" id="propRot">0°</span></div></div>
                <div class="rp-section"><div class="rp-title">图层</div>
                  <div class="rp-btns"><button class="rp-btn" id="propDown">↓</button><button class="rp-btn" id="propUp">↑</button><button class="rp-btn primary" id="propTop">⤒</button></div>
                </div>
                <div class="rp-section"><button class="rp-btn" id="propDelete" style="width:100%;color:#ff6b6b;border-color:#ffccc7">删除</button></div>
              </div>
            </div>
          </div>
          <!-- 编辑器弹窗 -->
          <div class="editor-modal" id="editorModal">
            <div class="editor-top">
              <div class="ed-top-left">
                <svg class="ed-top-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span class="ed-top-title">图片编辑</span>
              </div>
              <div style="flex:1"></div>
              <div class="ed-top-right">
                <button class="sb-btn" id="editorCancel">关闭</button>
                <button class="sb-btn" id="edCopyImgUrl" style="background:#ff6d00;color:#fff;border-color:#ff6d00;font-weight:bold">复制图片地址</button>
                <button class="sb-btn" id="editorSave" style="background:#2e7d32;color:#fff;border-color:#2e7d32;font-weight:bold">应用并关闭</button>
              </div>
            </div>
            <div class="ed-floating-bar" id="edFloatingBar">
              <div class="ed-float-handle" id="edFloatHandle" title="拖动移动">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" style="opacity:.5"><circle cx="4" cy="4" r="1.5"/><circle cx="12" cy="4" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="12" cy="8" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/></svg>
              </div>
              <div class="ed-float-sep"></div>
              <button class="ed-float-btn" id="edUndo" title="撤销 (Ctrl+Z)">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h8a3 3 0 110 6H8"/><path d="M6 4L3 7l3 3"/></svg>
                <span>撤销</span>
              </button>
              <button class="ed-float-btn" id="edRedo" title="重做 (Ctrl+Y)">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 7H5a3 3 0 100 6h3"/><path d="M10 4l3 3-3 3"/></svg>
                <span>重做</span>
              </button>
              <div class="ed-float-sep"></div>
              <div class="ed-float-btns" id="edFloatBtns"></div>
            </div>
            <div class="editor-body">
              <div class="editor-left">
                <div class="acc-section open" data-mode="erase">
                  <div class="acc-header">AI消除 <span class="acc-icon">🧹</span></div>
                  <div class="acc-body"><div class="acc-inner">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">点击快捷工具栏按钮激活涂抹，松手自动调用AI消除</div>
                    <div class="acc-btn-row" style="margin-bottom:6px">
                      <button class="acc-btn active" id="edEraseBrush">画笔</button>
                      <button class="acc-btn" id="edEraseBox">框选</button>
                    </div>
                    <div class="acc-slider">
                      <div class="slider-header"><span>笔刷大小</span><span class="slider-val" id="edEraseBrushVal">20</span></div>
                      <input type="range" id="edEraseBrushSize" min="5" max="80" value="20">
                    </div>
                  </div></div>
                </div>
                <div class="acc-section">
                  <div class="acc-header">旋转翻转 <span class="acc-icon">🔄</span></div>
                  <div class="acc-body"><div class="acc-inner">
                    <button class="acc-btn" id="edRotate90">↻ 旋转 90°</button>
                    <button class="acc-btn" id="edFlipH">↔ 水平翻转</button>
                  </div></div>
                </div>
                <div class="acc-section">
                  <div class="acc-header">滤镜调节 <span class="acc-icon">🎨</span></div>
                  <div class="acc-body"><div class="acc-inner">
                    <div class="acc-slider"><div class="slider-header"><span>亮度</span><span class="slider-val" id="edBrightVal">100</span></div><input type="range" id="edBright" min="0" max="200" value="100"></div>
                    <div class="acc-slider"><div class="slider-header"><span>对比度</span><span class="slider-val" id="edContrastVal">100</span></div><input type="range" id="edContrast" min="0" max="200" value="100"></div>
                    <div class="acc-slider"><div class="slider-header"><span>饱和度</span><span class="slider-val" id="edSaturateVal">100</span></div><input type="range" id="edSaturate" min="0" max="200" value="100"></div>
                    <div class="acc-btn-row"><button class="acc-btn" id="edFilterReset">重置</button><button class="acc-btn primary" id="edFilterApply">应用</button></div>
                  </div></div>
                </div>
                <div class="acc-section" data-mode="mosaic">
                  <div class="acc-header">马赛克 <span class="acc-icon">🔲</span></div>
                  <div class="acc-body"><div class="acc-inner">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">点击快捷工具栏按钮激活涂抹，松手自动应用</div>
                    <div class="acc-btn-row" style="margin-bottom:6px">
                      <button class="acc-btn active" id="edMosBrush">画笔</button>
                      <button class="acc-btn" id="edMosBox">框选</button>
                    </div>
                    <div class="acc-slider">
                      <div class="slider-header"><span>笔刷大小</span><span class="slider-val" id="edMosBrushVal">20</span></div>
                      <input type="range" id="edMosBrushSize" min="5" max="80" value="20">
                    </div>
                  </div></div>
                </div>
                <div class="acc-section">
                  <div class="acc-header">AI工具 <span class="acc-icon">✨</span></div>
                  <div class="acc-body"><div class="acc-inner">
                    <button class="acc-btn" id="edAiCutout">AI 抠图</button>
                    <button class="acc-btn" id="edAiWhiteBg">AI 白底图</button>
                    <button class="acc-btn" id="edAiEnhance">AI 画质增强</button>
                  </div></div>
                </div>
              </div>
              <div class="editor-center">
                <div class="editor-canvas-wrap" id="editorCanvasWrap">
                  <canvas id="editorImgCanvas"></canvas>
                  <canvas id="editorMaskCanvas"></canvas>
                </div>
                <div class="editor-status" id="editorStatus">就绪</div>
                <div class="editor-processing" id="editorProcessing">
                  <div class="ai-spinner"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
                  <div class="editor-processing-text" id="editorProcessText">处理中...</div>
                </div>
              </div>
              <div class="editor-right">
                <div class="er-title">图片列表 (<span id="erCount">0</span>)</div>
                <div class="er-list" id="editorImageList"></div>
              </div>
            </div>
          </div>
          <div class="preview-mask" id="previewMask">
            <div class="preview-box"><img id="previewImg" src="" alt="预览"><button class="preview-close" id="previewClose">关闭</button></div>
          </div>
          <div class="ai-processing" id="aiProcessing" style="display:none">
            <div class="ai-spinner"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
            <div class="ai-processing-text" id="aiProcessText">处理中...</div>
          </div>
          <div class="toast" id="toast"></div>
        </div>

        <!-- 去中文工具 -->
        <div v-if="activeTab === 'cleaner'" class="cleaner-layout">
          <div class="cleaner-sidebar">
            <div class="sb-section" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:700">🧹 去中文工具</span>
              <span class="service-status" id="ocrStatus">OCR 检测中...</span>
              <span class="service-status" id="lamaStatus">LaMa 检测中...</span>
            </div>
            <div class="sb-section">
              <div class="sb-title">📥 图片输入</div>
              <button class="sb-btn primary" id="btnImportFromCollage" style="margin-bottom:4px">从拼图列表导入</button>
              <textarea class="sb-text-input" id="imageUrlInput" rows="3" placeholder="粘贴图片URL（多个换行分隔）"></textarea>
              <button class="sb-btn" id="btnLoadUrl">加载URL图片</button>
              <button class="sb-btn" id="btnUpload">上传本地图片</button>
              <input type="file" id="fileInput" accept="image/*" multiple style="display:none">
              <button class="sb-btn" id="btnPasteClipboard">从剪贴板粘贴</button>
              <div class="sb-hint">支持拖拽图片到画布</div>
            </div>
            <div class="sb-section">
              <div class="sb-title">🔍 检测设置</div>
              <label class="sb-check"><input type="checkbox" id="chkChineseOnly" checked> 仅检测中文</label>
              <div class="sb-slider">
                <div class="slider-header"><span>最低置信度</span><span class="slider-val" id="confVal">0.50</span></div>
                <input type="range" id="confSlider" min="0.1" max="0.95" step="0.05" value="0.5">
              </div>
              <div class="sb-slider">
                <div class="slider-header"><span>膨胀像素</span><span class="slider-val" id="expandVal">8</span></div>
                <input type="range" id="expandSlider" min="0" max="30" step="1" value="8">
              </div>
              <button class="sb-btn primary" id="btnDetect">🔍 检测文字</button>
            </div>
            <div class="sb-section">
              <div class="sb-title">✨ 一键去中文</div>
              <button class="sb-btn primary" id="btnCleanAll" style="background:linear-gradient(135deg,#ff6b35,#e94560)">✨ 检测 + 修复</button>
              <div class="sb-hint">OCR检测 → 生成Mask → LaMa修复</div>
            </div>
            <div class="sb-section">
              <div class="sb-title">💾 导出</div>
              <button class="sb-btn" id="btnDownload">下载结果图</button>
              <button class="sb-btn" id="btnCopyUrl">复制到图床</button>
              <button class="sb-btn primary" id="btnAddToCollage">添加到拼图列表</button>
            </div>
            <div class="sb-section">
              <div class="sb-title">🔄 批量模式</div>
              <div class="sb-hint" id="batchHint">尚未添加图片</div>
              <button class="sb-btn" id="btnBatchClean" disabled>批量去中文</button>
              <div class="sb-hint" id="batchProgress"></div>
            </div>
            <div class="sb-section" v-if="sourceProduct">
              <button class="sb-btn primary" style="background:linear-gradient(135deg,#2e7d32,#43a047);border-color:#2e7d32;font-weight:bold" @click="replaceFromCleaner">替换回商品</button>
            </div>
          </div>
          <div class="cleaner-canvas-area" id="canvasArea">
            <div class="empty-state" id="emptyState">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              <p>拖拽图片到这里，或从左侧输入URL</p>
            </div>
            <div class="cleaner-canvas-wrap" id="canvasWrap" style="display:none">
              <div class="cleaner-canvas-board" id="canvasBoard">
                <img id="mainImage" src="" alt="">
                <canvas id="overlayCanvas"></canvas>
              </div>
              <div class="loading-overlay" id="loadingOverlay" style="display:none">
                <div class="loading-spinner"></div>
              </div>
            </div>
            <div class="compare-wrap" id="compareWrap" style="display:none">
              <div class="compare-side">
                <div class="compare-label">原图</div>
                <img id="compareOrig" src="">
              </div>
              <div class="compare-side">
                <div class="compare-label">去中文后</div>
                <img id="compareClean" src="">
              </div>
            </div>
          </div>
          <div class="cleaner-right-panel">
            <div class="rp-section">
              <div class="rp-title">📊 检测统计</div>
              <div class="rp-stat">
                <div class="stat"><div class="num" id="statTotal">0</div><div class="label">文字区域</div></div>
                <div class="stat"><div class="num" id="statChinese">0</div><div class="label">含中文</div></div>
                <div class="stat"><div class="num" id="statEnglish">0</div><div class="label">纯英文</div></div>
              </div>
              <div class="sb-hint" id="detectTime"></div>
            </div>
            <div class="rp-section">
              <div class="rp-title">📝 检测结果</div>
              <div class="region-list" id="regionList">
                <div class="sb-hint">暂无检测结果</div>
              </div>
            </div>
            <div class="rp-section">
              <div class="rp-title">🖼️ 图片队列</div>
              <div class="region-list" id="imageQueue">
                <div class="sb-hint">暂无图片</div>
              </div>
            </div>
          </div>
          <div class="toast" id="toast"></div>
        </div>
      </div>
    </div>`
});
