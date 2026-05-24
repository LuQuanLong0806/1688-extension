// 类目映射管理页面 — 以店小秘类目为视图
Vue.component('page-categories', {
  data: function () {
    return {
      loading: false,
      list: [],
      keyword: '',
      page: 1,
      pageSize: 20,
      total: 0,
      treeStatus: { total: 0, lastSync: null, levels: 0 },
      // 维护映射弹窗
      modalVisible: false,
      modalDxmName: '',
      modalPath: '',
      modalList: [],
      modalLoading: false,
      addKeyword: '',
      addOptions: [],
      _addTimer: null,
      // 新增映射弹窗（顶栏）
      addVisible: false,
      addDxmSelected: '',
      addDxmPath: '',
      addAliList: [],
      addAliSelected: [],
      // 批量补全
      batchBackfillVisible: false,
      batchBackfillList: [],
      batchBackfillSelected: [],
      batchBackfillLoading: false
    };
  },
  mounted: function () {
    this.loadList();
    this.loadTreeStatus();
    this.loadAliCategories();
  },
  methods: {
    loadList: function () {
      var vm = this;
      vm.loading = true;
      var params = new URLSearchParams();
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      params.set('page', vm.page);
      params.set('pageSize', vm.pageSize);
      fetch('/api/category-mappings/grouped?' + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.list = data.list || [];
          vm.total = data.total || 0;
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    doSearch: function () { this.page = 1; this.loadList(); },
    clearSearch: function () { this.keyword = ''; this.page = 1; this.loadList(); },
    loadTreeStatus: function () {
      var vm = this;
      fetch('/api/dxm-tree/status').then(function (r) { return r.json(); }).then(function (s) {
        vm.treeStatus = s;
      }).catch(function () {});
    },
    loadAliCategories: function () {
      var vm = this;
      fetch('/api/product/categories').then(function (r) { return r.json(); }).then(function (list) {
        vm.addAliList = list || [];
      }).catch(function () {});
    },
    // 删除整个店小秘类目映射
    deleteDxmCategory: function (row) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除店小秘类目「' + row.customCategory + '」的所有映射？通过该映射分类的' + row.productCount + '条商品分类也将被清空。',
        onOk: function () {
          fetch('/api/category-mappings/dxm/' + encodeURIComponent(row.customCategory), { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              vm.$Message.success('已删除，清空 ' + (data.cleared || 0) + ' 条商品分类');
              vm.loadList();
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    changePage: function (p) {
      this.page = p;
      this.loadList();
    },
    changePageSize: function (size) {
      this.pageSize = size;
      this.page = 1;
      this.loadList();
    },
    // 打开维护映射弹窗
    openModal: function (row) {
      this.modalDxmName = row.customCategory;
      this.modalPath = row.path;
      this.modalVisible = true;
      this.addKeyword = '';
      this.addOptions = [];
      this.loadModalList();
    },
    loadModalList: function () {
      var vm = this;
      vm.modalLoading = true;
      fetch('/api/category-mappings/by-dxm?name=' + encodeURIComponent(vm.modalDxmName))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.modalList = data;
          vm.modalLoading = false;
        })
        .catch(function () { vm.modalLoading = false; });
    },
    // 删除单条1688映射
    deleteMapItem: function (item) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认解除1688类目「' + item.categoryName + '」与店小秘类目的绑定？通过该映射分类的' + item.productCount + '条商品分类也将被清空。',
        onOk: function () {
          fetch('/api/category-mappings/' + item.id, { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              vm.$Message.success('已解除，清空 ' + (data.cleared || 0) + ' 条商品分类');
              vm.loadModalList();
              vm.loadList();
            }).catch(function () { vm.$Message.error('解除失败'); });
        }
      });
    },
    // 维护弹窗 - 新增映射搜索
    onAddInput: function () {
      var vm = this;
      var kw = (vm.addKeyword || '').trim();
      if (!kw) { vm.addOptions = []; return; }
      clearTimeout(vm._addTimer);
      vm._addTimer = setTimeout(function () {
        fetch('/api/categories?keyword=' + encodeURIComponent(kw))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            vm.addOptions = d.list || [];
          }).catch(function () {});
      }, 300);
    },
    // 维护弹窗 - 选中1688类目绑定
    addMapping: function (cat) {
      var vm = this;
      fetch('/api/category-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: cat.name, customCategory: vm.modalDxmName })
      }).then(function (r) { return r.json(); }).then(function () {
        vm.$Message.success('已绑定');
        vm.addKeyword = '';
        vm.addOptions = [];
        vm.loadModalList();
        vm.loadList();
      }).catch(function () { vm.$Message.error('绑定失败'); });
    },
    // 补全路径
    backfillPath: function (row) {
      var vm = this;
      this.$Modal.confirm({
        title: '补全路径',
        content: '确认补全类目「' + row.customCategory + '」下所有缺少路径的商品？共 ' + (row.productCount || 0) + ' 件商品。',
        onOk: function () {
          fetch('/api/products/backfill-path', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customCategory: row.customCategory })
          }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.updated > 0) {
              vm.$Message.success('已补全 ' + data.updated + ' 件商品的路径: ' + data.path);
            } else {
              vm.$Message.info(data.message || '无需补全');
            }
            vm.loadList();
          }).catch(function () { vm.$Message.error('补全失败'); });
        }
      });
    },
    // === 新增映射弹窗（顶栏按钮）===
    openAddDialog: function () {
      this.addVisible = true;
      this.addDxmSelected = '';
      this.addDxmPath = '';
      this.addAliSelected = [];
    },
    onAddDxmInput: function (val) {
      this.addDxmSelected = val;
    },
    onAddDxmPath: function (path) {
      this.addDxmPath = path;
    },
    submitAddMapping: function () {
      var vm = this;
      if (!vm.addDxmSelected) { vm.$Message.warning('请选择店小秘类目'); return; }
      if (!vm.addAliSelected.length) { vm.$Message.warning('请选择1688类目'); return; }
      Promise.all(vm.addAliSelected.map(function (name) {
        return fetch('/api/category-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryName: name, customCategory: vm.addDxmSelected })
        });
      })).then(function () {
        vm.$Message.success('已创建 ' + vm.addAliSelected.length + ' 条映射');
        vm.addVisible = false;
        vm.loadList();
      }).catch(function () { vm.$Message.error('创建映射失败'); });
    },
    // 批量补全路径
    openBatchBackfill: function () {
      var vm = this;
      vm.batchBackfillSelected = [];
      vm.batchBackfillLoading = false;
      fetch('/api/category-mappings/grouped?pageSize=9999')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.batchBackfillList = (data.list || []).filter(function (row) { return !row.path; });
          vm.batchBackfillVisible = true;
        });
    },
    batchBackfillAll: function () {
      this.batchBackfillSelected = this.batchBackfillList.map(function (r) { return r.customCategory; });
    },
    doBatchBackfill: function () {
      var vm = this;
      if (!vm.batchBackfillSelected.length) { vm.$Message.warning('请选择类目'); return; }
      vm.batchBackfillLoading = true;
      var total = vm.batchBackfillSelected.length;
      var done = 0;
      var totalUpdated = 0;
      vm.batchBackfillSelected.forEach(function (cat) {
        fetch('/api/products/backfill-path', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customCategory: cat })
        }).then(function (r) { return r.json(); }).then(function (data) {
          done++;
          totalUpdated += (data.updated || 0);
          if (done >= total) {
            vm.batchBackfillLoading = false;
            vm.$Message.success('批量补全完成，共更新 ' + totalUpdated + ' 件商品');
            vm.batchBackfillVisible = false;
            vm.loadList();
          }
        }).catch(function () {
          done++;
          if (done >= total) {
            vm.batchBackfillLoading = false;
            vm.$Message.info('批量补全完成，共更新 ' + totalUpdated + ' 件商品');
            vm.batchBackfillVisible = false;
            vm.loadList();
          }
        });
      });
    }
  },
  computed: {
    columns: function () {
      var vm = this;
      return [
        {
          title: '店小秘类目',
          key: 'customCategory',
          minWidth: 160,
          render: function (h, params) {
            return h('span', { style: { color: 'var(--text-primary)', fontWeight: '500' } }, params.row.customCategory);
          }
        },
        {
          title: '完整路径',
          key: 'path',
          minWidth: 260,
          render: function (h, params) {
            return h('span', { style: { fontSize: '12px', color: 'var(--text-muted)', wordBreak: 'break-all', lineHeight: '1.4' } }, params.row.path || '-');
          }
        },
        {
          title: '商品数',
          width: 90,
          align: 'center',
          render: function (h, params) {
            var cnt = params.row.productCount || 0;
            return h('span', { style: { fontWeight: '500', color: cnt ? 'var(--text-primary)' : 'var(--text-muted)' } }, cnt);
          }
        },
        {
          title: '已绑定1688类目',
          minWidth: 200,
          render: function (h, params) {
            var cats = params.row.aliCategories || [];
            var tags = cats.map(function (c) {
              return h('Tag', { style: { marginRight: '4px', marginBottom: '2px' } }, c.categoryName);
            });
            return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '2px' } }, tags.length ? tags : [h('span', { style: { color: 'var(--text-muted)' } }, '-')]);
          }
        },
        {
          title: '操作',
          width: 280,
          align: 'center',
          render: function (h, params) {
            return h('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } }, [
              h('Button', {
                props: { type: 'primary', size: 'small', icon: 'md-settings' },
                on: { click: function () { vm.openModal(params.row); } }
              }, '维护映射'),
              h('Button', {
                props: { type: 'warning', size: 'small', icon: 'md-git-pull-request' },
                on: { click: function () { vm.backfillPath(params.row); } }
              }, '补全路径'),
              h('Button', {
                props: { type: 'error', size: 'small', icon: 'ios-trash' },
                on: { click: function () { vm.deleteDxmCategory(params.row); } }
              }, '删除')
            ]);
          }
        }
      ];
    }
  },
  template: `
    <div class="list-card">
      <div style="padding:12px 20px;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="font-weight:500;color:var(--text-primary)">分类树同步</span>
        <span style="font-size:13px;color:var(--text-secondary)">共 <strong style="color:var(--text-primary)">{{ treeStatus.total }}</strong> 个分类</span>
        <span v-if="treeStatus.lastSync" style="font-size:13px;color:var(--text-secondary)">最后同步: {{ treeStatus.lastSync }}</span>
        <span v-if="treeStatus.levels" style="font-size:13px;color:var(--text-secondary)">层级: {{ treeStatus.levels }}</span>
        <i-button v-if="treeStatus.total === 0" type="info" size="small" @click="$Message.info('请在店小秘页面右键小蜜蜂 → 同步类目树')">前往同步</i-button>
      </div>
      <div class="action-bar">
        <div class="action-bar-left">
          <span style="font-weight:500;color:var(--text-primary)">店小秘类目映射</span>
          <i-input v-model="keyword" placeholder="搜索店小秘类目" style="width:220px" @on-enter="doSearch" @on-clear="clearSearch" clearable>
            <icon type="ios-search" slot="prefix"></icon>
          </i-input>
          <i-button type="primary" icon="ios-search" @click="doSearch">搜索</i-button>
        </div>
        <div class="action-bar-right">
          <span style="font-size:13px;color:var(--text-secondary)">共 <strong style="color:var(--text-primary)">{{ total }}</strong> 个已映射类目</span>
          <i-button type="success" icon="md-add" @click="openAddDialog">新增映射</i-button>
          <i-button type="warning" icon="md-git-pull-request" @click="openBatchBackfill">批量补全</i-button>
          <i-button icon="md-refresh" @click="loadList">刷新</i-button>
        </div>
      </div>
      <i-table :columns="columns" :data="list" :loading="loading" stripe style="margin-bottom:0;"></i-table>
      <div style="padding:12px 20px;display:flex;justify-content:flex-end;background:var(--bg-surface);border-top:1px solid var(--border-subtle)">
        <Page :current="page" :total="total" :page-size="pageSize" :page-size-opts="[10,20,50,100]"
          show-total show-sizer show-elevator
          @on-change="changePage" @on-page-size-change="changePageSize" />
      </div>
      <!-- 维护映射弹窗 -->
      <modal v-model="modalVisible" :title="'维护映射 - ' + modalDxmName" :mask-closable="false" width="600" footer-hide>
        <div v-if="modalPath" style="font-size:12px;color:var(--text-muted);margin-bottom:12px;padding:8px;background:var(--bg-elevated);border-radius:var(--radius);word-break:break-all">{{ modalPath }}</div>
        <!-- 新增映射 -->
        <div style="margin-bottom:16px">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">新增1688类目映射</div>
          <div style="position:relative">
            <i-input v-model="addKeyword" placeholder="输入1688类目名称搜索..." @on-input="onAddInput" style="width:100%">
              <icon type="ios-search" slot="prefix"></icon>
            </i-input>
            <div v-if="addOptions.length" style="position:absolute;top:34px;left:0;right:0;z-index:1050;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-hover);max-height:200px;overflow-y:auto">
              <div v-for="cat in addOptions" :key="cat.name"
                style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center"
                @mouseenter="$event.target.style.background='var(--accent-subtle)'"
                @mouseleave="$event.target.style.background=''"
                @click="addMapping(cat)">
                <span style="font-size:13px;color:var(--text-primary)">{{ cat.name }}</span>
                <span style="font-size:11px;color:var(--text-muted)">{{ cat.count }}件商品</span>
              </div>
            </div>
          </div>
        </div>
        <!-- 已绑定列表 -->
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">已绑定的1688类目</div>
        <div v-if="modalLoading" style="text-align:center;padding:20px;color:var(--text-muted)">加载中...</div>
        <div v-else-if="!modalList.length" style="text-align:center;padding:20px;color:var(--text-muted)">暂无绑定</div>
        <table v-else style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:var(--bg-elevated)">
              <th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--border)">1688类目</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--border);width:80px">商品数</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--border);width:80px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in modalList" :key="item.id" style="border-bottom:1px solid var(--border-subtle)">
              <td style="padding:8px 12px;color:var(--accent)">{{ item.categoryName }}</td>
              <td style="padding:8px 12px;text-align:center;color:var(--text-primary)">{{ item.productCount || 0 }}</td>
              <td style="padding:8px 12px;text-align:center">
                <i-button type="error" size="small" icon="ios-trash" @click="deleteMapItem(item)"></i-button>
              </td>
            </tr>
          </tbody>
        </table>
      </modal>
      <!-- 新增映射弹窗（顶栏） -->
      <modal v-model="addVisible" title="新增类目映射" :mask-closable="false" width="520">
        <div style="margin-bottom:16px">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">店小秘类目</div>
          <category-picker :value="addDxmSelected"
            placeholder="搜索店小秘类目..."
            @input="onAddDxmInput"
            @path="onAddDxmPath" />
        </div>
        <div style="margin-bottom:16px">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">1688类目（可多选）</div>
          <i-select v-model="addAliSelected" multiple filterable placeholder="选择1688类目">
            <i-option v-for="c in addAliList" :key="c" :value="c">{{ c }}</i-option>
          </i-select>
        </div>
        <div slot="footer">
          <i-button @click="addVisible = false">取消</i-button>
          <i-button type="primary" @click="submitAddMapping">确认映射</i-button>
        </div>
      </modal>
      <!-- 批量补全弹窗 -->
      <modal v-model="batchBackfillVisible" title="批量补全路径" :mask-closable="false" width="520">
        <div v-if="!batchBackfillList.length" style="text-align:center;padding:20px;color:var(--text-muted)">所有类目已有路径，无需补全</div>
        <div v-else>
          <div style="margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:13px;color:var(--text-secondary)">以下类目缺少完整路径，勾选需要补全的类目</span>
            <a style="font-size:13px;cursor:pointer" @click="batchBackfillAll">全选</a>
          </div>
          <checkbox-group v-model="batchBackfillSelected">
            <div v-for="row in batchBackfillList" :key="row.customCategory" style="padding:4px 0">
              <checkbox :label="row.customCategory">
                <span style="color:var(--text-primary)">{{ row.customCategory }}</span>
                <span style="color:var(--text-muted);margin-left:4px">({{ row.productCount || 0 }}件)</span>
              </checkbox>
            </div>
          </checkbox-group>
        </div>
        <div slot="footer">
          <i-button @click="batchBackfillVisible = false">取消</i-button>
          <i-button type="primary" :loading="batchBackfillLoading" :disabled="!batchBackfillSelected.length" @click="doBatchBackfill">补全 ({{ batchBackfillSelected.length }})</i-button>
        </div>
      </modal>
    </div>`
});
