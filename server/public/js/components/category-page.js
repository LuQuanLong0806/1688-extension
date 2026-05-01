// 类目映射管理页面
Vue.component('page-categories', {
  data: function () {
    return {
      loading: false,
      list: [],
      total: 0,
      page: 1,
      pageSize: 20,
      keyword: '',
      treeStatus: { total: 0, lastSync: null, levels: 0 },
      // 映射弹窗
      mapVisible: false,
      mapCategoryName: '',
      mapList: [],
      mapLoading: false
    };
  },
  mounted: function () {
    this.loadCategories();
    this.loadTreeStatus();
  },
  methods: {
    loadCategories: function () {
      var vm = this;
      vm.loading = true;
      var params = new URLSearchParams({ page: vm.page, pageSize: vm.pageSize });
      if (vm.keyword.trim()) params.set('keyword', vm.keyword.trim());
      fetch('/api/categories?' + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (d) {
          vm.list = d.list;
          vm.total = d.total;
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    onPageChange: function (p) { this.page = p; this.loadCategories(); },
    onPageSizeChange: function (s) { this.pageSize = s; this.loadCategories(1); },
    doSearch: function () { this.page = 1; this.loadCategories(); },
    clearSearch: function () { this.keyword = ''; this.page = 1; this.loadCategories(); },
    loadTreeStatus: function () {
      var vm = this;
      fetch('/api/dxm-tree/status').then(function (r) { return r.json(); }).then(function (s) {
        vm.treeStatus = s;
      });
    },
    // 打开映射弹窗
    openMapDialog: function (catName) {
      this.mapCategoryName = catName;
      this.mapVisible = true;
      this.loadMapList(catName);
    },
    loadMapList: function (catName) {
      var vm = this;
      vm.mapLoading = true;
      fetch('/api/category-mappings/by-name?name=' + encodeURIComponent(catName))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.mapList = data;
          vm.mapLoading = false;
        })
        .catch(function () { vm.mapLoading = false; });
    },
    deleteMapItem: function (item) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除映射：' + item.customCategory + '？',
        onOk: function () {
          fetch('/api/category-mappings/' + item.id, { method: 'DELETE' }).then(function () {
            vm.$Message.success('已删除');
            vm.loadMapList(vm.mapCategoryName);
          });
        }
      });
    }
  },
  template: `
    <div class="list-card">
      <div style="padding:12px 20px;background:#f6f8fa;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <span style="font-weight:500;color:#333">分类树同步</span>
        <span style="font-size:13px;color:#888">共 <strong style="color:#333">{{ treeStatus.total }}</strong> 个分类</span>
        <span v-if="treeStatus.lastSync" style="font-size:13px;color:#888">最后同步: {{ treeStatus.lastSync }}</span>
        <span v-if="treeStatus.levels" style="font-size:13px;color:#888">层级: {{ treeStatus.levels }}</span>
        <i-button v-if="treeStatus.total === 0" type="info" size="small" @click="$Message.info('请在店小秘页面右键小蜜蜂 → 同步类目树')">前往同步</i-button>
      </div>
      <div class="action-bar">
        <div class="action-bar-left">
          <span style="font-weight:500;color:#333">1688类目</span>
          <i-input v-model="keyword" placeholder="搜索类目名称" style="width:220px" @on-enter="doSearch" @on-clear="clearSearch" clearable>
            <icon type="ios-search" slot="prefix"></icon>
          </i-input>
          <i-button type="primary" icon="ios-search" @click="doSearch">搜索</i-button>
        </div>
        <div class="action-bar-right">
          <span style="font-size:13px;color:#888">共 <strong style="color:#333">{{ total }}</strong> 个类目</span>
          <i-button icon="md-refresh" @click="loadCategories">刷新</i-button>
        </div>
      </div>
      <i-table :columns="columns" :data="list" :loading="loading" stripe style="margin-bottom:0;">
        <template slot="name" slot-scope="{ row }">
          <span style="color:#333">{{ row.name }}</span>
        </template>
        <template slot="count" slot-scope="{ row }">
          <span style="color:#888">{{ row.count }}</span>
        </template>
        <template slot="actions" slot-scope="{ row }">
          <i-button type="primary" size="small" icon="md-settings" @click="openMapDialog(row.name)">维护映射</i-button>
        </template>
      </i-table>
      <div class="pagination-wrap">
        <page :total="total" :current="page" :page-size="pageSize"
          :page-size-opts="[10,20,50,100]" show-total show-elevator show-sizer
          @on-change="onPageChange" @on-page-size-change="onPageSizeChange" />
      </div>
      <!-- 映射弹窗 -->
      <modal v-model="mapVisible" :title="'映射管理 - ' + mapCategoryName" :mask-closable="false" width="520" footer-hide>
        <div v-if="mapLoading" style="text-align:center;padding:20px;color:#999">加载中...</div>
        <div v-else-if="!mapList.length" style="text-align:center;padding:20px;color:#999">暂无映射数据</div>
        <table v-else style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f6f8fa">
              <th style="padding:8px 12px;text-align:left;border-bottom:1px solid #e8e8e8">店小秘类目</th>
              <th style="padding:8px 12px;text-align:center;border-bottom:1px solid #e8e8e8;width:60px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in mapList" :key="item.id" style="border-bottom:1px solid #f5f5f5">
              <td style="padding:8px 12px;color:#1890ff">{{ item.customCategory }}</td>
              <td style="padding:8px 12px;text-align:center">
                <i-button type="error" size="small" icon="ios-trash" @click="deleteMapItem(item)"></i-button>
              </td>
            </tr>
          </tbody>
        </table>
      </modal>
    </div>`,
  computed: {
    columns: function () {
      return [
        { title: '1688类目', key: 'name', minWidth: 200, slot: 'name' },
        { title: '类目ID', key: 'catId', width: 160, slot: 'catId' },
        { title: '商品数', key: 'count', width: 100, align: 'center', slot: 'count' },
        { title: '操作', width: 120, align: 'center', slot: 'actions' }
      ];
    }
  }
});
