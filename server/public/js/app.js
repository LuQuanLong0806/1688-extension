// 主 Vue 实例 — 骨架 + 侧边栏 + 视图切换
new Vue({
  el: '#app',
  data: {
    currentView: 'page-products',
    sidebarCollapsed: false,
    theme: '1688',
    stats: { total: 0, unused: 0, used: 0, totalCategories: 0 },
    // detail modal
    showDetail: false,
    detailData: null,
    // image preview
    previewVisible: false,
    previewList: [],
    previewIdx: 0,
    // image editor
    showImageEditor: false,
    editorImageUrl: '',
    editorProductId: '',
    editorField: 'main_images',
    editorIndex: 0,
    // meitu editor modal
    showMeituEditor: false,
    meituImageUrl: '',
    meituProductId: '',
    meituField: 'main_images',
    meituIndex: 0
  },
  computed: {
    themeName: function () {
      var map = { '1688': '1688', 'jd': 'JD', 'fresh': '清新' };
      return map[this.theme] || '1688';
    }
  },
  mounted: function () {
    this.loadStats();
    this.initTheme();
  },
  methods: {
    initTheme: function () {
      var saved = localStorage.getItem('theme');
      if (saved) {
        this.theme = saved;
        document.documentElement.setAttribute('data-theme', saved);
      }
    },
    toggleTheme: function () {
      var themes = ['1688', 'jd', 'fresh'];
      var idx = themes.indexOf(this.theme);
      this.theme = themes[(idx + 1) % themes.length];
      document.documentElement.setAttribute('data-theme', this.theme);
      localStorage.setItem('theme', this.theme);
    },
    switchView: function (view) {
      this.currentView = view;
      if (view === 'page-dashboard') {
        this.loadStats();
      }
    },
    loadStats: function () {
      var vm = this;
      fetch('/api/product/stats').then(function (r) { return r.json(); })
        .then(function (d) { vm.stats = d; }).catch(function () {});
    },
    openDetail: function (id) {
      var vm = this;
      fetch('/api/product/' + id).then(function (r) { return r.json(); })
        .then(function (d) { vm.detailData = d; vm.showDetail = true; }).catch(function () { vm.$Message.error('加载详情失败'); });
    },
    onDetailStatusChanged: function () {
      this.loadStats();
    },
    // image preview
    openPreview: function (imgs, idx) {
      this.previewList = imgs;
      this.previewIdx = idx;
      this.previewVisible = true;
    },
    closePreview: function () { this.previewVisible = false; },
    // image editor
    openImageEditor: function (opts) {
      this.editorImageUrl = opts.url || '';
      this.editorProductId = opts.productId || '';
      this.editorField = opts.field || 'main_images';
      this.editorIndex = opts.index || 0;
      this.showImageEditor = true;
    },
    onImageEditorSaved: function (data) {
      if (data.url && this.$refs.detailModal) {
        this.$refs.detailModal.updateImageUrl(data.field, data.index, data.url);
      }
    },
    openMeituEditor: function (opts) {
      this.meituImageUrl = opts.url || '';
      this.meituProductId = opts.productId || '';
      this.meituField = opts.field || 'main_images';
      this.meituIndex = opts.index || 0;
      this.showMeituEditor = true;
    },
    onMeituEditorSaved: function (data) {
      if (data.url && this.$refs.detailModal) {
        this.$refs.detailModal.updateImageUrl(data.field, data.index, data.url);
      }
    }
  }
});
