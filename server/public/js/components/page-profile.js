// 个人中心页面 — 4 卡片：个人信息 / 账户安全 / 偏好 / 我的统计
// /project-style-strict: 复用项目 CSS 变量、.user-avatar 类、iView 组件，不引入新视觉风格
Vue.component('page-profile', {
  data: function () {
    return {
      profile: {
        username: '', display_name: '', role: '',
        email: '', avatar_url: '',
        created_at: '', last_login: ''
      },
      // 头像上传
      uploadingAvatar: false,
      // 显示名/邮箱行内编辑
      editingField: '',
      editValue: '',
      savingField: false,
      // 修改密码 modal
      showPwdModal: false,
      pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
      changingPwd: false,
      // 偏好
      prefTheme: localStorage.getItem('theme') || '1688',
      // 统计
      stats: { total: 0, unused: 0, used: 0 }
    };
  },
  computed: {
    roleLabel: function () {
      return { admin: '管理员', operator: '操作员', viewer: '观察者' }[this.profile.role] || '未知';
    },
    roleClass: function () {
      return 'role-tag-' + (this.profile.role || 'viewer');
    },
    avatarLetter: function () {
      var src = this.profile.display_name || this.profile.username || '?';
      return src.charAt(0).toUpperCase();
    },
    hasAvatar: function () {
      return !!this.profile.avatar_url;
    },
    avatarDisplayUrl: function () {
      // 本地路径以 / 开头，需要相对当前 origin
      if (!this.profile.avatar_url) return '';
      if (/^https?:\/\//.test(this.profile.avatar_url)) return this.profile.avatar_url;
      return this.profile.avatar_url;
    },
    displayNameDisplay: function () {
      return this.profile.display_name || this.profile.username || '(未设置)';
    },
    emailDisplay: function () {
      return this.profile.email || '未绑定';
    },
    createdDisplay: function () {
      if (!this.profile.created_at) return '—';
      return this.profile.created_at.substring(0, 10);
    },
    lastLoginDisplay: function () {
      if (!this.profile.last_login) return '—';
      return this.profile.last_login.substring(0, 16);
    }
  },
  mounted: function () {
    this.loadProfile();
    this.loadStats();
  },
  methods: {
    loadProfile: function () {
      var vm = this;
      apiFetch('/api/me').then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.id) {
          vm.profile = {
            username: d.username || '',
            display_name: d.display_name || '',
            role: d.role || '',
            email: d.email || '',
            avatar_url: d.avatar_url || '',
            created_at: d.created_at || '',
            last_login: d.last_login || ''
          };
        }
      }).catch(function () { vm.$Message.error('加载个人信息失败'); });
    },
    loadStats: function () {
      var vm = this;
      apiFetch('/api/product/stats?scope=mine').then(function (r) { return r.json(); }).then(function (d) {
        vm.stats = {
          total: d.total || 0,
          unused: d.unused || 0,
          used: d.used || 0
        };
      }).catch(function () {});
    },

    // ===== 行内编辑 =====
    startEdit: function (field) {
      this.editingField = field;
      this.editValue = field === 'email' ? (this.profile.email || '') : (this.profile.display_name || '');
    },
    cancelEdit: function () {
      this.editingField = '';
      this.editValue = '';
    },
    saveField: function () {
      var vm = this;
      var field = this.editingField;
      if (!field) return;
      var payload = {
        display_name: field === 'display_name' ? this.editValue.trim() : this.profile.display_name,
        email: field === 'email' ? this.editValue.trim() : this.profile.email
      };
      if (field === 'display_name' && payload.display_name.length > 32) {
        this.$Message.error('显示名最多 32 字符'); return;
      }
      if (field === 'email' && payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        this.$Message.error('邮箱格式不正确'); return;
      }
      this.savingField = true;
      apiFetch('/api/me/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.savingField = false;
        if (d.ok) {
          vm.profile.display_name = d.display_name;
          vm.profile.email = d.email;
          vm.editingField = '';
          vm.$Message.success('已保存');
          // 同步顶部 header 显示
          if (vm.$root.currentUser) {
            vm.$root.currentUser.display_name = d.display_name;
          }
        } else {
          vm.$Message.error(d.error || '保存失败');
        }
      }).catch(function () {
        vm.savingField = false;
        vm.$Message.error('保存失败');
      });
    },

    // ===== 头像上传 =====
    triggerAvatarUpload: function () {
      if (this.uploadingAvatar) return;
      var input = this.$refs.avatarFileInput;
      if (input) input.click();
    },
    onAvatarFile: function (e) {
      var vm = this;
      var file = e.target.files && e.target.files[0];
      // 清空 input value 允许重复选择同一文件
      e.target.value = '';
      if (!file) return;
      if (file.size > 10485760) {
        this.$Message.error('图片不能超过 10M'); return;
      }
      if (!/^image\//.test(file.type)) {
        this.$Message.error('请选择图片文件'); return;
      }
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var max = 256;
          var w = img.width, h = img.height;
          if (w > h) { if (w > max) { h = h * max / w; w = max; } }
          else { if (h > max) { w = w * max / h; h = max; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/png');
          vm.uploadAvatar(dataUrl);
        };
        img.onerror = function () { vm.$Message.error('图片加载失败'); };
        img.src = ev.target.result;
      };
      reader.onerror = function () { vm.$Message.error('文件读取失败'); };
      reader.readAsDataURL(file);
    },
    uploadAvatar: function (dataUrl) {
      var vm = this;
      this.uploadingAvatar = true;
      apiFetch('/api/me/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: dataUrl })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.uploadingAvatar = false;
        if (d.ok) {
          vm.profile.avatar_url = d.avatar_url;
          if (vm.$root.currentUser) vm.$root.currentUser.avatar_url = d.avatar_url;
          vm.$Message.success('头像已更新');
        } else {
          vm.$Message.error(d.error || '上传失败');
        }
      }).catch(function () {
        vm.uploadingAvatar = false;
        vm.$Message.error('上传失败');
      });
    },

    // ===== 修改密码 =====
    openPwdModal: function () {
      this.pwdForm = { oldPassword: '', newPassword: '', confirmPassword: '' };
      this.showPwdModal = true;
    },
    changePassword: function () {
      var vm = this;
      var f = this.pwdForm;
      if (!f.oldPassword) { this.$Message.error('请输入旧密码'); return; }
      if (f.newPassword.length < 6) { this.$Message.error('新密码至少 6 个字符'); return; }
      if (f.newPassword !== f.confirmPassword) { this.$Message.error('两次输入的新密码不一致'); return; }
      if (f.newPassword === f.oldPassword) { this.$Message.error('新密码不能与旧密码相同'); return; }
      this.changingPwd = true;
      apiFetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: f.oldPassword, newPassword: f.newPassword })
      }).then(function (r) { return r.json(); }).then(function (d) {
        vm.changingPwd = false;
        if (d.ok) {
          if (d.token) localStorage.setItem('jwt_token', d.token);
          vm.showPwdModal = false;
          vm.$Message.success('密码已修改，其他设备已被登出');
        } else {
          vm.$Message.error(d.error || '修改失败');
        }
      }).catch(function () {
        vm.changingPwd = false;
        vm.$Message.error('修改失败');
      });
    },

    // ===== 主题切换 =====
    setTheme: function (t) {
      this.prefTheme = t;
      this.$root.theme = t;
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('theme', t);
    }
  },
  template: `
    <div class="profile-page">
      <input type="file" ref="avatarFileInput" accept="image/*" style="display:none" @change="onAvatarFile" />

      <!-- ① 个人信息 -->
      <div class="profile-card">
        <div class="profile-card-title">个人信息</div>
        <div class="profile-card-body profile-info-grid">
          <div class="profile-avatar-wrap" @click="triggerAvatarUpload" :class="{ uploading: uploadingAvatar }" title="点击更换头像">
            <img v-if="hasAvatar" :src="avatarDisplayUrl" class="profile-avatar-img" alt="avatar" />
            <div v-else class="profile-avatar-letter user-avatar">{{ avatarLetter }}</div>
            <div class="profile-avatar-overlay">
              <span v-if="!uploadingAvatar">更换</span>
              <span v-else>上传中...</span>
            </div>
          </div>
          <div class="profile-info-list">
            <div class="profile-info-row">
              <span class="profile-info-label">账号</span>
              <span class="profile-info-value">{{ profile.username }}</span>
            </div>
            <div class="profile-info-row">
              <span class="profile-info-label">显示名</span>
              <template v-if="editingField === 'display_name'">
                <i-input v-model="editValue" size="small" style="width:200px" @on-enter="saveField" @on-blur="saveField" />
                <i-button size="small" type="text" @click="cancelEdit">取消</i-button>
              </template>
              <template v-else>
                <span class="profile-info-value">{{ displayNameDisplay }}</span>
                <i-button size="small" type="text" icon="md-create" @click="startEdit('display_name')">编辑</i-button>
              </template>
            </div>
            <div class="profile-info-row">
              <span class="profile-info-label">邮箱</span>
              <template v-if="editingField === 'email'">
                <i-input v-model="editValue" size="small" placeholder="user@example.com" style="width:220px" @on-enter="saveField" @on-blur="saveField" />
                <i-button size="small" type="text" @click="cancelEdit">取消</i-button>
              </template>
              <template v-else>
                <span class="profile-info-value" :class="{ muted: !profile.email }">{{ emailDisplay }}</span>
                <i-button size="small" type="text" icon="md-create" @click="startEdit('email')">{{ profile.email ? '编辑' : '绑定' }}</i-button>
              </template>
            </div>
            <div class="profile-info-row">
              <span class="profile-info-label">角色</span>
              <span class="role-tag" :class="roleClass">{{ roleLabel }}</span>
            </div>
            <div class="profile-info-row">
              <span class="profile-info-label">注册时间</span>
              <span class="profile-info-value">{{ createdDisplay }}</span>
            </div>
            <div class="profile-info-row">
              <span class="profile-info-label">最后登录</span>
              <span class="profile-info-value">{{ lastLoginDisplay }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ② 账户安全 -->
      <div class="profile-card">
        <div class="profile-card-title">账户安全</div>
        <div class="profile-card-body">
          <div class="profile-security-row">
            <div>
              <div class="profile-security-label">登录密码</div>
              <div class="profile-security-desc">建议定期修改密码，使用 6 位以上字符</div>
            </div>
            <i-button type="primary" @click="openPwdModal">修改密码</i-button>
          </div>
        </div>
      </div>

      <!-- ③ 偏好设置 -->
      <div class="profile-card">
        <div class="profile-card-title">偏好设置</div>
        <div class="profile-card-body">
          <div class="profile-info-row">
            <span class="profile-info-label">主题</span>
            <div class="profile-theme-group">
              <div class="profile-theme-chip" :class="{ active: prefTheme === '1688' }" @click="setTheme('1688')">1688</div>
              <div class="profile-theme-chip" :class="{ active: prefTheme === 'jd' }" @click="setTheme('jd')">JD</div>
              <div class="profile-theme-chip" :class="{ active: prefTheme === 'fresh' }" @click="setTheme('fresh')">清新</div>
            </div>
          </div>
        </div>
      </div>

      <!-- ④ 我的统计 -->
      <div class="profile-card">
        <div class="profile-card-title">我的统计</div>
        <div class="profile-card-body">
          <div class="profile-stats-grid">
            <div class="profile-stat-box">
              <div class="profile-stat-num">{{ stats.total }}</div>
              <div class="profile-stat-label">采集总数</div>
            </div>
            <div class="profile-stat-box">
              <div class="profile-stat-num">{{ stats.used }}</div>
              <div class="profile-stat-label">已发布</div>
            </div>
            <div class="profile-stat-box">
              <div class="profile-stat-num">{{ stats.unused }}</div>
              <div class="profile-stat-label">未发布</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 修改密码 modal -->
      <Modal v-model="showPwdModal" title="修改密码" :mask-closable="false" @on-ok="changePassword" :ok-text="changingPwd ? '修改中...' : '确认修改'" :cancel-text="'取消'">
        <div style="display:flex;flex-direction:column;gap:12px;padding:8px 0">
          <div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">旧密码</div>
            <i-input v-model="pwdForm.oldPassword" type="password" placeholder="请输入旧密码" />
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">新密码（至少 6 位）</div>
            <i-input v-model="pwdForm.newPassword" type="password" placeholder="请输入新密码" />
          </div>
          <div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">确认新密码</div>
            <i-input v-model="pwdForm.confirmPassword" type="password" placeholder="再次输入新密码" />
          </div>
        </div>
      </Modal>
    </div>
  `
});
