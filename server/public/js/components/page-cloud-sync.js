// 云同步配置页面
Vue.component('page-cloud-sync', {
  data: function () {
    return {
      loading: false,
      saving: false,
      tursoUrl: '',
      tursoToken: '',
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
      if (this.status.connected) return '#19be6b';
      if (this.status.config) return '#ff9900';
      return '#bbbec4';
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
    exportSettings: function () {
      window.open('/api/settings-export', '_blank');
    },
    importSettings: function () {
      var vm = this;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            fetch('/api/settings-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            }).then(function (r) { return r.json(); }).then(function (res) {
              if (res.ok) vm.$Message.success('导入成功，共 ' + res.imported + ' 项');
              else vm.$Message.error(res.error || '导入失败');
            }).catch(function () { vm.$Message.error('导入失败'); });
          } catch (err) {
            vm.$Message.error('文件格式错误');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    },
    loadConfig: function () {
      var vm = this;
      vm.loading = true;
      fetch('/api/sync/config')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.tursoUrl = data.url || '';
          vm.tursoToken = data.token || '';
          vm.status = { connected: data.status ? data.status.connected : false, lastSyncTime: data.status ? data.status.lastSyncTime : null, config: data.configured };
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    saveConfig: function () {
      var vm = this;
      var url = (vm.tursoUrl || '').trim();
      var token = (vm.tursoToken || '').trim();
      if (!url || !token) { vm.$Message.warning('请填写 URL 和 Token'); return; }
      vm.saving = true;
      fetch('/api/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, token: token })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) { vm.$Message.success(data.message); vm.loadConfig(); }
          else vm.$Message.error(data.message || '连接失败');
          vm.saving = false;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = false; });
    },
    testConnection: function () {
      var vm = this;
      vm.saving = true;
      fetch('/api/sync/test', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) vm.$Message.success('连接成功');
          else vm.$Message.error(data.message || '连接失败');
          vm.loadConfig();
          vm.saving = false;
        })
        .catch(function () { vm.$Message.error('测试失败'); vm.saving = false; });
    },
    initCloud: function () {
      var vm = this;
      vm.$Modal.confirm({
        title: '初始化云端',
        content: '<p>将建表并上传本地所有知识库数据到 Turso。</p><p style="color:#ed4014;margin-top:6px">分类库和商品需单独同步。</p>',
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
        content: '<p>合并云端和本地知识库（映射、关联、同义词、黑名单），取最大值不丢数据。</p><p style="color:#2d8cf0;margin-top:6px">分类库和商品需单独同步。</p>',
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
          content: '<p>确定要' + actionLabel + label + '吗？</p><p style="color:#ed4014;margin-top:6px">数据量较大，可能需要较长时间。</p>',
          onOk: run
        });
      } else {
        run();
      }
    }
  },
  template: '\
    <div class="list-card" style="padding:24px">\
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">\
        <h3 style="margin:0;font-size:18px">云同步</h3>\
        <div style="display:flex;align-items:center;gap:12px">\
          <Tag :color="statusColor" style="font-size:13px">{{ statusText }}</Tag>\
          <span style="color:#808695;font-size:12px">上次同步: {{ lastSyncText }}</span>\
        </div>\
      </div>\
\
      <!-- 连接配置 + 快捷操作 -->\
      <div style="display:flex;gap:16px;margin-bottom:20px">\
        <Card style="flex:1">\
          <p slot="title">Turso 连接配置</p>\
          <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center">\
            <span style="width:90px;flex-shrink:0;color:#515a6e">Database URL</span>\
            <Input v-model="tursoUrl" placeholder="libsql://your-db-name.turso.io" />\
          </div>\
          <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center">\
            <span style="width:90px;flex-shrink:0;color:#515a6e">Auth Token</span>\
            <Input v-model="tursoToken" type="password" placeholder="eyJ..." />\
          </div>\
          <div style="display:flex;gap:8px">\
            <Button type="primary" :loading="saving" @click="saveConfig">保存并连接</Button>\
            <Button :loading="saving" @click="testConnection">测试连接</Button>\
          </div>\
        </Card>\
        <Card style="flex:1">\
          <p slot="title">快捷操作</p>\
          <div style="display:flex;flex-direction:column;gap:10px;justify-content:center;height:calc(100% - 40px)">\
            <Button type="warning" long :loading="isBusy(\'init\')" @click="initCloud" style="font-size:14px;padding:10px">初始化云端</Button>\
            <Button type="primary" long :loading="isBusy(\'sync\')" @click="fullSync" style="font-size:14px;padding:10px">双向同步（知识库）</Button>\
          </div>\
          <div style="margin-top:10px;color:#808695;font-size:11px">初始化 = 建表+上传；双向同步 = 知识库一键合并</div>\
        </Card>\
      </div>\
\
      <!-- 知识库 -->\
      <div class="sync-section-title">知识库</div>\
      <div class="sync-grid sync-grid--kb">\
        <div v-for="t in sections[0].tables" :key="t.key" class="sync-card">\
          <div class="sync-card-icon">{{ t.icon }}</div>\
          <div class="sync-card-body">\
            <div class="sync-card-label">{{ t.label }}</div>\
            <div class="sync-card-desc">{{ t.desc }}</div>\
          </div>\
          <div class="sync-card-actions">\
            <Button size="small" :loading="isBusy(t.key + \'-push\')" @click="doAction(t, \'push\')">上传</Button>\
            <Button size="small" :loading="isBusy(t.key + \'-pull\')" @click="doAction(t, \'pull\')">拉取</Button>\
            <Button size="small" type="primary" :loading="isBusy(t.key + \'-sync\')" @click="doAction(t, \'sync\')">双向</Button>\
          </div>\
        </div>\
      </div>\
\
      <!-- 大数据量 -->\
      <div class="sync-section-title">大数据量</div>\
      <div class="sync-section-title">大数据量</div>\
      <div class="sync-grid sync-grid--big">\
        <div v-for="t in sections[1].tables" :key="t.key" class="sync-card">\
          <div class="sync-card-icon">{{ t.icon }}</div>\
          <div class="sync-card-body">\
            <div class="sync-card-label">{{ t.label }}</div>\
            <div class="sync-card-desc">{{ t.desc }}</div>\
          </div>\
          <div class="sync-card-actions">\
            <Button size="small" :loading="isBusy(t.key + \'-push\')" @click="doAction(t, \'push\')">上传</Button>\
            <Button size="small" :loading="isBusy(t.key + \'-pull\')" @click="doAction(t, \'pull\')">拉取</Button>\
            <Button size="small" type="primary" :loading="isBusy(t.key + \'-sync\')" @click="doAction(t, \'sync\')">双向</Button>\
          </div>\
        </div>\
      </div>\
\
      <!-- 设置导入导出 -->\
      <div class="sync-section-title">设置（本地文件）</div>\
      <div style="display:flex;gap:12px;margin-bottom:20px">\
        <Button icon="md-download" @click="exportSettings">导出设置</Button>\
        <Button icon="md-upload" @click="importSettings">导入设置</Button>\
        <span style="color:#808695;font-size:12px;line-height:32px">导出API密钥、价格公式等配置为JSON文件，拷贝到其他机器导入即可</span>\
      </div>\
\
      <!-- 最近结果 -->\
      <Card v-if="syncResult" style="margin-top:20px">\
        <p slot="title">最近操作结果</p>\
        <pre style="font-size:12px;white-space:pre-wrap;background:#f8f8f8;padding:12px;border-radius:6px;max-height:300px;overflow:auto">{{ JSON.stringify(syncResult, null, 2) }}</pre>\
      </Card>\
    </div>'
});
