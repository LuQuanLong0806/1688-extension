// 主 Vue 实例 — 骨架 + 侧边栏 + 视图切换
new Vue({
  el: '#app',
  data: {
    currentView: localStorage.getItem('__current_view') || 'page-products',
    sidebarCollapsed: false,
    theme: '1688',
    stats: { total: 0, unused: 0, used: 0, totalCategories: 0 },
    currentUser: null,
    // detail modal
    showDetail: false,
    detailData: null,
    // image preview
    previewVisible: false,
    previewList: [],
    previewIdx: 0,
    // collage modal
    showCollageModal: false
  },
  computed: {
    themeName: function () {
      var map = { '1688': '1688', 'jd': 'JD', 'fresh': '清新' };
      return map[this.theme] || '1688';
    }
  },
  mounted: function () {
    var vm = this;
    var token = localStorage.getItem('jwt_token');
    if (!token) { window.location.href = '/login.html'; return; }
    apiFetch('/api/me').then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error || !d.id) { localStorage.removeItem('jwt_token'); window.location.href = '/login.html'; return; }
        vm.currentUser = d;
        vm.loadStats();
        vm.initTheme();
      }).catch(function () { window.location.href = '/login.html'; });
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
      if (view === 'page-meitu') {
        this.showCollageModal = true;
        return;
      }
      this.currentView = view;
      localStorage.setItem('__current_view', view);
      if (view === 'page-dashboard') {
        this.loadStats();
      }
    },
    loadStats: function () {
      var vm = this;
      apiFetch('/api/product/stats').then(function (r) { return r.json(); })
        .then(function (d) { vm.stats = d; }).catch(function () {});
    },
    logout: function () {
      // 必须先调 /api/logout（带 token），让 server 写 token_invalid_at
      // 否则 JWT 是无状态的，server 端不知道用户登出，旧 token 还能继续用
      apiFetch('/api/logout', { method: 'POST' })
        .catch(function () {})
        .finally(function () {
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('jwt_user');
          window.location.href = '/login.html';
        });
    },
    openDetail: function (id) {
      var vm = this;
      apiFetch('/api/product/' + id).then(function (r) { return r.json(); })
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
