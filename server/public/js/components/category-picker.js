// 类目选择器组件 — 搜索下拉
// value/emit: 叶子名称（如 "模具"）
// 输入框显示叶子名称，下方显示完整 path
Vue.component('category-picker', {
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '搜索分类' }
  },
  data: function () {
    return {
      keyword: this.value || '',
      searchOptions: [],
      searchLoading: false,
      dropdownVisible: false,
      currentPath: '',
      _selecting: false
    };
  },
  watch: {
    value: function (v) {
      if (!this._selecting) this.keyword = v || '';
      this.loadPath();
    }
  },
  created: function () {
    this.loadPath();
  },
  methods: {
    loadPath: function () {
      if (!this.value) { this.currentPath = ''; return; }
      var vm = this;
      fetch('/api/dxm-tree/resolve-path?name=' + encodeURIComponent(this.value))
        .then(function (r) { return r.json(); })
        .then(function (data) { vm.currentPath = data.path || ''; })
        .catch(function () { vm.currentPath = ''; });
    },
    doSearch: function () {
      var vm = this;
      var kw = (vm.keyword || '').trim();
      if (!kw) { vm.searchOptions = []; vm.dropdownVisible = false; return; }
      vm.searchLoading = true;
      fetch('/api/dxm-tree/search?keyword=' + encodeURIComponent(kw))
        .then(function (r) { return r.json(); })
        .then(function (list) {
          vm.searchOptions = list;
          vm.searchLoading = false;
          vm.dropdownVisible = true;
        })
        .catch(function () { vm.searchLoading = false; });
    },
    selectOption: function (item) {
      this._selecting = true;
      this.keyword = item.catName;
      this.currentPath = item.path;
      this.dropdownVisible = false;
      this.$emit('input', item.catName);
      var vm = this;
      setTimeout(function () { vm._selecting = false; }, 300);
    },
    onInputBlur: function () {
      var vm = this;
      setTimeout(function () {
        vm.dropdownVisible = false;
        if (!vm._selecting) vm.keyword = vm.value || '';
      }, 150);
    },
    clearValue: function () {
      this.keyword = '';
      this.currentPath = '';
      this.searchOptions = [];
      this.dropdownVisible = false;
      this.$emit('input', '');
    }
  },
  template: `
    <div style="width:100%">
      <div style="display:flex;position:relative">
        <div style="flex:1;position:relative">
          <input type="text" v-model="keyword" :placeholder="placeholder"
            style="width:100%;height:32px;padding:0 24px 0 8px;border:1px solid #dcdee2;border-right:none;border-radius:4px 0 0 4px;font-size:13px;outline:none;box-sizing:border-box"
            @keyup.enter="doSearch"
            @blur="onInputBlur" />
          <i v-if="keyword" class="ivu-icon ivu-icon-ios-close-circle"
            style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:16px;color:#808695;cursor:pointer"
            @mousedown.prevent="clearValue"></i>
        </div>
        <button @click="doSearch"
          style="height:32px;padding:0 12px;background:#2d8cf0;color:#fff;border:1px solid #2d8cf0;border-radius:0 4px 4px 0;font-size:13px;cursor:pointer;white-space:nowrap;outline:none">
          <i class="ivu-icon ivu-icon-ios-search" style="font-size:14px"></i>
        </button>
        <div v-if="dropdownVisible && searchOptions.length" style="position:absolute;top:34px;left:0;right:0;z-index:1050;background:#fff;border:1px solid #dcdee2;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);max-height:260px;overflow-y:auto">
          <div v-for="item in searchOptions" :key="item.catId"
            style="padding:6px 10px;cursor:pointer;border-bottom:1px solid #f5f5f5"
            @mouseenter="$event.target.style.background='#f0f7ff'"
            @mouseleave="$event.target.style.background=''"
            @mousedown.prevent="selectOption(item)">
            <div style="font-size:13px;color:#333">{{ item.catName }}</div>
          </div>
        </div>
        <div v-if="dropdownVisible && !searchOptions.length && keyword && !searchLoading" style="position:absolute;top:34px;left:0;right:0;z-index:1050;background:#fff;border:1px solid #dcdee2;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.15);padding:10px;text-align:center;color:#999;font-size:13px">
          无匹配结果
        </div>
      </div>
      <div v-if="currentPath" style="font-size:11px;color:#999;margin-top:2px;padding-left:2px;word-break:break-all;line-height:1.3">
        {{ currentPath }}
      </div>
    </div>`
});
