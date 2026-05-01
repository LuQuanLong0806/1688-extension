// 主 Vue 实例 — 骨架 + 侧边栏 + 视图切换
new Vue({
  el: '#app',
  data: {
    currentView: 'page-products',
    sidebarCollapsed: false,
    stats: { total: 0, unused: 0, used: 0, totalCategories: 0 },
    // detail modal
    showDetail: false,
    detailData: null,
    // image preview
    previewVisible: false,
    previewList: [],
    previewIdx: 0
  },
  mounted: function () {
    this.loadStats();
  },
  methods: {
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
    closePreview: function () { this.previewVisible = false; }
  }
});
