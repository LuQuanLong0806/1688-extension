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
        ollama_port: '11434',
        vision_apiKey: '',
        image_apiKey: '',
        zhipu: '',
        qwen: '',
        hunyuan_sid: '',
        hunyuan_skey: ''
      },
      imgbbStatus: { configured: false, masked: '' },
      imgbbKey: '',
      tursoUrl: '',
      tursoToken: '',
      tursoStatus: { connected: false, config: false },
      tursoSaving: false
    };
  },
  mounted: function () {
    this.loadConfigs();
    this.loadImgbb();
    this.loadTurso();
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
          vm.editData.zhipu = '';
          vm.editData.qwen = '';
          vm.editData.hunyuan_sid = '';
          vm.editData.hunyuan_skey = '';
          vm.editData.vision_apiKey = '';
          vm.editData.image_apiKey = '';
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    // 智谱 key 管理
    addZhipuKey: function () {
      var vm = this;
      var key = (vm.editData.zhipu || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'zhipu';
      fetch('/api/ai/zhipu-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', key: key })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { vm.$Message.success('已添加，共 ' + d.count + ' 个Key'); vm.editData.zhipu = ''; vm.loadConfigs(); }
        else vm.$Message.error(d.error || '添加失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('添加失败'); vm.saving = null; });
    },
    deleteZhipuKey: function (idx) {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个智谱 Key 吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          vm.saving = 'zhipu';
          fetch('/api/ai/zhipu-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', index: idx })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
            else vm.$Message.error(d.error || '删除失败');
            vm.saving = null;
          }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
        }
      });
    },
    // 通义千问 key 管理
    addQwenKey: function () {
      var vm = this;
      var key = (vm.editData.qwen || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'qwen';
      fetch('/api/ai/qwen-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', key: key })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { vm.$Message.success('已添加，共 ' + d.count + ' 个Key'); vm.editData.qwen = ''; vm.loadConfigs(); }
        else vm.$Message.error(d.error || '添加失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('添加失败'); vm.saving = null; });
    },
    deleteQwenKey: function (idx) {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个通义千问 Key 吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          vm.saving = 'qwen';
          fetch('/api/ai/qwen-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', index: idx })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
            else vm.$Message.error(d.error || '删除失败');
            vm.saving = null;
          }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
        }
      });
    },
    // 混元账号管理
    addHunyuanAccount: function () {
      var vm = this;
      var sid = (vm.editData.hunyuan_sid || '').trim();
      var skey = (vm.editData.hunyuan_skey || '').trim();
      if (!sid || !skey) { vm.$Message.warning('请输入 SecretId 和 SecretKey'); return; }
      vm.saving = 'hunyuan';
      fetch('/api/ai/hunyuan-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', secretId: sid, secretKey: skey })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { vm.$Message.success('已添加，共 ' + d.count + ' 个账号'); vm.editData.hunyuan_sid = ''; vm.editData.hunyuan_skey = ''; vm.loadConfigs(); }
        else vm.$Message.error(d.error || '添加失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('添加失败'); vm.saving = null; });
    },
    deleteHunyuanAccount: function (idx) {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除这个混元账号吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          vm.saving = 'hunyuan';
          fetch('/api/ai/hunyuan-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', index: idx })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.ok) { vm.$Message.success('已删除'); vm.loadConfigs(); }
            else vm.$Message.error(d.error || '删除失败');
            vm.saving = null;
          }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
        }
      });
    },
    // Ollama
    saveOllama: function () {
      var vm = this;
      var model = (vm.editData.ollama_model || '').trim() || 'qwen3:8b';
      var port = (vm.editData.ollama_port || '').trim() || '11434';
      vm.saving = 'ollama';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { ollama: { model: model, port: port } } })
      }).then(function (r) { return r.json(); }).then(function (result) {
        if (result.ok) { vm.$Message.success('本地模型配置已保存'); vm.loadConfigs(); }
        else vm.$Message.error(result.error || '保存失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    // 智能检测 / 图片生成（单 key）
    saveVisionKey: function () {
      var vm = this;
      var key = (vm.editData.vision_apiKey || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'vision';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vision: { model: 'glm-4v-flash', apiKey: key } })
      }).then(function (r) { return r.json(); }).then(function (result) {
        if (result.ok) { vm.$Message.success('智能检测 Key 已保存'); vm.editData.vision_apiKey = ''; vm.loadConfigs(); }
        else vm.$Message.error(result.error || '保存失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    deleteVisionKey: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除智能检测的专用 Key 吗？删除后将使用智谱通用 Key。', okText: '删除', cancelText: '取消',
        onOk: function () {
          vm.saving = 'vision';
          fetch('/api/ai/configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vision: { model: 'glm-4v-flash', apiKey: '' } })
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result.ok) { vm.$Message.success('已删除，将使用智谱通用 Key'); vm.loadConfigs(); }
            vm.saving = null;
          }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
        }
      });
    },
    saveImageKey: function () {
      var vm = this;
      var key = (vm.editData.image_apiKey || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'image';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { model: 'cogview-3-flash', apiKey: key } })
      }).then(function (r) { return r.json(); }).then(function (result) {
        if (result.ok) { vm.$Message.success('图片生成 Key 已保存'); vm.editData.image_apiKey = ''; vm.loadConfigs(); }
        else vm.$Message.error(result.error || '保存失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    deleteImageKey: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除图片生成的专用 Key 吗？删除后将使用智谱通用 Key。', okText: '删除', cancelText: '取消',
        onOk: function () {
          vm.saving = 'image';
          fetch('/api/ai/configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: { model: 'cogview-3-flash', apiKey: '' } })
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result.ok) { vm.$Message.success('已删除，将使用智谱通用 Key'); vm.loadConfigs(); }
            vm.saving = null;
          }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
        }
      });
    },
    // ImgBB
    loadImgbb: function () {
      var vm = this;
      fetch('/api/ai/smms-token').then(function (r) { return r.json(); }).then(function (d) {
        vm.imgbbStatus = { configured: !!d.configured, masked: d.masked || '' };
      }).catch(function () {});
    },
    saveImgbb: function () {
      var vm = this;
      var key = (vm.imgbbKey || '').trim();
      if (!key) { vm.$Message.warning('请输入 ImgBB API Key'); return; }
      vm.saving = 'imgbb';
      fetch('/api/ai/smms-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: key })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { vm.$Message.success('ImgBB API Key 已保存'); vm.imgbbKey = ''; vm.loadImgbb(); }
        else vm.$Message.error(d.error || '保存失败');
        vm.saving = null;
      }).catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    deleteImgbb: function () {
      var vm = this;
      vm.$Modal.confirm({ title: '确认删除', content: '确定要删除 ImgBB API Key 吗？', okText: '删除', cancelText: '取消',
        onOk: function () {
          vm.saving = 'imgbb';
          fetch('/api/ai/smms-token-delete', { method: 'POST' })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.ok) { vm.$Message.success('ImgBB API Key 已删除'); vm.loadImgbb(); }
              vm.saving = null;
            }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
        }
      });
    },
    // Turso
    loadTurso: function () {
      var vm = this;
      fetch('/api/sync/config').then(function (r) { return r.json(); }).then(function (data) {
        vm.tursoUrl = data.url || '';
        vm.tursoToken = data.token || '';
        vm.tursoStatus = { connected: data.status ? data.status.connected : false, config: data.configured };
      }).catch(function () {});
    },
    saveTurso: function () {
      var vm = this;
      var url = (vm.tursoUrl || '').trim();
      var token = (vm.tursoToken || '').trim();
      if (!url || !token) { vm.$Message.warning('请填写 URL 和 Token'); return; }
      vm.tursoSaving = true;
      fetch('/api/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, token: token })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data.ok) { vm.$Message.success(data.message); vm.loadTurso(); }
        else vm.$Message.error(data.message || '连接失败');
        vm.tursoSaving = false;
      }).catch(function () { vm.$Message.error('保存失败'); vm.tursoSaving = false; });
    },
    testTurso: function () {
      var vm = this;
      vm.tursoSaving = true;
      fetch('/api/sync/test', { method: 'POST' })
        .then(function (r) { return r.json(); }).then(function (data) {
          if (data.ok) vm.$Message.success('连接成功');
          else vm.$Message.error(data.message || '连接失败');
          vm.loadTurso();
          vm.tursoSaving = false;
        }).catch(function () { vm.$Message.error('测试失败'); vm.tursoSaving = false; });
    },
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
                if (res.ok) vm.$Message.success('导入成功，共 ' + res.imported + ' 项');
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
              <div class="ai-key-list" v-if="configs._global && configs._global.keys && configs._global.keys.length">
                <span class="ai-key-count">共 {{ configs._global.keys.length }} 个Key</span>
                <span v-for="(k, i) in configs._global.keys" :key="'z'+i" class="ai-key-tag">
                  {{ k }}
                  <i class="ivu-icon ivu-icon-ios-close" style="cursor:pointer;margin-left:2px" @click="deleteZhipuKey(i)"></i>
                </span>
              </div>
              <div v-else class="ai-key-empty">未设置</div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <i-input v-model="editData.zhipu" type="password" password size="small" placeholder="输入新 Key，回车添加" style="width:240px" @on-enter="addZhipuKey()"></i-input>
                <i-button type="primary" size="small" :loading="saving === 'zhipu'" @click="addZhipuKey()">添加</i-button>
              </div>
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
              <div class="ai-key-list" v-if="providers.qwen && providers.qwen.keys && providers.qwen.keys.length">
                <span class="ai-key-count">共 {{ providers.qwen.keys.length }} 个Key</span>
                <span v-for="(k, i) in providers.qwen.keys" :key="'q'+i" class="ai-key-tag">
                  {{ k }}
                  <i class="ivu-icon ivu-icon-ios-close" style="cursor:pointer;margin-left:2px" @click="deleteQwenKey(i)"></i>
                </span>
              </div>
              <div v-else class="ai-key-empty">未设置</div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <i-input v-model="editData.qwen" type="password" password size="small" placeholder="输入新 Key，回车添加" style="width:240px" @on-enter="addQwenKey()"></i-input>
                <i-button type="primary" size="small" :loading="saving === 'qwen'" @click="addQwenKey()">添加</i-button>
              </div>
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
              <div class="ai-key-list" v-if="providers.hunyuan && providers.hunyuan.accounts && providers.hunyuan.accounts.length">
                <span class="ai-key-count">共 {{ providers.hunyuan.accounts.length }} 个账号</span>
                <span v-for="(a, i) in providers.hunyuan.accounts" :key="'h'+i" class="ai-key-tag">
                  {{ a.secretId }}
                  <i class="ivu-icon ivu-icon-ios-close" style="cursor:pointer;margin-left:2px" @click="deleteHunyuanAccount(i)"></i>
                </span>
              </div>
              <div v-else class="ai-key-empty">未设置</div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <i-input v-model="editData.hunyuan_sid" size="small" placeholder="SecretId" style="width:150px"></i-input>
                <i-input v-model="editData.hunyuan_skey" type="password" password size="small" placeholder="SecretKey" style="width:150px"></i-input>
                <i-button type="primary" size="small" :loading="saving === 'hunyuan'" @click="addHunyuanAccount()">添加</i-button>
              </div>
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
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">智谱AI</span>
              <span class="ai-pmodel">GLM-4V-Flash</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div class="ai-provider-action">
              <span v-if="configs.vision && configs.vision.apiKey" class="ai-key-hint">专用Key: {{ configs.vision.apiKey }}</span>
              <span v-else class="ai-key-hint none">使用分类推荐中的智谱通用Key</span>
              <i-input v-model="editData.vision_apiKey" type="password" password size="small"
                :placeholder="(configs.vision && configs.vision.apiKey) ? '输入新Key覆盖' : '留空使用通用Key'"
                style="width:200px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'vision'" @click="saveVisionKey()">保存</i-button>
              <i-button v-if="configs.vision && configs.vision.apiKey" size="small" @click="deleteVisionKey()">删除</i-button>
            </div>
          </div>
        </div>

        <!-- ====== 图片生成 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">图片生成</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">AI生成商品主图、详情图</span>
          </div>
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">智谱AI</span>
              <span class="ai-pmodel">CogView-3-Flash / CogView-4</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div class="ai-provider-action">
              <span v-if="configs.image && configs.image.apiKey" class="ai-key-hint">专用Key: {{ configs.image.apiKey }}</span>
              <span v-else class="ai-key-hint none">使用分类推荐中的智谱通用Key</span>
              <i-input v-model="editData.image_apiKey" type="password" password size="small"
                :placeholder="(configs.image && configs.image.apiKey) ? '输入新Key覆盖' : '留空使用通用Key'"
                style="width:200px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'image'" @click="saveImageKey()">保存</i-button>
              <i-button v-if="configs.image && configs.image.apiKey" size="small" @click="deleteImageKey()">删除</i-button>
            </div>
          </div>
        </div>

        <!-- ====== 图床配置 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">图床配置</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">拼图/编辑器复制图片地址使用</span>
          </div>
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">ImgBB</span>
              <span class="ai-pmodel">api.imgbb.com</span>
              <a href="https://api.imgbb.com/" target="_blank" style="font-size:11px;color:var(--accent)">免费申请</a>
            </div>
            <div class="ai-provider-action">
              <span v-if="imgbbStatus.configured" class="ai-key-hint">{{ imgbbStatus.masked }}</span>
              <span v-else class="ai-key-hint none">未设置</span>
              <i-input v-model="imgbbKey" type="password" password size="small"
                :placeholder="imgbbStatus.configured ? '输入新Key覆盖' : '请输入 API Key'"
                style="width:220px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'imgbb'" @click="saveImgbb()">保存</i-button>
              <i-button v-if="imgbbStatus.configured" size="small" :loading="saving === 'imgbb'" @click="deleteImgbb()">删除</i-button>
            </div>
          </div>
        </div>

        <!-- ====== Turso 连接配置 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">Turso 连接配置</span>
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">云端数据库，多设备同步知识库和商品数据</span>
            <span v-if="tursoStatus.connected" style="font-size:12px;color:var(--success);margin-left:8px">已连接</span>
            <span v-else-if="tursoStatus.config" style="font-size:12px;color:var(--accent);margin-left:8px">已配置（未连接）</span>
            <span v-else style="font-size:12px;color:var(--text-muted);margin-left:8px">未配置</span>
          </div>
          <div class="ai-provider-row" style="flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <span style="width:100px;flex-shrink:0;color:var(--text-secondary);font-size:13px">Database URL</span>
              <i-input v-model="tursoUrl" size="small" placeholder="libsql://your-db-name.turso.io" style="flex:1"></i-input>
            </div>
            <div style="display:flex;gap:10px;align-items:center;width:100%">
              <span style="width:100px;flex-shrink:0;color:var(--text-secondary);font-size:13px">Auth Token</span>
              <i-input v-model="tursoToken" type="password" password size="small" placeholder="eyJ..." style="flex:1"></i-input>
            </div>
            <div style="display:flex;gap:8px;margin-left:110px">
              <i-button type="primary" size="small" :loading="tursoSaving" @click="saveTurso()">保存并连接</i-button>
              <i-button size="small" :loading="tursoSaving" @click="testTurso()">测试连接</i-button>
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
    </div>`
});
