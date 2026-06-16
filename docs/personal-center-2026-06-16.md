# 个人中心页面 — 设计文档

> 日期：2026-06-16
> 状态：✅ 方案已确认，待实施

## 背景

[app.js:92-95](server/public/js/app.js#L92-L95) 里"个人中心"目前是 placeholder（`comingSoon()` → 弹"开发中" toast）。有了多用户机制后，需要给非 admin 用户一个自助管理入口（admin 已经有 [page-users.js](server/public/js/components/page-users.js)，但只能管别人、不能管自己）。

**现状盘点**：

| 资产 | 位置 | 状态 |
|---|---|---|
| 用户表字段 | [db.js:192-206](server/db.js#L192-L206) | id / username / password_hash / password_salt / display_name / role / last_login / must_change_password / disabled / token_invalid_at / created_at / updated_at |
| `/api/me` | [users.js:95-101](server/routes/users.js#L95-L101) | 返回 id/username/display_name/role/last_login/must_change_password |
| `/api/change-password` | [users.js:103-124](server/routes/users.js#L103-L124) | 已有，含旧密码校验 + 全设备登出 |
| 自助修改 display_name | — | **无**，目前只能 admin 通过 PUT /api/users/:id 改 |
| 主题切换 | [app.js:48-54](server/public/js/app.js#L48-L54) | 已有，但入口在 header 圆形按钮里，不在正式页面 |
| 字母头像 fallback | [index.html:42](server/public/index.html#L42) | 已有，用 display_name 首字符 |

## 已确认决策（用户已选）

1. ✅ **改昵称 + 改密码**：旧密码 + 两次新密码校验（必做）
2. ❌ **踢下线不做**：允许同一账号多端登录
3. ✅ **统计卡做** / ❌ **默认页面不做**
4. ✅ **头像做**（上传图片）+ ✅ **绑定邮箱**

## 入口改造

保留 header 右上角用户菜单的"个人中心"项位置不变，把 `comingSoon()` 换成 `switchView('page-profile')`。**不进侧边栏**——个人中心非高频，放用户菜单足够。

```javascript
// app.js:92
comingSoon: function () {
  this.userMenuOpen = false;
  this.currentView = 'page-profile';
  localStorage.setItem('__current_view', 'page-profile');
}
```

## 数据库改动

users 表新增 2 列（[db.js:192-206](server/db.js#L192-L206) + [cloud/index.js:54](server/cloud/index.js#L54)）：

```sql
avatar_url TEXT DEFAULT '',   -- 头像 URL（OSS 路径或 /avatars/xxx.png 本地路径）
email TEXT DEFAULT ''          -- 邮箱（不做邮件验证，仅格式校验）
```

**自动迁移**：[db.js:340-358](server/db.js#L340-L358) `migrateLocalSchema()` 启动时自动 ALTER TABLE ADD COLUMN，无需手写迁移脚本。云端 DDL 同步更新即可。

**云同步**：复用现有 `pushUserCloud(sql, params, source)` 模式，新字段会随 UPDATE 自动推送。

## 页面结构（4 卡片布局）

参考 [page-api-keys.js](server/public/js/components/page-api-keys.js) 的卡片式布局，主题色用 `var(--accent)` + `var(--bg-surface)`，4 张卡片纵向排列：

```
┌──────────────────────────────────────────┐
│  ① 个人信息                               │
│  [头像 80×80]  用户名  角色标签            │
│                显示名  ✎ 编辑              │
│                📧 邮箱  ✎ 编辑             │
│                📅 注册时间 / 最后登录       │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  ② 账户安全                               │
│  [修改密码] 按钮 → modal                   │
│    旧密码：____                            │
│    新密码：____                            │
│    确认新密码：____                        │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  ③ 偏好设置                               │
│  主题：[1688] [JD] [清新]                  │
└──────────────────────────────────────────┘
┌──────────────────────────────────────────┐
│  ④ 我的统计                               │
│  采集数 / 已发布 / 未发布  3 个数字卡       │
└──────────────────────────────────────────┘
```

### 卡片 ① 个人信息（含头像 + 邮箱）

**展示**：
- 头像（80×80 圆形）：优先显示 `avatar_url`，无则用字母 fallback（首字符大写）
- 头像悬停显示"更换"遮罩，点击触发文件选择
- 用户名（只读）
- 显示名（默认显示，可编辑）
- 邮箱（默认显示，可编辑；未绑定时显示"未绑定"灰字）
- 角色标签（admin 橙 / operator 蓝 / viewer 灰）
- 注册时间 + 最后登录（只读）

**头像上传流程**：
1. 用户点头像 → 触发隐藏 `<input type="file" accept="image/*">`
2. 前端 FileReader 读为 base64
3. 前端用 canvas 压缩到最大 256×256（避免传超大原图）
4. POST `/api/me/avatar` { image_base64 }
5. 后端走 OSS 优先 / 本地兜底（与 [image-gen.js:186](server/routes/ai/image-gen.js#L186) 同套机制）
6. 后端写入 users.avatar_url + pushUserCloud 同步
7. 返回新 URL，前端刷新头像

**头像存储路径**：
- OSS：`avatars/{userId}_{ts}.png`（不复用 products/ 前缀，便于将来按业务清理）
- 本地兜底：`server/public/avatars/{userId}_{ts}.png`（独立目录，**不走 7 天清理**——头像是持久资源）
- 在 [server.js:45](server/server.js#L45) 之后加一行：`app.use('/avatars', express.static(path.join(__dirname, 'public', 'avatars')))`

**邮箱编辑**：
- 点邮箱旁的 ✎ → 行内 input → 失焦或回车保存
- 前端正则校验 `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- 后端再校验一遍（不信任前端）
- 不做邮件验证流程（不发验证邮件，避免引入邮件服务依赖）
- 不强制唯一（本次范围之外；如有需要，加 SELECT 校验即可）

**后端新接口**：

```javascript
// PUT /api/me/profile — 改 display_name + email
router.put('/me/profile', function (req, res) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var displayName = (req.body.display_name || '').trim();
  var email = (req.body.email || '').trim();
  if (displayName.length > 32) return res.status(400).json({ error: '显示名最多 32 字符' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '邮箱格式不正确' });
  }
  var now = localNow();
  _getDb().run("UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE id = ?", [displayName, email, now, req.user.id]);
  _getDb().scheduleSave();
  pushUserCloud("UPDATE users SET display_name = ?, email = ?, updated_at = ? WHERE username = ?", [displayName, email, now, req.user.username], 'self-update-profile');
  res.json({ ok: true, display_name: displayName, email: email });
});

// POST /api/me/avatar — 上传头像
router.post('/me/avatar', function (req, res) {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  var imageBase64 = req.body.image_base64;
  if (!imageBase64) return res.status(400).json({ error: '缺少图片数据' });
  // 复用 upload-limits 中间件（MIME 白名单 + 字节上限）
  // 头像路径名：avatars/{userId}_{ts}.png
  var nameParam = 'avatar_' + req.user.id + '_' + Date.now() + '.png';
  // OSS 优先
  if (require('../../services/oss-upload').isConfigured()) {
    // 直接走 OSS，路径前缀改成 avatars/
    // ... OSS 上传逻辑
  } else {
    // 本地：写 public/avatars/
    var filename = 'avatar_' + req.user.id + '_' + Date.now() + '.png';
    var filepath = path.join(__dirname, '..', 'public', 'avatars', filename);
    // ... base64 解码 + 写文件
  }
  // 更新 users.avatar_url
  // pushUserCloud 同步
});
```

**头像上传走 upload-limits 中间件**：复用 [upload-limits.js](server/middleware/upload-limits.js) preCheck（MIME + 字节）+ transformHandler（像素 + 转码），享受相同的保护。

**`/api/me` 改造**：增加 `avatar_url` / `email` / `created_at` 字段返回：

```javascript
// users.js:96-101 改为
var user = _getDb().getOne('SELECT id, username, display_name, role, last_login, must_change_password, avatar_url, email, created_at FROM users WHERE id = ?', [req.user.id]);
res.json({ ...user, must_change_password: user.must_change_password || 0 });
```

### 卡片 ② 账户安全（仅修改密码）

**不做踢下线**（用户决策 2：允许多端登录）。

**修改密码**：复用已有 [POST /api/change-password](server/routes/users.js#L103-L124)。

**注意**：现有 change-password 实现会置 `token_invalid_at = now`，这会让**所有设备的 token 失效**（包括本机）。但接口同时返回新 token，前端拿到后替换 jwt_token 即可，本机继续可用。**其他设备会被踢**——这是改密码的合理行为，符合安全预期。

如果用户真的想改密码不踢其他设备，需要改后端逻辑（保留本机 iat > token_invalid_at 的判断）。本次先按现有实现，符合"改密码 = 安全事件 = 全设备重登"的常识。

**前端 modal 流程**：
1. 三个 input：旧密码 / 新密码 / 确认新密码
2. 校验：新密码 ≥ 6 字符 + 两次输入一致 + 不等于旧密码
3. 提交 → POST /api/change-password
4. 成功 → 把 response.token 写入 `localStorage.jwt_token` + cookie + 提示"密码已修改"
5. 失败 → 显示后端错误（旧密码错误 / 密码太短等）

### 卡片 ③ 偏好设置（仅主题）

**默认页面不做**（用户决策 3）。只保留主题切换。

**实现**：3 个 button group，点击即切，复用 [app.js:48-54](server/public/js/app.js#L48-L54) 的逻辑（抽出来成 `setTheme(name)` 共用，header 圆形按钮和个人中心两边都调）。

### 卡片 ④ 我的统计

**复用现有 `/api/product/stats`**，加 owner 过滤。

**后端改动**（[products.js](server/routes/products.js)）：
```javascript
// 现有 /api/product/stats
router.get('/product/stats', function (req, res) {
  var scope = req.query.scope || 'mine';  // 默认 mine
  var ownerFilter = scope === 'all' && req.user.role === 'admin' ? '' : 'AND owner = ?';
  var params = scope === 'all' && req.user.role === 'admin' ? [] : [req.user.username];
  // ... 现有统计 SQL 加 ownerFilter
});
```

**前端展示**：3 个数字卡（采集数 / 已发布数 / 未发布数），用大字号 + 副标签的卡片样式。

## 后端改动清单

| 接口 | 方法 | 用途 | 新增/复用 |
|---|---|---|---|
| `/api/me` | GET | 取个人信息（加 avatar_url/email/created_at） | 改造 |
| `/api/me/profile` | PUT | 改 display_name + email | **新增** |
| `/api/me/avatar` | POST | 上传头像 | **新增** |
| `/api/change-password` | POST | 改密码 | 复用 |
| `/api/product/stats` | GET | 我的统计（加 scope 参数） | 改造 |

**DB schema**：users 表加 `avatar_url` + `email` 两列（[db.js](server/db.js#L192-L206) + [cloud/index.js:54](server/cloud/index.js#L54)）。

**静态资源**：[server.js](server/server.js#L45) 加 `/avatars` 路径映射 `public/avatars/`。

## 前端改动清单

| 文件 | 改动 |
|---|---|
| `server/public/js/components/page-profile.js`（**新**） | 4 卡片主页面 |
| `server/public/js/app.js` | `comingSoon` 改成 `switchView('page-profile')`；`toggleTheme` 抽出 `setTheme(name)` 共用 |
| `server/public/index.html` | 注册 `<page-profile>` 组件标签 + 引入 page-profile.js |
| `server/public/css/` 或全局 CSS | `.avatar-upload-overlay` 等少量样式（继承主题变量） |

**page-profile.js 结构**：

```javascript
Vue.component('page-profile', {
  data: function () {
    return {
      profile: { username:'', display_name:'', role:'', email:'', avatar_url:'', created_at:'', last_login:'' },
      // 头像上传
      uploadingAvatar: false,
      // 显示名/邮箱 行内编辑
      editingField: '',  // 'display_name' / 'email' / ''
      editValue: '',
      savingField: false,
      // 修改密码
      showPwdModal: false,
      pwdForm: { oldPassword:'', newPassword:'', confirmPassword:'' },
      changingPwd: false,
      // 偏好
      prefTheme: localStorage.getItem('theme') || '1688',
      // 统计
      stats: { total:0, published:0, unpublished:0 }
    };
  },
  computed: {
    roleLabel: function () { return {admin:'管理员', operator:'操作员', viewer:'观察者'}[this.profile.role] || '未知'; },
    roleClass: function () { return 'role-' + (this.profile.role || 'viewer'); },
    avatarLetter: function () { return (this.profile.display_name || this.profile.username || '?').charAt(0).toUpperCase(); },
    hasAvatar: function () { return !!this.profile.avatar_url; }
  },
  mounted: function () { this.loadProfile(); this.loadStats(); },
  methods: {
    loadProfile: function () { /* GET /api/me */ },
    startEdit: function (field) { /* 行内编辑 */ },
    saveField: function () { /* PUT /api/me/profile */ },
    cancelEdit: function () { /* 退出编辑 */ },
    triggerAvatarUpload: function () { /* 触发 file input */ },
    onAvatarFile: function (e) { /* FileReader + canvas 压缩 → POST /api/me/avatar */ },
    openPwdModal: function () { /* reset form */ },
    changePassword: function () { /* POST /api/change-password */ },
    setTheme: function (t) { /* localStorage + document.documentElement */ },
    loadStats: function () { /* GET /api/product/stats?scope=mine */ }
  },
  template: `... 4 卡片 ...`
});
```

**头像上传前端压缩**（避免传 5MB 原图）：
```javascript
onAvatarFile: function (e) {
  var file = e.target.files[0];
  if (!file) return;
  if (file.size > 10485760) { this.$Message.error('图片不能超过 10M'); return; }
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
      // POST /api/me/avatar
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
```

## 视觉规范（/project-style-strict）

**强制**：
- 卡片背景 `var(--bg-surface)`，边框 `var(--border)`
- 标题用 `var(--text-primary)`，次要文字 `var(--text-secondary)`
- 按钮主色 `var(--accent)`，危险按钮 `#ff4d4f`
- 角色标签三种颜色基于现有项目色系：admin 用橙 `var(--accent)` / operator 用蓝 `#1890ff` / viewer 用灰 `#888`
- 圆角、间距、字体继承全局，不自定义
- 头像圆形 80×80，复用 `.user-avatar` 类的圆形/字体规范，仅放大尺寸
- 头像"更换"遮罩用半透明黑 + 白字，hover 触发
- iView 组件复用 `i-button` / `i-input` / `i-modal` / `i-select` / `icon`，不混其他 UI 库

**禁用**：
- 不写新 CSS 文件（少量样式内联在组件 template 或全局 CSS 末尾追加）
- 不引入新字体/图标库
- 不引入头像裁剪库（前端 canvas 压缩即可，不需要 jcrop/cropper）
- 邮箱不做邮件发送（不引入 nodemailer 等）

## 测试计划

| 测试项 | 范围 |
|---|---|
| DB 迁移 | users 表自动补 avatar_url / email 列（migrateLocalSchema） |
| GET /api/me | 返回新字段 avatar_url / email / created_at |
| PUT /api/me/profile | 改 display_name + email + 云同步推送 |
| PUT /api/me/profile 邮箱格式校验 | 非法邮箱 → 400 |
| POST /api/me/avatar | 上传成功 + 写入 avatar_url + 云同步 |
| POST /api/me/avatar MIME 校验 | 复用 upload-limits 中间件 |
| GET /api/product/stats?scope=mine | 按 owner 过滤 |
| 改密码 token 续期 | response.token 写入 localStorage 后本机继续可用 |

**测试文件**：
- `server/__tests__/unit/me-routes.test.js`（新）—— 测 3 个新接口 + /api/me 新字段
- `server/__tests__/unit/product-stats-scope.test.js`（新）—— 测 scope 参数（或扩展现有 product-stats 测试）
- 前端纯手动测试（沿用项目惯例，前端无单元测试）

## 工作量估算

| 改动 | 文件 | 行数 |
|---|---|---|
| DB schema（users 加 2 列） | server/db.js + server/cloud/index.js | ~4 |
| 后端 3 个新接口 + /api/me 改造 | server/routes/users.js | ~120 |
| /api/product/stats 加 scope | server/routes/products.js | ~15 |
| server.js 加 /avatars 静态 | server/server.js | ~2 |
| 前端 page-profile.js（新） | server/public/js/components/page-profile.js | ~450（含 template） |
| app.js 入口改造 | server/public/js/app.js | ~10 |
| index.html 注册组件 | server/public/index.html | ~2 |
| 全局 CSS 少量补充 | server/public/css/*.css | ~30 |
| 后端测试 | server/__tests__/unit/me-routes.test.js | ~180 |

**总计**：~810 行。

## 不在本次范围

- 头像裁剪 UI（前端只做 canvas 压缩，不做交互式裁剪框）
- 邮箱验证流程（不发验证邮件）
- 邮箱唯一性约束（admin 可看是否冲突，本次不做）
- 用户活动审计日志
- 双因素认证（2FA）
- 登录历史
- 头像审核（运维问题，靠 admin 在用户管理页介入）

## 实施顺序

1. **DB**：users 表 DDL 加 avatar_url + email（db.js + cloud/index.js）
2. **后端 /api/me 改造**：返回新字段
3. **后端 PUT /api/me/profile**：改 display_name + email + 云同步
4. **后端 POST /api/me/avatar**：上传 + 云同步（走 upload-limits 中间件）
5. **后端 /api/product/stats**：加 scope 参数
6. **server.js**：注册 /avatars 静态目录
7. **后端测试**：me-routes.test.js（3 个新接口 + /api/me 字段）
8. **前端 page-profile.js**：4 卡片（个人信息/账户安全/偏好/统计）
9. **app.js**：comingSoon → switchView；toggleTheme 抽出 setTheme
10. **index.html**：注册组件
11. **手动验证**：3 个角色登录 + 头像上传 + 邮箱编辑 + 改密码 + 主题切换 + 统计数据
