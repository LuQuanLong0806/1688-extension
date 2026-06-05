// AI模型配置页面 — 多Token轮换
Vue.component('page-api-keys', {
  data: function () {
    return {
      loading: false,
      saving: null,
      configs: {},
      providers: {},
      editData: {
        ollama_model: 'qwen3:8b',
        ollama_port: '11434'
      },
      imgbbStatus: { configured: false, masked: '' },
      tursoUrl: '',
      tursoToken: '',
      tursoStatus: { connected: false, config: false },
      tursoSaving: false,
      tursoEditing: false,
      comfyuiUrl: '',
      comfyuiStatus: { online: false, loading: false },
      qwenVlKey: '',
      qwenVlStatus: { configured: false, masked: '', isDefault: false },
      qwenVlSaving: false,
      keyModal: {
        show: false,
        mode: 'add',
        provider: '',
        index: -1,
        key: '',
        label: '',
        sid: '',
        skey: ''
      }
    };
  },
  mounted: function () {
    this.loadConfigs();
    this.loadImgbb();
    this.loadTurso();
    this.loadComfyui();
    this.loadQwenVl();
  },
  methods: {
    loadConfigs: function () {
      var vm = this;
      vm.loading = true;
      fetch('/api/ai/configs')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          vm.configs = {};
          vm.providers = data.providers || {};
          ['category', 'vision', 'image'].forEach(function (uc) {
            vm.$set(vm.configs, uc, data[uc] || {});
          });
          vm.$set(vm.configs, '_global', data._global || {});
          vm.editData.ollama_model = (vm.providers.ollama && vm.providers.ollama.model) || 'qwen3:8b';
          vm.editData.ollama_port = (vm.providers.ollama && vm.providers.ollama.port) || '11434';
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
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
      var existingLabel = '';
      if (provider === 'vision' && this.configs.vision) existingLabel = this.configs.vision.customLabel || '';
      else if (provider === 'image' && this.configs.image) existingLabel = this.configs.image.customLabel || '';
      else if (provider === 'imgbb') existingLabel = this.imgbbStatus.label || '';
      this.keyModal = { show: true, mode: 'edit', provider: provider, index: -1, key: '', label: existingLabel, sid: '', skey: '' };
    },
    closeModal: function () { this.keyModal.show = false; },
    saveModal: function () {
      var vm = this;
      var m = vm.keyModal;
      var label = (m.label || '').trim();
      // ===== 多 key 供应商 =====
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
              if (d.ok) { vm.$Message.success('已更新'); vm.$set(vm.configs._global.keys[m.index], 'label', label); }
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
              if (d.ok) { vm.$Message.success('已更新'); vm.$set(vm.providers.qwen.keys[m.index], 'label', label); }
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
              if (d.ok) { vm.$Message.success('已更新'); vm.$set(vm.providers.hunyuan.accounts[m.index], 'label', label); }
              else vm.$Message.error(d.error || '更新失败');
              vm.keyModal.show = false;
            }).catch(function () { vm.$Message.error('更新失败'); });
        }
      // ===== 单 key 场景 =====
      } else if (m.provider === 'vision' || m.provider === 'image' || m.provider === 'imgbb') {
        if (m.mode === 'edit') {
          // 仅更新备注，不修改 Key
          vm.saving = m.provider;
          if (m.provider === 'imgbb') {
            fetch('/api/ai/smms-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labelOnly: true, label: label }) })
              .then(function (r) { return r.json(); }).then(function (d) {
                if (d.ok) { vm.$Message.success('备注已更新'); vm.loadImgbb(); }
                else vm.$Message.error(d.error || '更新失败');
                vm.saving = null; vm.keyModal.show = false;
              }).catch(function () { vm.$Message.error('更新失败'); vm.saving = null; });
          } else {
            var payload = {};
            payload[m.provider] = { label: label };
            fetch('/api/ai/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
              .then(function (r) { return r.json(); }).then(function (d) {
                if (d.ok) { vm.$Message.success('备注已更新'); vm.loadConfigs(); }
                else vm.$Message.error(d.error || '更新失败');
                vm.saving = null; vm.keyModal.show = false;
              }).catch(function () { vm.$Message.error('更新失败'); vm.saving = null; });
          }
        } else {
          // 替换/设置 Key（含备注）
          var key = (m.key || '').trim();
          if (!key) { vm.$Message.warning('请输入API Key'); return; }
          vm.saving = m.provider;
          if (m.provider === 'vision') {
            fetch('/api/ai/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vision: { model: 'glm-4v-flash', apiKey: key, label: label } }) })
              .then(function (r) { return r.json(); }).then(function (d) {
                if (d.ok) { vm.$Message.success('智能检测 Key 已保存'); vm.loadConfigs(); }
                else vm.$Message.error(d.error || '保存失败');
                vm.saving = null; vm.keyModal.show = false;
              }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
          } else if (m.provider === 'image') {
            fetch('/api/ai/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: { model: 'cogview-3-flash', apiKey: key, label: label } }) })
              .then(function (r) { return r.json(); }).then(function (d) {
                if (d.ok) { vm.$Message.success('图片生成 Key 已保存'); vm.loadConfigs(); }
                else vm.$Message.error(d.error || '保存失败');
                vm.saving = null; vm.keyModal.show = false;
              }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
          } else if (m.provider === 'imgbb') {
            fetch('/api/ai/smms-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: key, label: label }) })
              .then(function (r) { return r.json(); }).then(function (d) {
                if (d.ok) { vm.$Message.success('ImgBB Key 已保存'); vm.loadImgbb(); }
                else vm.$Message.error(d.error || '保存失败');
                vm.saving = null; vm.keyModal.show = false;
              }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
          }
        }
      }
    },
    // ===== 删除 =====
    deleteZhipuKey: function (idx) {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个智谱 Key 吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/zhipu-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', index: idx }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '删除失败');
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    deleteQwenKey: function (idx) {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个通义千问 Key 吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/qwen-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', index: idx }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '删除失败');
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    deleteHunyuanAccount: function (idx) {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个混元账号吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/hunyuan-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', index: idx }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
              else vm.$Message.error(d.error || '删除失败');
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    deleteVisionKey: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '删除后将使用智谱通用 Key', okText: '删除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vision: { model: 'glm-4v-flash', apiKey: '', label: '' } }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
            }).catch(function () { vm.$Message.error('删除失败'); });
        }
      });
    },
    deleteImageKey: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '删除后将使用智谱通用 Key', okText: '删除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: { model: 'cogview-3-flash', apiKey: '', label: '' } }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
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
      var model = (vm.editData.ollama_model || '').trim() || 'qwen3:8b';
      var port = (vm.editData.ollama_port || '').trim() || '11434';
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: (vm.comfyuiUrl || '').trim() })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.comfyuiStatus.loading = false;
        if (d.ok) { vm.$Message.success('ComfyUI 配置已保存'); vm.loadComfyui(); }
        else { vm.$Message.error(d.error || '保存失败'); }
      }).catch(function (e) { vm.comfyuiStatus.loading = false; vm.$Message.error('保存失败: ' + e.message); });
    },
    // ===== 通义千问 VL =====
    loadQwenVl: function () {
      var vm = this;
      fetch('/api/ai/qwen-vl-config').then(function (r) { return r.json(); }).then(function (d) {
        vm.qwenVlStatus = { configured: d.configured, masked: d.masked || '', isDefault: d.isDefault || false };
      }).catch(function () {});
    },
    saveQwenVl: function () {
      var vm = this;
      var key = (vm.qwenVlKey || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.qwenVlSaving = true;
      fetch('/api/ai/qwen-vl-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.qwenVlSaving = false;
        if (d.ok) { vm.$Message.success('通义千问VL Key 已保存'); vm.qwenVlKey = ''; vm.loadQwenVl(); }
        else vm.$Message.error(d.error || '保存失败');
      }).catch(function (e) { vm.qwenVlSaving = false; vm.$Message.error('保存失败: ' + e.message); });
    },
    deleteQwenVl: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认清除', content: '清除后将使用内置默认Key', okText: '清除', cancelText: '取消',
        onOk: function () {
          fetch('/api/ai/qwen-vl-config/delete', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) { vm.$Message.success('已清除'); vm.loadQwenVl(); }
          });
        }
      });
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
                if (res.ok) { vm.$Message.success('导入成功，共 ' + res.imported + ' 项'); vm.loadConfigs(); }
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
          <p style="margin:0;font-size:13px;color:var(--text-muted)">配置各AI功能的模型和密钥，限流时自动切换备用Key</p>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <i-button @click="exportSettings" style="border-radius:var(--radius);font-size:13px;padding:6px 16px"><icon type="md-download" style="margin-right:4px"></icon>导出设置</i-button>
          <i-button type="primary" @click="importSettings" style="border-radius:var(--radius);font-size:13px;padding:6px 16px"><icon type="md-upload" style="margin-right:4px"></icon>导入设置</i-button>
        </div>
      </div>

      <div v-if="loading" style="text-align:center;padding:40px;color:var(--text-muted)">加载中...</div>

      <template v-else>

        <!-- ====== 分类推荐 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">分类推荐</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">多Key轮换 → 供应商降级</span>
          </div>

          <!-- 智谱 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">智谱AI</span>
              <span class="ai-pmodel">GLM-4.7 / GLM-4-Flash</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-for="(k, i) in (configs._global && configs._global.keys || [])" :key="'z'+i" class="ai-key-tag">
                  {{ k.key || k }}<span v-if="k.label" class="ai-key-label-text">[{{ k.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('zhipu', i, k.label)"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteZhipuKey(i)"></i>
                </span>
                <i-button type="primary" size="small" @click="openAddModal('zhipu')"><icon type="md-add" style="margin-right:2px"></icon>添加</i-button>
              </div>
              <div v-if="!configs._global || !configs._global.keys || !configs._global.keys.length" class="ai-key-empty">未设置</div>
            </div>
          </div>

          <!-- 通义千问 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">通义千问</span>
              <span class="ai-pmodel">qwen-turbo</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-for="(k, i) in (providers.qwen && providers.qwen.keys || [])" :key="'q'+i" class="ai-key-tag">
                  {{ k.key || k }}<span v-if="k.label" class="ai-key-label-text">[{{ k.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('qwen', i, k.label)"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteQwenKey(i)"></i>
                </span>
                <i-button type="primary" size="small" @click="openAddModal('qwen')"><icon type="md-add" style="margin-right:2px"></icon>添加</i-button>
              </div>
              <div v-if="!providers.qwen || !providers.qwen.keys || !providers.qwen.keys.length" class="ai-key-empty">未设置</div>
            </div>
          </div>

          <!-- 腾讯混元 -->
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">腾讯混元</span>
              <span class="ai-pmodel">hunyuan-lite</span>
              <span class="ai-pfree">永久免费</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-for="(a, i) in (providers.hunyuan && providers.hunyuan.accounts || [])" :key="'h'+i" class="ai-key-tag">
                  {{ a.secretId }}<span v-if="a.label" class="ai-key-label-text">[{{ a.label }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditModal('hunyuan', i, a.label)"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteHunyuanAccount(i)"></i>
                </span>
                <i-button type="primary" size="small" @click="openAddModal('hunyuan')"><icon type="md-add" style="margin-right:2px"></icon>添加</i-button>
              </div>
              <div v-if="!providers.hunyuan || !providers.hunyuan.accounts || !providers.hunyuan.accounts.length" class="ai-key-empty">未设置</div>
            </div>
          </div>

          <!-- 本地模型 -->
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">本地模型</span>
              <span class="ai-pmodel">Ollama</span>
              <span class="ai-pfree" style="background:var(--info-bg);color:var(--info)">断网可用</span>
            </div>
            <div class="ai-provider-action">
              <span v-if="providers.ollama && providers.ollama.configured" class="ai-key-hint">{{ providers.ollama.model }}:{{ providers.ollama.port }}</span>
              <span v-else class="ai-key-hint none">未配置</span>
              <i-input v-model="editData.ollama_model" size="small" placeholder="模型名" style="width:120px"></i-input>
              <i-input v-model="editData.ollama_port" size="small" placeholder="端口" style="width:80px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'ollama'" @click="saveOllama()">保存</i-button>
            </div>
          </div>
        </div>

        <!-- ====== 智能检测 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">智能检测</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">自动识别商品图片违规、质检问题</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">智谱AI</span>
              <span class="ai-pmodel">GLM-4V-Flash</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-if="configs.vision && configs.vision.apiKey" class="ai-key-tag">
                  {{ configs.vision.apiKey }}<span v-if="configs.vision.customLabel" class="ai-key-label-text">[{{ configs.vision.customLabel }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditSingleLabel('vision')"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteVisionKey()"></i>
                </span>
                <i-button type="primary" size="small" @click="openSingleKeyModal('vision')"><icon type="md-add" style="margin-right:2px"></icon>{{ (configs.vision && configs.vision.apiKey) ? '替换' : '设置' }} Key</i-button>
              </div>
              <div v-if="!configs.vision || !configs.vision.apiKey" class="ai-key-empty">未设置专用 Key，将使用智谱通用 Key</div>
            </div>
          </div>
        </div>

        <!-- ====== 图片生成 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">图片生成</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">AI生成商品主图、详情图</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">智谱AI</span>
              <span class="ai-pmodel">CogView-3-Flash / CogView-4</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div style="flex:1;min-width:0">
              <div class="ai-key-list">
                <span v-if="configs.image && configs.image.apiKey" class="ai-key-tag">
                  {{ configs.image.apiKey }}<span v-if="configs.image.customLabel" class="ai-key-label-text">[{{ configs.image.customLabel }}]</span>
                  <i class="ivu-icon ivu-icon-ios-create ai-key-edit-icon" @click="openEditSingleLabel('image')"></i>
                  <i class="ivu-icon ivu-icon-ios-close ai-key-del-icon" @click="deleteImageKey()"></i>
                </span>
                <i-button type="primary" size="small" @click="openSingleKeyModal('image')"><icon type="md-add" style="margin-right:2px"></icon>{{ (configs.image && configs.image.apiKey) ? '替换' : '设置' }} Key</i-button>
              </div>
              <div v-if="!configs.image || !configs.image.apiKey" class="ai-key-empty">未设置专用 Key，将使用智谱通用 Key</div>
            </div>
          </div>
        </div>

        <!-- ====== 图床配置 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">图床配置</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">拼图/编辑器复制图片地址使用</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap">
            <div class="ai-provider-info">
              <span class="ai-pname">ImgBB</span>
              <span class="ai-pmodel">api.imgbb.com</span>
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
        </div>

        <!-- ====== ComfyUI Inpaint 配置 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">ComfyUI Inpaint</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">AI消除修复后端（去中文/手动涂抹消除）</span>
            <span v-if="comfyuiStatus.online" style="margin-left:auto;font-size:12px;color:#4caf50;font-weight:600">● 在线</span>
            <span v-else-if="comfyuiUrl" style="margin-left:auto;font-size:12px;color:#ff9800;font-weight:600">● 离线</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <span style="width:100px;flex-shrink:0;color:var(--text-secondary);font-size:13px">服务地址</span>
              <i-input v-model="comfyuiUrl" size="small" placeholder="https://comfyui.example.com" style="flex:1"></i-input>
            </div>
            <div style="margin-left:110px">
              <i-button type="primary" size="small" :loading="comfyuiStatus.loading" @click="saveComfyui()">保存</i-button>
            </div>
          </div>
        </div>

        <!-- ====== 通义千问 VL（图片识别）====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">通义千问 VL（图片识别）</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">商品图片AI识别分析</span>
            <span v-if="qwenVlStatus.configured" style="margin-left:auto;font-size:12px;color:#4caf50;font-weight:600">● 已配置</span>
            <span v-else style="margin-left:auto;font-size:12px;color:#ff9800;font-weight:600">● 未配置</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <span style="width:100px;flex-shrink:0;color:var(--text-secondary);font-size:13px">API Key</span>
              <i-input v-model="qwenVlKey" size="small" :placeholder="qwenVlStatus.masked || 'sk-...'" style="flex:1"></i-input>
            </div>
            <div style="margin-left:110px;display:flex;gap:8px">
              <i-button type="primary" size="small" :loading="qwenVlSaving" @click="saveQwenVl()">保存</i-button>
              <i-button v-if="qwenVlStatus.configured" size="small" @click="deleteQwenVl()">清除</i-button>
              <a href="https://bailian.console.aliyun.com/" target="blank" style="font-size:12px;color:var(--accent);align-self:center">免费申请</a>
            </div>
            <div v-if="qwenVlStatus.isDefault" style="margin-left:110px;font-size:11px;color:var(--text-muted)">当前使用脚本内置默认Key</div>
          </div>
        </div>

        <!-- ====== Turso 连接配置 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">Turso 连接配置</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">云端数据库，多设备同步知识库和商品数据</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <span style="width:100px;flex-shrink:0;color:var(--text-secondary);font-size:13px">Database URL</span>
              <i-input v-model="tursoUrl" size="small" :disabled="tursoStatus.config && !tursoEditing" placeholder="libsql://your-db-name.turso.io" style="flex:1"></i-input>
            </div>
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <span style="width:100px;flex-shrink:0;color:var(--text-secondary);font-size:13px">Auth Token</span>
              <i-input v-model="tursoToken" type="password" password size="small" :disabled="tursoStatus.config && !tursoEditing" placeholder="eyJ..." style="flex:1"></i-input>
            </div>
            <div style="display:flex;gap:8px;margin-left:110px">
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

        <!-- 说明 -->
        <div style="margin-top:12px;padding:10px 14px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius);font-size:12px;color:var(--text-muted);line-height:1.8">
          <icon type="ios-information-circle" style="margin-right:4px"></icon>
          智谱AI：<a href="https://open.bigmodel.cn" target="_blank" style="color:var(--accent)">open.bigmodel.cn</a> &nbsp;|&nbsp;
          通义千问：<a href="https://dashscope.console.aliyun.com" target="_blank" style="color:var(--accent)">DashScope 控制台</a> &nbsp;|&nbsp;
          腾讯混元：<a href="https://console.cloud.tencent.com/cam/capi" target="_blank" style="color:var(--accent)">API密钥管理</a>
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
            <!-- 智谱/通义千问 添加 -->
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
            <!-- 智谱/通义千问 编辑备注 -->
            <template v-if="(keyModal.provider === 'zhipu' || keyModal.provider === 'qwen') && keyModal.mode === 'edit'">
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给 Key 加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <!-- 混元 添加 -->
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
            <!-- 混元 编辑备注 -->
            <template v-if="keyModal.provider === 'hunyuan' && keyModal.mode === 'edit'">
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给账号加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <!-- 单 Key 编辑备注（vision/image/imgbb）-->
            <template v-if="(keyModal.provider === 'vision' || keyModal.provider === 'image' || keyModal.provider === 'imgbb') && keyModal.mode === 'edit'">
              <div>
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">备注</span>
                <i-input v-model="keyModal.label" size="small" placeholder="给 Key 加个备注方便区分" style="width:100%" @on-enter="saveModal"></i-input>
              </div>
            </template>
            <!-- 单 Key（vision/image/imgbb）-->
            <template v-if="keyModal.mode === 'single'">
              <div style="margin-bottom:12px">
                <span style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:6px">{{ keyModal.provider === 'imgbb' ? 'ImgBB API Key' : 'API Key' }}</span>
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
