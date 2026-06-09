// AI模型配置页面 — 按厂商分组 + 统一Key池
Vue.component('page-api-keys', {
  data: function () {
    return {
      loading: false,
      saving: null,
      zhipuKeys: [],
      qwenKeys: [],
      hunyuanAccounts: [],
      ollamaModel: 'qwen3:8b',
      ollamaPort: '11434',
      ollamaConfigured: false,
      imgbbStatus: { configured: false, masked: '', label: '' },
      tursoUrl: '',
      tursoToken: '',
      tursoStatus: { connected: false, config: false },
      tursoSaving: false,
      tursoEditing: false,
      comfyuiUrl: '',
      comfyuiStatus: { online: false, loading: false },
      keyModal: { show: false, mode: 'add', provider: '', index: -1, key: '', label: '', sid: '', skey: '' },
      dispatch: { text: [], vision: [], image: [] },
      dispatchTab: 'text',
      dispatchVendorStatus: {},
      dispatchAvailableModels: {},
      dispatchDragIdx: -1
    };
  },
  mounted: function () {
    this.loadConfigs();
    this.loadDispatch();
    this.loadImgbb();
    this.loadTurso();
    this.loadComfyui();
  },
  methods: {
    loadConfigs: function () {
      var vm = this;
      vm.loading = true;
      fetch('/api/ai/vendor-configs')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var v = data.vendors || {};
          vm.zhipuKeys = (v.zhipu && v.zhipu.keys) || [];
          vm.qwenKeys = (v.qwen && v.qwen.keys) || [];
          vm.hunyuanAccounts = (v.hunyuan && v.hunyuan.accounts) || [];
          vm.ollamaModel = (v.ollama && v.ollama.model) || 'qwen3:8b';
          vm.ollamaPort = (v.ollama && v.ollama.port) || '11434';
          vm.ollamaConfigured = !!(v.ollama && v.ollama.configured);
          vm.loading = false;
        })
        .catch(function (e) { console.error('[AI配置] 加载失败:', e); vm.loading = false; });
    },
    // ===== 调度优先级 =====
    loadDispatch: function () {
      var vm = this;
      fetch('/api/ai/dispatch-order').then(function (r) { return r.json(); }).then(function (d) {
        vm.dispatch = d.dispatch || { text: [], vision: [], image: [] };
        vm.dispatchVendorStatus = d.vendorStatus || {};
        vm.dispatchAvailableModels = d.availableModels || {};
      }).catch(function () {});
    },
    getVendorLabel: function (vendor) {
      var m = { zhipu: '智谱AI', qwen: '通义千问', hunyuan: '腾讯混元', ollama: '本地模型' };
      return m[vendor] || vendor;
    },
    getKeyInfo: function (entry) {
      var s = this.dispatchVendorStatus[entry.vendor];
      if (!s) return '';
      if (entry.vendor === 'hunyuan') return s.hasKeys ? s.keyCount + '个账号' : '无账号';
      if (entry.vendor === 'ollama') return s.configured ? s.model : '未配置';
      return s.hasKeys ? s.keyCount + '个Key' : '无Key';
    },
    isNoKeys: function (entry) {
      var s = this.dispatchVendorStatus[entry.vendor];
      if (!s) return true;
      if (entry.vendor === 'ollama') return !s.configured;
      return !s.hasKeys;
    },
    getModelsForVendor: function (entry) {
      var m = this.dispatchAvailableModels[entry.vendor];
      if (!m) return [];
      return m[this.dispatchTab] || [];
    },
    changeDispatchModel: function (entry, model) {
      entry.model = model;
      this.saveDispatch();
    },
    saveDispatch: function () {
      var vm = this;
      fetch('/api/ai/dispatch-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatch: vm.dispatch })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d.ok) vm.$Message.error('保存失败');
      }).catch(function () { vm.$Message.error('保存失败'); });
    },
    onDragStart: function (e, idx) {
      this.dispatchDragIdx = idx;
      e.dataTransfer.effectAllowed = 'move';
      e.target.classList.add('dragging');
    },
    onDragEnd: function (e) {
      e.target.classList.remove('dragging');
      this.dispatchDragIdx = -1;
    },
    onDragOver: function (e, idx) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    onDrop: function (e, idx) {
      e.preventDefault();
      var list = this.dispatch[this.dispatchTab];
      var from = this.dispatchDragIdx;
      if (from < 0 || from === idx) return;
      var item = list.splice(from, 1)[0];
      list.splice(idx, 0, item);
      this.saveDispatch();
    },
    // ===== 弹窗 =====
    openAddModal: function (provider) {
      this.keyModal = { show: true, mode: 'add', provider: provider, index: -1, key: '', label: '', sid: '', skey: '' };
    },
    openEditModal: function (provider, index, label) {
      this.keyModal = { show: true, mode: 'edit', provider: provider, index: index, key: '', label: label || '', sid: '', skey: '' };
    },
    openSingleKeyModal: function (provider) {
      this.keyModal = { show: true, mode: 'single', provider: provider, index: -1, key: '', label: '', sid: '', skey: '' };
    },
    openEditSingleLabel: function (provider) {
      var existingLabel = provider === 'imgbb' ? (this.imgbbStatus.label || '') : '';
      this.keyModal = { show: true, mode: 'edit', provider: provider, index: -1, key: '', label: existingLabel, sid: '', skey: '' };
    },
    closeModal: function () { this.keyModal.show = false; },
    saveModal: function () {
      var vm = this;
      var m = vm.keyModal;
      var label = (m.label || '').trim();
      if (m.provider === 'zhipu') {
        if (m.mode === 'add') {
          var key = (m.key || '').trim();
          if (!key) { vm.$Message.warning('请输入API Key'); return; }
          vm.saving = 'zhipu';
          fetch('/api/ai/zhipu-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', key: key, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已添加，共 ' + d.count + ' 个Key'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '添加失败');
              vm.saving = null; vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('添加失败'); vm.saving = null; });
        } else {
          fetch('/api/ai/zhipu-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-label', index: m.index, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已更新'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '更新失败');
              vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('更新失败'); });
        }
      } else if (m.provider === 'qwen') {
        if (m.mode === 'add') {
          var key = (m.key || '').trim();
          if (!key) { vm.$Message.warning('请输入API Key'); return; }
          vm.saving = 'qwen';
          fetch('/api/ai/qwen-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', key: key, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已添加，共 ' + d.count + ' 个Key'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '添加失败');
              vm.saving = null; vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('添加失败'); vm.saving = null; });
        } else {
          fetch('/api/ai/qwen-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-label', index: m.index, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已更新'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '更新失败');
              vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('更新失败'); });
        }
      } else if (m.provider === 'hunyuan') {
        if (m.mode === 'add') {
          var sid = (m.sid || '').trim();
          var skey = (m.skey || '').trim();
          if (!sid || !skey) { vm.$Message.warning('请输入 SecretId 和 SecretKey'); return; }
          vm.saving = 'hunyuan';
          fetch('/api/ai/hunyuan-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', secretId: sid, secretKey: skey, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已添加，共 ' + d.count + ' 个账号'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '添加失败');
              vm.saving = null; vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('添加失败'); vm.saving = null; });
        } else {
          fetch('/api/ai/hunyuan-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update-label', index: m.index, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已更新'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '更新失败');
              vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('更新失败'); });
        }
      } else if (m.provider === 'imgbb') {
        if (m.mode === 'edit') {
          vm.saving = 'imgbb';
          fetch('/api/ai/smms-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelOnly: true, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('备注已更新'); vm.loadImgbb(); }
              else vm.$Message.error(d.error || '更新失败');
              vm.saving = null; vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('更新失败'); vm.saving = null; });
        } else {
          var key = (m.key || '').trim();
          if (!key) { vm.$Message.warning('请输入API Key'); return; }
          vm.saving = 'imgbb';
          fetch('/api/ai/smms-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: key, label: label }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('ImgBB Key 已保存'); vm.loadImgbb(); }
              else vm.$Message.error(d.error || '保存失败');
              vm.saving = null; vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
        }
      }
    },
    // ===== 删除 =====
    deleteKey: function (provider, idx) {
      var vm = this;
      var names = { zhipu: '智谱 Key', qwen: '通义千问 Key', hunyuan: '混元账号' };
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个' + (names[provider] || 'Key') + '吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          var endpoint = provider === 'zhipu' ? '/api/ai/zhipu-keys' : provider === 'qwen' ? '/api/ai/qwen-keys' : '/api/ai/hunyuan-keys';
          fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', index: idx }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '删除失败');
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    deleteImgbb: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除 ImgBB API Key 吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/smms-token-delete', { method: 'POST' })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadImgbb(); }
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    // ===== Ollama =====
    saveOllama: function () {
      var vm = this;
      var model = (vm.ollamaModel || '').trim() || 'qwen3:8b';
      var port = (vm.ollamaPort || '').trim() || '11434';
      vm.saving = 'ollama';
      fetch('/api/ai/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providers: { ollama: { model: model, port: port } } }) })
        .then(function (r) { return r.json(); }).then(function (result) {
          if (result.ok) { vm.$Message.success('本地模型配置已保存'); vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    // ===== ImgBB =====
    loadImgbb: function () {
      var vm = this;
      fetch('/api/ai/smms-token').then(function (r) { return r.json(); }).then(function (d) {
        vm.imgbbStatus = { configured: !!d.configured, masked: d.masked || '', label: d.label || '' };
      }).catch(function () {});
    },
    // ===== ComfyUI =====
    loadComfyui: function () {
      var vm = this;
      fetch('/api/ai/comfyui-config').then(function (r) { return r.json(); }).then(function (d) {
        vm.comfyuiUrl = d.url || '';
        vm.comfyuiStatus = { online: d.online || false, loading: false };
      }).catch(function () { vm.comfyuiStatus = { online: false, loading: false }; });
    },
    saveComfyui: function () {
      var vm = this;
      vm.comfyuiStatus.loading = true;
      fetch('/api/ai/comfyui-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: (vm.comfyuiUrl || '').trim() })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.comfyuiStatus.loading = false;
        if (d.ok) { vm.$Message.success('ComfyUI 配置已保存'); vm.loadComfyui(); }
        else { vm.$Message.error(d.error || '保存失败'); }
      }).catch(function () { vm.comfyuiStatus.loading = false; vm.$Message.error('保存失败'); });
    },
    // ===== Turso =====
    loadTurso: function () {
      var vm = this;
      fetch('/api/sync/config').then(function (r) { return r.json(); }).then(function (data) {
        vm.tursoUrl = data.url || '';
        vm.tursoToken = data.token || '';
        vm.tursoStatus = { connected: data.status ? data.status.connected : false, config: data.configured };
        vm.tursoEditing = false;
      }).catch(function () {});
    },
    saveTurso: function () {
      var vm = this;
      var url = (vm.tursoUrl || '').trim();
      var token = (vm.tursoToken || '').trim();
      if (!url || !token) { vm.$Message.warning('请填写 URL 和 Token'); return; }
      vm.tursoSaving = true;
      fetch('/api/sync/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url, token: token }) })
        .then(function (r) { return r.json(); }).then(function (data) {
          if (data.ok) { vm.$Message.success('配置已保存'); vm.loadTurso(); }
          else vm.$Message.error(data.message || '保存失败');
          vm.tursoSaving = false;
        }).catch(function () { vm.$Message.error('保存失败'); vm.tursoSaving = false; });
    },
    // ===== 导入导出 =====
    exportSettings: function () { window.open('/api/settings-export', '_blank'); },
    importSettings: function () {
      var vm = this;
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.onchange = function (e) {
        var file = e.target.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            fetch('/api/settings-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
              .then(function (r) { return r.json(); }).then(function (res) {
                if (res.ok) { vm.$Message.success('导入成功，共 ' + res.imported + ' 项'); vm.loadConfigs(); vm.loadImgbb(); }
                else vm.$Message.error(res.error || '导入失败');
              }).catch(function () { vm.$Message.error('导入失败'); });
          } catch (err) { vm.$Message.error('文件格式错误'); }
        };
        reader.readAsText(file);
      };
      input.click();
    }
  },
  template: `
    <div style="padding:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <div>
          <h3 style="margin:0 0 6px;font-size:18px;color:var(--text-primary)">AI模型配置</h3>
          <p style="margin:0;font-size:13px;color:var(--text-muted)">按厂商管理API Key，同一厂商所有模型共用Key池</p>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <i-button @click="exportSettings" style="border-radius:var(--radius);font-size:13px;padding:6px 16px"><icon type="md-download" style="margin-right:4px"></icon>导出设置</i-button>
          <i-button type="primary" @click="importSettings" style="border-radius:var(--radius);font-size:13px;padding:6px 16px"><icon type="md-upload" style="margin-right:4px"></icon>导入设置</i-button>
        </div>
      </div>

      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>

      <template v-else>

        <!-- ====== 调度优先级 ====== -->
        <div class="ai-dispatch-panel">
          <div class="ai-dispatch-header">
            <span class="ai-dispatch-title">调度优先级</span>
            <div class="ai-dispatch-tab">
              <span class="ai-dispatch-tab-item" :class="{ active: dispatchTab === 'text' }" @click="dispatchTab = 'text'">文本模型</span>
              <span class="ai-dispatch-tab-item" :class="{ active: dispatchTab === 'vision' }" @click="dispatchTab = 'vision'">视觉模型</span>
              <span class="ai-dispatch-tab-item" :class="{ active: dispatchTab === 'image' }" @click="dispatchTab = 'image'">图像生成</span>
            </div>
          </div>
          <div class="ai-dispatch-body">
            <div v-for="(entry, idx) in dispatch[dispatchTab]" :key="entry.vendor + entry.model"
                 class="ai-dispatch-row" :class="{ 'no-keys': isNoKeys(entry) }"
                 draggable="true"
                 @dragstart="onDragStart($event, idx)"
                 @dragend="onDragEnd($event)"
                 @dragover="onDragOver($event, idx)"
                 @drop="onDrop($event, idx)">
              <i class="ivu-icon ivu-icon-ios-menu ai-drag-handle"></i>
              <span class="ai-dispatch-rank">{{ idx + 1 }}</span>
              <span class="ai-dispatch-vendor-name">{{ getVendorLabel(entry.vendor) }}</span>
              <i-select :value="entry.model" size="small" style="width:160px" @on-change="changeDispatchModel(entry, $event)">
                <i-option v-for="m in getModelsForVendor(entry)" :key="m" :value="m">{{ m }}</i-option>
                <i-option v-if="!getModelsForVendor(entry).length" :value="entry.model">{{ entry.model }}</i-option>
              </i-select>
              <span class="ai-dispatch-key-info">{{ getKeyInfo(entry) }}</span>
            </div>
            <div v-if="!dispatch[dispatchTab] || !dispatch[dispatchTab].length" style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">
              暂无调度配置
            </div>
          </div>
        </div>

        <!-- ====== 智谱AI ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">智谱AI (Zhipu)</span>
            <span class="ai-pfree" style="margin-left:8px">免费</span>
            <a href="https://open.bigmodel.cn" target="_blank" style="font-size:11px;color:var(--accent);margin-left:8px">open.bigmodel.cn</a>
          </div>
          <!-- Key池 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">API Key</span>
              <span class="ai-key-count" v-if="zhipuKeys.length">{{ zhipuKeys.length }}个</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-for="(k, i) in zhipuKeys" :key="'z'+i" class="ai-key-tag">
                  {{ k.key }}<span v-if="k.label" class="ai-key-label-text">[{{ k.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('zhipu', i, k.label)"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteKey('zhipu', i)"></i>
                </span>
                <i-button type="primary" size="small" @click="openAddModal('zhipu')"><icon type="md-add" style="margin-right:2px"></icon>添加Key</i-button>
              </div>
              <div v-if="!zhipuKeys.length" class="ai-key-empty">未设置，所有智谱模型将无法使用</div>
            </div>
          </div>
          <!-- 模型展示 -->
          <div class="ai-provider-row">
            <span class="ai-model-type-tag tag-text">文本模型</span>
            <span class="ai-model-name">GLM-4.7-Flash<span class="ai-pfree" style="margin-left:4px">免费</span></span>
            <span class="ai-model-name">GLM-4-Flash<span class="ai-pfree" style="margin-left:4px">免费</span></span>
          </div>
          <div class="ai-provider-row">
            <span class="ai-model-type-tag tag-vision">视觉模型</span>
            <span class="ai-model-name">GLM-4.6V-Flash<span class="ai-pfree" style="margin-left:4px">免费</span></span>
            <span class="ai-model-name">GLM-4V-Flash<span class="ai-pfree" style="margin-left:4px">免费</span></span>
          </div>
          <div class="ai-provider-row" style="border-bottom:none">
            <span class="ai-model-type-tag tag-image">图像生成</span>
            <span class="ai-model-name">CogView-3-Flash<span class="ai-pfree" style="margin-left:4px">免费</span></span>
            <span class="ai-model-name">CogView-4<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--warning-bg);color:var(--warning);margin-left:4px">付费</span></span>
          </div>
        </div>

        <!-- ====== 通义千问 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">通义千问 (Qwen)</span>
            <span class="ai-pfree" style="margin-left:8px;background:var(--warning-bg);color:var(--warning)">免费/付费</span>
            <a href="https://dashscope.console.aliyun.com" target="_blank" style="font-size:11px;color:var(--accent);margin-left:8px">DashScope 控制台</a>
          </div>
          <!-- Key池 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">API Key</span>
              <span class="ai-key-count" v-if="qwenKeys.length">{{ qwenKeys.length }}个</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-for="(k, i) in qwenKeys" :key="'q'+i" class="ai-key-tag">
                  {{ k.key }}<span v-if="k.label" class="ai-key-label-text">[{{ k.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('qwen', i, k.label)"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteKey('qwen', i)"></i>
                </span>
                <i-button type="primary" size="small" @click="openAddModal('qwen')"><icon type="md-add" style="margin-right:2px"></icon>添加Key</i-button>
              </div>
              <div v-if="!qwenKeys.length" class="ai-key-empty">未设置（图片识别将使用内置默认Key）</div>
            </div>
          </div>
          <!-- 模型展示 -->
          <div class="ai-provider-row">
            <span class="ai-model-type-tag tag-text">文本模型</span>
            <span class="ai-model-name">Qwen-Turbo</span>
          </div>
          <div class="ai-provider-row" style="border-bottom:none">
            <span class="ai-model-type-tag tag-vision">视觉模型</span>
            <span class="ai-model-name">Qwen3.6-Flash<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--warning-bg);color:var(--warning);margin-left:4px">0.5元/百万token</span></span>
            <span class="ai-model-name">Qwen3.7-Plus<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:var(--warning-bg);color:var(--warning);margin-left:4px">4元/百万token</span></span>
          </div>
        </div>

        <!-- ====== 腾讯混元 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">腾讯混元 (Hunyuan)</span>
            <span class="ai-pfree" style="margin-left:8px">永久免费</span>
            <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" style="font-size:11px;color:var(--accent);margin-left:8px">密钥管理</a>
          </div>
          <!-- 账号池 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">账号</span>
              <span class="ai-key-count" v-if="hunyuanAccounts.length">{{ hunyuanAccounts.length }}个</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-for="(a, i) in hunyuanAccounts" :key="'h'+i" class="ai-key-tag">
                  {{ a.secretId }}<span v-if="a.label" class="ai-key-label-text">[{{ a.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('hunyuan', i, a.label)"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteKey('hunyuan', i)"></i>
                </span>
                <i-button type="primary" size="small" @click="openAddModal('hunyuan')"><icon type="md-add" style="margin-right:2px"></icon>添加账号</i-button>
              </div>
              <div v-if="!hunyuanAccounts.length" class="ai-key-empty">未设置</div>
            </div>
          </div>
          <!-- 模型展示 -->
          <div class="ai-provider-row" style="border-bottom:none">
            <span class="ai-model-type-tag tag-text">文本模型</span>
            <span class="ai-model-name">Hunyuan-Lite<span class="ai-pfree" style="margin-left:4px">永久免费</span></span>
          </div>
        </div>

        <!-- ====== 本地模型 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">本地模型 (Ollama)</span>
            <span class="ai-pfree" style="margin-left:8px;background:var(--info-bg);color:var(--info)">断网可用</span>
          </div>
          <div class="ai-provider-row" style="border-bottom:none">
            <span class="ai-model-type-tag tag-text">文本模型</span>
            <i-input v-model="ollamaModel" size="small" placeholder="模型名" style="width:140px"></i-input>
            <i-input v-model="ollamaPort" size="small" placeholder="端口" style="width:90px"></i-input>
            <i-button type="primary" size="small" :loading="saving === 'ollama'" @click="saveOllama()">保存</i-button>
            <span v-if="ollamaConfigured" class="ai-key-hint">{{ ollamaModel }}:{{ ollamaPort }}</span>
          </div>
        </div>

        <!-- ====== 工具服务 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">工具服务</span>
          </div>
          <!-- 图床 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">图床</span>
              <span class="ai-pmodel">ImgBB</span>
              <a href="https://api.imgbb.com/" target="_blank" style="font-size:11px;color:var(--accent)">免费申请</a>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-if="imgbbStatus.configured" class="ai-key-tag">
                  {{ imgbbStatus.masked }}<span v-if="imgbbStatus.label" class="ai-key-label-text">[{{ imgbbStatus.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditSingleLabel('imgbb')"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteImgbb()"></i>
                </span>
                <i-button type="primary" size="small" @click="openSingleKeyModal('imgbb')"><icon type="md-add" style="margin-right:2px"></icon>{{ imgbbStatus.configured ? '替换' : '设置' }} Key</i-button>
              </div>
              <div v-if="!imgbbStatus.configured" class="ai-key-empty">未设置</div>
            </div>
          </div>
          <!-- ComfyUI -->
          <div class="ai-provider-row" style="flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <div class="ai-provider-info" style="min-width:auto">
                <span class="ai-pname">ComfyUI</span>
                <span style="font-size:12px;color:var(--text-muted)">AI消除修复</span>
              </div>
              <span v-if="comfyuiStatus.online" style="font-size:12px;color:var(--success);font-weight:600">● 在线</span>
              <span v-else-if="comfyuiUrl" style="font-size:12px;color:var(--warning);font-weight:600">● 离线</span>
            </div>
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <i-input v-model="comfyuiUrl" size="small" placeholder="https://comfyui.example.com" style="flex:1"></i-input>
              <i-button type="primary" size="small" :loading="comfyuiStatus.loading" @click="saveComfyui()">保存</i-button>
            </div>
          </div>
          <!-- Turso -->
          <div class="ai-provider-row" style="flex-wrap:wrap;gap:10px;border-bottom:none">
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <div class="ai-provider-info" style="min-width:auto">
                <span class="ai-pname">Turso</span>
                <span style="font-size:12px;color:var(--text-muted)">云端同步</span>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <i-input v-model="tursoUrl" size="small" :disabled="tursoStatus.config && !tursoEditing" placeholder="libsql://your-db.turso.io" style="flex:1"></i-input>
            </div>
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <i-input v-model="tursoToken" type="password" password size="small" :disabled="tursoStatus.config && !tursoEditing" placeholder="Auth Token" style="flex:1"></i-input>
            </div>
            <div style="display:flex;gap:8px">
              <template v-if="tursoStatus.config && !tursoEditing">
                <i-button size="small" @click="tursoEditing = true">修改</i-button>
              </template>
              <template v-else>
                <i-button type="primary" size="small" :loading="tursoSaving" @click="saveTurso()">保存</i-button>
                <i-button v-if="tursoStatus.config" size="small" @click="loadTurso()">取消</i-button>
              </template>
            </div>
          </div>
        </div>

      </template>

      <!-- ====== Key 弹窗 ====== -->
      <div v-if="keyModal.show" class="ai-modal-mask" @click.self="closeModal">
        <div class="ai-modal">
          <div class="ai-modal-header">
            <span style="font-size:15px;font-weight:600;color:var(--text-primary)">{{ keyModal.mode === 'add' ? '添加 Key' : keyModal.mode === 'edit' ? '编辑备注' : '设置 Key' }}</span>
            <i class="ivu-icon ivu-icon-ios-close" style="cursor:pointer;font-size:20px;color:var(--text-muted)" @click="closeModal"></i>
          </div>
          <div class="ai-modal-body">
            <template v-if="(keyModal.provider === 'zhipu' || keyModal.provider === 'qwen') && keyModal.mode === 'add'">
              <div style="margin-bottom:12px">
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">API Key</span>
                <i-input v-model="keyModal.key" type="password" password size="small" placeholder="请输入 API Key" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给 Key 加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <template v-if="(keyModal.provider === 'zhipu' || keyModal.provider === 'qwen') && keyModal.mode === 'edit'">
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给 Key 加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <template v-if="keyModal.provider === 'hunyuan' && keyModal.mode === 'add'">
              <div style="margin-bottom:12px">
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">SecretId</span>
                <i-input v-model="keyModal.sid" size="small" placeholder="请输入 SecretId" style="width:100%"></i-input>
              </div>
              <div style="margin-bottom:12px">
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">SecretKey</span>
                <i-input v-model="keyModal.skey" type="password" password size="small" placeholder="请输入 SecretKey" style="width:100%"></i-input>
              </div>
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给账号加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <template v-if="keyModal.provider === 'hunyuan' && keyModal.mode === 'edit'">
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给账号加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <template v-if="keyModal.provider === 'imgbb' && keyModal.mode === 'edit'">
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给 Key 加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <template v-if="keyModal.provider === 'imgbb' && keyModal.mode === 'single'">
              <div style="margin-bottom:12px">
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">ImgBB API Key</span>
                <i-input v-model="keyModal.key" type="password" password size="small" placeholder="请输入 API Key" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给 Key 加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
          </div>
          <div class="ai-modal-footer">
            <i-button size="small" @click="closeModal">取消</i-button>
            <i-button type="primary" size="small" :loading="!!saving" @click="saveModal">{{ keyModal.mode === 'edit' ? '保存' : '确认' }}</i-button>
          </div>
        </div>
      </div>
    </div>`
});
