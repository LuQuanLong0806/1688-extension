// 小秘美图独立页面
Vue.component('page-meitu', {
  data: function () {
    return { imageUrl: '' };
  },
  methods: {
    loadFromUrl: function () {
      if (!this.imageUrl.trim()) {
        this.$Message.warning('请输入图片地址');
        return;
      }
      this.$refs.editor.loadImage(this.imageUrl.trim());
    }
  },
  template: `
    <div style="height:100%;display:flex;flex-direction:column">
      <div style="padding:10px 16px;background:#16213e;border-bottom:1px solid #2a2a4a;display:flex;gap:10px;align-items:center;flex-shrink:0">
        <i-input v-model="imageUrl" placeholder="输入图片URL，回车加载" style="flex:1;max-width:500px"
          @on-enter="loadFromUrl" search enter-button="加载" @on-search="loadFromUrl">
          <icon type="md-link" slot="prefix" />
        </i-input>
        <upload :before-upload="function(f){ $refs.editor.loadFromFile(f); return false; }" action="" style="display:inline-block">
          <i-button type="info" icon="md-folder-open">选择本地图片</i-button>
        </upload>
      </div>
      <div style="flex:1;min-height:0">
        <meitu-editor ref="editor" mode="page"></meitu-editor>
      </div>
    </div>`
});
