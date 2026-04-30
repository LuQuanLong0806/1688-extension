// 类目映射管理页面
Vue.component('page-categories', {
  data: function () {
    return {
      loading: false,
      mappings: [],
      keyword: '',
      treeStatus: { total: 0, lastSync: null, levels: 0 }
    };
  },
  computed: {
    aliCategoryCount: function () {
      var set = {};
      this.mappings.forEach(function (m) { set[m.categoryName] = true; });
      return Object.keys(set).length;
    }
  },
  mounted: function () {
    this.loadMappings();
    this.loadTreeStatus();
  },
  methods: {
    loadMappings: function () {
      var vm = this;
      vm.loading = true;
      var url = '/api/category-mappings';
      if (vm.keyword.trim()) url += '?keyword=' + encodeURIComponent(vm.keyword.trim());
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.mappings = data;
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    doSearch: function () { this.loadMappings(); },
    clearSearch: function () { this.keyword = ''; this.loadMappings(); },
    deleteMapping: function (id) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认删除',
        content: '确认删除该映射关系？',
        onOk: function () {
          fetch('/api/category-mappings/' + id, { method: 'DELETE' }).then(function () {
            vm.$Message.success('已删除');
            vm.loadMappings();
          });
        }
      });
    },
    loadTreeStatus: function () {
      var vm = this;
      fetch('/api/dxm-tree/status').then(function (r) { return r.json(); }).then(function (s) {
        vm.treeStatus = s;
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
          <span style="font-weight:500;color:#333">类目映射</span>
          <i-input v-model="keyword" placeholder="搜索1688类目或店小秘类目" style="width:260px" @on-enter="doSearch" @on-clear="clearSearch" clearable>
            <icon type="ios-search" slot="prefix"></icon>
          </i-input>
          <i-button type="primary" icon="ios-search" @click="doSearch">搜索</i-button>
        </div>
        <div class="action-bar-right">
          <i-button icon="md-refresh" @click="loadMappings">刷新</i-button>
        </div>
      </div>
      <div style="padding:8px 20px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888;display:flex;gap:20px">
        <span>共 <strong style="color:#333">{{ aliCategoryCount }}</strong> 个1688类目</span>
        <span>共 <strong style="color:#333">{{ mappings.length }}</strong> 条映射</span>
      </div>
      <div v-if="loading" style="text-align:center;padding:40px;color:#999">加载中...</div>
      <div v-else-if="!mappings.length" style="text-align:center;padding:40px;color:#999">暂无映射数据</div>
      <table v-else style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f6f8fa">
            <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #e8e8e8;width:50%">1688类目</th>
            <th style="padding:10px 12px;text-align:left;border-bottom:1px solid #e8e8e8;width:40%">店小秘类目</th>
            <th style="padding:10px 12px;text-align:center;border-bottom:1px solid #e8e8e8;width:60px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in mappings" :key="item.id" style="border-bottom:1px solid #f5f5f5">
            <td style="padding:8px 12px;color:#333">{{ item.categoryName }}</td>
            <td style="padding:8px 12px;color:#1890ff">{{ item.customCategory }}</td>
            <td style="padding:8px 12px;text-align:center">
              <i-button type="error" size="small" icon="ios-trash" @click="deleteMapping(item.id)"></i-button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>`
});
