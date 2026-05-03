// 图片编辑器页面 — 独立菜单页（基于 TUI Image Editor）
Vue.component('page-editor', {
  props: { stats: { type: Object, default: function () { return {}; } } },
  data: function () {
    return {
      editor: null,
      loading: false,
      saving: false,
      imageUrl: '',
      fileInput: '',
      removingBg: false,
      bgProgress: ''
    };
  },
  beforeDestroy: function () {
    this.destroyEditor();
  },
  methods: {
    loadFromUrl: function () {
      if (!this.imageUrl.trim()) {
        this.$Message.warning('请输入图片地址');
        return;
      }
      this.loading = true;
      this.$nextTick(function () {
        this.initEditor('/api/proxy-image?url=' + encodeURIComponent(this.imageUrl.trim()));
      }.bind(this));
    },
    onFileChange: function (file) {
      if (!file) return false;
      if (!file.type.startsWith('image/')) {
        this.$Message.warning('请选择图片文件');
        return false;
      }
      this.loading = true;
      var vm = this;
      var reader = new FileReader();
      reader.onload = function (ev) {
        vm.$nextTick(function () {
          vm.initEditor(ev.target.result);
        });
      };
      reader.readAsDataURL(file);
      return false;
    },
    initEditor: function (src) {
      var vm = this;
      vm.destroyEditor();

      var container = document.getElementById('__page_editor_container');
      if (!container) return;

      vm.editor = new tui.ImageEditor(container, {
        includeUI: {
          loadImage: { path: src, name: 'image' },
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
        body: JSON.stringify({ dataUrl: dataUrl })
      }).then(function (r) { return r.json(); }).then(function (data) {
        vm.saving = false;
        if (data.url) {
          vm.$Message.success('图片已保存到服务器');
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
      a.download = 'edited_' + Date.now() + '.png';
      a.click();
    },
    clearEditor: function () {
      this.destroyEditor();
      this.imageUrl = '';
      this.fileInput = '';
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
    <div class="page-editor-wrap">
      <div class="page-editor-header">
        <div class="page-editor-toolbar">
          <i-input v-model="imageUrl" placeholder="输入图片URL，回车加载" style="flex:1;max-width:500px"
            @on-enter="loadFromUrl" search enter-button="加载" @on-search="loadFromUrl">
            <icon type="md-link" slot="prefix" />
          </i-input>
          <upload :before-upload="onFileChange" action="" style="display:inline-block">
            <i-button type="info" icon="md-folder-open">选择本地图片</i-button>
          </upload>
          <!-- <i-button type="primary" icon="md-checkmark" :loading="saving" @click="saveToServer">保存到服务器</i-button> -->
          <i-button type="warning" icon="md-cut" :loading="removingBg" @click="removeBg">AI抠图</i-button>
          <i-button type="success" icon="md-download" @click="downloadImage">下载到本地</i-button>
          <i-button icon="md-trash" @click="clearEditor">清空</i-button>
        </div>
      </div>
      <div class="page-editor-body">
        <div class="editor-loading" v-if="loading || removingBg">
          <div class="editor-loading-inner">
            <icon type="ios-loading" size="40" class="editor-spin-icon" style="color:#fdba3b"></icon>
            <div style="margin-top:12px;color:#999">{{ removingBg ? bgProgress : '加载编辑器中...' }}</div>
          </div>
        </div>
        <div id="__page_editor_container" class="editor-canvas-area"></div>
      </div>
    </div>`
});
