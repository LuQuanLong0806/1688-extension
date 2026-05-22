// AI模型配置页面
Vue.component('page-api-keys', {
  data: function () {
    return {
      loading: false,
      saving: null,
      configs: {},
      providers: {},
      editData: {}
    };
  },
  mounted: function () {
    this.loadConfigs();
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
    }
  },
  template: `
    <div class="list-card" style="padding:24px">
      <div style="margin-bottom:24px">
        <h3 style="margin:0 0 6px;font-size:18px;color:#333">AI模型配置</h3>
        <p style="margin:0;font-size:13px;color:#808695">配置各AI功能的模型和密钥，限流时自动切换备用</p>
      </div>

      <div v-if="loading" style="text-align:center;padding:40px;color:#999">加载中...</div>

      <template v-else>

        <!-- ====== 分类推荐 ====== -->
        <div class="ai-module">
          <div class="ai-module-header">
            <span class="ai-module-title">分类推荐</span>
            <span style="font-size:12px;color:#aaa;margin-left:8px">智谱 → 通义千问 → 腾讯混元 自动切换</span>
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
              <span class="ai-pfree" style="background:#e8f0ff;color:#2d8cf0">断网可用</span>
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

        <!-- 说明 -->
        <div style="margin-top:12px;padding:10px 14px;background:#f8f8f8;border-radius:6px;font-size:12px;color:#999;line-height:1.8">
          <icon type="ios-information-circle" style="margin-right:4px"></icon>
          智谱AI：<a href="https://open.bigmodel.cn" target="_blank" style="color:#2d8cf0">open.bigmodel.cn</a> &nbsp;|&nbsp;
          通义千问：<a href="https://dashscope.console.aliyun.com" target="_blank" style="color:#2d8cf0">DashScope 控制台</a> &nbsp;|&nbsp;
          腾讯混元：<a href="https://console.cloud.tencent.com/cam/capi" target="_blank" style="color:#2d8cf0">API密钥管理</a>
        </div>
      </template>
    </div>`
});
