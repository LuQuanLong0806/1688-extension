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
      dxmCategoryFilter: '',
      dxmCategoryList: [],
      selectedIds: [],
      batchCatVisible: false,
      batchCatValue: '',
      batchCatPath: '',
      _pollTimer: null
    };
  },
  mounted: function () {
    this.loadList(1);
    this.loadCategories();
    this.loadDxmCategories();
    this.startPoll();
  },
  beforeDestroy: function () {
    if (this._pollTimer) this._pollTimer.close();
  },
  computed: {
    columns: function () {
      var vm = this;
      return [
        { type: 'selection', width: 40, align: 'center' },
        {
          title: '预览',
          width: 80,
          align: 'center',
          ellipsis: false,
          className: 'col-thumb',
          slot: 'preview'
        },
        {
          title: '标题',
          key: 'title',
          width: 220,
          ellipsis: false,
          tooltip: false,
          slot: 'title'
        },
        {
          title: '1688类目',
          width: 160,
          align: 'center',
          slot: 'aliCategory'
        },
        {
          title: '选择分类',
          width: 240,
          slot: 'category'
        },
        {
          title: 'SKU',
          width: 180,
          slot: 'sku'
        },
        {
          title: '使用状态',
          width: 100,
          align: 'center',
          slot: 'status'
        },
        { title: '采集时间', key: 'created_at', width: 200 },
        {
          title: '操作',
          width: 280,
          align: 'center',
          className: 'col-actions',
          fixed: 'right',
          slot: 'actions'
        }
      ];
    }
  },
  methods: {
    // -- 列辅助方法 --
    getSkuImage: function (row) {
      var mainImages = JSON.parse(row.main_images || '[]');
      if (mainImages.length) {
        var first = mainImages[0];
        return typeof first === 'string' ? first : (first && first.url) || null;
      }
      var skus = JSON.parse(row.skus || '[]');
      return skus.length && skus[0].image ? skus[0].image : null;
    },
    getCategoryName: function (row) {
      var cat = row.category;
      return (
        row.customCategory ||
        (cat && (cat.leafCategoryName || cat.categoryPath)) ||
        ''
      );
    },
    getSkuText: function (row) {
      var skus = JSON.parse(row.skus || '[]');
      if (!skus.length) return '';
      var names = skus
        .map(function (s) {
          return s.name || s.sku || '';
        })
        .filter(Boolean);
      if (!names.length)
        names = skus.map(function (s, i) {
          return 'SKU' + (i + 1);
        });
      return names.join('、');
    },
    saveCategory: function (row, val) {
      if (val === undefined) return;
      row.customCategory = val;
      var vm = this;
      fetch('/api/product/' + row.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCategory: val || '' })
      })
        .then(function () {
          vm.$Message.success('已保存');
        })
        .catch(function () {
          vm.$Message.error('保存失败');
        });
    },
    saveCategoryPath: function (row, path) {
      row.manualCategory = path || '';
      fetch('/api/product/' + row.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualCategory: path || '' })
      }).catch(function () {});
    },
    // -- 数据加载 --
    startPoll: function () {
      var vm = this;
      var es = new EventSource('/api/events');
      es.addEventListener('product-added', function () {
        vm.loadList(vm.page);
        vm.$root.loadStats();
        vm.$Message.info('新采集数据已同步');
      });
      es.onerror = function () {
        es.close();
        setTimeout(function () {
          vm.startPoll();
        }, 3000);
      };
      vm._pollTimer = es;
    },
    loadCategories: function () {
      var vm = this;
      fetch('/api/product/categories')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.categoryList = list;
        })
        .catch(function () {});
    },
    loadDxmCategories: function () {
      var vm = this;
      fetch('/api/product/dxm-categories')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.dxmCategoryList = list;
        })
        .catch(function () {});
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
      if (vm.dxmCategoryFilter) params.set('dxmCategory', vm.dxmCategoryFilter);
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
    openAdd: function (id) {
      window.open(
        'https://www.dianxiaomi.com/web/temu/add?collectId=' + id,
        '_blank'
      );
    },
    openQuoteEdit: function (id) {
      var pid =
        localStorage.getItem('dxm_quote_product_id') || '166827730497622097';
      window.open(
        'https://www.dianxiaomi.com/web/temu/quoteEdit?id=' +
          pid +
          '&collectId=' +
          id,
        '_blank'
      );
    },
    deleteProduct: function (id) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除此商品？',
        onOk: function () {
          fetch('/api/product/' + id, { method: 'DELETE' })
            .then(function () {
              vm.loadList();
              vm.$root.loadStats();
            })
            .catch(function () {
              vm.$Message.error('删除失败');
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
          })
            .then(function () {
              vm.selectedIds = [];
              vm.loadList();
              vm.$root.loadStats();
            })
            .catch(function () {
              vm.$Message.error('批量删除失败');
            });
        }
      });
    },
    openBatchCategory: function () {
      if (!this.selectedIds.length) {
        this.$Message.warning('请先选择商品');
        return;
      }
      this.batchCatValue = '';
      this.batchCatPath = '';
      this.batchCatVisible = true;
    },
    saveBatchCategory: function () {
      var vm = this;
      var catValue = (vm.batchCatValue || '').trim();
      if (!catValue) {
        vm.$Message.warning('请选择类目');
        return;
      }
      var body = { customCategory: catValue };
      if (vm.batchCatPath) body.manualCategory = vm.batchCatPath;
      Promise.all(
        vm.selectedIds.map(function (id) {
          return fetch('/api/product/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        })
      )
        .then(function () {
          vm.$Message.success(
            '已批量设置 ' + vm.selectedIds.length + ' 条商品的类目'
          );
          vm.batchCatVisible = false;
          vm.selectedIds = [];
          vm.loadList();
        })
        .catch(function () {
          vm.$Message.error('批量设置失败');
        });
    }
  },
  template: `
    <div class="list-card">
      <div class="filter-bar">
        <i-input v-model="keyword" placeholder="搜索标题..." clearable style="width:220px" @on-enter="loadList(1)" @on-clear="loadList(1)">
          <icon type="ios-search" slot="prefix"></icon>
        </i-input>
        <span style="font-size:13px;color:#666;white-space:nowrap">状态</span>
        <i-select v-model="statusFilter" clearable placeholder="全部状态" style="width:130px" @on-change="loadList(1)">
          <i-option value="all">全部状态</i-option>
          <i-option value="0">未使用</i-option>
          <i-option value="1">已使用</i-option>
        </i-select>
        <span style="font-size:13px;color:#666;white-space:nowrap">类目</span>
        <i-select v-model="categoryFilter" clearable filterable placeholder="全部类目" style="width:150px" @on-change="loadList(1)">
          <i-option v-for="c in categoryList" :key="c" :value="c">{{ c }}</i-option>
        </i-select>
        <span style="font-size:13px;color:#666;white-space:nowrap">店小秘类目</span>
        <i-select v-model="dxmCategoryFilter" clearable filterable placeholder="店小秘类目" style="width:160px" @on-change="loadList(1)">
          <i-option value="_none">未映射</i-option>
          <i-option v-for="d in dxmCategoryList" :key="d" :value="d">{{ d }}</i-option>
        </i-select>
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>
      </div>
      <div class="action-bar">
        <div class="action-bar-left">共采集 <strong>{{ total }}</strong> 条数据</div>
        <div class="action-bar-right">
          <i-button type="error" icon="ios-trash" :disabled="selectedIds.length === 0" @click="batchDelete">
            批量删除{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <i-button type="warning" icon="md-pricetag" :disabled="selectedIds.length === 0" @click="openBatchCategory">
            批量设置类目{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <tooltip content="刷新" placement="top"><i-button icon="md-refresh" shape="circle" @click="loadList()"></i-button></tooltip>
        </div>
      </div>
      <i-table :columns="columns" :data="list" :loading="loading" stripe @on-selection-change="onSelectionChange" style="margin-bottom:0;">
        <template slot="preview" slot-scope="{ row }">
          <div v-if="!getSkuImage(row)" class="cell-thumb-ph"></div>
          <img v-else :src="getSkuImage(row)" loading="lazy" class="cell-thumb"
            @mouseenter="$root.$refs.thumbPreview.open(getSkuImage(row), $event)"
            @mousemove="$root.$refs.thumbPreview.move($event)"
            @mouseleave="$root.$refs.thumbPreview.close()" />
        </template>
        <template slot="title" slot-scope="{ row }">
          <a v-if="row.source_url" :href="row.source_url" target="_blank"
            style="word-break:break-all;line-height:1.4;color:#333;text-decoration:none;cursor:pointer;display:inline-block"
            @mouseenter="$event.target.style.color='#ff6a00';$event.target.style.textDecoration='underline'"
            @mouseleave="$event.target.style.color='#333';$event.target.style.textDecoration='none'">{{ row.title || '-' }}</a>
          <span v-else style="word-break:break-all;line-height:1.4">{{ row.title || '-' }}</span>
        </template>
        <template slot="aliCategory" slot-scope="{ row }">
          <span style="font-size:12px;color:#666;word-break:break-all">{{ (row.category && (row.category.leafCategoryName || row.category.categoryPath)) || '-' }}</span>
        </template>
        <template slot="category" slot-scope="{ row }">
          <category-picker :value="row.customCategory || ''"
            placeholder="搜索或选择分类"
            @input="saveCategory(row, $event)"
            @path="saveCategoryPath(row, $event)" />
        </template>
        <template slot="sku" slot-scope="{ row }">
          <template v-if="!getSkuText(row)">
            <span style="color:#ccc">-</span>
          </template>
          <span v-else style="font-size:12px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all">{{ getSkuText(row) }}</span>
        </template>
        <template slot="status" slot-scope="{ row }">
          <span :class="row.status === 1 ? 'status-tag status-used' : 'status-tag status-unused'">{{ row.status === 1 ? '已使用' : '未使用' }}</span>
        </template>
        <template slot="actions" slot-scope="{ row }">
          <div class="action-btns">
            <Button type="primary" size="small" icon="ios-eye" @click="$root.openDetail(row.id)">详情</Button>
            <Button type="success" size="small" icon="md-paper-plane" @click="openAdd(row.id)">发布</Button>
            <Button type="error" size="small" icon="ios-trash" @click="deleteProduct(row.id)">删除</Button>
          </div>
        </template>
      </i-table>
      <div class="pagination-wrap">
        <page :total="total" :current="page" :page-size="pageSize"
          :page-size-opts="[10,20,50,100]" show-total show-elevator show-sizer
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />
      </div>
      <modal v-model="batchCatVisible" title="批量设置类目" :mask-closable="false" width="500">
        <div style="margin-bottom:12px">
          <p style="margin-bottom:8px;color:#666">已选择 <strong>{{ selectedIds.length }}</strong> 条商品</p>
          <category-picker v-model="batchCatValue" placeholder="搜索或选择分类" @path="function(p) { batchCatPath = p }" />
        </div>
        <div slot="footer">
          <i-button @click="batchCatVisible = false">取消</i-button>
          <i-button type="primary" @click="saveBatchCategory">保存</i-button>
        </div>
      </modal>
    </div>`
});
