new Vue({
  el: '#app',
  data: {
    loading: false,
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    keyword: '',
    statusFilter: 'all',
    selectedIds: [],
    showDetail: false,
    detail: null,
    detailTab: 'info',
    stats: { total: 0, unused: 0, used: 0, totalSkus: 0 },
    previewVisible: false,
    previewImages: [],
    previewIndex: 0,
    columns: [
      { type: 'selection', width: 50, align: 'center' },
      {
        title: '预览', width: 64, align: 'center',
        render: function (h, params) {
          var skus = JSON.parse(params.row.skus || '[]');
          var img = null;
          if (skus.length && skus[0].image) img = skus[0].image;
          if (img) {
            return h('img', { attrs: { src: img, loading: 'lazy' }, class: 'cell-thumb' });
          }
          return h('div', { class: 'cell-thumb-placeholder' }, '∕');
        }
      },
      { title: 'ID', key: 'id', width: 70 },
      { title: '标题', key: 'title', minWidth: 200, render: function (h, params) {
        return h('span', { class: 'title-text' }, params.row.title || '-');
      }},
      { title: '属性', key: 'attrs', width: 100, render: function (h, params) {
        var len = params.row.attrs ? params.row.attrs.length : 0;
        return h('span', len ? len + '个' : '-');
      }},
      { title: 'SKU', key: 'skuCount', width: 80, align: 'center' },
      { title: '状态', key: 'status', width: 100, align: 'center', render: function (h, params) {
        var s = params.row.status;
        return h('span', { class: 'status-dot ' + (s === 0 ? 'unused' : 'used') },
          s === 0 ? '未使用' : '已使用');
      }},
      { title: '采集时间', key: 'created_at', width: 170 },
      { title: '操作', width: 120, align: 'center', render: function (h, params) {
        var self = this;
        return h('div', [
          h('Button', {
            props: { type: 'primary', size: 'small', icon: 'ios-eye' },
            style: { marginRight: '4px' },
            on: { click: function () { self.$root.openDetail(params.row.id); } }
          }),
          h('Button', {
            props: { type: 'error', size: 'small', icon: 'ios-trash' },
            on: { click: function () { self.$root.deleteOne(params.row.id); } }
          })
        ]);
      }}
    ]
  },
  mounted: function () {
    this.loadStats();
    this.loadList(1);
  },
  methods: {
    loadStats: function () {
      var vm = this;
      fetch('/api/product/stats')
        .then(function (r) { return r.json(); })
        .then(function (data) { vm.stats = data; });
    },
    loadList: function (p) {
      var vm = this;
      if (p) vm.page = p;
      vm.loading = true;

      var params = new URLSearchParams({ page: vm.page, pageSize: vm.pageSize });
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      if (vm.statusFilter !== 'all') params.set('status', vm.statusFilter);

      fetch('/api/product?' + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.list = data.list;
          vm.total = data.total;
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    onPageChange: function (p) {
      this.loadList(p);
    },
    onPageSizeChange: function (size) {
      this.pageSize = size;
      this.loadList(1);
    },
    onSelectionChange: function (selection) {
      this.selectedIds = selection.map(function (item) { return item.id; });
    },
    deleteOne: function (id) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除此商品？删除后不可恢复。',
        onOk: function () {
          fetch('/api/product/' + id, { method: 'DELETE' })
            .then(function () { vm.loadList(); vm.loadStats(); });
        }
      });
    },
    batchDelete: function () {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除 ' + vm.selectedIds.length + ' 条商品？删除后不可恢复。',
        onOk: function () {
          fetch('/api/product/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: vm.selectedIds })
          }).then(function () {
            vm.selectedIds = [];
            vm.loadList();
            vm.loadStats();
          });
        }
      });
    },
    openDetail: function (id) {
      var vm = this;
      vm.detailTab = 'info';
      fetch('/api/product/' + id)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.detail = data;
          vm.showDetail = true;
        });
    },
    toggleStatus: function () {
      var vm = this;
      if (!vm.detail) return;
      var newStatus = vm.detail.status === 0 ? 1 : 0;
      fetch('/api/product/' + vm.detail.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      }).then(function (r) { return r.json(); }).then(function () {
        vm.detail.status = newStatus;
        vm.loadList();
        vm.loadStats();
      });
    },
    copyUrl: function () {
      var vm = this;
      if (!vm.detail) return;
      var url = location.origin + '/api/product/' + vm.detail.id;
      navigator.clipboard.writeText(url).then(function () {
        vm.$Message.success('已复制: ' + url);
      });
    },
    openPreview: function (images, index) {
      this.previewImages = images;
      this.previewIndex = index;
      this.previewVisible = true;
    },
    closePreview: function () {
      this.previewVisible = false;
    }
  }
});
