// 类目映射管理页面
Vue.component('page-categories', {
  data: function () {
    return {
      loading: false,
      library: [],
      keyword: '',
      statusFilter: 'unmapped',
      allCategories: [],
      searchResults: null,
      searchLoading: false,
      expandedId: -1,
      matchResults: {},
      manualInput: {}
    };
  },
  computed: {
    unmappedCount: function () {
      return this.allCategories.filter(function (c) { return !c.dxmCategory; }).length;
    },
    displayList: function () {
      var filter = this.statusFilter;
      var list = this.searchResults !== null ? this.searchResults : this.allCategories;
      if (filter === 'unmapped') {
        list = list.filter(function (c) { return !c.dxmCategory; });
      } else if (filter === 'mapped') {
        list = list.filter(function (c) { return c.dxmCategory; });
      }
      return list;
    }
  },
  mounted: function () {
    this.loadLibrary();
    this.loadAll();
  },
  methods: {
    loadLibrary: function () {
      var vm = this;
      fetch('/api/dxm-category/library').then(function (r) { return r.json(); }).then(function (list) {
        vm.library = list;
      });
    },
    loadAll: function () {
      var vm = this;
      vm.loading = true;
      fetch('/api/dxm-category/search')
        .then(function (r) { return r.json(); })
        .then(function (results) {
          vm.allCategories = results;
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    doSearch: function () {
      var vm = this;
      var kw = vm.keyword.trim();
      if (!kw) {
        vm.searchResults = null;
        return;
      }
      vm.searchLoading = true;
      vm.expandedId = -1;
      fetch('/api/dxm-category/search?keyword=' + encodeURIComponent(kw))
        .then(function (r) { return r.json(); })
        .then(function (results) {
          vm.searchResults = results;
          vm.searchLoading = false;
        })
        .catch(function () { vm.searchLoading = false; });
    },
    clearSearch: function () {
      this.keyword = '';
      this.searchResults = null;
    },
    toggleExpand: function (name) {
      var vm = this;
      if (vm.expandedId === name) { vm.expandedId = -1; return; }
      vm.expandedId = name;
      if (!vm.matchResults[name]) {
        fetch('/api/dxm-category/match?name=' + encodeURIComponent(name))
          .then(function (r) { return r.json(); })
          .then(function (results) {
            vm.$set(vm.matchResults, name, results);
          });
      }
    },
    doRemap: function (categoryName, dxmItem) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认映射',
        content: '将"' + categoryName + '"映射到"' + dxmItem.leaf_name + '"？该类目下所有商品都会被更新。',
        onOk: function () {
          fetch('/api/dxm-category/remap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryName: categoryName,
              dxmCategory: { path: dxmItem.path, leafName: dxmItem.leaf_name }
            })
          }).then(function () {
            vm.$Message.success('映射成功');
            vm.loadAll();
            if (vm.searchResults !== null) vm.doSearch();
          });
        }
      });
    },
    doManualMap: function (categoryName) {
      var vm = this;
      var input = (vm.manualInput[categoryName] || '').trim();
      if (!input) { vm.$Message.warning('请输入店小秘类目路径'); return; }
      var cleanPath = input.replace(/\s+/g, '');
      var parts = cleanPath.split('/');
      var leafName = parts[parts.length - 1] || cleanPath;
      vm.$Modal.confirm({
        title: '确认映射',
        content: '将"' + categoryName + '"映射到"' + cleanPath + '"？该类目下所有商品都会被更新。',
        onOk: function () {
          fetch('/api/dxm-category/remap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryName: categoryName,
              dxmCategory: { path: cleanPath, leafName: leafName }
            })
          }).then(function () {
            vm.$Message.success('映射成功');
            vm.loadAll();
            if (vm.searchResults !== null) vm.doSearch();
          });
        }
      });
    },
    scoreColor: function (score) {
      if (score >= 80) return '#52c41a';
      if (score >= 60) return '#faad14';
      return '#999';
    }
  },
  template: `
    <div class="list-card">
      <div class="action-bar">
        <div class="action-bar-left">
          <i-select v-model="statusFilter" style="width:120px" @on-change="page = 1">
            <i-option value="all">全部</i-option>
            <i-option value="unmapped">未映射</i-option>
            <i-option value="mapped">已映射</i-option>
          </i-select>
          <i-input v-model="keyword" placeholder="搜索类目名称" style="width:260px" @on-enter="doSearch" @on-clear="clearSearch" clearable>
            <icon type="ios-search" slot="prefix"></icon>
          </i-input>
          <i-button type="primary" icon="ios-search" @click="doSearch">搜索</i-button>
        </div>
        <div class="action-bar-right">
          <i-button icon="md-refresh" @click="loadAll">刷新</i-button>
        </div>
      </div>
      <div style="padding:8px 20px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#888;display:flex;gap:20px">
        <span>共 <strong style="color:#333">{{ allCategories.length }}</strong> 个类目</span>
        <span>待映射 <strong style="color:#ff4d4f">{{ unmappedCount }}</strong> 个</span>
        <span>类目库 <strong style="color:#333">{{ library.length }}</strong> 个</span>
      </div>
      <div v-if="loading || searchLoading" style="text-align:center;padding:40px;color:#999">加载中...</div>
      <div v-else-if="!displayList.length && searchResults !== null" style="text-align:center;padding:40px;color:#999">无匹配结果</div>
      <div v-else-if="!displayList.length" style="text-align:center;padding:40px;color:#999">暂无类目数据</div>
      <div v-else>
        <div v-for="item in displayList" :key="item.name" class="cat-map-item">
          <div class="cat-map-header" @click="toggleExpand(item.name)">
            <span class="cat-map-name">{{ item.name }}</span>
            <tag v-if="item.dxmCategory" color="green">{{ item.dxmCategory.leafName }}</tag>
            <tag v-else color="red">未映射</tag>
            <tag color="blue">{{ item.totalProducts }}条商品</tag>
            <icon :type="expandedId === item.name ? 'ios-arrow-up' : 'ios-arrow-down'" style="margin-left:8px;color:#999" />
          </div>
          <div v-if="expandedId === item.name" class="cat-map-body">
            <div style="margin-bottom:8px;padding:6px 10px;background:#f6f8fa;border-radius:6px;font-size:13px">
              <span style="color:#999">当前映射：</span>
              <span v-if="item.dxmCategory" style="color:#ff6a00">{{ item.dxmCategory.path }}</span>
              <span v-else style="color:#999">无</span>
            </div>
            <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">
              <i-input v-model="manualInput[item.name]" placeholder="手动输入店小秘类目路径" style="flex:1" @keyup.enter.native="doManualMap(item.name)" />
              <i-button type="warning" @click="doManualMap(item.name)">手动映射</i-button>
            </div>
            <div style="font-size:12px;color:#999;margin-bottom:8px;padding-left:2px">请复制店小秘完整类目路径</div>
            <div v-if="matchResults[item.name]">
              <div v-if="!matchResults[item.name].length" style="color:#999;padding:8px 0">类目库中暂无自动匹配项</div>
              <div v-for="m in matchResults[item.name]" :key="m.path" class="cat-map-match">
                <span class="cat-map-score" :style="{ color: scoreColor(m.score) }">{{ m.score }}%</span>
                <span class="cat-map-path">{{ m.path }}</span>
                <span class="cat-map-count">选过{{ m.count }}次</span>
                <i-button type="primary" size="small" @click="doRemap(item.name, m)">选择映射</i-button>
              </div>
            </div>
            <div v-else style="color:#999;padding:8px 0">匹配中...</div>
          </div>
        </div>
      </div>
    </div>`
});
