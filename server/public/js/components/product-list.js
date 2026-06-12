// 商品列表页面组件
Vue.component('page-products', {
  data: function () {
    return {
      loading: false,
      syncing: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      statusFilter: 'all',
      deletedFilter: '0',
      categoryFilter: '',
      categoryList: [],
      dxmCategoryFilter: '',
      dxmCategoryList: [],
      selectedIds: [],
      batchCatVisible: false,
      batchCatValue: '',
      batchCatPath: '',
      _pollTimer: null,
      recommending: {},
      automating: false,
      pipelineProgress: {},
      pipelineQueue: {},
      pipelineDrawerVisible: false,
      pipelineTotalCount: 0,
      scopeFilter: 'mine',
      assignModalVisible: false,
      assignUsername: '',
      assignLoading: false
    };
  },
  mounted: function () {
    this.restoreFilters();
    this.loadList();
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
      var base = [
        { type: 'selection', width: 40, align: 'center' },
        {
          title: '状态',
          width: 70,
          align: 'center',
          slot: 'statusDot'
        },
        {
          title: '阶段',
          width: 80,
          align: 'center',
          slot: 'automationStage'
        },
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
          minWidth: 180,
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
          minWidth: 200,
          slot: 'category'
        },
        {
          title: 'SKU',
          width: 180,
          slot: 'sku'
        },
        { title: '采集时间', key: 'created_at', width: 200 }
      ];
      if (vm.scopeFilter === 'inbox') {
        base.push({
          title: '认领',
          width: 80,
          align: 'center',
          render: function (h, params) {
            return h('i-button', {
              props: { size: 'small', type: 'success' },
              on: { click: function () { vm.claimProduct(params.row); } }
            }, '认领');
          }
        });
      }
      base.push({
        title: '操作',
        width: 220,
        align: 'center',
        className: 'col-actions',
        fixed: 'right',
        slot: 'actions'
      });
      return base;
    }
  },
  methods: {
    // -- 筛选缓存 --
    restoreFilters: function () {
      try {
        var s = JSON.parse(localStorage.getItem('__product_filters'));
        if (!s) return;
        if (s.keyword !== undefined) this.keyword = s.keyword;
        if (s.statusFilter !== undefined) this.statusFilter = s.statusFilter;
        if (s.deletedFilter !== undefined) this.deletedFilter = s.deletedFilter;
        if (s.categoryFilter !== undefined)
          this.categoryFilter = s.categoryFilter;
        if (s.dxmCategoryFilter !== undefined)
          this.dxmCategoryFilter = s.dxmCategoryFilter;
        if (s.page) this.page = s.page;
        if (s.pageSize) this.pageSize = s.pageSize;
      } catch (e) {}
    },
    saveFilters: function () {
      try {
        localStorage.setItem(
          '__product_filters',
          JSON.stringify({
            keyword: this.keyword,
            statusFilter: this.statusFilter,
            deletedFilter: this.deletedFilter,
            categoryFilter: this.categoryFilter,
            dxmCategoryFilter: this.dxmCategoryFilter,
            page: this.page,
            pageSize: this.pageSize
          })
        );
      } catch (e) {}
    },
    pipelineActive: function () {
      var q = this.pipelineQueue;
      return q && q.state === 'running' && q.currentUid;
    },
    pipelineCurrentMsg: function () {
      if (!this.pipelineActive) return '';
      var uid = this.pipelineQueue && this.pipelineQueue.currentUid;
      var p = uid ? this.pipelineProgress[uid] : null;
      return (p && typeof p.message === 'string') ? p.message : '处理中...';
    },
    pipelineCurrentStep: function () {
      if (!this.pipelineActive) return '';
      var uid = this.pipelineQueue && this.pipelineQueue.currentUid;
      var p = uid ? this.pipelineProgress[uid] : null;
      return (p && p.step) ? 'Step ' + p.step + '/' + (p.total || 7) : '';
    },
    pipelineQueueInfo: function () {
      var q = this.pipelineQueue;
      if (!q || !q.state) return '';
      if (this.pipelineTotalCount <= 0) return '';
      var done = this.pipelineTotalCount - (q.pending || 0) - 1;
      if (done < 0) done = 0;
      return done + '/' + this.pipelineTotalCount;
    },
    pipelineStepList: function () {
      var names = ['智能筛选', '图片处理', '尺寸标注', '分类推荐', '标题优化', '数据诊断', '上传图床'];
      var uid = this.pipelineQueue && this.pipelineQueue.currentUid;
      var p = uid ? this.pipelineProgress[uid] : null;
      var currentStep = p ? p.step : 0;
      var total = p ? p.total : 7;
      var list = [];
      for (var i = 1; i <= total; i++) {
        var status = 'pending';
        var cls = '';
        var msg = '';
        if (p && i < currentStep) {
          status = 'done'; cls = 'done';
        } else if (p && i === currentStep) {
          if (p.stage === 'processing') { status = 'active'; cls = 'active'; }
          else { status = 'done'; cls = 'done'; }
          msg = (typeof p.message === 'string') ? p.message : '';
        }
        list.push({ idx: i, name: names[i - 1] || ('步骤' + i), status: status, cls: cls, message: msg });
      }
      return list;
    },
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
      // 改分类时清空旧路径，等 saveCategoryPath 设置新路径
      if (val) row.manualCategory = '';
      var vm = this;
      apiFetch('/api/product/' + row.uid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customCategory: val || '',
          manualCategory: '',
          dxmCategory: ''
        })
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
      apiFetch('/api/product/' + row.uid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualCategory: path || '',
          dxmCategory: path ? JSON.stringify({ path: path, leafName: row.customCategory || '' }) : ''
        })
      }).catch(function () {});
    },
    recommendCategory: function (row) {
      var vm = this;
      if (!row.uid) { vm.$Message.warning('商品缺少唯一标识'); return; }
      vm.$set(vm.recommending, row.uid, true);
      apiFetch('/api/product/' + row.uid + '/recommend-category', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            vm.$Message.info('AI推荐已触发，请稍候...');
          } else {
            vm.$Message.error(data.error || '推荐失败');
            vm.$set(vm.recommending, row.uid, false);
          }
        })
        .catch(function () {
          vm.$Message.error('请求失败');
          vm.$set(vm.recommending, row.uid, false);
        });
    },
    // -- 数据加载 --
    startPoll: function () {
      var vm = this;
      var token = localStorage.getItem('jwt_token') || '';
      var es = new EventSource('/api/events?token=' + encodeURIComponent(token));
      es.addEventListener('product-added', function () {
        vm.loadList(vm.page);
        vm.$root.loadStats();
        vm.$Message.info('新采集数据已同步');
      });
      es.addEventListener('product-category-updated', function (e) {
        try {
          var data = JSON.parse(e.data);
          var uid = data.uid || data.id;
          if (uid) vm.$set(vm.recommending, uid, false);
          if (data.skipped) {
            vm.$Message.info('已有手动分类，跳过AI推荐');
          } else if (data.source === 'manual_review') {
            vm.$Message.warning({ content: 'AI无法自动分类，请手动选择', duration: 5 });
          } else if (data.source === 'score_low') {
            var bestName = data.category || (data.alternatives && data.alternatives[0] && (data.alternatives[0].name || data.alternatives[0].category)) || '';
            if (bestName) {
              vm.$Message.warning({ content: 'AI推荐不确定（' + (data.confidence * 100).toFixed(0) + '%），最接近: ' + bestName, duration: 6 });
            } else {
              vm.$Message.warning('AI分类推荐无匹配结果');
            }
          } else if (data.category) {
            vm.$Message.success('AI分类推荐: ' + data.category);
          } else {
            vm.$Message.warning('AI分类推荐无匹配结果');
          }
          vm.loadList(vm.page);
        } catch (ex) {}
      });
      es.addEventListener('pipeline-progress', function (e) {
        try {
          var data = JSON.parse(e.data);
          if (data.uid) {
            vm.$set(vm.pipelineProgress, data.uid, data);
          }
          if (data.stage === 'draft' || data.stage === 'failed') {
            vm.loadList(vm.page);
          }
        } catch (ex) {}
      });
      es.addEventListener('pipeline-queue', function (e) {
        try {
          var data = JSON.parse(e.data);
          vm.pipelineQueue = data;
          if (data.total && data.total > vm.pipelineTotalCount) {
            vm.pipelineTotalCount = data.total;
          }
          if (data.state === 'idle') {
            vm.pipelineProgress = {};
            vm.automating = false;
            vm.pipelineTotalCount = 0;
          }
        } catch (ex) {}
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
      apiFetch('/api/product/categories')
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
      apiFetch('/api/product/dxm-categories')
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.dxmCategoryList = list;
        })
        .catch(function () {});
    },
    syncAndRefresh: function () {
      var vm = this;
      vm.syncing = true;
      var since = new Date(Date.now() - 24 * 3600000 + 8 * 3600000).toISOString().replace('T', ' ').substring(0, 19);
      apiFetch('/api/sync/product-pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: since }) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          vm.syncing = false;
          if (res.ok) {
            var msg = '同步完成';
            if (res.added) msg += ' 新增' + res.added;
            if (res.updated) msg += ' 更新' + res.updated;
            vm.$Message.success(msg);
          } else {
            vm.$Message.warning(res.error || '未连接云端，仅刷新本地');
          }
          vm.loadList();
        })
        .catch(function () {
          vm.syncing = false;
          vm.$Message.info('已刷新');
          vm.loadList();
        });
    },
    loadList: function (p) {
      var vm = this;
      if (p) vm.page = p;
      vm.saveFilters();
      vm.loading = true;
      vm.selectedIds = [];
      var params = new URLSearchParams({
        page: vm.page,
        pageSize: vm.pageSize
      });
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      if (vm.statusFilter && vm.statusFilter !== 'all')
        params.set('status', vm.statusFilter);
      if (vm.deletedFilter) params.set('deleted', vm.deletedFilter);
      if (vm.categoryFilter) params.set('category', vm.categoryFilter);
      if (vm.dxmCategoryFilter) params.set('dxmCategory', vm.dxmCategoryFilter);
      if (vm.scopeFilter) params.set('scope', vm.scopeFilter);
      apiFetch('/api/product?' + params.toString())
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
    switchScope: function (scope) {
      this.scopeFilter = scope;
      this.loadList(1);
    },
    claimProduct: function (row) {
      var vm = this;
      apiFetch('/api/products/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids: [row.uid] })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { vm.$Message.success('认领成功'); vm.loadList(); }
          else { vm.$Message.error(d.error || '认领失败'); }
        }).catch(function () { vm.$Message.error('认领失败'); });
    },
    batchClaim: function () {
      var vm = this;
      if (!vm.selectedIds.length) { vm.$Message.warning('请选择商品'); return; }
      apiFetch('/api/products/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids: vm.selectedIds })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { vm.$Message.success('认领 ' + d.claimed + ' 件商品'); vm.loadList(); }
        });
    },
    openAssignModal: function () {
      var vm = this;
      if (!vm.selectedIds.length) { vm.$Message.warning('请选择商品'); return; }
      vm.assignUsername = '';
      vm.assignModalVisible = true;
    },
    doAssign: function () {
      var vm = this;
      if (!vm.assignUsername.trim()) { vm.$Message.warning('请输入用户名'); return; }
      vm.assignLoading = true;
      apiFetch('/api/products/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uids: vm.selectedIds, username: vm.assignUsername.trim() })
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          vm.assignLoading = false;
          if (d.ok) { vm.assignModalVisible = false; vm.$Message.success('已分配 ' + d.assigned + ' 件商品'); vm.loadList(); }
          else { vm.$Message.error(d.error || '分配失败'); }
        }).catch(function () { vm.assignLoading = false; });
    },
    onPageSizeChange: function (s) {
      this.pageSize = s;
      this.saveFilters();
      this.loadList(1);
    },
    onSelectionChange: function (sel) {
      this.selectedIds = sel.map(function (i) {
        return i.uid;
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
          apiFetch('/api/product/' + id, { method: 'DELETE' })
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
    toggleProductStatus: function (row) {
      var vm = this;
      if (row._statusPending) return;
      row._statusPending = true;
      // 先切换视觉效果（动画）
      row.status = row.status === 1 ? 0 : 1;
      apiFetch('/api/product/batch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.uid], status: -1 })
      })
        .then(function (res) { return res.json(); })
        .then(function (res) {
          if (!res.ok) {
            // 失败回滚
            row.status = row.status === 1 ? 0 : 1;
            vm.$Message.error('切换失败');
          } else {
            vm.$Message.success(row.status === 1 ? '已发布' : '已取消发布');
          }
        })
        .catch(function () {
          row.status = row.status === 1 ? 0 : 1;
          vm.$Message.error('切换失败');
        })
        .finally(function () {
          setTimeout(function () { row._statusPending = false; }, 600);
        });
    },

    batchToggleStatus: function () {
      var vm = this;
      if (!vm.selectedIds.length) return;
      this.$Modal.confirm({
        title: '批量修改状态',
        content: '确认将 ' + vm.selectedIds.length + ' 条商品的状态反转？',
        onOk: function () {
          apiFetch('/api/product/batch-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: vm.selectedIds, status: -1 })
          })
            .then(function () {
              vm.selectedIds = [];
              vm.loadList();
              vm.$Message.success('状态已修改');
            })
            .catch(function () {
              vm.$Message.error('批量修改状态失败');
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
          apiFetch('/api/product/batch-delete', {
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
      if (vm.batchCatPath) {
        body.manualCategory = vm.batchCatPath;
        body.dxmCategory = JSON.stringify({ path: vm.batchCatPath, leafName: catValue });
      }
      Promise.all(
        vm.selectedIds.map(function (id) {
          return apiFetch('/api/product/' + id, {
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
    },
    batchAutomate: function () {
      var vm = this;
      if (!vm.selectedIds.length) return;
      vm.$Modal.confirm({
        title: '批量自动化',
        content: '将对 ' + vm.selectedIds.length + ' 个商品启动自动化处理（去水印、白底图、分类推荐等）',
        onOk: function () {
          vm.automating = true;
          apiFetch('/api/product/batch-automate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uids: vm.selectedIds })
          }).then(function (r) { return r.json(); }).then(function (data) {
            vm.automating = false;
            if (data.ok) {
              vm.$Message.success('已启动 ' + data.started + ' 个，跳过 ' + data.skipped.length + ' 个');
              vm.selectedIds = [];
              vm.loadList(1);
            }
          }).catch(function () { vm.automating = false; });
        }
      });
    }
  },
  template: `
    <div class="list-card">
      <div style="display:flex;gap:4px;margin-bottom:10px;">
        <span class="scope-tab" :class="{active: scopeFilter==='mine'}" @click="switchScope('mine')">我的商品</span>
        <span class="scope-tab" :class="{active: scopeFilter==='inbox'}" @click="switchScope('inbox')">采集箱</span>
        <span class="scope-tab" :class="{active: scopeFilter==='all'}" @click="switchScope('all')" v-if="$root.currentUser && $root.currentUser.role === 'admin'">全部</span>
      </div>
      <div class="filter-bar">
        <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">标题</span>
        <i-input v-model="keyword" placeholder="搜索标题..." clearable style="width:220px" @on-enter="loadList(1)" @on-clear="loadList(1)">
          <icon type="ios-search" slot="prefix"></icon>
        </i-input>
        <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">状态</span>
        <i-select v-model="statusFilter" clearable placeholder="全部状态" style="width:130px" @on-change="loadList(1)">
          <i-option value="all">全部状态</i-option>
          <i-option value="0">未发布</i-option>
          <i-option value="1">已发布</i-option>
        </i-select>
        <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">店小秘类目</span>
        <i-select v-model="dxmCategoryFilter" clearable filterable placeholder="店小秘类目" style="width:160px" @on-change="loadList(1)">
          <i-option value="_none">未映射</i-option>
          <i-option v-for="d in dxmCategoryList" :key="d" :value="d">{{ d }}</i-option>
        </i-select>
        <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">1688类目</span>
        <i-select v-model="categoryFilter" clearable filterable placeholder="全部类目" style="width:150px" @on-change="loadList(1)">
          <i-option v-for="c in categoryList" :key="c" :value="c">{{ c }}</i-option>
        </i-select>
        <span style="font-size:13px;color:var(--text-secondary);white-space:nowrap">删除</span>
        <i-select v-model="deletedFilter" style="width:110px" @on-change="loadList(1)">
          <i-option value="0">正常</i-option>
          <i-option value="1">已删除</i-option>
          <i-option value="all">全部</i-option>
        </i-select>
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>
      </div>
      <div class="action-bar">
        <div class="action-bar-left">共采集 <strong>{{ total }}</strong> 条数据</div>
        <div class="action-bar-right">
          <i-button v-if="scopeFilter==='inbox' && selectedIds.length" type="success" icon="md-checkmark-circle" @click="batchClaim">认领 ({{selectedIds.length}})</i-button>
          <i-button v-if="scopeFilter==='inbox' && $root.currentUser && $root.currentUser.role==='admin' && selectedIds.length" icon="md-person" @click="openAssignModal">分配给...</i-button>
          <i-button type="warning" icon="md-pricetag" :disabled="selectedIds.length === 0" @click="openBatchCategory">
            批量设置类目{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <i-button v-if="selectedIds.length" type="warning" icon="md-flash" @click="batchAutomate" :loading="automating">
            批量自动化{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <i-button type="error" icon="ios-trash" :disabled="selectedIds.length === 0" @click="batchDelete">
            批量删除{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <i-button type="info" icon="md-swap" :disabled="selectedIds.length === 0" @click="batchToggleStatus">
            批量修改状态{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <tooltip content="云同步并刷新" placement="top"><i-button icon="md-refresh" shape="circle" :loading="syncing" @click="syncAndRefresh"></i-button></tooltip>
        </div>
      </div>
      <div v-if="pipelineActive" class="pipeline-bar" :class="{ 'pipeline-bar-expanded': pipelineDrawerVisible }" @click="pipelineDrawerVisible = !pipelineDrawerVisible">
        <i class="ivu-icon ivu-icon-ios-loading pipeline-icon"></i>
        <span class="pipeline-label">自动化处理<template v-if="pipelineQueueInfo"> {{ pipelineQueueInfo }}</template></span>
        <span v-if="pipelineCurrentStep" class="pipeline-step">{{ pipelineCurrentStep }}</span>
        <span v-if="pipelineCurrentMsg && pipelineCurrentMsg !== '处理中...'" class="pipeline-msg">{{ pipelineCurrentMsg }}</span>
        <i class="ivu-icon pipeline-bar-arrow" :class="pipelineDrawerVisible ? 'ivu-icon-ios-arrow-up' : 'ivu-icon-ios-arrow-down'"></i>
      </div>
      <div v-if="pipelineActive && pipelineDrawerVisible" class="pipeline-detail">
        <div class="pipeline-detail-queue">
          <span v-if="pipelineQueueInfo">商品 {{ pipelineQueueInfo }}</span>
          <span v-if="pipelineQueue.pending !== undefined" style="margin-left:12px;color:var(--text-muted)">剩余 {{ pipelineQueue.pending }} 个</span>
        </div>
        <ul class="pipeline-steps">
          <li v-for="s in pipelineStepList" :key="s.idx" class="pipeline-step-item" :class="s.cls">
            <i v-if="s.status === 'done'" class="ivu-icon ivu-icon-md-checkmark-circle"></i>
            <i v-else-if="s.status === 'active'" class="ivu-icon ivu-icon-ios-loading pipeline-step-spinner"></i>
            <i v-else-if="s.status === 'skipped'" class="ivu-icon ivu-icon-ios-remove-circle-outline"></i>
            <span v-else class="pipeline-step-num">{{ s.idx }}</span>
            <span class="pipeline-step-name">{{ s.name }}</span>
            <span v-if="s.message" class="pipeline-step-msg">{{ s.message }}</span>
          </li>
        </ul>
      </div>
      <div class="table-wrap">
        <i-table :columns="columns" :data="list" :loading="loading" stripe @on-selection-change="onSelectionChange" style="margin-bottom:0;">
          <template slot="preview" slot-scope="{ row }">
            <div v-if="!getSkuImage(row)" class="cell-thumb-ph"></div>
            <img v-else :src="getSkuImage(row)" loading="lazy" class="cell-thumb"
              @mouseenter="$root.$refs.thumbPreview.open(getSkuImage(row), $event)"
              @mousemove="$root.$refs.thumbPreview.move($event)"
              @mouseleave="$root.$refs.thumbPreview.close()" />
          </template>
          <template slot="statusDot" slot-scope="{ row }">

            <div class="status-dot-wrap" @click="toggleProductStatus(row)">

              <div class="status-dot" :class="row.status === 1 ? 'status-dot-on' : 'status-dot-off'"></div>

              <span class="status-dot-text">{{ row.status === 1 ? '已发布' : '未发布' }}</span>

            </div>

          </template>
          <template slot="automationStage" slot-scope="{ row }">
            <span v-if="row.automation_stage === 'processing'" class="stage-badge stage-processing">
              <i class="ivu-icon ivu-icon-ios-loading" style="animation: spin 1s linear infinite"></i>
              处理中
            </span>
            <span v-else-if="row.automation_stage === 'draft'" class="stage-badge stage-draft">草稿箱</span>
            <span v-else-if="row.automation_stage === 'ready'" class="stage-badge stage-ready">待发布</span>
            <span v-else-if="row.automation_stage === 'failed'" class="stage-badge stage-failed">失败</span>
            <span v-else class="stage-text-muted">-</span>
          </template>

          <template slot="title" slot-scope="{ row }">
            <a v-if="row.source_url" :href="row.source_url" target="_blank"
              style="word-break:break-all;line-height:1.4;color:var(--text-primary);text-decoration:none;cursor:pointer;display:inline"
              @mouseenter="$event.target.style.color='#ff6a00';$event.target.style.textDecoration='underline'"
              @mouseleave="$event.target.style.color='var(--text-primary)';$event.target.style.textDecoration='none'">{{ row.title || '-' }}</a>
            <span v-else style="word-break:break-all;line-height:1.4;display:inline">{{ row.title || '-' }}</span>

          </template>
          <template slot="aliCategory" slot-scope="{ row }">
            <span style="font-size:12px;color:var(--text-secondary);word-break:break-all">{{ (row.category && (row.category.leafCategoryName || row.category.categoryPath)) || '-' }}</span>
          </template>
          <template slot="category" slot-scope="{ row }">
            <div style="display:flex;align-items:center;gap:4px">
              <category-picker :value="row.customCategory || ''" :path="(row.dxmCategory && row.dxmCategory.path) || row.manualCategory || ''"
                placeholder="搜索或选择分类"
                @input="saveCategory(row, $event)"
                @path="saveCategoryPath(row, $event)" />
              <button v-if="!row.customCategory" class="btn-recommend"
                :class="{ loading: recommending[row.uid] }"
                :disabled="recommending[row.uid]"
                @click="recommendCategory(row)"
                :title="recommending[row.uid] ? '推荐中...' : 'AI推荐分类'">
                <span v-if="recommending[row.uid]">⏳</span>
                <span v-else>🤖</span>
              </button>
            </div>
          </template>
          <template slot="sku" slot-scope="{ row }">
            <template v-if="!getSkuText(row)">
              <span style="color:var(--text-muted)">-</span>
            </template>
            <span v-else style="font-size:12px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all">{{ getSkuText(row) }}</span>
          </template>
          <template slot="actions" slot-scope="{ row }">
            <div class="action-btns">
              <Button type="primary" size="small" icon="ios-eye" @click="$root.openDetail(row.uid)">详情</Button>
              <Button type="success" size="small" icon="md-paper-plane" @click="openAdd(row.uid)">发布</Button>
              <Button type="error" size="small" icon="ios-trash" @click="deleteProduct(row.uid)">删除</Button>
            </div>
          </template>
        </i-table>
      </div>
      <div class="pagination-wrap">
        <page :total="total" :current="page" :page-size="pageSize"
          :page-size-opts="[10,20,50,100]" show-total show-elevator show-sizer
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />
      </div>
      <modal v-model="batchCatVisible" title="批量设置类目" :mask-closable="false" width="500">
        <div style="margin-bottom:12px">
          <p style="margin-bottom:8px;color:var(--text-secondary)">已选择 <strong>{{ selectedIds.length }}</strong> 条商品</p>
          <category-picker v-model="batchCatValue" placeholder="搜索或选择分类" @path="function(p) { batchCatPath = p }" />
        </div>
        <div slot="footer">
          <i-button @click="batchCatVisible = false">取消</i-button>
          <i-button type="primary" @click="saveBatchCategory">保存</i-button>
        </div>
      </modal>
      <modal v-model="assignModalVisible" title="分配商品给用户" :mask-closable="false" width="400">
        <div style="margin-bottom:12px">
          <p style="margin-bottom:8px;color:var(--text-secondary)">将 <strong>{{ selectedIds.length }}</strong> 条商品分配给：</p>
          <i-input v-model="assignUsername" placeholder="输入目标用户名"></i-input>
        </div>
        <div slot="footer">
          <i-button @click="assignModalVisible = false">取消</i-button>
          <i-button type="primary" :loading="assignLoading" @click="doAssign">确认分配</i-button>
        </div>
      </modal>
    </div>`
});
