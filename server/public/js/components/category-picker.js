// 类目选择器组件 — 输入即搜索
// value/emit: 叶子名称（如 "模具"）
// 输入框显示叶子名称，下方显示完整 path
Vue.component('category-picker', {
  props: {
    value: { type: String, default: '' },
    path: { type: String, default: '' },
    placeholder: { type: String, default: '搜索分类' }
  },
  data: function () {
    return {
      keyword: this.value || '',
      searchOptions: [],
      searchLoading: false,
      dropdownVisible: false,
      currentPath: this.path || '',
      _selecting: false,
      _searchTimer: null,
      dropStyle: { top: '0px', left: '0px', minWidth: '360px' }
    };
  },
  watch: {
    value: function (v) {
      if (!this._selecting) this.keyword = v || '';
    },
    path: function (p) {
      this.currentPath = p || '';
    }
  },
  mounted: function () {
    // 下拉用 fixed 定位后，外部滚动会让下拉与输入框错位 → 跟随重定位
    var vm = this;
    this._onScrollOrResize = function () {
      if (vm.dropdownVisible) vm.updateDropPos();
    };
    window.addEventListener('scroll', this._onScrollOrResize, true);
    window.addEventListener('resize', this._onScrollOrResize);
  },
  beforeDestroy: function () {
    if (this._onScrollOrResize) {
      window.removeEventListener('scroll', this._onScrollOrResize, true);
      window.removeEventListener('resize', this._onScrollOrResize);
    }
    clearTimeout(this._searchTimer);
  },
  methods: {
    onInputChange: function () {
      var vm = this;
      // 选中分类后赋值会触发 on-change，此时跳过搜索
      if (vm._selecting) return;

      var kw = (vm.keyword || '').trim();

      // 值为空时只清空下拉，不触发保存
      if (!kw) {
        vm.searchOptions = [];
        vm.dropdownVisible = false;
        return;
      }

      // 防抖搜索 300ms
      clearTimeout(vm._searchTimer);
      vm._searchTimer = setTimeout(function () {
        vm.doSearch(kw);
      }, 300);
    },
    updateDropPos: function () {
      var input = this.$el && this.$el.querySelector('input');
      if (!input) return;
      var rect = input.getBoundingClientRect();
      var w = Math.max(360, rect.width);
      var dropH = 260;
      var spaceBelow = window.innerHeight - rect.bottom;
      var spaceAbove = rect.top;
      var openUp = spaceBelow < dropH && spaceAbove >= dropH;
      // 用 fixed 定位 → 脱离 .ivu-table-body 等祖先 overflow:hidden 的裁剪
      // （单行表格场景 absolute 下拉会被表格遮挡）
      this.dropStyle = {
        position: 'fixed',
        top: openUp ? 'auto' : (rect.bottom + 4) + 'px',
        bottom: openUp ? (window.innerHeight - rect.top + 4) + 'px' : 'auto',
        left: rect.left + 'px',
        minWidth: w + 'px',
        maxHeight: dropH + 'px',
        zIndex: 9999
      };
    },
    doSearch: function (kw) {
      var vm = this;
      vm.searchLoading = true;
      apiFetch('/api/dxm-tree/search?keyword=' + encodeURIComponent(kw))
        .then(function (r) {
          return r.json();
        })
        .then(function (list) {
          vm.searchOptions = list;
          vm.searchLoading = false;
          vm.dropdownVisible = true;
          vm.$nextTick(function () { vm.updateDropPos(); });
        })
        .catch(function () {
          vm.searchLoading = false;
        });
    },
    selectOption: function (item) {
      this._selecting = true;
      this.keyword = item.catName;
      this.currentPath = item.path;
      this.dropdownVisible = false;
      this.searchOptions = [];
      this.$emit('input', item.catName);
      this.$emit('path', item.path || '');
      var vm = this;
      setTimeout(function () {
        vm._selecting = false;
      }, 300);
    },
    onInputBlur: function () {
      var vm = this;
      setTimeout(function () {
        vm.dropdownVisible = false;
        if (!vm._selecting) {
          vm.keyword = vm.value || '';
        }
      }, 150);
    },
    clearValue: function () {
      this.keyword = '';
      this.currentPath = '';
      this.searchOptions = [];
      this.dropdownVisible = false;
      this.$emit('input', '');
      this.$emit('path', '');
    }
  },
  template: `
    <div style="width:100%;position:relative">
      <div style="display:flex;position:relative">
        <div style="flex:1;position:relative">
          <input type="text" v-model="keyword" :placeholder="placeholder"
            style="width:100%;height:32px;padding:0 24px 0 8px;border:1px solid var(--border);border-radius:var(--radius);font-size:13px;outline:none;box-sizing:border-box"
            @input="onInputChange"
            @focus="updateDropPos"
            @blur="onInputBlur" />
          <i v-if="keyword" class="ivu-icon ivu-icon-ios-close-circle"
            style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:16px;color:var(--text-secondary);cursor:pointer"
            @mousedown.prevent="clearValue"></i>
        </div>
      </div>
      <div v-if="dropdownVisible && searchOptions.length" :style="Object.assign({background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',boxShadow:'var(--shadow)',overflowY:'auto'}, dropStyle)">
        <div v-for="item in searchOptions" :key="item.catId"
          style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border)"
          @mouseenter="$event.target.style.background='var(--bg-elevated)'"
          @mouseleave="$event.target.style.background=''"
          @mousedown.prevent="selectOption(item)">
          <div style="font-size:13px;color:var(--text-primary)">{{ item.catName }}</div>
          <div v-if="item.path" style="font-size:12px;color:var(--text-muted);margin-top:1px;word-break:break-all">{{ item.path }}</div>
        </div>
      </div>
      <div v-if="dropdownVisible && !searchOptions.length && keyword && !searchLoading" :style="Object.assign({background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',boxShadow:'var(--shadow)',padding:'10px',textAlign:'center',color:'var(--text-muted)',fontSize:'13px'}, dropStyle)">
        无匹配结果
      </div>
      <div v-if="currentPath" style="font-size:11px;color:var(--text-muted);margin-top:2px;padding-left:2px;word-break:break-all;line-height:1.3">
        {{ currentPath }}
      </div>
    </div>`
});
