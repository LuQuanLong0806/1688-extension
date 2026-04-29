// 类目映射管理页面
Vue.component('page-categories', {
  data: function () {
    return {
      loading: false,
      unmapped: [],
      library: [],
      matchResults: {},
      expandedId: -1,
      manualInput: '',
      manualExpanded: {}
    };
  },
  mounted: function () {
    this.loadData();
  },
  methods: {
    loadData: function () {
      var vm = this;
      vm.loading = true;
      Promise.all([
        fetch('/api/dxm-category/unmapped').then(function (r) { return r.json(); }),
        fetch('/api/dxm-category/library').then(function (r) { return r.json(); })
      ]).then(function (results) {
        vm.unmapped = results[0];
        vm.library = results[1];
        vm.loading = false;
      }).catch(function () {
        vm.loading = false;
      });
    },
    doMatch: function (name) {
      var vm = this;
      if (vm.matchResults[name]) {
        vm.expandedId = vm.expandedId === name ? -1 : name;
        return;
      }
      fetch('/api/dxm-category/match?name=' + encodeURIComponent(name))
        .then(function (r) { return r.json(); })
        .then(function (results) {
          vm.$set(vm.matchResults, name, results);
          vm.expandedId = name;
        });
    },
    confirmMapping: function (categoryName, dxmItem) {
      var vm = this;
      this.$Modal.confirm({
        title: '确认映射',
        content: '将"' + categoryName + '"映射到"' + dxmItem.leaf_name + '"？同类目所有未设置店小秘类目的商品都会被更新。',
        onOk: function () {
          fetch('/api/dxm-category/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryName: categoryName,
              dxmCategory: { path: dxmItem.path, leafName: dxmItem.leaf_name }
            })
          }).then(function () {
            vm.$Message.success('映射成功');
            vm.loadData();
          });
        }
      });
    },
    doManualMap: function (categoryName) {
      var vm = this;
      var input = (vm.manualInput[categoryName] || '').trim();
      if (!input) {
        vm.$Message.warning('请输入店小秘类目路径');
        return;
      }
      // 自动去空格
      var cleanPath = input.replace(/\s+/g, '');
      var parts = cleanPath.split('/');
      var leafName = parts[parts.length - 1] || cleanPath;

      vm.$Modal.confirm({
        title: '确认手动映射',
        content: '将"' + categoryName + '"映射到"' + cleanPath + '"？',
        onOk: function () {
          fetch('/api/dxm-category/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              categoryName: categoryName,
              dxmCategory: { path: cleanPath, leafName: leafName }
            })
          }).then(function () {
            vm.$Message.success('映射成功');
            vm.loadData();
          });
        }
      });
    },
    toggleManual: function (name) {
      var vm = this;
      vm.$set(vm.manualExpanded, name, !vm.manualExpanded[name]);
      if (!vm.manualInput[name]) {
        vm.$set(vm.manualInput, name, '');
      }
    },
    scoreColor: function (score) {
      if (score >= 80) return '#52c41a';
      if (score >= 60) return '#faad14';
      return '#999';
    }
  },
  template: '\
    <div class="list-card">\
      <div class="action-bar">\
        <div class="action-bar-left">\
          待映射 <strong>{{ unmapped.length }}</strong> 个类目\
          <span style="margin-left:16px;color:#999">类目库 <strong>{{ library.length }}</strong> 个店小秘类目</span>\
        </div>\
        <div class="action-bar-right">\
          <i-button icon="md-refresh" @click="loadData">刷新</i-button>\
        </div>\
      </div>\
      <div v-if="loading" style="text-align:center;padding:40px;color:#999">加载中...</div>\
      <div v-else-if="!unmapped.length" style="text-align:center;padding:40px;color:#999">所有类目都已映射</div>\
      <div v-else>\
        <div v-for="(item, idx) in unmapped" :key="item.name" class="cat-map-item">\
          <div class="cat-map-header" @click="doMatch(item.name)">\
            <span class="cat-map-name">{{ item.name }}</span>\
            <tag color="blue">{{ item.unmappedProducts }}/{{ item.totalProducts }}条待映射</tag>\
            <icon :type="expandedId === item.name ? \'ios-arrow-up\' : \'ios-arrow-down\'" style="margin-left:8px;color:#999" />\
          </div>\
          <div v-if="expandedId === item.name" class="cat-map-body">\
            <div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">\
              <i-input v-model="manualInput[item.name]" placeholder="手动输入店小秘类目路径，如：家居生活/厨房用品/冰块模具" style="flex:1" size="small" @keyup.enter.native="doManualMap(item.name)" />\
              <i-button type="warning" size="small" @click="doManualMap(item.name)">手动映射</i-button>\
            </div>\
            <div style="font-size:12px;color:#999;margin-bottom:8px;padding-left:2px">请输入店小秘完整类目路径</div>\
            <div v-if="matchResults[item.name]">\
              <div v-if="!matchResults[item.name].length" style="color:#999;padding:8px 0">类目库中暂无自动匹配项，可手动输入</div>\
              <div v-for="m in matchResults[item.name]" :key="m.path" class="cat-map-match">\
                <span class="cat-map-score" :style="{ color: scoreColor(m.score) }">{{ m.score }}%</span>\
                <span class="cat-map-path">{{ m.path }}</span>\
                <span class="cat-map-count">选过{{ m.count }}次</span>\
                <i-button type="primary" size="small" @click="confirmMapping(item.name, m)">确认映射</i-button>\
              </div>\
            </div>\
            <div v-else style="color:#999;padding:8px 0">匹配中...</div>\
          </div>\
        </div>\
      </div>\
    </div>'
});
