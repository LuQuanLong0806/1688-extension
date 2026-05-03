// 图片编辑器弹窗 — 基于 TUI Image Editor（汉化版）
Vue.component('image-editor-modal', {
  props: {
    visible: { type: Boolean, default: false },
    imageUrl: { type: String, default: '' },
    productId: { type: [String, Number], default: '' },
    field: { type: String, default: 'main_images' },
    index: { type: Number, default: 0 }
  },
  data: function () {
    return {
      editor: null,
      loading: false,
      saving: false,
      removingBg: false,
      bgProgress: ''
    };
  },
  watch: {
    visible: function (val) {
      if (val) {
        this.loading = true;
        this.waitForContainer();
      } else {
        this.destroyEditor();
      }
    }
  },
  methods: {
    waitForContainer: function () {
      var vm = this;
      var tries = 0;
      (function poll() {
        var el = document.getElementById('__editor_container');
        if (el && el.offsetHeight > 0) {
          vm.initEditor();
          return;
        }
        tries++;
        if (tries > 50) {
          vm.loading = false;
          vm.$Message.error('编辑器容器未就绪');
          return;
        }
        setTimeout(poll, 100);
      })();
    },
    initEditor: function () {
      var vm = this;
      vm.destroyEditor();

      var container = document.getElementById('__editor_container');
      if (!container) return;

      var proxyUrl = '/api/proxy-image?url=' + encodeURIComponent(vm.imageUrl);

      vm.editor = new tui.ImageEditor(container, {
        includeUI: {
          loadImage: { path: proxyUrl, name: 'image' },
          locale: zhLocale(),
          theme: blackTheme(),
          initMenu: 'crop',
          menuBarPosition: 'bottom'
        },
        cssMaxWidth: 1000,
        cssMaxHeight: 600,
        usageStatistics: false
      });

      vm.editor.on('imageLoaded', function () {
        vm.loading = false;
      });

      setTimeout(function () {
        vm.loading = false;
      }, 10000);
    },
    destroyEditor: function () {
      if (this.editor) {
        this.editor.destroy();
        this.editor = null;
      }
      this.loading = false;
      this.saving = false;
    },
    saveToServer: function () {
      var vm = this;
      if (!vm.editor) return;
      vm.saving = true;

      var dataUrl = vm.editor.toDataURL({ format: 'jpeg', quality: 0.92 });
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
          vm.close();
        } else {
          vm.$Message.error('保存失败');
        }
      }).catch(function () {
        vm.saving = false;
        vm.$Message.error('保存失败');
      });
    },
    downloadImage: function () {
      var vm = this;
      if (!vm.editor) return;
      var dataUrl = vm.editor.toDataURL({ format: 'png' });
      var a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'edited_' + (vm.productId || 'image') + '_' + Date.now() + '.png';
      a.click();
    },
    close: function () {
      this.destroyEditor();
      this.$emit('update:visible', false);
    },
    removeBg: function () {
      var vm = this;
      if (!vm.editor) return;
      vm.removingBg = true;
      vm.bgProgress = '正在加载AI抠图模型（首次约30MB）...';

      loadBgRemovalLib().then(function (removeBackground) {
        vm.bgProgress = 'AI抠图处理中...';
        var dataUrl = vm.editor.toDataURL({ format: 'png' });
        var blob = dataURLtoBlob(dataUrl);
        return removeBackground(blob, {
          progress: function (key, current, total) {
            if (total > 0) vm.bgProgress = key + ' ' + Math.round(current / total * 100) + '%';
          }
        });
      }).then(function (resultBlob) {
        var url = URL.createObjectURL(resultBlob);
        vm.editor.deactivateAll();
        return vm.editor.loadImageFromURL(url, 'removed-bg');
      }).then(function () {
        vm.removingBg = false;
        vm.bgProgress = '';
        vm.$Message.success('抠图完成');
      }).catch(function (e) {
        console.error('[抠图失败]', e);
        vm.removingBg = false;
        vm.bgProgress = '';
        vm.$Message.error('抠图失败: ' + (e.message || '未知错误'));
      });
    }
  },
  template: `
    <modal v-model="visible" class="editor-modal-fullscreen" fullscreen footer-hide
      title="图片编辑" @on-cancel="close">
      <div class="editor-loading" v-if="loading || removingBg">
        <div class="editor-loading-inner">
          <icon type="ios-loading" size="40" class="editor-spin-icon" style="color:#fdba3b"></icon>
          <div style="margin-top:12px;color:#999">{{ removingBg ? bgProgress : '加载编辑器中...' }}</div>
        </div>
      </div>
      <div id="__editor_container" class="editor-canvas-area"></div>
      <div class="editor-footer-fixed">
        <i-button type="warning" icon="md-cut" :loading="removingBg" @click="removeBg">AI抠图</i-button>
        <i-button type="primary" icon="md-checkmark" :loading="saving" @click="saveToServer">保存到服务器</i-button>
        <i-button type="success" icon="md-download" @click="downloadImage">下载到本地</i-button>
        <i-button icon="md-close" @click="close">关闭</i-button>
      </div>
    </modal>`
});

