// 词库管理页面组件
Vue.component('page-word-library', {
  data: function () {
    return {
      activeTab: 'noise',
      tabs: [
        { key: 'noise', label: '过滤词库' },
        { key: 'generic', label: '泛义词库' },
        { key: 'mutex', label: '互斥组' }
      ],
      loading: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      selectedIds: [],
      modalVisible: false,
      modalEditId: null,
      modalForm: { value: '', group_name: '', description: '' },
      mutexGroups: []
    };
  },
  computed: {
    columns: function () {
      var vm = this;
      var cols = [
        { type: 'selection', width: 40, align: 'center' },
        { title: '词语', key: 'value', minWidth: 140 }
      ];
      if (vm.activeTab === 'mutex') {
        cols.push({ title: '互斥组', key: 'group_name', width: 140 });
      }
      cols.push({ title: '说明', key: 'description', minWidth: 120 });
      cols.push({
        title: '操作',
        width: 150,
        align: 'center',
        slot: 'actions'
      });
      return cols;
    }
  },
  mounted: function () {
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
    loadList: function (pg) {
      var vm = this;
      if (pg !== undefined) vm.page = pg;
      vm.loading = true;
      var params = '?type=' + vm.activeTab;
      if (vm.keyword) params += '&keyword=' + encodeURIComponent(vm.keyword);
      fetch('/api/category-config' + params)
        .then(function (r) { return r.json(); })
        .then(function (res) {
          vm.loading = false;
          if (res.ok) {
            vm.list = res.list || [];
            vm.total = vm.list.length;
            // 提取互斥组列表（去重）
            if (vm.activeTab === 'mutex') {
              var gs = {};
              vm.list.forEach(function (r) { if (r.group_name) gs[r.group_name] = true; });
              vm.mutexGroups = Object.keys(gs);
            }
          }
        })
        .catch(function () { vm.loading = false; });
    },
    openAdd: function () {
      this.modalEditId = null;
      this.modalForm = { value: '', group_name: '', description: '' };
      this.modalVisible = true;
    },
    openEdit: function (row) {
      this.modalEditId = row.id;
      this.modalForm = { value: row.value, group_name: row.group_name || '', description: row.description || '' };
      this.modalVisible = true;
    },
    saveItem: function () {
      var vm = this;
      var value = (vm.modalForm.value || '').trim();
      if (!value) { vm.$Message.warning('词语不能为空'); return; }
      if (vm.activeTab === 'mutex' && !(vm.modalForm.group_name || '').trim()) {
        vm.$Message.warning('互斥组名称不能为空');
        return;
      }
      fetch('/api/category-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: vm.activeTab,
          value: value,
          group_name: (vm.modalForm.group_name || '').trim(),
          description: (vm.modalForm.description || '').trim()
        })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          vm.$Message.success('保存成功');
          vm.modalVisible = false;
          vm.loadList();
        } else {
          vm.$Message.error(res.error || '保存失败');
        }
      })
      .catch(function () { vm.$Message.error('保存失败'); });
    },
    deleteItem: function (row) {
      var vm = this;
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
      vm.$Modal.confirm({
        title: '批量删除',
        content: '确定要删除选中的 ' + vm.selectedIds.length + ' 条记录吗？',
        onOk: function () {
          fetch('/api/category-config/batch-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: vm.selectedIds })
          })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.ok) {
              vm.$Message.success('已删除 ' + vm.selectedIds.length + ' 条');
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
    onPageChange: function (p) { this.page = p; },
    onPageSizeChange: function (s) { this.pageSize = s; this.page = 1; },
    filteredList: function () {
      var vm = this;
      var start = (vm.page - 1) * vm.pageSize;
      return vm.list.slice(start, start + vm.pageSize);
    }
  },
  template: `
    <div class="list-card">
      <div class="filter-bar" style="gap:8px">
        <tabs :value="activeTab" @on-click="switchTab" style="margin-right:8px">
          <tab-pane v-for="t in tabs" :key="t.key" :name="t.key" :label="t.label" />
        </tabs>
        <i-input v-model="keyword" placeholder="搜索词语..." clearable style="width:200px"
          @on-enter="loadList(1)" @on-clear="loadList(1)">
          <icon type="ios-search" slot="prefix"></icon>
        </i-input>
        <i-button type="primary" icon="ios-search" @click="loadList(1)">搜索</i-button>
      </div>
      <div class="action-bar">
        <div class="action-bar-left">共 <strong>{{ total }}</strong> 条</div>
        <div class="action-bar-right">
          <i-button type="primary" icon="md-add" @click="openAdd">新增</i-button>
          <i-button type="error" icon="ios-trash" :disabled="selectedIds.length === 0" @click="batchDelete">
            批量删除{{ selectedIds.length ? ' (' + selectedIds.length + ')' : '' }}
          </i-button>
          <tooltip content="刷新" placement="top"><i-button icon="md-refresh" shape="circle" @click="loadList()"></i-button></tooltip>
        </div>
      </div>
      <div class="table-wrap">
        <i-table :columns="columns" :data="filteredList()" :loading="loading" stripe
          @on-selection-change="onSelectionChange" style="margin-bottom:0;">
          <template slot="actions" slot-scope="{ row }">
            <div class="action-btns">
              <Button type="primary" size="small" icon="md-create" @click="openEdit(row)">编辑</Button>
              <Button type="error" size="small" icon="ios-trash" @click="deleteItem(row)">删除</Button>
            </div>
          </template>
        </i-table>
      </div>
      <div class="pagination-wrap">
        <page :total="total" :current="page" :page-size="pageSize"
          :page-size-opts="[20,50,100]" show-total show-elevator show-sizer
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />
      </div>
      <modal v-model="modalVisible" :title="modalEditId ? '编辑' : '新增'" :mask-closable="false" width="460">
        <i-form :label-width="80" style="margin-top:12px">
          <form-item label="词语" required>
            <i-input v-model="modalForm.value" placeholder="输入词语" />
          </form-item>
          <form-item v-if="activeTab === 'mutex'" label="互斥组" required>
            <i-select v-model="modalForm.group_name" filterable allow-create placeholder="选择或输入组名">
              <i-option v-for="g in mutexGroups" :key="g" :value="g">{{ g }}</i-option>
            </i-select>
          </form-item>
          <form-item label="说明">
            <i-input v-model="modalForm.description" type="textarea" :rows="2" placeholder="可选" />
          </form-item>
        </i-form>
        <div slot="footer">
          <i-button @click="modalVisible = false">取消</i-button>
          <i-button type="primary" @click="saveItem">保存</i-button>
        </div>
      </modal>
    </div>`
});
