// 悬浮缩略图预览
Vue.component('thumb-preview', {
  template: '\
    <div class="thumb-preview-pop" v-if="show" :style="{ top: y + \'px\', left: x + \'px\' }">\
      <img :src="url" />\
    </div>',
  data: function () {
    return { show: false, url: '', x: 0, y: 0 };
  },
  methods: {
    open: function (url, e) {
      this.url = url;
      this.show = true;
      this.move(e);
    },
    move: function (e) {
      var size = 400, pad = 12;
      var vw = window.innerWidth, vh = window.innerHeight;
      var x = e.clientX + pad, y = e.clientY + pad;
      if (x + size > vw) x = e.clientX - size - pad;
      if (y + size > vh) y = vh - size - pad;
      if (x < pad) x = pad;
      if (y < pad) y = pad;
      this.x = x;
      this.y = y;
    },
    close: function () { this.show = false; }
  }
});