// ========== 共享：中文 locale ==========
function zhLocale() {
  return {
    Crop: '裁剪',
    Flip: '翻转',
    Rotate: '旋转',
    Draw: '画笔',
    Shape: '形状',
    Icon: '图标',
    Text: '文字',
    Mask: '蒙版',
    Filter: '滤镜',
    'Free': '自由',
    'Straight': '直线',
    'Load': '加载',
    'Download': '下载',
    'Apply': '应用',
    'Cancel': '取消',
    'Flip X': '水平翻转',
    'Flip Y': '垂直翻转',
    'Reset': '重置',
    'Custom': '自定义',
    'Square': '正方形',
    'Circle': '圆形',
    'Triangle': '三角形',
    'Rect': '矩形',
    'Polygon': '多边形',
    'Line': '线段',
    'Arrow': '箭头',
    'Bold': '加粗',
    'Italic': '斜体',
    'Underline': '下划线',
    'Text size': '字号',
    'Fill': '填充',
    'Stroke': '描边',
    'Stroke width': '描边宽度',
    'Type': '类型',
    'Color': '颜色',
    'Transparency': '透明度',
    'Width': '宽度',
    'Height': '高度',
    'Lock Aspect Ratio': '锁定比例',
    'Grayscale': '灰度',
    'Sepia': '复古',
    'Invert': '反色',
    'Blur': '模糊',
    'Sharpen': '锐化',
    'Emboss': '浮雕',
    'Remove White': '去白边',
    'Distance': '距离',
    'Brightness': '亮度',
    'Noise': '噪点',
    'Pixelate': '像素化',
    'Tint': '着色',
    'Multiply': '正片叠底',
    'Blend': '混合',
    'Zoom': '缩放',
    'Undo': '撤销',
    'Redo': '重做',
    'Delete': '删除',
    'Delete All': '全部删除',
    'History': '历史'
  };
}

// ========== 共享：黑色主题 ==========
function blackTheme() {
  return {
    'common.bi.image': '',
    'common.bisize.width': '0',
    'common.bisize.height': '0',
    'common.backgroundImage': 'none',
    'common.backgroundColor': '#1e1e1e',
    'common.border': '0px',
    'header.backgroundImage': 'none',
    'header.backgroundColor': '#2c2c2c',
    'header.border': '0px',
    'loadButton.backgroundColor': '#fff',
    'loadButton.border': '1px solid #ddd',
    'loadButton.color': '#222',
    'loadButton.fontFamily': 'inherit',
    'downloadButton.backgroundColor': '#fdba3b',
    'downloadButton.border': '1px solid #fdba3b',
    'downloadButton.color': '#000',
    'downloadButton.fontFamily': 'inherit',
    'menu.normalIcon.path': '',
    'menu.activeIcon.path': '',
    'menu.iconSize.width': '24px',
    'menu.iconSize.height': '24px',
    'submenu.backgroundColor': '#1e1e1e',
    'submenu.partition.color': '#444',
    'submenu.normalLabel.color': '#ccc',
    'submenu.normalLabel.fontWeight': 'lighter',
    'submenu.activeLabel.color': '#fff',
    'submenu.activeLabel.fontWeight': 'lighter',
    'submenu.iconSize.width': '32px',
    'submenu.iconSize.height': '32px',
    'range.value.color': '#fff',
    'range.value.fontWeight': 'lighter',
    'range.value.fontSize': '11px',
    'range.value.border': '1px solid #555',
    'range.value.backgroundColor': '#2c2c2c',
    'range.title.color': '#fff',
    'range.title.fontWeight': 'lighter',
    'range.pointer.color': '#fff',
    'range.pointer.width': '8px',
    'range.pointer.height': '8px',
    'range.pointer.border': '1px solid #fff',
    'range.pointer.backgroundColor': '#fdba3b',
    'range.subprogressbar.color': '#555',
    'range.progressbar.color': '#fdba3b',
    'range.tracker.color': '#fdba3b',
    'range.tracker.border': '1px solid #fdba3b',
    'range.tracker.backgroundColor': '#fdba3b'
  };
}

// ========== 共享：AI抠图工具 ==========
function dataURLtoBlob(dataUrl) {
  var parts = dataUrl.split(',');
  var mime = parts[0].match(/:(.*?);/)[1];
  var b64 = atob(parts[1]);
  var arr = new Uint8Array(b64.length);
  for (var i = 0; i < b64.length; i++) arr[i] = b64.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function loadBgRemovalLib() {
  if (window.__imglyRemoveBg) {
    return Promise.resolve(window.__imglyRemoveBg);
  }
  return import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm')
    .then(function (mod) {
      window.__imglyRemoveBg = mod.removeBackground;
      return mod.removeBackground;
    });
}
