// 商品列表页面组件
Vue.component('page-products', {
  data: function () {
    return {
      loading: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      statusFilter: 'all',
      categoryFilter: '',
      categoryList: [],
      selectedIds: [],
      columns: []
    };
  },
  created: function () {
    var vm = this;
    this.columns = [
      { type: 'selection', width: 60, align: 'center' },
      {
        title: '预览',
        width: 100,
        align: 'center',
        ellipsis: false,
        className: 'col-thumb',
        render: function (h, params) {
          var skus = JSON.parse(params.row.skus || '[]');
          var img = skus.length && skus[0].image ? skus[0].image : null;
          if (!img) return h('div', { class: 'cell-thumb-ph' });
          return h('img', {
            attrs: { src: img, loading: 'lazy' },
            class: 'cell-thumb',
            on: {
              mouseenter: function (e) {
                vm.$root.$refs.thumbPreview.open(img, e);
              },
              mousemove: function (e) {
                vm.$root.$refs.thumbPreview.move(e);
              },
              mouseleave: function () {
                vm.$root.$refs.thumbPreview.close();
              }
            }
          });
        }
      },
      {
        title: '标题',
        key: 'title',
        width: 300,
        ellipsis: false,
        render: function (h, params) {
          return h('span', { class: 'title-text' }, params.row.title || '-');
        }
      },
      {
        title: '类目',
        width: 180,
        render: function (h, params) {
          var cat = params.row.category;
          var name = cat && (cat.leafCategoryName || cat.categoryPath);
          if (name) {
            return h('span', { class: 'cell-category-wrap' }, [
              h(
                'span',
                { class: 'cell-category', attrs: { title: name } },
                name
              ),
              h('Icon', {
                props: { type: 'md-copy', size: 16 },
                class: 'cell-copy-icon',
                nativeOn: {
                  click: function (e) {
                    e.stopPropagation();
                    navigator.clipboard.writeText(name).then(function () {
                      vm.$Message.success('已复制: ' + name);
                    });
                  }
                }
              })
            ]);
          }
          return h('span', { style: { color: '#ccc' } }, '-');
        }
      },
      {
        title: 'SKU',
        minWidth: 160,
        maxWidth: 360,
        render: function (h, params) {
          var skus = JSON.parse(params.row.skus || '[]');
          if (!skus.length) return h('span', { style: { color: '#ccc' } }, '-');
          var names = skus
            .map(function (s) {
              return s.name || s.sku || '';
            })
            .filter(Boolean);
          if (!names.length)
            names = skus.map(function (s, i) {
              return 'SKU' + (i + 1);
            });
          var text = names.join('、');
          return h(
            'span',
            {
              style: {
                fontSize: '12px',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: '2',
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-all'
              }
            },
            text
          );
        }
      },
      {
        title: '来源地址',
        width: 200,
        render: function (h, params) {
          var url = params.row.source_url;
          if (!url) return h('span', { style: { color: '#ccc' } }, '-');
          var short = url.length > 35 ? url.substring(0, 35) + '...' : url;
          return h(
            'a',
            {
              attrs: { href: url, target: '_blank', title: url },
              style: {
                fontSize: '12px',
                color: '#ff6a00',
                wordBreak: 'break-all',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: '2',
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }
            },
            short
          );
        }
      },
      {
        title: '使用状态',
        width: 120,
        align: 'center',
        render: function (h, params) {
          return h('i-switch', {
            props: {
              value: params.row.status === 0,
              trueColor: '#52c41a',
              falseColor: '#d9d9d9'
            },
            on: {
              'on-change': function (val) {
                vm.toggleStatus(params.row);
              }
            }
          });
        }
      },
      { title: '采集时间', key: 'created_at', width: 200 },
      {
        title: '操作',
        width: 240,
        align: 'center',
        className: 'col-actions',
        fixed: 'right',
        render: function (h, params) {
          var row = params.row;
          return h('div', { class: 'action-btns' }, [
            h(
              'Tooltip',
              {
                props: {
                  content: '查看/编辑',
                  placement: 'top',
                  transfer: true
                }
              },
              [
                h('Button', {
                  props: { type: 'primary', size: 'small', icon: 'ios-eye' },
                  on: {
                    click: function () {
                      vm.$root.openDetail(row.id);
                    }
                  }
                })
              ]
            ),
            h(
              'Tooltip',
              {
                props: { content: '新建打开', placement: 'top', transfer: true }
              },
              [
                h('Button', {
                  props: { size: 'small', icon: 'md-open' },
                  on: {
                    click: function () {
                      window.open('https://www.dianxiaomi.com/web/temu/add', '_blank');
                    }
                  }
                })
              ]
            ),
            h(
              'Tooltip',
              {
                props: { content: '引用打开', placement: 'top', transfer: true }
              },
              [
                h('Button', {
                  props: { size: 'small', icon: 'ios-link' },
                  on: {
                    click: function () {
                      vm.openQuoteEdit(row.id);
                    }
                  }
                })
              ]
            ),
            h(
              'Tooltip',
              { props: { content: '删除', placement: 'top', transfer: true } },
              [
                h('Button', {
                  props: { type: 'error', size: 'small', icon: 'ios-trash' },
                  on: {
                    click: function () {
                      vm.deleteProduct(row.id);
                    }
                  }
                })
              ]
            )
          ]);
        }
      }
    ];
  },
  mounted: function () {
    this.loadList(1);
    this.loadCategories();
  },
  methods: {
    loadCategories: function () {
      var vm = this;
      fetch('/api/product/categories')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.categoryList = list;
        });
    },
    loadList: function (p) {
      var vm = this;
      if (p) vm.page = p;
      vm.loading = true;
      var params = new URLSearchParams({
        page: vm.page,
        pageSize: vm.pageSize
      });
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      if (vm.statusFilter && vm.statusFilter !== 'all')
        params.set('status', vm.statusFilter);
      if (vm.categoryFilter) params.set('category', vm.categoryFilter);
      fetch('/api/product?' + params.toString())
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          vm.list = d.list;
          vm.total = d.total;
          vm.loading = false;
        })
        .catch(function () {
          vm.loading = false;
        });
    },
    toggleStatus: function (row) {
      var vm = this;
      var ns = row.status === 0 ? 1 : 0;
      fetch('/api/product/' + row.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
      }).then(function () {
        row.status = ns;
        vm.$root.loadStats();
      });
    },
    onPageChange: function (p) {
      this.loadList(p);
    },
    onPageSizeChange: function (s) {
      this.pageSize = s;
      this.loadList(1);
    },
    onSelectionChange: function (sel) {
      this.selectedIds = sel.map(function (i) {
        return i.id;
      });
    },
    openQuoteEdit: function (id) {
      window.open('https://www.dianxiaomi.com/web/temu/quoteEdit?collectId=' + id, '_blank');
    },
    openSource: function (url) {
      if (url) window.open(url, '_blank');
    },
    deleteProduct: function (id) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除此商品？',
        onOk: function () {
          fetch('/api/product/' + id, { method: 'DELETE' }).then(function () {
            vm.loadList();
            vm.$root.loadStats();
          });
        }
      });
    },
    batchDelete: function () {
      var vm = this;
      if (!vm.selectedIds.length) return;
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
            vm.$root.loadStats();
          });
        }
      });
    }
  },
  template:
    '\
    <div class="list-card">\
      <div class="filter-bar">\
        <i-input v-model="keyword" placeholder="搜索标题..." clearable style="width:220px" @on-enter="loadList(1)" @on-clear="loadList(1)">\
          <icon type="ios-search" slot="prefix"></icon>\
        </i-input>\
        <i-select v-model="statusFilter" clearable placeholder="全部状态" style="width:130px" @on-change="loadList(1)">\
          <i-option value="all">全部状态</i-option>\
          <i-option value="0">未使用</i-option>\
          <i-option value="1">已使用</i-option>\
        </i-select>\
        <i-select v-model="categoryFilter" clearable filterable placeholder="全部类目" style="width:150px" @on-change="loadList(1)">\
          <i-option v-for="c in categoryList" :key="c" :value="c">{{ c }}</i-option>\
        </i-select>\
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>\
      </div>\
      <div class="action-bar">\
        <div class="action-bar-left">共采集 <strong>{{ total }}</strong> 条数据</div>\
        <div class="action-bar-right">\
          <i-button type="error" icon="ios-trash" size="small"\
            :disabled="selectedIds.length === 0"\
            @click="batchDelete">\
            批量删除{{ selectedIds.length ? \' (\' + selectedIds.length + \')\' : \'\' }}\
          </i-button>\
          <tooltip content="刷新" placement="top"><i-button icon="md-refresh" shape="circle" size="small" @click="loadList()"></i-button></tooltip>\
        </div>\
      </div>\
      <i-table :columns="columns" :data="list" :loading="loading" stripe\
        @on-selection-change="onSelectionChange" style="margin-bottom:0;"></i-table>\
      <div class="pagination-wrap">\
        <page :total="total" :current="page" :page-size="pageSize"\
          :page-size-opts="[10,20,50,100]" show-total show-elevator show-sizer\
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />\
      </div>\
    </div>'
});
