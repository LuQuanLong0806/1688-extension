// 小秘美图编辑器 — 基于 Fabric.js 自建（对标店小秘小秘美图）
Vue.component('meitu-editor', {
  props: {
    imageUrl: { type: String, default: '' },
    productId: { type: [String, Number], default: '' },
    field: { type: String, default: 'main_images' },
    index: { type: Number, default: 0 },
    mode: { type: String, default: 'modal' } // 'modal' | 'page'
  },
  data: function () {
    return {
      canvas: null,
      activeTool: '',
      hasImage: false,
      history: [],
      redoStack: [],
      maxHistory: 30,
      saving: false,
      // 裁剪
      cropMode: false,
      cropRect: null,
      cropPreset: '',
      // 文字
      textContent: '',
      textColor: '#ffffff',
      textSize: 24,
      textBold: false,
      // 滤镜
      filters: { brightness: 0, contrast: 0, saturation: 0 },
      // 消除
      eraseMode: false,
      eraseBrushSize: 20,
      eraseStrokes: [],
      eraseTool: 'brush',
      // 马赛克
      mosaicMode: false,
      mosaicSize: 15,
      // 换背景
      bgColor: '',
      // 水印
      watermarkText: '',
      watermarkOpacity: 30,
      watermarkSize: 20,
      watermarkColor: '#ffffff',
      watermarkAngle: -30,
      // AI
      aiProcessing: false,
      aiProgress: '',
      aiPrompt: '电商产品主图，纯白背景，高清简约',
      aiModel: 'cogview-3-flash',
      aiSize: '1024x1024',
      aiApiKey: '',
      aiKeyConfigured: false,
      aiKeyMasked: '',
      aiKeyEditing: false
    };
  },
  watch: {
    imageUrl: function (val) {
      if (val) this.loadImage(val);
    }
  },
  mounted: function () {
    var vm = this;
    vm.$nextTick(function () {
      vm.waitForContainer();
    });
    vm.checkAiKey();
    window.addEventListener('keydown', this.onKeydown);
  },
  beforeDestroy: function () {
    window.removeEventListener('keydown', this.onKeydown);
    if (this.canvas) {
      this.canvas.dispose();
      this.canvas = null;
    }
  },
  methods: {
    // ===== Canvas 初始化 =====
    waitForContainer: function () {
      var vm = this;
      var tries = 0;
      (function poll() {
        var wrap = vm.$refs.canvasWrap;
        if (wrap && wrap.clientHeight > 100) {
          vm.initCanvas();
          if (vm.imageUrl) vm.loadImage(vm.imageUrl);
          return;
        }
        tries++;
        if (tries > 50) {
          vm.initCanvas();
          return;
        }
        setTimeout(poll, 100);
      })();
    },

    initCanvas: function () {
      var wrap = this.$refs.canvasWrap;
      if (!wrap) return;
      var w = wrap.clientWidth || 800;
      var h = wrap.clientHeight || 600;
      this.canvas = new fabric.Canvas(this.$refs.canvas, {
        width: w,
        height: h,
        backgroundColor: 'transparent',
        preserveObjectStacking: true,
        selection: true
      });
      // 监听对象修改用于撤销
      var vm = this;
      this.canvas.on('object:modified', function () { vm.saveHistory(); });
      this.canvas.on('path:created', function () { vm.saveHistory(); });
    },

    resizeCanvas: function () {
      var wrap = this.$refs.canvasWrap;
      if (!wrap || !this.canvas) return;
      this.canvas.setDimensions({ width: wrap.clientWidth, height: wrap.clientHeight });
    },

    // ===== 图片加载 =====
    loadImage: function (url) {
      var vm = this;
      var src = url;
      // 外部URL走代理
      if (url && url.indexOf('http') === 0 && url.indexOf('localhost') === -1 && url.indexOf('/uploads/') === -1) {
        src = '/api/proxy-image?url=' + encodeURIComponent(url);
      }
      fabric.Image.fromURL(src, function (img) {
        if (!img || !img.width) {
          vm.$Message.error('图片加载失败');
          return;
        }

        // AI生成的图片（/uploads/ai_开头）自动裁掉右下角水印
        if (url && url.indexOf('/uploads/ai_') !== -1) {
          var el = img.getElement();
          var w = img.width;
          var h = img.height;
          var cropH = 30;
          if (h > cropH) {
            var tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = w;
            tmpCanvas.height = h - cropH;
            var ctx = tmpCanvas.getContext('2d');
            ctx.drawImage(el, 0, 0, w, h - cropH, 0, 0, w, h - cropH);
            img = new fabric.Image(tmpCanvas);
          }
        }

        vm.canvas.clear();
        vm.canvas.backgroundColor = 'transparent';
        // 适配画布尺寸
        var wrap = vm.$refs.canvasWrap;
        var maxW = wrap.clientWidth - 40;
        var maxH = wrap.clientHeight - 40;
        var scale = Math.min(maxW / img.width, maxH / img.height, 1);
        img.set({
          left: (wrap.clientWidth - img.width * scale) / 2,
          top: (wrap.clientHeight - img.height * scale) / 2,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
          name: 'bgImage'
        });
        vm.canvas.add(img);
        vm.canvas.renderAll();
        vm.hasImage = true;
        vm.history = [];
        vm.redoStack = [];
        vm.saveHistory();
        vm.$emit('loaded');
      }, { crossOrigin: 'anonymous' });
    },

    loadFromFile: function (file) {
      if (!file) return false;
      var vm = this;
      var reader = new FileReader();
      reader.onload = function (ev) {
        vm.loadImage(ev.target.result);
      };
      reader.readAsDataURL(file);
      return false;
    },

    // ===== 历史记录（撤销/重做）=====
    saveHistory: function () {
      if (!this.canvas) return;
      var json = this.canvas.toJSON();
      this.history.push(JSON.stringify(json));
      if (this.history.length > this.maxHistory) this.history.shift();
      this.redoStack = [];
    },

    undo: function () {
      if (this.history.length <= 1) return;
      var current = this.history.pop();
      this.redoStack.push(current);
      var prev = this.history[this.history.length - 1];
      this.restoreCanvas(prev);
    },

    redo: function () {
      if (!this.redoStack.length) return;
      var state = this.redoStack.pop();
      this.history.push(state);
      this.restoreCanvas(state);
    },

    restoreCanvas: function (jsonStr) {
      var vm = this;
      vm.canvas.loadFromJSON(jsonStr, function () {
        vm.canvas.renderAll();
        vm.ensureBgUnselectable();
      });
    },

    ensureBgUnselectable: function () {
      this.canvas.getObjects().forEach(function (obj) {
        if (obj.name === 'bgImage') {
          obj.set({ selectable: false, evented: false });
        }
      });
    },

    // ===== 工具切换 =====
    setTool: function (tool) {
      if (this.cropMode) this.cancelCrop();
      if (this.eraseMode) this.cancelErase();
      if (this.mosaicMode) this.cancelMosaic();
      this.activeTool = this.activeTool === tool ? '' : tool;
      this.canvas.isDrawingMode = false;
      this.canvas.selection = true;
      this.canvas.defaultCursor = 'default';
      this.canvas.forEachObject(function (o) {
        if (o.name !== 'bgImage') o.set({ selectable: true, evented: true });
      });

      if (this.activeTool === 'text') {
        this.canvas.defaultCursor = 'text';
      } else if (this.activeTool === 'erase') {
        this.startErase();
      } else if (this.activeTool === 'crop') {
        this.startCrop();
      } else if (this.activeTool === 'mosaic') {
        this.startMosaic();
      } else if (this.activeTool === 'ai') {
        this.checkAiKey();
      }
    },

    onCanvasClick: function (e) {
      if (this.activeTool === 'text' && this.hasImage) {
        this.addTextAt(e);
      }
    },

    // ===== 裁剪 =====
    startCrop: function () {
      this.cropMode = true;
      this.cropPreset = '';
      this.canvas.selection = false;
      this.canvas.forEachObject(function (o) { o.set({ selectable: false, evented: false }); });
      this.canvas.defaultCursor = 'crosshair';

      var vm = this;
      var isDown = false;
      var startX, startY;

      vm.canvas.on('mouse:down', cropDown);
      vm.canvas.on('mouse:move', cropMove);
      vm.canvas.on('mouse:up', cropUp);

      function cropDown(opt) {
        isDown = true;
        var pointer = vm.canvas.getPointer(opt.e);
        startX = pointer.x;
        startY = pointer.y;
        if (vm.cropRect) vm.canvas.remove(vm.cropRect);
        vm.cropRect = new fabric.Rect({
          left: startX, top: startY, width: 0, height: 0,
          fill: 'rgba(253,186,59,0.15)',
          stroke: '#fdba3b', strokeWidth: 2,
          strokeDashArray: [5, 3],
          selectable: false, evented: false
        });
        vm.canvas.add(vm.cropRect);
      }

      function cropMove(opt) {
        if (!isDown || !vm.cropRect) return;
        var pointer = vm.canvas.getPointer(opt.e);
        vm.cropRect.set({
          width: Math.abs(pointer.x - startX),
          height: Math.abs(pointer.y - startY),
          left: Math.min(startX, pointer.x),
          top: Math.min(startY, pointer.y)
        });
        vm.canvas.renderAll();
      }

      function cropUp() {
        isDown = false;
        vm.canvas.off('mouse:down', cropDown);
        vm.canvas.off('mouse:move', cropMove);
        vm.canvas.off('mouse:up', cropUp);
      }
    },

    applyCrop: function () {
      if (!this.cropRect || !this.cropRect.width || !this.cropRect.height) {
        this.$Message.warning('请先拖拽选择裁剪区域');
        return;
      }
      var rect = {
        left: this.cropRect.left,
        top: this.cropRect.top,
        width: this.cropRect.width,
        height: this.cropRect.height
      };
      this.canvas.remove(this.cropRect);
      this.cropRect = null;

      // 用临时canvas裁剪
      var ratio = this.getBgImageRatio();
      var cropData = {
        left: rect.left * ratio,
        top: rect.top * ratio,
        width: rect.width * ratio,
        height: rect.height * ratio
      };
      var vm = this;
      this.canvas.discardActiveObject();
      this.canvas.renderAll();

      var tmpCanvas = document.createElement('canvas');
      tmpCanvas.width = cropData.width;
      tmpCanvas.height = cropData.height;
      var tmpCtx = tmpCanvas.getContext('2d');

      this.canvas.setBackgroundColor('transparent');
      this.canvas.renderAll();
      var dataUrl = this.canvas.toDataURL({ format: 'png', quality: 1 });

      var img = new Image();
      img.onload = function () {
        tmpCtx.drawImage(img, cropData.left, cropData.top, cropData.width, cropData.height, 0, 0, cropData.width, cropData.height);
        var croppedUrl = tmpCanvas.toDataURL('image/png');
        vm.loadImage(croppedUrl);
        vm.cropMode = false;
        vm.activeTool = '';
      };
      img.src = dataUrl;
    },

    applyCropPreset: function (preset) {
      this.cropPreset = preset;
      var bgImg = this.getBgImage();
      if (!bgImg) return;
      var w = bgImg.width * bgImg.scaleX;
      var h = bgImg.height * bgImg.scaleY;
      var left = bgImg.left;
      var top = bgImg.top;
      var targetW, targetH;

      var presets = {
        '1:1': [1, 1],
        '4:3': [4, 3],
        '3:4': [3, 4],
        '16:9': [16, 9],
        '800x800': [1, 1],
        '750x1000': [3, 4]
      };
      var r = presets[preset];
      if (!r) return;

      if (w / h > r[0] / r[1]) {
        targetH = h;
        targetW = h * r[0] / r[1];
      } else {
        targetW = w;
        targetH = w * r[1] / r[0];
      }

      if (this.cropRect) this.canvas.remove(this.cropRect);
      this.cropRect = new fabric.Rect({
        left: left + (w - targetW) / 2,
        top: top + (h - targetH) / 2,
        width: targetW, height: targetH,
        fill: 'rgba(253,186,59,0.15)',
        stroke: '#fdba3b', strokeWidth: 2,
        strokeDashArray: [5, 3],
        selectable: false, evented: false
      });
      this.canvas.add(this.cropRect);
      this.canvas.renderAll();
    },

    cancelCrop: function () {
      if (this.cropRect) {
        this.canvas.remove(this.cropRect);
        this.cropRect = null;
      }
      this.cropMode = false;
      this.cropPreset = '';
      this.activeTool = '';
      this.canvas.selection = true;
      this.canvas.defaultCursor = 'default';
      this.restoreObjectSelection();
    },

    // ===== 旋转/翻转 =====
    rotateImage: function (deg) {
      var bgImg = this.getBgImage();
      if (!bgImg) return;
      bgImg.set({ angle: (bgImg.angle || 0) + deg });
      this.canvas.renderAll();
      this.saveHistory();
    },

    flipImage: function (dir) {
      var bgImg = this.getBgImage();
      if (!bgImg) return;
      if (dir === 'h') bgImg.set({ flipX: !bgImg.flipX });
      else bgImg.set({ flipY: !bgImg.flipY });
      this.canvas.renderAll();
      this.saveHistory();
    },

    // ===== 文字 =====
    addTextAt: function (e) {
      var vm = this;
      var pointer = vm.canvas.getPointer(e.e);
      var textbox = new fabric.Textbox('输入文字', {
        left: pointer.x,
        top: pointer.y,
        width: 150,
        fontSize: vm.textSize,
        fill: vm.textColor,
        fontWeight: vm.textBold ? 'bold' : 'normal',
        fontFamily: 'Microsoft YaHei, sans-serif',
        name: 'text'
      });
      vm.canvas.add(textbox);
      vm.canvas.setActiveObject(textbox);
      vm.canvas.renderAll();
      vm.activeTool = '';
      vm.saveHistory();
      // 进入编辑模式
      textbox.enterEditing();
      textbox.selectAll();
    },

    updateTextProp: function (prop, val) {
      var obj = this.canvas.getActiveObject();
      if (!obj || obj.type !== 'textbox') return;
      obj.set(prop, val);
      this.canvas.renderAll();
      this.saveHistory();
    },

    // ===== 消除 =====
    startErase: function () {
      this.eraseMode = true;
      this.setupEraseTool();
    },

    // 画笔/框选切换时重新初始化
    onEraseToolChange: function () {
      if (!this.eraseMode) return;
      // 清除已有标记
      var marks = this.canvas.getObjects().filter(function (o) { return o.name === 'erase-mark'; });
      var vm = this;
      marks.forEach(function (o) { vm.canvas.remove(o); });
      this.canvas.renderAll();
      this.setupEraseTool();
    },

    setupEraseTool: function () {
      var vm = this;
      // 先彻底清理
      vm.canvas.isDrawingMode = false;
      vm.canvas.off('path:created');
      vm.canvas.off('mouse:down');
      vm.canvas.off('mouse:move');
      vm.canvas.off('mouse:up');
      vm.canvas.selection = false;
      vm.canvas.forEachObject(function (o) { o.set({ selectable: false, evented: false }); });
      vm.canvas.defaultCursor = 'crosshair';

      if (vm.eraseTool === 'brush') {
        // 用 Fabric 内置 isDrawingMode — 它内部正确处理路径渲染
        vm.canvas.isDrawingMode = true;
        vm.canvas.freeDrawingBrush = new fabric.PencilBrush(vm.canvas);
        vm.canvas.freeDrawingBrush.color = 'rgba(255,50,50,0.6)';
        vm.canvas.freeDrawingBrush.width = vm.eraseBrushSize;

        // 在 mouse:up 时捕获画笔的绝对坐标（path:created 时 brush._points 已被清空）
        var brushPoints = [];
        vm.canvas.on('mouse:down', function () {
          brushPoints = [];
        });
        vm.canvas.on('mouse:move', function () {
          if (!vm.canvas.isDrawingMode) return;
          var pts = vm.canvas.freeDrawingBrush && vm.canvas.freeDrawingBrush._points;
          if (pts && pts.length > 0) {
            // 深拷贝每个点的坐标值，避免 Fabric 内部复用对象导致数据丢失
            brushPoints = [];
            for (var j = 0; j < pts.length; j++) {
              brushPoints.push({ x: pts[j].x, y: pts[j].y });
            }
          }
        });
        vm.canvas.on('path:created', function (opt) {
          if (!vm.eraseMode) return;
          if (opt.path) {
            // brush._points 是绝对 canvas 坐标，直接使用
            var rawPts = brushPoints.slice();
            opt.path.set({
              name: 'erase-mark',
              selectable: false,
              evented: false,
              _rawPoints: rawPts
            });
            // 松手自动修复
            if (rawPts.length > 0) {
              vm.aiInpaint();
            }
          }
        });

      } else {
        // 框选模式
        var isDown = false, startX, startY;
        vm._eraseBoxRect = null;

        var bg = vm.getBgImage();
        var imgBounds = bg ? {
          left: bg.left, top: bg.top,
          right: bg.left + bg.width * bg.scaleX,
          bottom: bg.top + bg.height * bg.scaleY
        } : null;

        var downHandler = function (opt) {
          var p = vm.canvas.getPointer(opt.e);
          if (imgBounds && (p.x < imgBounds.left || p.x > imgBounds.right || p.y < imgBounds.top || p.y > imgBounds.bottom)) return;
          isDown = true;
          startX = p.x;
          startY = p.y;
          if (vm._eraseBoxRect) {
            vm.canvas.remove(vm._eraseBoxRect);
            vm._eraseBoxRect = null;
          }
          vm._eraseBoxRect = new fabric.Rect({
            left: startX, top: startY, width: 0, height: 0,
            fill: 'rgba(255,50,50,0.3)', stroke: '#ff4757', strokeWidth: 2,
            strokeDashArray: [6, 3], selectable: false, evented: false, name: 'erase-mark'
          });
          vm.canvas.add(vm._eraseBoxRect);
          vm.canvas.renderAll();
        };

        var moveHandler = function (opt) {
          if (!isDown || !vm._eraseBoxRect) return;
          var p = vm.canvas.getPointer(opt.e);
          // 限制在图片范围内
          if (imgBounds) {
            p.x = Math.max(imgBounds.left, Math.min(imgBounds.right, p.x));
            p.y = Math.max(imgBounds.top, Math.min(imgBounds.bottom, p.y));
          }
          vm._eraseBoxRect.set({
            left: Math.min(startX, p.x),
            top: Math.min(startY, p.y),
            width: Math.abs(p.x - startX),
            height: Math.abs(p.y - startY)
          });
          vm.canvas.renderAll();
        };

        var upHandler = function () {
          isDown = false;
          // 框太小忽略
          if (vm._eraseBoxRect && vm._eraseBoxRect.width < 5 && vm._eraseBoxRect.height < 5) {
            vm.canvas.remove(vm._eraseBoxRect);
            vm._eraseBoxRect = null;
            vm.canvas.renderAll();
            return;
          }
          // 框选完成后自动修复
          if (vm._eraseBoxRect) {
            vm.aiInpaint();
          }
        };

        vm.canvas.on('mouse:down', downHandler);
        vm.canvas.on('mouse:move', moveHandler);
        vm.canvas.on('mouse:up', upHandler);
        vm._eraseDownHandler = downHandler;
        vm._eraseMoveHandler = moveHandler;
        vm._eraseUpHandler = upHandler;
      }
    },

    cancelErase: function () {
      // 清除所有消除标记
      var vm = this;
      var marks = vm.canvas.getObjects().filter(function (o) { return o.name === 'erase-mark'; });
      marks.forEach(function (o) { vm.canvas.remove(o); });

      vm.eraseMode = false;
      vm.canvas.isDrawingMode = false;
      vm.canvas.off('path:created');
      vm.canvas.off('mouse:down');
      vm.canvas.off('mouse:move');
      vm.canvas.off('mouse:up');
      vm._eraseBoxRect = null;
      vm.activeTool = '';
      vm.canvas.selection = true;
      vm.canvas.defaultCursor = 'default';
      vm.restoreObjectSelection();
      vm.canvas.renderAll();
    },

    // 清除消除标记（不退出消除模式）
    clearEraseMarks: function () {
      var vm = this;
      var marks = vm.canvas.getObjects().filter(function (o) { return o.name === 'erase-mark'; });
      marks.forEach(function (o) { vm.canvas.remove(o); });
      vm._eraseBoxRect = null;
      vm.canvas.renderAll();
    },

    // ===== AI抠图 =====
    removeBg: function () {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载图片'); return; }
      vm.aiProcessing = true;
      vm.aiProgress = '正在加载AI抠图模型（首次约30MB）...';

      loadBgRemovalLib().then(function (removeBackground) {
        vm.aiProgress = 'AI抠图处理中...';
        var dataUrl = vm.canvas.toDataURL({ format: 'png' });
        var blob = dataURLtoBlob(dataUrl);
        return removeBackground(blob, {
          progress: function (key, current, total) {
            if (total > 0) vm.aiProgress = key + ' ' + Math.round(current / total * 100) + '%';
          }
        });
      }).then(function (resultBlob) {
        var url = URL.createObjectURL(resultBlob);
        vm.loadImage(url);
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.success('抠图完成');
      }).catch(function (e) {
        console.error('[抠图失败]', e);
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('抠图失败: ' + (e.message || '未知错误'));
      });
    },

    // ===== 换背景 =====
    setBgColor: function (color) {
      this.bgColor = color;
      this.canvas.setBackgroundColor(color || 'transparent');
      this.canvas.renderAll();
      this.saveHistory();
    },

    // ===== 水印 =====
    addWatermark: function () {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载图片'); return; }
      var text = vm.watermarkText.trim();
      if (!text) { vm.$Message.warning('请输入水印文字'); return; }

      // 删除旧水印
      var old = vm.canvas.getObjects().filter(function (o) { return o.name === 'watermark'; });
      old.forEach(function (o) { vm.canvas.remove(o); });

      // 平铺水印
      var bgImg = vm.getBgImage();
      if (!bgImg) return;
      var left = bgImg.left;
      var top = bgImg.top;
      var w = bgImg.width * bgImg.scaleX;
      var h = bgImg.height * bgImg.scaleY;
      var stepX = Math.max(vm.watermarkSize * text.length * 0.8, 120);
      var stepY = Math.max(vm.watermarkSize * 3, 80);

      for (var y = top; y < top + h + stepY; y += stepY) {
        for (var x = left; x < left + w + stepX; x += stepX) {
          var wt = new fabric.Text(text, {
            left: x,
            top: y,
            fontSize: vm.watermarkSize,
            fill: vm.watermarkColor,
            opacity: vm.watermarkOpacity / 100,
            angle: vm.watermarkAngle,
            fontFamily: 'Microsoft YaHei, sans-serif',
            selectable: true,
            evented: true,
            name: 'watermark'
          });
          vm.canvas.add(wt);
        }
      }
      vm.canvas.renderAll();
      vm.saveHistory();
      vm.$Message.success('水印已添加');
    },

    removeWatermark: function () {
      var vm = this;
      var marks = vm.canvas.getObjects().filter(function (o) { return o.name === 'watermark'; });
      if (!marks.length) { vm.$Message.info('没有水印'); return; }
      marks.forEach(function (o) { vm.canvas.remove(o); });
      vm.canvas.renderAll();
      vm.saveHistory();
      vm.$Message.success('水印已移除');
    },

    // ===== 滤镜 =====
    applyFilters: function () {
      var bgImg = this.getBgImage();
      if (!bgImg) return;
      bgImg.filters = [];
      if (this.filters.brightness !== 0) {
        bgImg.filters.push(new fabric.Image.filters.Brightness({ brightness: this.filters.brightness / 100 }));
      }
      if (this.filters.contrast !== 0) {
        bgImg.filters.push(new fabric.Image.filters.Contrast({ contrast: this.filters.contrast / 100 }));
      }
      if (this.filters.saturation !== 0) {
        bgImg.filters.push(new fabric.Image.filters.Saturation({ saturation: this.filters.saturation / 100 }));
      }
      bgImg.applyFilters();
      this.canvas.renderAll();
      this.saveHistory();
    },

    resetFilters: function () {
      this.filters = { brightness: 0, contrast: 0, saturation: 0 };
      var bgImg = this.getBgImage();
      if (bgImg) {
        bgImg.filters = [];
        bgImg.applyFilters();
        this.canvas.renderAll();
      }
    },

    // ===== 导出 =====
    copyToClipboard: function () {
      var vm = this;
      var dataUrl = vm.canvas.toDataURL({ format: 'png' });
      fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }).then(function () {
        vm.$Message.success('已复制！打开店小秘 Ctrl+V 粘贴');
      }).catch(function (e) {
        vm.$Message.error('复制失败: ' + e.message);
      });
    },

    saveToServer: function () {
      var vm = this;
      vm.saving = true;
      var dataUrl = vm.canvas.toDataURL({ format: 'jpeg', quality: 0.92 });
      fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: dataUrl,
          productId: vm.productId,
          field: vm.field,
          index: vm.index
        })
      }).then(function (r) { return r.json(); }).then(function (data) {
        vm.saving = false;
        if (data.url) {
          vm.$Message.success('图片已保存');
          vm.$emit('saved', { url: data.url, field: vm.field, index: vm.index });
        } else {
          vm.$Message.error('保存失败');
        }
      }).catch(function () {
        vm.saving = false;
        vm.$Message.error('保存失败');
      });
    },

    downloadImage: function () {
      var dataUrl = this.canvas.toDataURL({ format: 'png' });
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'meitu_' + (this.productId || 'image') + '_' + Date.now() + '.png';
      a.click();
    },

    // ===== 键盘快捷键 =====
    onKeydown: function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
      if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
      if (e.key === 'Delete') {
        var obj = this.canvas.getActiveObject();
        if (obj && obj.name !== 'bgImage') {
          this.canvas.remove(obj);
          this.canvas.renderAll();
          this.saveHistory();
        }
      }
      if (e.key === 'Escape') {
        if (this.cropMode) this.cancelCrop();
        if (this.eraseMode) this.cancelErase();
        this.activeTool = '';
      }
    },

    // ===== 工具方法 =====
    getBgImage: function () {
      return this.canvas.getObjects().find(function (o) { return o.name === 'bgImage'; });
    },

    getBgImageRatio: function () {
      var bgImg = this.getBgImage();
      if (!bgImg) return 1;
      return bgImg.width / (bgImg.width * bgImg.scaleX);
    },

    restoreObjectSelection: function () {
      this.canvas.forEachObject(function (o) {
        if (o.name !== 'bgImage') o.set({ selectable: true, evented: true });
      });
    },

    clearCanvas: function () {
      this.canvas.clear();
      this.canvas.backgroundColor = 'transparent';
      this.canvas.renderAll();
      this.hasImage = false;
      this.history = [];
      this.redoStack = [];
      this.activeTool = '';
      this.cropMode = false;
      this.eraseMode = false;
      this.mosaicMode = false;
      this.$emit('cleared');
    },

    // ===== 马赛克 =====
    startMosaic: function () {
      this.mosaicMode = true;
      this.canvas.isDrawingMode = true;
      this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
      this.canvas.freeDrawingBrush.color = 'rgba(0,0,0,0.01)';
      this.canvas.freeDrawingBrush.width = this.mosaicSize;
      this.canvas.selection = false;
      this.canvas.forEachObject(function (o) { o.set({ selectable: false, evented: false }); });

      var vm = this;
      var points = [];
      vm.canvas.off('mouse:down');
      vm.canvas.off('mouse:move');
      vm.canvas.off('mouse:up');

      vm.canvas.on('mouse:down', function () { points = []; });
      vm.canvas.on('mouse:move', function (opt) {
        if (!vm.canvas.isDrawingMode) return;
        var p = vm.canvas.getPointer(opt.e);
        points.push({ x: p.x, y: p.y });
      });
      vm.canvas.on('mouse:up', function () {
        if (points.length < 2) return;
        // 取消画笔产生的路径
        var objs = vm.canvas.getObjects();
        var last = objs[objs.length - 1];
        if (last && last.type === 'path') vm.canvas.remove(last);
        vm.applyMosaic(points);
        points = [];
      });
    },

    applyMosaic: function (points) {
      var bgImg = this.getBgImage();
      if (!bgImg) return;
      var ctx = bgImg._element ? bgImg._element.getContext('2d') : null;
      if (!ctx) {
        // 用canvas toDataURL方式
        this.applyMosaicFallback(points);
        return;
      }
      var size = this.mosaicSize;
      var ratio = this.getBgImageRatio();
      // 对每个点做像素化
      for (var i = 0; i < points.length; i++) {
        var px = (points[i].x - bgImg.left) * ratio;
        var py = (points[i].y - bgImg.top) * ratio;
        var halfSize = size * ratio / 2;
        var x0 = Math.max(0, Math.floor(px - halfSize));
        var y0 = Math.max(0, Math.floor(py - halfSize));
        var w = Math.floor(size * ratio);
        var h = Math.floor(size * ratio);
        try {
          var imgData = ctx.getImageData(x0, y0, w, h);
          var data = imgData.data;
          var step = Math.max(4, Math.floor(size * ratio / 4));
          for (var sy = 0; sy < h; sy += step) {
            for (var sx = 0; sx < w; sx += step) {
              var idx = (sy * w + sx) * 4;
              var r = data[idx], g = data[idx + 1], b = data[idx + 2];
              for (var dy = 0; dy < step && sy + dy < h; dy++) {
                for (var dx = 0; dx < step && sx + dx < w; dx++) {
                  var ti = ((sy + dy) * w + (sx + dx)) * 4;
                  data[ti] = r; data[ti + 1] = g; data[ti + 2] = b;
                }
              }
            }
          }
          ctx.putImageData(imgData, x0, y0);
        } catch (e) {}
      }
      this.canvas.renderAll();
      this.saveHistory();
    },

    applyMosaicFallback: function (points) {
      // 简化版：用矩形覆盖模拟
      var vm = this;
      var size = vm.mosaicSize;
      points.forEach(function (p) {
        var rect = new fabric.Rect({
          left: p.x - size / 2, top: p.y - size / 2,
          width: size, height: size,
          fill: 'rgba(128,128,128,0.8)',
          selectable: false, evented: false,
          name: 'mosaic'
        });
        vm.canvas.add(rect);
      });
      vm.canvas.renderAll();
      vm.saveHistory();
    },

    cancelMosaic: function () {
      this.mosaicMode = false;
      this.canvas.isDrawingMode = false;
      this.canvas.off('mouse:down');
      this.canvas.off('mouse:move');
      this.canvas.off('mouse:up');
      this.activeTool = '';
      this.canvas.selection = true;
      this.restoreObjectSelection();
      this.saveHistory();
    },

    // ===== AI文生图 =====
    checkAiKey: function () {
      var vm = this;
      fetch('/api/ai/get-key').then(function (r) { return r.json(); }).then(function (d) {
        vm.aiKeyConfigured = d.configured;
        vm.aiKeyMasked = d.masked || '';
      }).catch(function () {});
    },

    saveAiKey: function () {
      var vm = this;
      if (!vm.aiApiKey.trim()) { vm.$Message.warning('请输入API密钥'); return; }
      fetch('/api/ai/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: vm.aiApiKey.trim() })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) {
          vm.aiKeyConfigured = true;
          vm.aiKeyEditing = false;
          vm.aiApiKey = '';
          vm.$Message.success('API密钥已保存');
          vm.checkAiKey();
        } else {
          vm.$Message.error(d.error || '保存失败');
        }
      }).catch(function () { vm.$Message.error('保存失败'); });
    },

    startEditKey: function () {
      this.aiKeyEditing = true;
      this.aiApiKey = '';
    },

    deleteAiKey: function () {
      var vm = this;
      vm.$Modal.confirm({
        title: '删除API密钥',
        content: '确定要删除已保存的智谱API密钥吗？',
        onOk: function () {
          fetch('/api/ai/delete-key', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) {
              vm.aiKeyConfigured = false;
              vm.aiKeyMasked = '';
              vm.aiKeyEditing = false;
              vm.$Message.success('密钥已删除');
            }
          });
        }
      });
    },

    aiTextToImage: function () {
      var vm = this;
      if (!vm.aiPrompt.trim()) { vm.$Message.warning('请输入图片描述'); return; }
      vm.aiProcessing = true;
      vm.aiProgress = 'AI文生图中...';

      fetch('/api/ai/text-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: vm.aiPrompt, size: vm.aiSize, model: vm.aiModel })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        if (d.error) { vm.$Message.error(d.error); return; }
        vm.loadImage(d.url);
        vm.$Message.success('AI文生图完成');
      }).catch(function (e) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('AI文生图失败: ' + e.message);
      });
    },

    aiImageToImage: function () {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载参考图'); return; }
      if (!vm.aiPrompt.trim()) { vm.$Message.warning('请输入图片描述'); return; }
      vm.aiProcessing = true;
      vm.aiProgress = 'AI图生图中...';

      var dataUrl = vm.canvas.toDataURL({ format: 'png' });
      var base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');

      fetch('/api/ai/image-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: vm.aiPrompt, image_base64: base64, size: vm.aiSize })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        if (d.error) { vm.$Message.error(d.error); return; }
        vm.loadImage(d.url);
        vm.$Message.success('AI图生图完成');
      }).catch(function (e) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('AI图生图失败: ' + e.message);
      });
    },

    // 通用：获取当前图片的base64
    _getCurrentImageBase64: function () {
      var bgImg = this.getBgImage();
      if (!bgImg || !bgImg._element) return null;
      var el = bgImg._element;
      var c = document.createElement('canvas');
      c.width = el.naturalWidth || el.width;
      c.height = el.naturalHeight || el.height;
      c.getContext('2d').drawImage(el, 0, 0);
      return c.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
    },

    // ===== AI白底图 =====
    aiWhiteBg: function () {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载图片'); return; }
      var base64 = vm._getCurrentImageBase64();
      if (!base64) { vm.$Message.error('无法读取图片'); return; }

      vm.aiProcessing = true;
      vm.aiProgress = 'AI生成白底图中...';
      fetch('/api/ai/white-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        if (d.error) { vm.$Message.error(d.error); return; }
        vm.loadImage(d.url);
        vm.$Message.success('AI白底图生成完成');
      }).catch(function (e) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('AI白底图失败: ' + e.message);
      });
    },

    // ===== AI画质增强 =====
    aiEnhance: function () {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载图片'); return; }
      var base64 = vm._getCurrentImageBase64();
      if (!base64) { vm.$Message.error('无法读取图片'); return; }

      vm.aiProcessing = true;
      vm.aiProgress = 'AI画质增强中...';
      fetch('/api/ai/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64 })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        if (d.error) { vm.$Message.error(d.error); return; }
        vm.loadImage(d.url);
        vm.$Message.success('AI画质增强完成');
      }).catch(function (e) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('AI画质增强失败: ' + e.message);
      });
    },

    // ===== 生成mask图 =====
    // 直接用标记对象的坐标画到与原图同尺寸的 mask canvas 上
    generateMask: function () {
      var vm = this;
      var bgImg = vm.getBgImage();
      if (!bgImg) return null;

      var marks = vm.canvas.getObjects().filter(function (o) { return o.name === 'erase-mark'; });
      if (!marks.length) return null;

      var origW = Math.round(bgImg.width);
      var origH = Math.round(bgImg.height);
      var imgLeft = bgImg.left;
      var imgTop = bgImg.top;
      var dispW = bgImg.width * bgImg.scaleX;
      var dispH = bgImg.height * bgImg.scaleY;

      var maskCanvas = document.createElement('canvas');
      maskCanvas.width = origW;
      maskCanvas.height = origH;
      var maskCtx = maskCanvas.getContext('2d');

      // 黑色背景
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, origW, origH);

      // canvas坐标 → 原图像素坐标
      function toImgX(cx) { return (cx - imgLeft) / dispW * origW; }
      function toImgY(cy) { return (cy - imgTop) / dispH * origH; }

      marks.forEach(function (obj) {
        maskCtx.save();
        if (obj.type === 'path' && obj._rawPoints && obj._rawPoints.length > 0) {
          // 画笔路径 — 使用保存的原始点坐标
          maskCtx.strokeStyle = 'white';
          maskCtx.fillStyle = 'white';
          maskCtx.lineWidth = obj.strokeWidth / dispW * origW;
          maskCtx.lineCap = 'round';
          maskCtx.lineJoin = 'round';

          maskCtx.beginPath();
          maskCtx.moveTo(toImgX(obj._rawPoints[0].x), toImgY(obj._rawPoints[0].y));
          for (var i = 1; i < obj._rawPoints.length; i++) {
            maskCtx.lineTo(toImgX(obj._rawPoints[i].x), toImgY(obj._rawPoints[i].y));
          }
          maskCtx.stroke();
        } else if (obj.type === 'rect') {
          // 框选矩形
          var rx = toImgX(obj.left);
          var ry = toImgY(obj.top);
          var rw = obj.width / dispW * origW;
          var rh = obj.height / dispH * origH;
          maskCtx.fillStyle = 'white';
          maskCtx.fillRect(rx, ry, rw, rh);
        }
        maskCtx.restore();
      });

      return maskCanvas.toDataURL('image/png');
    },

    // ===== AI消除修复（LaMa ONNX服务端推理）=====
    aiInpaint: function () {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载图片'); return; }

      var maskDataUrl = vm.generateMask();
      if (!maskDataUrl) { vm.$Message.warning('请先涂抹或框选要消除的区域'); return; }

      vm.aiProcessing = true;
      vm.aiProgress = 'AI修复中（本地LaMa模型推理）...';

      // 获取原图（不含标记）
      var bgImg = vm.getBgImage();
      var el = bgImg._element;
      var origCanvas = document.createElement('canvas');
      origCanvas.width = el.width || el.naturalWidth;
      origCanvas.height = el.height || el.naturalHeight;
      var origCtx = origCanvas.getContext('2d');
      origCtx.drawImage(el, 0, 0);
      var imgBase64 = origCanvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');
      var maskBase64 = maskDataUrl.replace(/^data:image\/\w+;base64,/, '');

      fetch('/api/ai/inpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imgBase64,
          mask_base64: maskBase64
        })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        if (d.error) { vm.$Message.error(d.error); return; }
        // 用修复结果替换图片
        vm.loadImage(d.url);
        vm.$Message.success('AI修复完成');
      }).catch(function (e) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('AI修复失败: ' + e.message);
      });
    },

    // ===== 智能检测（智谱GLM视觉识别）=====
    smartDetect: function (type) {
      var vm = this;
      if (!vm.hasImage) { vm.$Message.warning('请先加载图片'); return; }

      vm.aiProcessing = true;
      vm.aiProgress = 'AI智能检测中（上传图片到智谱GLM分析）...';

      var bgImg = vm.getBgImage();
      var el = bgImg._element;
      // 用 el 的原始尺寸（即上传给GLM的图片尺寸）
      var elW = el.naturalWidth || el.width;
      var elH = el.naturalHeight || el.height;

      var origCanvas = document.createElement('canvas');
      origCanvas.width = elW;
      origCanvas.height = elH;
      var origCtx = origCanvas.getContext('2d');
      origCtx.drawImage(el, 0, 0);
      var imgBase64 = origCanvas.toDataURL('image/png');

      // 记住上传的图片尺寸用于坐标转换
      var uploadedW = elW;
      var uploadedH = elH;

      fetch('/api/ai/smart-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imgBase64,
          type: type || 'all'
        })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        if (d.error) { vm.$Message.error(d.error); return; }

        var regions = d.regions || [];
        if (!regions.length) {
          vm.$Message.info('未检测到水印/文字/LOGO');
          return;
        }

        // 坐标转换：GLM返回的是上传图片(uploadedW x uploadedH)的像素坐标
        // 需要转到 canvas 显示坐标
        // bgImg.width 是 Fabric 对象的原始宽度（= el.naturalWidth = uploadedW）
        // canvas显示: bgImg.left + (x / bgImg.width) * bgImg.width * bgImg.scaleX
        var bgImgObj = vm.getBgImage();
        var scaleX = bgImgObj.scaleX;
        var scaleY = bgImgObj.scaleY;
        var imgLeft = bgImgObj.left;
        var imgTop = bgImgObj.top;
        var imgOrigW = bgImgObj.width;  // = uploadedW
        var imgOrigH = bgImgObj.height; // = uploadedH

        console.log('[智能检测] 上传图尺寸:', uploadedW, 'x', uploadedH,
          'bgImg:', imgOrigW, 'x', imgOrigH,
          'scale:', scaleX, scaleY,
          'pos:', imgLeft, imgTop);
        console.log('[智能检测] regions:', JSON.stringify(regions));

        regions.forEach(function (r) {
          var canvasX = imgLeft + (r.x / imgOrigW) * imgOrigW * scaleX;
          var canvasY = imgTop + (r.y / imgOrigH) * imgOrigH * scaleY;
          var canvasW = (r.width / imgOrigW) * imgOrigW * scaleX;
          var canvasH = (r.height / imgOrigH) * imgOrigH * scaleY;

          var rect = new fabric.Rect({
            left: canvasX,
            top: canvasY,
            width: canvasW,
            height: canvasH,
            fill: 'rgba(255,50,50,0.3)',
            stroke: '#ff4757',
            strokeWidth: 2,
            strokeDashArray: [6, 3],
            selectable: false,
            evented: false,
            name: 'erase-mark'
          });
          vm.canvas.add(rect);
        });
        vm.canvas.renderAll();
        vm.$Message.success('检测到 ' + regions.length + ' 个区域，点击"AI修复消除"清除');
      }).catch(function (e) {
        vm.aiProcessing = false;
        vm.aiProgress = '';
        vm.$Message.error('智能检测失败: ' + e.message);
      });
    }
  },
  template: `
    <div class="meitu-editor">
      <!-- 顶部工具栏 -->
      <div class="meitu-toolbar">
        <div class="meitu-toolbar-group">
          <button class="meitu-tool-btn" :class="{active: activeTool==='crop'}" @click="setTool('crop')" title="裁剪">
            <span class="tool-icon">✂️</span><span class="tool-label">裁剪</span>
          </button>
          <button class="meitu-tool-btn" @click="rotateImage(-90)" title="左转90°">
            <span class="tool-icon">↩️</span><span class="tool-label">旋转</span>
          </button>
          <button class="meitu-tool-btn" @click="flipImage('h')" title="水平翻转">
            <span class="tool-icon">↔️</span><span class="tool-label">翻转</span>
          </button>
        </div>
        <div class="meitu-toolbar-sep"></div>
        <div class="meitu-toolbar-group">
          <button class="meitu-tool-btn" :class="{active: activeTool==='text'}" @click="setTool('text')" title="添加文字">
            <span class="tool-icon">🔤</span><span class="tool-label">文字</span>
          </button>
          <button class="meitu-tool-btn" :class="{active: activeTool==='erase'}" @click="setTool('erase')" title="消除文字">
            <span class="tool-icon">🧹</span><span class="tool-label">消除</span>
          </button>
          <button class="meitu-tool-btn" :class="{active: activeTool==='mosaic'}" @click="setTool('mosaic')" title="马赛克">
            <span class="tool-icon">🔲</span><span class="tool-label">马赛克</span>
          </button>
        </div>
        <div class="meitu-toolbar-sep"></div>
        <div class="meitu-toolbar-group">
          <button class="meitu-tool-btn" :class="{active: activeTool==='bg'}" @click="setTool('bg')" title="换背景">
            <span class="tool-icon">🎨</span><span class="tool-label">换背景</span>
          </button>
          <button class="meitu-tool-btn" @click="removeBg" :class="{loading: aiProcessing}" title="AI抠图">
            <span class="tool-icon">🎯</span><span class="tool-label">抠图</span>
          </button>
          <button class="meitu-tool-btn" :class="{active: activeTool==='filter'}" @click="setTool('filter')" title="调色">
            <span class="tool-icon">🌈</span><span class="tool-label">调色</span>
          </button>
          <button class="meitu-tool-btn" :class="{active: activeTool==='ai'}" @click="setTool('ai')" title="AI生成">
            <span class="tool-icon">🤖</span><span class="tool-label">AI</span>
          </button>
          <button class="meitu-tool-btn" :class="{active: activeTool==='watermark'}" @click="setTool('watermark')" title="水印">
            <span class="tool-icon">💧</span><span class="tool-label">水印</span>
          </button>
        </div>
      </div>

      <!-- 主区域 -->
      <div class="meitu-main">
        <!-- 画布 -->
        <div class="meitu-canvas-wrap" ref="canvasWrap" @click="onCanvasClick">
          <canvas ref="canvas"></canvas>
          <!-- 空状态 -->
          <div class="meitu-empty" v-if="!hasImage && !aiProcessing">
            <div class="meitu-empty-icon">🖼️</div>
            <div class="meitu-empty-text">点击下方按钮加载图片</div>
            <div style="display:flex;gap:8px">
              <upload :before-upload="loadFromFile" action="" style="display:inline-block">
                <button class="meitu-empty-btn">选择本地图片</button>
              </upload>
            </div>
          </div>
          <!-- AI处理遮罩 -->
          <div class="meitu-processing" v-if="aiProcessing">
            <div class="meitu-processing-spin">⟳</div>
            <div class="meitu-processing-text">{{ aiProgress }}</div>
          </div>
        </div>

        <!-- 右侧面板 -->
        <div class="meitu-panel" v-if="hasImage || activeTool === 'ai'">
          <!-- 裁剪面板 -->
          <div v-if="cropMode" class="meitu-panel-section">
            <div class="meitu-panel-title">裁剪比例</div>
            <div class="meitu-crop-presets">
              <div class="meitu-crop-preset" :class="{active:cropPreset==='1:1'}" @click="applyCropPreset('1:1')">1:1</div>
              <div class="meitu-crop-preset" :class="{active:cropPreset==='4:3'}" @click="applyCropPreset('4:3')">4:3</div>
              <div class="meitu-crop-preset" :class="{active:cropPreset==='3:4'}" @click="applyCropPreset('3:4')">3:4</div>
              <div class="meitu-crop-preset" :class="{active:cropPreset==='16:9'}" @click="applyCropPreset('16:9')">16:9</div>
              <div class="meitu-crop-preset" :class="{active:cropPreset==='800x800'}" @click="applyCropPreset('800x800')">800×800</div>
              <div class="meitu-crop-preset" :class="{active:cropPreset==='750x1000'}" @click="applyCropPreset('750x1000')">750×1000</div>
            </div>
            <div style="margin-top:10px;display:flex;gap:6px">
              <i-button type="warning" size="small" @click="applyCrop" :disabled="!cropRect">确认裁剪</i-button>
              <i-button size="small" @click="cancelCrop">取消</i-button>
            </div>
          </div>

          <!-- 消除面板 -->
          <div v-if="eraseMode" class="meitu-panel-section">
            <div class="meitu-panel-title">消除工具</div>
            <div style="margin-bottom:8px">
              <radio-group v-model="eraseTool" size="small" @on-change="onEraseToolChange">
                <radio label="brush">画笔涂抹</radio>
                <radio label="box">框选区域</radio>
              </radio-group>
            </div>
            <div v-if="eraseTool==='brush'" class="meitu-panel-row">
              <label>粗细</label>
              <slider v-model="eraseBrushSize" :min="5" :max="60" :step="1" @on-change="canvas.freeDrawingBrush.width=eraseBrushSize"></slider>
            </div>
            <div v-if="eraseTool==='box'" style="color:#999;font-size:11px;margin-bottom:6px">在图片上拖拽框选要消除的区域</div>
            <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
              <i-button type="error" size="small" long :loading="aiProcessing" @click="smartDetect('all')" :disabled="!hasImage">
                <icon type="md-eye" /> 智能检测
              </i-button>
              <i-button type="warning" size="small" long @click="aiInpaint" :disabled="!hasImage" :loading="aiProcessing">
                <icon type="md-build" /> AI修复消除
              </i-button>
              <i-button size="small" @click="clearEraseMarks">清除标记</i-button>
              <i-button size="small" @click="cancelErase">完成</i-button>
            </div>
            <div style="color:#999;font-size:10px;margin-top:6px">
              <div>1. 画笔涂抹或框选要消除的区域</div>
              <div>2. 或点击"智能检测"自动标记</div>
              <div>3. 点击"AI修复消除"完成修复</div>
            </div>
          </div>

          <!-- 马赛克面板 -->
          <div v-if="mosaicMode" class="meitu-panel-section">
            <div class="meitu-panel-title">马赛克</div>
            <div class="meitu-panel-row">
              <label>块大小</label>
              <slider v-model="mosaicSize" :min="5" :max="40" :step="1"></slider>
            </div>
            <div style="color:#999;font-size:11px;margin-bottom:8px">在图片上涂抹区域进行打码</div>
            <div style="display:flex;gap:6px">
              <i-button size="small" @click="cancelMosaic">完成</i-button>
            </div>
          </div>

          <!-- AI面板 -->
          <div v-if="activeTool==='ai'" class="meitu-panel-section">
            <div class="meitu-panel-title">智谱AI</div>
            <!-- 密钥管理 -->
            <div style="margin-bottom:10px;padding:8px;background:#2a2a4a;border-radius:4px">
              <div v-if="!aiKeyConfigured" style="display:flex;flex-direction:column;gap:6px">
                <div style="color:#fdba3b;font-size:11px">未配置API密钥</div>
                <i-input v-model="aiApiKey" type="password" placeholder="输入智谱API密钥" size="small" />
                <i-button type="warning" size="small" long @click="saveAiKey">保存密钥</i-button>
              </div>
              <div v-else style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="color:#67c23a;font-size:11px">✓ 已配置 {{ aiKeyMasked }}</span>
                <i-button size="small" @click="startEditKey">修改</i-button>
                <i-button size="small" type="error" @click="deleteAiKey">删除</i-button>
              </div>
            </div>
            <!-- 修改密钥弹层 -->
            <div v-if="aiKeyEditing" style="margin-bottom:10px;display:flex;flex-direction:column;gap:6px">
              <i-input v-model="aiApiKey" type="password" placeholder="输入新的API密钥" size="small" />
              <div style="display:flex;gap:6px">
                <i-button type="warning" size="small" @click="saveAiKey">保存</i-button>
                <i-button size="small" @click="aiKeyEditing=false">取消</i-button>
              </div>
            </div>
            <!-- AI功能 -->
            <div v-if="aiKeyConfigured">
              <!-- 一键AI功能 -->
              <div style="margin-bottom:10px;display:flex;flex-direction:column;gap:6px">
                <i-button type="success" size="small" long :loading="aiProcessing" :disabled="!hasImage" @click="aiWhiteBg">
                  <icon type="md-square-outline" /> AI白底图
                </i-button>
                <i-button type="info" size="small" long :loading="aiProcessing" :disabled="!hasImage" @click="aiEnhance">
                  <icon type="md-trending-up" /> AI画质增强
                </i-button>
              </div>
              <div style="border-top:1px solid #333;margin:8px 0"></div>
              <div style="margin-bottom:8px">
                <div style="color:#999;font-size:11px;margin-bottom:4px">模型</div>
                <radio-group v-model="aiModel" size="small">
                  <radio label="cogview-3-flash">CogView-3 (免费)</radio>
                  <radio label="cogview-4">CogView-4 (更精细)</radio>
                </radio-group>
              </div>
              <div style="margin-bottom:8px">
                <div style="color:#999;font-size:11px;margin-bottom:4px">尺寸</div>
                <radio-group v-model="aiSize" size="small">
                  <radio label="1024x1024">1024²</radio>
                  <radio label="768x1344">768×1344</radio>
                  <radio label="864x1152">864×1152</radio>
                </radio-group>
              </div>
              <i-input v-model="aiPrompt" type="textarea" :rows="3" placeholder="描述想要的图片效果" size="small" style="margin-bottom:8px" />
              <div style="margin-bottom:8px">
                <div style="color:#999;font-size:11px;margin-bottom:4px">快捷prompt：</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px">
                  <i-button size="small" @click="aiPrompt='电商产品主图，纯白背景，高清简约，800x800'">白底主图</i-button>
                  <i-button size="small" @click="aiPrompt='产品场景图，自然光，温馨家居背景'">场景图</i-button>
                  <i-button size="small" @click="aiPrompt='产品细节特写，微距摄影，高质感'">细节图</i-button>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <i-button type="warning" size="small" long :loading="aiProcessing" @click="aiTextToImage">
                  <icon type="md-create" /> AI文生图
                </i-button>
                <i-button type="primary" size="small" long :loading="aiProcessing" :disabled="!hasImage" @click="aiImageToImage">
                  <icon type="md-swap" /> AI图生图
                </i-button>
              </div>
            </div>
          </div>

          <!-- 换背景面板 -->
          <div v-if="activeTool==='bg'" class="meitu-panel-section">
            <div class="meitu-panel-title">背景颜色</div>
            <div class="meitu-bg-colors">
              <div class="meitu-bg-color transparent" :class="{active:bgColor==='transparent'}" @click="setBgColor('')"></div>
              <div class="meitu-bg-color" style="background:#fff" :class="{active:bgColor==='#ffffff'}" @click="setBgColor('#ffffff')"></div>
              <div class="meitu-bg-color" style="background:#f5f5f5" :class="{active:bgColor==='#f5f5f5'}" @click="setBgColor('#f5f5f5')"></div>
              <div class="meitu-bg-color" style="background:#000" :class="{active:bgColor==='#000000'}" @click="setBgColor('#000000')"></div>
              <div class="meitu-bg-color" style="background:#ff4757" :class="{active:bgColor==='#ff4757'}" @click="setBgColor('#ff4757')"></div>
              <div class="meitu-bg-color" style="background:#ff6b81" :class="{active:bgColor==='#ff6b81'}" @click="setBgColor('#ff6b81')"></div>
              <div class="meitu-bg-color" style="background:#ffa502" :class="{active:bgColor==='#ffa502'}" @click="setBgColor('#ffa502')"></div>
              <div class="meitu-bg-color" style="background:#2ed573" :class="{active:bgColor==='#2ed573'}" @click="setBgColor('#2ed573')"></div>
              <div class="meitu-bg-color" style="background:#1e90ff" :class="{active:bgColor==='#1e90ff'}" @click="setBgColor('#1e90ff')"></div>
              <div class="meitu-bg-color" style="background:#5352ed" :class="{active:bgColor==='#5352ed'}" @click="setBgColor('#5352ed')"></div>
              <div class="meitu-bg-color" style="background:#a55eea" :class="{active:bgColor==='#a55eea'}" @click="setBgColor('#a55eea')"></div>
              <div class="meitu-bg-color" style="background:#eccc68" :class="{active:bgColor==='#eccc68'}" @click="setBgColor('#eccc68')"></div>
            </div>
            <div class="meitu-panel-row" style="margin-top:10px">
              <label>自定义</label>
              <color-picker v-model="bgColor" @on-change="setBgColor" recommend alpha />
            </div>
          </div>

          <!-- 滤镜面板 -->
          <div v-if="activeTool==='filter'" class="meitu-panel-section">
            <div class="meitu-panel-title">调色</div>
            <div class="meitu-filter-slider">
              <div class="filter-label"><span>亮度</span><span class="filter-val">{{filters.brightness}}</span></div>
              <slider v-model="filters.brightness" :min="-100" :max="100" :step="1" @on-change="applyFilters"></slider>
            </div>
            <div class="meitu-filter-slider">
              <div class="filter-label"><span>对比度</span><span class="filter-val">{{filters.contrast}}</span></div>
              <slider v-model="filters.contrast" :min="-100" :max="100" :step="1" @on-change="applyFilters"></slider>
            </div>
            <div class="meitu-filter-slider">
              <div class="filter-label"><span>饱和度</span><span class="filter-val">{{filters.saturation}}</span></div>
              <slider v-model="filters.saturation" :min="-100" :max="100" :step="1" @on-change="applyFilters"></slider>
            </div>
            <i-button size="small" @click="resetFilters" style="margin-top:4px">重置</i-button>
          </div>

          <!-- 水印面板 -->
          <div v-if="activeTool==='watermark'" class="meitu-panel-section">
            <div class="meitu-panel-title">文字水印</div>
            <i-input v-model="watermarkText" placeholder="输入水印文字，如店铺名" size="small" style="margin-bottom:8px" />
            <div class="meitu-filter-slider">
              <div class="filter-label"><span>透明度</span><span class="filter-val">{{watermarkOpacity}}%</span></div>
              <slider v-model="watermarkOpacity" :min="5" :max="80" :step="5"></slider>
            </div>
            <div class="meitu-filter-slider">
              <div class="filter-label"><span>字号</span><span class="filter-val">{{watermarkSize}}</span></div>
              <slider v-model="watermarkSize" :min="12" :max="48" :step="2"></slider>
            </div>
            <div class="meitu-filter-slider">
              <div class="filter-label"><span>角度</span><span class="filter-val">{{watermarkAngle}}°</span></div>
              <slider v-model="watermarkAngle" :min="-60" :max="0" :step="5"></slider>
            </div>
            <div class="meitu-panel-row" style="margin-top:4px">
              <label>颜色</label>
              <color-picker v-model="watermarkColor" recommend />
            </div>
            <div style="margin-top:10px;display:flex;gap:6px">
              <i-button type="warning" size="small" @click="addWatermark" :disabled="!watermarkText.trim()">添加水印</i-button>
              <i-button size="small" @click="removeWatermark">移除水印</i-button>
            </div>
          </div>

          <!-- 文字面板 -->
          <div v-if="activeTool==='text'" class="meitu-panel-section">
            <div class="meitu-panel-title">添加文字</div>
            <div style="color:#999;font-size:12px">点击画布任意位置添加文字</div>
          </div>

          <!-- 选中文字对象时的属性面板 -->
          <div v-if="activeTool==='' && hasImage" class="meitu-panel-section">
            <div class="meitu-panel-title">画布信息</div>
            <div style="color:#888;font-size:12px">
              <div>快捷键：Ctrl+Z 撤销 / Ctrl+Y 重做</div>
              <div>Delete 删除选中对象</div>
              <div>Esc 取消当前工具</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="meitu-footer">
        <div class="meitu-footer-left">
          <i-button size="small" :disabled="history.length<=1" @click="undo" title="Ctrl+Z">
            <icon type="md-undo" /> 撤销
          </i-button>
          <i-button size="small" :disabled="!redoStack.length" @click="redo" title="Ctrl+Y">
            <icon type="md-redo" /> 重做
          </i-button>
        </div>
        <div class="meitu-footer-right">
          <i-button size="small" :type="aiKeyConfigured ? 'default' : 'error'" @click="setTool('ai')">
            <icon type="md-key" /> {{ aiKeyConfigured ? 'AI已配置' : '配置AI密钥' }}
          </i-button>
          <upload v-if="!hasImage || mode==='page'" :before-upload="loadFromFile" action="" style="display:inline-block">
            <i-button size="small" icon="md-folder-open">加载图片</i-button>
          </upload>
          <i-button size="small" type="success" @click="copyToClipboard" :disabled="!hasImage">
            <icon type="md-clipboard" /> 复制到剪贴板
          </i-button>
          <i-button v-if="mode==='modal'" size="small" type="primary" @click="saveToServer" :loading="saving" :disabled="!hasImage">
            <icon type="md-checkmark" /> 保存
          </i-button>
          <i-button size="small" type="warning" @click="downloadImage" :disabled="!hasImage">
            <icon type="md-download" /> 下载
          </i-button>
          <i-button v-if="mode==='modal'" size="small" @click="$emit('close')">关闭</i-button>
        </div>
      </div>
    </div>`
});
