Vue.component('page-users', {
  data: function () {
    return {
      loading: false,
      users: [],
      showModal: false,
      modalTitle: '创建用户',
      editingId: null,
      form: { username: '', password: '', display_name: '', role: 'operator' },
      saving: false,
      columns: [
        { title: 'ID', key: 'id', width: 60 },
        { title: '用户名', key: 'username', minWidth: 100 },
        { title: '昵称', key: 'display_name', minWidth: 100 },
        { title: '角色', key: 'role', width: 100, render: function (h, params) {
          var map = { admin: '管理员', operator: '操作员', viewer: '只读' };
          var colorMap = { admin: '#ff6a00', operator: '#36b37e', viewer: '#9ea3b0' };
          return h('span', { style: { color: colorMap[params.row.role] || '#555', fontWeight: '500' } }, map[params.row.role] || params.row.role);
        }},
        { title: '最后登录', key: 'last_login', width: 160, render: function (h, params) {
          return h('span', params.row.last_login || '-');
        }},
        { title: '状态', key: 'disabled', width: 80, render: function (h, params) {
          return h('span', { style: { color: params.row.disabled ? '#ff4d4f' : '#36b37e' } }, params.row.disabled ? '已禁用' : '正常');
        }},
        { title: '操作', width: 180, align: 'center', render: function (h, params) {
          var vm = this;
          var btns = [];
          btns.push(h('i-button', { props: { size: 'small', type: 'primary' }, style: { marginRight: '4px' }, on: { click: function () { vm.$parent.editUser(params.row); } } }, '编辑'));
          if (!params.row.disabled) {
            btns.push(h('i-button', { props: { size: 'small', type: 'error' }, on: { click: function () { vm.$parent.disableUser(params.row); } } }, '禁用'));
          }
          return h('div', btns);
        }}
      ]
    };
  },
  mounted: function () {
    this.loadUsers();
  },
  methods: {
    loadUsers: function () {
      var vm = this;
      vm.loading = true;
      apiFetch('/api/users').then(function (r) { return r.json(); })
        .then(function (d) { vm.users = d; vm.loading = false; })
        .catch(function () { vm.loading = false; });
    },
    openCreate: function () {
      this.modalTitle = '创建用户';
      this.editingId = null;
      this.form = { username: '', password: '', display_name: '', role: 'operator' };
      this.showModal = true;
    },
    editUser: function (row) {
      this.modalTitle = '编辑用户';
      this.editingId = row.id;
      this.form = { username: row.username, password: '', display_name: row.display_name || '', role: row.role };
      this.showModal = true;
    },
    saveUser: function () {
      var vm = this;
      if (!vm.form.username) { vm.$Message.warning('请输入用户名'); return; }
      vm.saving = true;
      if (vm.editingId) {
        var body = { display_name: vm.form.display_name, role: vm.form.role };
        if (vm.form.password) body.password = vm.form.password;
        apiFetch('/api/users/' + vm.editingId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json(); })
          .then(function (d) {
            vm.saving = false;
            if (d.error) { vm.$Message.error(d.error); return; }
            vm.showModal = false;
            vm.loadUsers();
            vm.$Message.success('用户已更新');
          }).catch(function () { vm.saving = false; });
      } else {
        if (!vm.form.password || vm.form.password.length < 6) { vm.$Message.warning('密码至少6个字符'); vm.saving = false; return; }
        apiFetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vm.form)
        }).then(function (r) { return r.json(); })
          .then(function (d) {
            vm.saving = false;
            if (d.error) { vm.$Message.error(d.error); return; }
            vm.showModal = false;
            vm.loadUsers();
            vm.$Message.success('用户已创建');
          }).catch(function () { vm.saving = false; });
      }
    },
    disableUser: function (row) {
      var vm = this;
      vm.$Modal.confirm({
        title: '确认禁用',
        content: '确定要禁用用户 "' + row.username + '" 吗？',
        onOk: function () {
          apiFetch('/api/users/' + row.id, { method: 'DELETE' })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (d.error) { vm.$Message.error(d.error); return; }
              vm.loadUsers();
              vm.$Message.success('用户已禁用');
            });
        }
      });
    }
  },
  template: '\
    <div class="page-wrap-inner">\
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">\
        <h3 style="margin:0;color:var(--text-primary)">用户管理</h3>\
        <i-button type="primary" @click="openCreate">创建用户</i-button>\
      </div>\
      <i-table :columns="columns" :data="users" :loading="loading" stripe border size="small"></i-table>\
      <modal v-model="showModal" :title="modalTitle" :mask-closable="false" width="420">\
        <div v-if="!editingId" style="margin-bottom:12px;">\
          <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:4px;">用户名</label>\
          <i-input v-model="form.username" placeholder="请输入用户名"></i-input>\
        </div>\
        <div style="margin-bottom:12px;">\
          <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:4px;">{{ editingId ? "新密码（留空不修改）" : "密码" }}</label>\
          <i-input v-model="form.password" type="password" :placeholder="editingId ? \'留空不修改\' : \'请输入密码（至少6位）\'"></i-input>\
        </div>\
        <div style="margin-bottom:12px;">\
          <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:4px;">昵称</label>\
          <i-input v-model="form.display_name" placeholder="请输入昵称"></i-input>\
        </div>\
        <div style="margin-bottom:12px;">\
          <label style="display:block;font-size:13px;color:var(--text-secondary);margin-bottom:4px;">角色</label>\
          <i-select v-model="form.role">\
            <i-option value="admin">管理员</i-option>\
            <i-option value="operator">操作员</i-option>\
            <i-option value="viewer">只读</i-option>\
          </i-select>\
        </div>\
        <div slot="footer">\
          <i-button @click="showModal=false">取消</i-button>\
          <i-button type="primary" :loading="saving" @click="saveUser">保存</i-button>\
        </div>\
      </modal>\
    </div>'
});
