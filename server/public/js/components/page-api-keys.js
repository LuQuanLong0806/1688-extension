// AI模型配置页面
Vue.component('page-api-keys', {
  data: function () {
    return {
      loading: false,
      saving: null,
      configs: {},
      // 每个配置的编辑状态
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
          vm.configs = data;
          vm.initEditData();
          vm.loading = false;
        })
        .catch(function () { vm.loading = false; });
    },
    initEditData: function () {
      var vm = this;
      vm.editData = {};
      var cases = ['category', 'vision', 'image'];
      cases.forEach(function (uc) {
        var c = vm.configs[uc] || {};
        vm.$set(vm.editData, uc, {
          model: c.model || '',
          apiKey: ''
        });
      });
    },
    saveConfig: function (uc) {
      var vm = this;
      var edit = vm.editData[uc];
      if (!edit.model) {
        vm.$Message.warning('请选择模型');
        return;
      }
      vm.saving = uc;
      var body = {};
      body[uc] = { model: edit.model };
      if (edit.apiKey && edit.apiKey.trim()) {
        body[uc].apiKey = edit.apiKey.trim();
      }
      fetch('/api/ai/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (r) { return r.json(); })
        .then(function (result) {
          if (result.ok) {
            vm.$Message.success((vm.configs[uc] && vm.configs[uc].label || uc) + '配置已保存');
            vm.editData[uc].apiKey = '';
            vm.loadConfigs();
          } else {
            vm.$Message.error(result.error || '保存失败');
          }
          vm.saving = null;
        })
        .catch(function () {
          vm.$Message.error('保存失败');
          vm.saving = null;
        });
    },
    getStatusTag: function (uc) {
      var c = this.configs[uc];
      if (!c) return { text: '未配置', color: '#ed4014' };
      if (c.configured) return { text: '已配置', color: '#19be6b' };
      return { text: '缺少Key', color: '#ff9900' };
    }
  },
  template: `
    <div class="list-card" style="max-width:800px">
      <div style="margin-bottom:20px">
        <h3 style="margin:0 0 6px;font-size:16px;color:#333">AI模型配置</h3>
        <p style="margin:0;font-size:13px;color:#999">为每个AI功能单独配置模型和API Key。每个用途可使用不同的模型和密钥。</p>
      </div>

      <div v-if="loading" style="text-align:center;padding:40px;color:#999">加载中...</div>

      <template v-else>
        <div v-for="(meta, uc) in { category: configs.category, vision: configs.vision, image: configs.image }" :key="uc"
          style="border:1px solid #e8e8e8;border-radius:8px;padding:20px;margin-bottom:16px;background:#fafafa">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div>
              <span style="font-size:15px;font-weight:600;color:#333">{{ meta && meta.label || uc }}</span>
              <span :style="{ marginLeft:'10px', fontSize:'12px', padding:'2px 8px', borderRadius:'10px', color:'#fff', background: getStatusTag(uc).color }">
                {{ getStatusTag(uc).text }}
              </span>
            </div>
          </div>

          <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:0 0 220px">
              <div style="font-size:12px;color:#666;margin-bottom:4px">AI模型</div>
              <i-select v-model="editData[uc].model" style="width:220px" placeholder="选择模型">
                <i-option v-for="m in (meta && meta.models || [])" :key="m.id" :value="m.id">{{ m.name }}</i-option>
              </i-select>
            </div>
            <div style="flex:1;min-width:200px">
              <div style="font-size:12px;color:#666;margin-bottom:4px">
                API Key
                <span v-if="meta && meta.apiKey" style="color:#999;margin-left:4px">当前: {{ meta.apiKey }}</span>
                <span v-else style="color:#ed4014;margin-left:4px">未设置</span>
              </div>
              <i-input v-model="editData[uc].apiKey" type="password" password
                :placeholder="(meta && meta.apiKey) ? '留空保持不变，输入新Key则覆盖' : '请输入API Key'"
                style="width:100%"></i-input>
            </div>
            <i-button type="primary" :loading="saving === uc" @click="saveConfig(uc)"
              style="flex:0 0 auto">保存</i-button>
          </div>
        </div>

        <div style="border-top:1px solid #e8e8e8;padding-top:16px;margin-top:8px">
          <p style="font-size:13px;color:#999;margin:0 0 6px">
            <icon type="ios-information-circle" style="margin-right:4px"></icon>
            优先使用各功能的独立配置。如未设置独立Key，将回退使用全局Key。
          </p>
        </div>
      </template>
    </div>`
});
