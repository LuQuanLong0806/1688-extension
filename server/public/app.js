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
    columns: [
      { type: 'selection', width: 50, align: 'center' },
      { title: 'ID', key: 'id', width: 70 },
      { title: '标题', key: 'title', minWidth: 200, render: function (h, params) {
        return h('span', { class: 'title-text' }, params.row.title || '-');
      }},
      { title: '属性', key: 'attrs', width: 100, render: function (h, params) {
        var len = params.row.attrs ? params.row.attrs.length : 0;
        return h('span', len ? len + '个' : '-');
      }},
      { title: 'SKU数', key: 'skuCount', width: 80, align: 'center' },
      { title: '状态', key: 'status', width: 90, align: 'center', render: function (h, params) {
        var s = params.row.status;
        var color = s === 0 ? 'green' : 'default';
        var text = s === 0 ? '未使用' : '已用';
        return h('Tag', { props: { color: color } }, text);
      }},
      { title: '创建时间', key: 'created_at', width: 170 },
      { title: '操作', width: 150, align: 'center', render: function (h, params) {
        var self = this;
        return h('div', [
          h('Button', {
            props: { type: 'primary', size: 'small' },
            style: { marginRight: '4px' },
            on: { click: function () { self.$root.openDetail(params.row.id); } }
          }, '查看'),
          h('Button', {
            props: { type: 'error', size: 'small' },
            on: { click: function () { self.$root.deleteOne(params.row.id); } }
          }, '删除')
        ]);
      }}
    ]
  },
  mounted: function () {
    this.loadList(1);
  },
  methods: {
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
        content: '确认删除此商品？',
        onOk: function () {
          fetch('/api/product/' + id, { method: 'DELETE' })
            .then(function () { vm.loadList(); });
        }
      });
    },
    batchDelete: function () {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除 ' + vm.selectedIds.length + ' 条商品？',
        onOk: function () {
          fetch('/api/product/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: vm.selectedIds })
          }).then(function () {
            vm.selectedIds = [];
            vm.loadList();
          });
        }
      });
    },
    openDetail: function (id) {
      var vm = this;
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
      });
    },
    copyUrl: function () {
      var vm = this;
      if (!vm.detail) return;
      var url = location.origin + '/api/product/' + vm.detail.id;
      navigator.clipboard.writeText(url).then(function () {
        vm.$Message.success('已复制: ' + url);
      });
    }
  }
});
