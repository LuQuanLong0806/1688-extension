// AI模型配置页面
Vue.component('page-api-keys', {
  data: function () {
    return {
      loading: false,
      saving: null,
      configs: {},
      providers: {},
      editData: {},
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
          vm.initEditData();
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    initEditData: function () {
      this.editData = {
        zhipu: '',
        qwen: '',
        hunyuan_secretId: '',
        hunyuan_secretKey: '',
        ollama_model: (this.providers.ollama && this.providers.ollama.model) || 'qwen3:8b',
        ollama_port: (this.providers.ollama && this.providers.ollama.port) || '11434',
        vision_apiKey: '',
        image_apiKey: ''
      };
    },
    masked: function (key) { return key || ''; },
    saveZhipu: function () {
      var vm = this;
      var key = (vm.editData.zhipu || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'zhipu';
      fetch('/api/ai/global-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) { vm.$Message.success('智谱 API Key 已保存'); vm.editData.zhipu = ''; vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    saveQwen: function () {
      var vm = this;
      var key = (vm.editData.qwen || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'qwen';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { qwen: { apiKey: key } } })
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) { vm.$Message.success('通义千问 Key 已保存'); vm.editData.qwen = ''; vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    saveHunyuan: function () {
      var vm = this;
      var sid = (vm.editData.hunyuan_secretId || '').trim();
      var skey = (vm.editData.hunyuan_secretKey || '').trim();
      if (!sid || !skey) { vm.$Message.warning('请输入 SecretId 和 SecretKey'); return; }
      vm.saving = 'hunyuan';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { hunyuan: { secretId: sid, secretKey: skey } } })
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) { vm.$Message.success('腾讯混元密钥已保存'); vm.editData.hunyuan_secretId = ''; vm.editData.hunyuan_secretKey = ''; vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    saveOllama: function () {
      var vm = this;
      var model = (vm.editData.ollama_model || '').trim() || 'qwen3:8b';
      var port = (vm.editData.ollama_port || '').trim() || '11434';
      vm.saving = 'ollama';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providers: { ollama: { model: model, port: port } } })
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) { vm.$Message.success('本地模型配置已保存'); vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
    saveVisionKey: function () {
      var vm = this;
      var key = (vm.editData.vision_apiKey || '').trim();
      if (!key) { vm.$Message.warning('请输入API Key'); return; }
      vm.saving = 'vision';
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vision: { model: 'glm-4v-flash', apiKey: key } })
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) { vm.$Message.success('智能检测 Key 已保存'); vm.editData.vision_apiKey = ''; vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
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
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) { vm.$Message.success('图片生成 Key 已保存'); vm.editData.image_apiKey = ''; vm.loadConfigs(); }
          else vm.$Message.error(result.error || '保存失败');
          vm.saving = null;
        })
        .catch(function () { vm.$Message.error('保存失败'); vm.saving = null; });
    },
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
      vm.saving = 'imgbb';
      fetch('/api/ai/smms-token-delete', { method: 'POST' })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { vm.$Message.success('ImgBB API Key 已删除'); vm.loadImgbb(); }
          vm.saving = null;
        }).catch(function () { vm.$Message.error('删除失败'); vm.saving = null; });
    },
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
    }
  },
  template: `
    <div style="padding:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <div>
          <h3 style="margin:0 0 6px;font-size:18px;color:var(--text-primary)">AI模型配置</h3>
          <p style="margin:0;font-size:13px;color:var(--text-muted)">配置各AI功能的模型和密钥，限流时自动切换备用</p>
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
            <span style="font-size:12px;color:var(--text-muted);margin-left:8px">智谱 → 通义千问 → 腾讯混元 自动切换</span>
          </div>

          <!-- 智谱 -->
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">智谱AI</span>
              <span class="ai-pmodel">GLM-4.7-Flash / GLM-4-Flash</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div class="ai-provider-action">
              <span v-if="configs._global && configs._global.apiKey" class="ai-key-hint">{{ configs._global.apiKey }}</span>
              <span v-else class="ai-key-hint none">未设置</span>
              <i-input v-model="editData.zhipu" type="password" password size="small"
                :placeholder="(configs._global && configs._global.apiKey) ? '输入新Key覆盖' : '请输入API Key'"
                style="width:220px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'zhipu'" @click="saveZhipu()">保存</i-button>
            </div>
          </div>

          <!-- 通义千问 -->
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">通义千问</span>
              <span class="ai-pmodel">qwen-turbo</span>
              <span class="ai-pfree">免费</span>
            </div>
            <div class="ai-provider-action">
              <span v-if="providers.qwen && providers.qwen.apiKey" class="ai-key-hint">{{ providers.qwen.apiKey }}</span>
              <span v-else class="ai-key-hint none">未设置</span>
              <i-input v-model="editData.qwen" type="password" password size="small"
                :placeholder="(providers.qwen && providers.qwen.apiKey) ? '输入新Key覆盖' : '请输入 DashScope API Key'"
                style="width:220px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'qwen'" @click="saveQwen()">保存</i-button>
            </div>
          </div>

          <!-- 腾讯混元 -->
          <div class="ai-provider-row">
            <div class="ai-provider-info">
              <span class="ai-pname">腾讯混元</span>
              <span class="ai-pmodel">hunyuan-lite</span>
              <span class="ai-pfree">永久免费</span>
            </div>
            <div class="ai-provider-action">
              <span v-if="providers.hunyuan && providers.hunyuan.secretId" class="ai-key-hint">{{ providers.hunyuan.secretId }}</span>
              <span v-else class="ai-key-hint none">未设置</span>
              <i-input v-model="editData.hunyuan_secretId" size="small" placeholder="SecretId" style="width:130px"></i-input>
              <i-input v-model="editData.hunyuan_secretKey" type="password" password size="small" placeholder="SecretKey" style="width:130px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'hunyuan'" @click="saveHunyuan()">保存</i-button>
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
              <span v-if="configs.vision && configs.vision.apiKey" class="ai-key-hint">{{ configs.vision.apiKey }}</span>
              <span v-else class="ai-key-hint none">未设置</span>
              <i-input v-model="editData.vision_apiKey" type="password" password size="small"
                :placeholder="(configs.vision && configs.vision.apiKey) ? '输入新Key覆盖' : '请输入API Key'"
                style="width:220px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'vision'" @click="saveVisionKey()">保存</i-button>
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
              <span v-if="configs.image && configs.image.apiKey" class="ai-key-hint">{{ configs.image.apiKey }}</span>
              <span v-else class="ai-key-hint none">未设置</span>
              <i-input v-model="editData.image_apiKey" type="password" password size="small"
                :placeholder="(configs.image && configs.image.apiKey) ? '输入新Key覆盖' : '请输入API Key'"
                style="width:220px"></i-input>
              <i-button type="primary" size="small" :loading="saving === 'image'" @click="saveImageKey()">保存</i-button>
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
            <span v-else-if="tursoStatus.config" style="font-size:12px;color:#ff9900;margin-left:8px">已配置（未连接）</span>
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
