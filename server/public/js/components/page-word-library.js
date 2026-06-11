// 词库管理页面组件
Vue.component('page-word-library', {
  data: function () {
    return {
      activeTab: 'noise',
      allTabs: [
        { key: 'noise', label: '过滤词库' },
        { key: 'generic', label: '泛义词库' },
        { key: 'mutex', label: '互斥组' },
        { key: 'blacklist', label: '黑名单' },
        { key: 'rels', label: '关联库' }
      ],
      visibleTabs: ['noise', 'blacklist', 'rels'],
      showTabMenu: false,
      loading: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      selectedIds: [],
      addForm: { value: '', group_name: '', description: '' },
      addSaving: false,
      editId: null,
      editForm: { value: '', group_name: '', description: '' },
      editSaving: false,
      mutexGroups: []
    };
  },
  computed: {
    tabs: function () {
      var vm = this;
      return vm.allTabs.filter(function (t) { return vm.visibleTabs.indexOf(t.key) >= 0; });
    },
    isKbTab: function () { return this.activeTab === 'blacklist' || this.activeTab === 'rels'; },
    columns: function () {
      var vm = this;
      if (vm.activeTab === 'blacklist') {
        return [
          { title: '关键词', key: 'keyword', minWidth: 120, render: function (h, p) { return h('span', { style: { fontWeight: '500' } }, p.row.keyword); } },
          { title: '类目名', key: 'category_name', minWidth: 140, render: function (h, p) { return h('span', { style: { color: 'var(--accent)' } }, p.row.category_name); } },
          { title: '次数', key: 'count', width: 70, align: 'center', render: function (h, p) { var c = p.row.count || 1; return h('span', { style: { color: c > 3 ? 'var(--danger)' : '', fontWeight: c > 3 ? '600' : '' } }, c); } },
          { title: '原因', key: 'reason', width: 80, align: 'center', render: function (h, p) { return h('span', { style: { color: 'var(--text-muted)', fontSize: '12px' } }, p.row.reason || '-'); } },
          { title: '更新时间', key: 'updated_at', width: 160, render: function (h, p) { return h('span', { style: { color: 'var(--text-muted)', fontSize: '12px' } }, p.row.updated_at || '-'); } },
          { title: '操作', width: 80, align: 'center', slot: 'actions' }
        ];
      }
      if (vm.activeTab === 'rels') {
        return [
          { title: '关键词', key: 'keyword', minWidth: 120, render: function (h, p) { return h('span', { style: { fontWeight: '500' } }, p.row.keyword); } },
          { title: '类目名', key: 'category_name', minWidth: 140, render: function (h, p) { return h('span', { style: { color: 'var(--accent)' } }, p.row.category_name); } },
          { title: '权重', key: 'weight', width: 70, align: 'center', render: function (h, p) { var w = (p.row.weight || 0).toFixed(2); return h('span', { style: { color: p.row.weight >= 2 ? 'var(--danger)' : '', fontWeight: p.row.weight >= 2 ? '600' : '' } }, w); } },
          { title: '匹配数', key: 'match_count', width: 70, align: 'center' },
          { title: '来源', key: 'source', width: 70, align: 'center', render: function (h, p) { var s = p.row.source; var color = s === 'auto' ? 'var(--accent)' : s === 'manual' ? 'var(--success)' : 'var(--text-muted)'; var text = s === 'auto' ? '自动' : s === 'manual' ? '手动' : (s || '-'); return h('span', { style: { color: color, fontSize: '12px' } }, text); } },
          { title: '更新时间', key: 'updated_at', width: 160, render: function (h, p) { return h('span', { style: { color: 'var(--text-muted)', fontSize: '12px' } }, p.row.updated_at || '-'); } },
          { title: '操作', width: 80, align: 'center', slot: 'actions' }
        ];
      }
      var cols = [
        { type: 'selection', width: 40, align: 'center' },
        { title: '词语', key: 'value', minWidth: 140, render: function (h, p) {
          if (vm.editId === p.row.id) return h('Input', { props: { value: vm.editForm.value, size: 'small' }, on: { input: function (v) { vm.editForm.value = v; }, 'on-enter': function () { vm.saveEdit(); } } });
          return h('span', p.row.value);
        } }
      ];
      if (this.activeTab === 'mutex') {
        cols.push({ title: '互斥组', key: 'group_name', width: 140, render: function (h, p) {
          if (vm.editId === p.row.id) {
            return h('Select', { props: { value: vm.editForm.group_name, size: 'small', filterable: true, 'allow-create': true, placeholder: '选择或输入' }, on: { input: function (v) { vm.editForm.group_name = v; } } },
              vm.mutexGroups.map(function (g) { return h('Option', { props: { value: g } }, g); })
            );
          }
          return h('span', p.row.group_name);
        } });
      }
      cols.push({ title: '说明', key: 'description', minWidth: 120, render: function (h, p) {
        if (vm.editId === p.row.id) return h('Input', { props: { value: vm.editForm.description, size: 'small', placeholder: '说明' }, on: { input: function (v) { vm.editForm.description = v; }, 'on-enter': function () { vm.saveEdit(); } } });
        return h('span', p.row.description || '');
      } });
      cols.push({ title: '操作', width: 150, align: 'center', slot: 'actions' });
      return cols;
    },
    pagedList: function () {
      if (this.isKbTab) return this.list;
      var start = (this.page - 1) * this.pageSize;
      return this.list.slice(start, start + this.pageSize);
    }
  },
  mounted: function () {
    try {
      var saved = localStorage.getItem('wordlib_visible_tabs');
      if (saved) this.visibleTabs = JSON.parse(saved);
      if (this.visibleTabs.indexOf(this.activeTab) < 0) {
        this.activeTab = this.visibleTabs[0] || 'noise';
      }
    } catch (e) {}
    this.loadList();
  },
  methods: {
    switchTab: function (type) {
      this.activeTab = type;
      this.page = 1;
      this.keyword = '';
      this.selectedIds = [];
      this.loadList();
    },
    toggleVisibleTab: function (key) {
      var idx = this.visibleTabs.indexOf(key);
      if (idx >= 0) {
        if (this.visibleTabs.length <= 1) return;
        this.visibleTabs.splice(idx, 1);
        if (this.activeTab === key) this.activeTab = this.visibleTabs[0];
      } else {
        this.visibleTabs.push(key);
      }
      try { localStorage.setItem('wordlib_visible_tabs', JSON.stringify(this.visibleTabs)); } catch (e) {}
      this.$forceUpdate();
    },
    toggleTabMenu: function () {
      this.showTabMenu = !this.showTabMenu;
    },
    hideTabMenu: function () {
      this.showTabMenu = false;
    },
    loadList: function (pg) {
      var vm = this;
      if (pg !== undefined) vm.page = pg;
      vm.loading = true;
      vm.selectedIds = [];
      // 黑名单/关联库走服务端分页
      if (vm.activeTab === 'blacklist' || vm.activeTab === 'rels') {
        vm.loadKb();
        return;
      }
      var params = '?type=' + vm.activeTab;
      if (vm.keyword) params += '&keyword=' + encodeURIComponent(vm.keyword);
      fetch('/api/category-config' + params)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          vm.loading = false;
          if (res.ok) {
            vm.list = res.list || [];
            vm.total = vm.list.length;
            if (vm.activeTab === 'mutex') {
              var gs = {};
              vm.list.forEach(function (r) { if (r.group_name) gs[r.group_name] = true; });
              vm.mutexGroups = Object.keys(gs);
            }
          }
        })
        .catch(function () { vm.loading = false; });
    },
    loadKb: function () {
      var vm = this;
      vm.loading = true;
      var params = new URLSearchParams();
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      params.set('page', vm.page);
      params.set('pageSize', vm.pageSize);
      var url = vm.activeTab === 'blacklist'
        ? '/api/keyword-blacklist?' + params.toString()
        : '/api/keyword-rels?' + params.toString();
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        if (data.list) {
          vm.list = data.list;
          vm.total = data.total || 0;
        } else if (Array.isArray(data)) {
          vm.list = data;
          vm.total = data.length;
        }
        vm.loading = false;
      }).catch(function () { vm.loading = false; });
    },
    addItem: function () {
      var vm = this;
      var value = (vm.addForm.value || '').trim();
      if (!value) { vm.$Message.warning('词语不能为空'); return; }
      if (vm.activeTab === 'mutex' && !(vm.addForm.group_name || '').trim()) {
        vm.$Message.warning('互斥组名称不能为空');
        return;
      }
      vm.addSaving = true;
      fetch('/api/category-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: vm.activeTab,
          value: value,
          group_name: (vm.addForm.group_name || '').trim(),
          description: (vm.addForm.description || '').trim()
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        vm.addSaving = false;
        if (res.ok) {
          vm.$Message.success('添加成功');
          vm.addForm = { value: '', group_name: '', description: '' };
          vm.loadList();
        } else {
          vm.$Message.error(res.error || '添加失败');
        }
      })
      .catch(function () { vm.addSaving = false; vm.$Message.error('添加失败'); });
    },
    onAddEnter: function (e) {
      if (e.key === 'Enter' || e.type === 'keydown') {
        e.preventDefault();
        this.addItem();
      }
    },
    openEdit: function (row) {
      this.editId = row.id;
      this.editForm = { value: row.value, group_name: row.group_name || '', description: row.description || '' };
    },
    cancelEdit: function () {
      this.editId = null;
      this.editForm = { value: '', group_name: '', description: '' };
    },
    saveEdit: function () {
      var vm = this;
      var value = (vm.editForm.value || '').trim();
      if (!value) { vm.$Message.warning('词语不能为空'); return; }
      if (vm.activeTab === 'mutex' && !(vm.editForm.group_name || '').trim()) {
        vm.$Message.warning('互斥组名称不能为空');
        return;
      }
      vm.editSaving = true;
      fetch('/api/category-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: vm.activeTab,
          id: vm.editId,
          value: value,
          group_name: (vm.editForm.group_name || '').trim(),
          description: (vm.editForm.description || '').trim()
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        vm.editSaving = false;
        if (res.ok) {
          vm.$Message.success('保存成功');
          vm.editId = null;
          vm.loadList();
        } else {
          vm.$Message.error(res.error || '保存失败');
        }
      })
      .catch(function () { vm.editSaving = false; vm.$Message.error('保存失败'); });
    },
    deleteItem: function (row) {
      var vm = this;
      if (vm.activeTab === 'blacklist') {
        vm.$Modal.confirm({
          title: '删除黑名单',
          content: '确认删除「' + row.keyword + ' → ' + row.category_name + '」？',
          onOk: function () {
            fetch('/api/keyword-blacklist/' + row.id, { method: 'DELETE' })
              .then(function (r) { return r.json(); })
              .then(function () { vm.$Message.success('已删除'); vm.loadList(); })
              .catch(function () { vm.$Message.error('删除失败'); });
          }
        });
        return;
      }
      if (vm.activeTab === 'rels') {
        vm.$Modal.confirm({
          title: '作废关联',
          content: '确认作废「' + row.keyword + ' → ' + row.category_name + '」？作废后不再参与推荐。',
          onOk: function () {
            fetch('/api/keyword-rels/' + row.id, { method: 'DELETE' })
              .then(function (r) { return r.json(); })
              .then(function () { vm.$Message.success('已作废'); vm.loadList(); })
              .catch(function () { vm.$Message.error('操作失败'); });
          }
        });
        return;
      }
      vm.$Modal.confirm({
        title: '确认删除',
        content: '确定要删除「' + row.value + '」吗？',
        onOk: function () {
          fetch('/api/category-config/' + row.id, { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (res) {
              if (res.ok) {
                vm.$Message.success('已删除');
                vm.loadList();
              } else {
                vm.$Message.error(res.error || '删除失败');
              }
            })
            .catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    batchDelete: function () {
      var vm = this;
      if (!vm.selectedIds.length) { vm.$Message.warning('请先选择'); return; }
      var count = vm.selectedIds.length;
      vm.$Modal.confirm({
        title: '批量删除',
        content: '确定要删除选中的 ' + count + ' 条记录吗？',
        onOk: function () {
          fetch('/api/category-config/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: vm.selectedIds.slice() })
          })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.ok) {
              vm.$Message.success('已删除 ' + count + ' 条');
              vm.selectedIds = [];
              vm.loadList();
            } else {
              vm.$Message.error(res.error || '删除失败');
            }
          })
          .catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    onSelectionChange: function (sel) {
      this.selectedIds = sel.map(function (r) { return r.id; });
    },
    onPageChange: function (p) {
      this.page = p;
      this.selectedIds = [];
      if (this.isKbTab) this.loadKb();
    },
    onPageSizeChange: function (s) {
      this.pageSize = s;
      this.page = 1;
      this.selectedIds = [];
      if (this.isKbTab) this.loadKb();
    }
  },
  template: `
    <div class="list-card">
      <div class="filter-bar" style="gap:8px">
        <tabs :value="activeTab" @on-click="switchTab" style="margin-right:8px">
          <tab-pane v-for="t in tabs" :key="t.key" :name="t.key" :label="t.label" />
        </tabs>
        <div style="flex:1"></div>
        <div style="position:relative">
          <tooltip content="显示选项卡" placement="top-end">
            <i-button icon="ios-settings-outline" shape="circle" size="small" @click="toggleTabMenu"></i-button>
          </tooltip>
          <div v-if="showTabMenu" style="position:absolute;right:0;top:36px;z-index:999;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:8px 0;min-width:140px" @mouseleave="hideTabMenu">
            <div v-for="t in allTabs" :key="t.key" @click="toggleVisibleTab(t.key)" style="padding:6px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;white-space:nowrap" @mouseenter="$event.currentTarget.style.background='var(--bg-elevated)'" @mouseleave="$event.currentTarget.style.background=''">
              <icon :type="visibleTabs.indexOf(t.key) >= 0 ? 'md-checkbox' : 'md-square-outline'" :style="{color: visibleTabs.indexOf(t.key) >= 0 ? 'var(--accent)' : 'var(--text-muted)'}"></icon>
              <span>{{ t.label }}</span>
            </div>
          </div>
        </div>
        <i-input v-model="keyword" :placeholder="isKbTab ? '搜索关键词或类目...' : '搜索词语...'" clearable style="width:200px"
          @on-enter="loadList(1)" @on-clear="loadList(1)">
          <icon type="ios-search" slot="prefix"></icon>
        </i-input>
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>
      </div>
      <div class="action-bar">
        <div class="action-bar-left">共 <strong>{{ total }}</strong> 条</div>
        <div class="action-bar-right">
          <i-button v-if="!isKbTab" type="error" icon="ios-trash" :disabled="selectedIds.length === 0" @click="batchDelete">
            批量删除{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <tooltip content="刷新" placement="top"><i-button icon="md-refresh" shape="circle" @click="loadList()"></i-button></tooltip>
        </div>
      </div>
      <div v-if="!isKbTab" class="inline-add-bar">
        <div class="inline-add-fields">
          <i-input v-model="addForm.value" placeholder="输入词语" style="width:180px" @on-enter="addItem" />
          <i-select v-if="activeTab === 'mutex'" v-model="addForm.group_name" filterable allow-create placeholder="互斥组" style="width:140px">
            <i-option v-for="g in mutexGroups" :key="g" :value="g">{{ g }}</i-option>
          </i-select>
          <i-input v-model="addForm.description" placeholder="说明(可选)" style="width:160px" @on-enter="addItem" />
          <i-button type="primary" icon="md-add" :loading="addSaving" @click="addItem">添加</i-button>
        </div>
      </div>
      <div class="table-wrap">
        <i-table :columns="columns" :data="pagedList" :loading="loading" stripe
          row-key="id"
          @on-selection-change="onSelectionChange" style="margin-bottom:0;">
          <template slot="actions" slot-scope="{ row }">
            <div class="action-btns">
              <template v-if="!isKbTab && editId === row.id">
                <i-button type="success" size="small" icon="md-checkmark" :loading="editSaving" @click="saveEdit">保存</i-button>
                <i-button size="small" @click="cancelEdit">取消</i-button>
              </template>
              <template v-else>
                <Button v-if="!isKbTab" type="primary" size="small" icon="md-create" @click="openEdit(row)">编辑</Button>
                <Button :type="activeTab === 'rels' ? 'warning' : 'error'" size="small"
                  :icon="activeTab === 'rels' ? 'md-close' : 'ios-trash'"
                  @click="deleteItem(row)">{{ activeTab === 'rels' ? '作废' : '删除' }}</Button>
              </template>
            </div>
          </template>
        </i-table>
      </div>
      <div class="pagination-wrap">
        <page :total="total" :current="page" :page-size="pageSize"
          :page-size-opts="[20,50,100]" show-total show-elevator show-sizer
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />
      </div>
    </div>`
});
