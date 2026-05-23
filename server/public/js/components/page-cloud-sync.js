// 云同步配置页面
Vue.component('page-cloud-sync', {
  data: function () {
    return {
      loading: false,
      saving: false,
      status: { connected: false, lastSyncTime: null, config: false },
      syncing: false,
      syncingType: '',
      syncResult: null,
      sections: [
        {
          title: '知识库',
          tables: [
            { key: 'mappings', label: '类目映射', icon: '🏷️', desc: '1688类目 ↔ DXM类目对应关系', confirm: false },
            { key: 'keyword-rels', label: '关键词关联', icon: '🔗', desc: '关键词与DXM类目的权重关联', confirm: false },
            { key: 'synonyms', label: '同义词', icon: '📝', desc: '关键词同义词扩展', confirm: false },
            { key: 'blacklist', label: '黑名单', icon: '🚫', desc: '关键词-类目禁止关联', confirm: false }
          ]
        },
        {
          title: '大数据量',
          tables: [
            { key: 'tree', label: '店小秘分类库', icon: '🌲', desc: '数千条分类数据，操作前弹窗确认', confirm: true },
            { key: 'product', label: '商品数据', icon: '📦', desc: '用商品链接去重，不覆盖已有状态', confirm: true }
          ]
        }
      ]
    };
  },
  mounted: function () {
    this.loadConfig();
  },
  computed: {
    statusText: function () {
      if (this.status.connected) return '已连接';
      if (this.status.config) return '已配置（未连接）';
      return '未配置';
    },
    statusColor: function () {
      if (this.status.connected) return 'var(--success)';
      if (this.status.config) return 'var(--accent)';
      return 'var(--text-muted)';
    },
    lastSyncText: function () {
      if (!this.status.lastSyncTime) return '从未同步';
      return new Date(this.status.lastSyncTime).toLocaleString();
    }
  },
  methods: {
    isBusy: function (type) { return this.syncing && this.syncingType === type; },
    setBusy: function (type) {
      this.syncing = true;
      this.syncingType = type;
      this.syncResult = null;
    },
    done: function (msg, data) {
      this.syncResult = data;
      this.$Message.success(msg);
      this.syncing = false;
      this.syncingType = '';
      this.loadConfig();
    },
    fail: function (msg) {
      this.$Message.error(msg);
      this.syncing = false;
      this.syncingType = '';
    },
    loadConfig: function () {
      var vm = this;
      vm.loading = true;
      fetch('/api/sync/config')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.status = { connected: data.status ? data.status.connected : false, lastSyncTime: data.status ? data.status.lastSyncTime : null, config: data.configured };
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    initCloud: function () {
      var vm = this;
      vm.$Modal.confirm({
        title: '初始化云端',
        content: '<p>将建表并上传本地所有知识库数据到 Turso。</p><p style="color:var(--danger);margin-top:6px">分类库和商品需单独同步。</p>',
        onOk: function () {
          vm.setBusy('init');
          fetch('/api/sync/init', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (data) { data.ok ? vm.done('初始化完成', data) : vm.fail(data.error || '初始化失败'); })
            .catch(function () { vm.fail('初始化失败'); });
        }
      });
    },
    fullSync: function () {
      var vm = this;
      vm.$Modal.confirm({
        title: '双向同步',
        content: '<p>合并云端和本地知识库（映射、关联、同义词、黑名单），取最大值不丢数据。</p><p style="color:var(--accent);margin-top:6px">分类库和商品需单独同步。</p>',
        onOk: function () {
          vm.setBusy('sync');
          fetch('/api/sync/sync', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (data) { data.ok ? vm.done('同步完成', data) : vm.fail(data.error || '同步失败'); })
            .catch(function () { vm.fail('同步失败'); });
        }
      });
    },
    // 通用单表操作
    doAction: function (t, action) {
      var vm = this;
      var isTable = t.key !== 'tree' && t.key !== 'product';
      var busyKey = t.key + '-' + action;
      var url, label = t.label;

      if (isTable) {
        url = '/api/sync/table-' + action + '/' + t.key;
      } else {
        url = '/api/sync/' + t.key + '-' + action;
      }

      var actionLabel = action === 'push' ? '上传' : action === 'pull' ? '拉取' : '双向同步';
      var run = function () {
        vm.setBusy(busyKey);
        fetch(url, { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (data) { data.ok ? vm.done(label + actionLabel + '完成', data) : vm.fail(data.error || '操作失败'); })
          .catch(function () { vm.fail(label + actionLabel + '失败'); });
      };

      if (t.confirm) {
        vm.$Modal.confirm({
          title: label + actionLabel,
          content: '<p>确定要' + actionLabel + label + '吗？</p><p style="color:var(--danger);margin-top:6px">数据量较大，可能需要较长时间。</p>',
          onOk: run
        });
      } else {
        run();
      }
    }
  },
  template: '\
    <div style="padding:0">\
\
      <!-- 顶部状态栏 -->\
      <div class="sync-banner" :class="status.connected ? \'is-connected\' : \'is-idle\'">\
        <div class="sync-banner-left">\
          <div class="sync-banner-dot"></div>\
          <div class="sync-banner-info">\
            <h3 style="margin:0;font-size:18px;color:var(--text-primary)">云同步</h3>\
            <span class="sync-banner-sub">{{ statusText }} · 上次同步 {{ lastSyncText }}</span>\
          </div>\
        </div>\
        <div class="sync-banner-actions">\
          <Button type="warning" :loading="isBusy(\'init\')" @click="initCloud">\
            <icon type="md-cloud-upload" style="margin-right:4px"></icon>初始化云端\
          </Button>\
          <Button type="primary" :loading="isBusy(\'sync\')" @click="fullSync">\
            <icon type="md-sync" style="margin-right:4px"></icon>双向同步（知识库）\
          </Button>\
        </div>\
      </div>\
\
      <!-- 知识库 -->\
      <div class="sync-group">\
        <div class="sync-group-head">\
          <span class="sync-group-title">知识库</span>\
          <span class="sync-group-desc">映射、关联、同义词、黑名单</span>\
        </div>\
        <div class="sync-grid">\
          <div v-for="t in sections[0].tables" :key="t.key" class="sync-card">\
            <div class="sync-card-icon">{{ t.icon }}</div>\
            <div class="sync-card-body">\
              <div class="sync-card-label">{{ t.label }}</div>\
              <div class="sync-card-desc">{{ t.desc }}</div>\
            </div>\
            <div class="sync-card-actions">\
              <Button :loading="isBusy(t.key + \'-push\')" @click="doAction(t, \'push\')">上传</Button>\
              <Button :loading="isBusy(t.key + \'-pull\')" @click="doAction(t, \'pull\')">拉取</Button>\
              <Button type="primary" :loading="isBusy(t.key + \'-sync\')" @click="doAction(t, \'sync\')">双向</Button>\
            </div>\
          </div>\
        </div>\
      </div>\
\
      <!-- 大数据量 -->\
      <div class="sync-group">\
        <div class="sync-group-head">\
          <span class="sync-group-title">大数据量</span>\
          <span class="sync-group-desc">分类库、商品数据，操作前需确认</span>\
        </div>\
        <div class="sync-grid">\
          <div v-for="t in sections[1].tables" :key="t.key" class="sync-card">\
            <div class="sync-card-icon">{{ t.icon }}</div>\
            <div class="sync-card-body">\
              <div class="sync-card-label">{{ t.label }}</div>\
              <div class="sync-card-desc">{{ t.desc }}</div>\
            </div>\
            <div class="sync-card-actions">\
              <Button :loading="isBusy(t.key + \'-push\')" @click="doAction(t, \'push\')">上传</Button>\
              <Button :loading="isBusy(t.key + \'-pull\')" @click="doAction(t, \'pull\')">拉取</Button>\
              <Button type="primary" :loading="isBusy(t.key + \'-sync\')" @click="doAction(t, \'sync\')">双向</Button>\
            </div>\
          </div>\
        </div>\
      </div>\
\
      <!-- 最近结果 -->\
      <div v-if="syncResult" class="sync-result">\
        <div class="sync-result-head">\
          <icon type="md-checkmark-circle" style="color:var(--success);margin-right:6px"></icon>\
          <span>最近操作结果</span>\
        </div>\
        <pre class="sync-result-body">{{ JSON.stringify(syncResult, null, 2) }}</pre>\
      </div>\
\
    </div>'
});
