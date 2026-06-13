# 扩展自动登录方案 — 详细设计文档

**目标**: 管理平台登录一次 → 1688采集 + 店小蜜辅助 扩展自动以当前账号身份调用所有 API，无需单独登录。

**核心机制**: 服务端登录时写 cookie → 扩展通过 `chrome.cookies` API 读取 JWT → 所有请求带 `Authorization: Bearer` 头。

---

## 一、现状分析

### 1.1 管理平台（服务端）
- 登录接口 `POST /api/login` 返回 JWT token，前端存 `localStorage('jwt_token')`
- `server/public/js/api.js` 的 `apiFetch()` 自动附加 Bearer 头
- 认证中间件 `server/middleware/auth.js` 从 `Authorization: Bearer` 和 `?token=` 解析 JWT
- 无 cookie 机制

### 1.2 1688 扩展（有鉴权）
- `sites/1688/collect-data.js` 管理 token（`getToken/setToken/clearToken/authHeaders`）
- `sites/1688/float-btn.js` 有登录 UI（用户名/密码输入框）
- 调用 `/api/plugin-login` 获取 token → 存 `chrome.storage.local`
- 所有 API 请求带 `Authorization: Bearer` 头

### 1.3 店小蜜扩展（无鉴权）
- `sites/dianxiaomi/dxm-config.js` 管理 serverUrl，无 token 管理
- 所有 API 调用**裸发**，不带任何 auth 头
- 共 17 处 fetch 调用到管理平台 API，全部缺少鉴权

---

## 二、方案设计

### 2.1 认证流程

```
┌─────────────────────────────────────────────────────────┐
│ 1. 用户在管理平台登录                                      │
│    POST /api/login → 服务器返回 JWT                       │
│    前端存 localStorage('jwt_token')                       │
│    ★ 服务端同时设 cookie: auth_token=JWT (HttpOnly, 7天)   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 2. 扩展在 1688.com / dianxiaomi.com 页面加载              │
│    扩展启动 → chrome.cookies.get({url: serverUrl})        │
│    读到 cookie → 提取 JWT → 存入本地缓存                   │
│    读不到 → 显示「请先登录管理平台」提示                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 3. 扩展发起 API 请求                                      │
│    所有 fetch 自动附加 Authorization: Bearer <JWT>         │
│    服务端原有 auth 中间件正常解析 → req.user 挂载用户信息     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Token 过期 / 退出处理                                  │
│    收到 401 → 重新读 cookie（可能管理平台已重新登录）         │
│    仍失败 → 提示「请登录管理平台」                          │
│    管理平台退出 → cookie 被清除 → 扩展下次检测到无 token     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 为什么用 cookie + chrome.cookies 而不是 credentials: 'include'

| 方案 | 问题 |
|---|---|
| `credentials: 'include'` | 内容脚本在 1688.com 域下 fetch localhost:3000，cookie 属于 localhost 域，跨域不会自动带上 |
| 共享 localStorage | 管理平台运行在 localhost:3000，扩展内容脚本运行在 1688.com/dianxiaomi.com，无法互相读取 localStorage |
| cookie + chrome.cookies API | `chrome.cookies.get()` 可跨域读取任何域名下的 cookie，完美解决 ✓ |

---

## 三、服务端改动

### 3.1 文件: `server/routes/users.js`

#### 3.1.1 POST /api/login — 添加 cookie（第 40-51 行）

```javascript
// 现有代码
var token = signToken(user);
// ★ 新增: 设置 cookie
res.cookie('auth_token', token, {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7天，与 JWT expiresIn 一致
  sameSite: 'lax'
});
// 现有代码
res.json({ ok: true, token: token, user: { ... } });
```

#### 3.1.2 POST /api/plugin-login — 添加 cookie（第 55-67 行）

```javascript
var token = signToken(user);
// ★ 新增: 同样设置 cookie
res.cookie('auth_token', token, {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'lax'
});
res.json({ ok: true, token: token, user: { ... } });
```

#### 3.1.3 POST /api/logout — 新增端点

```javascript
// POST /api/logout
router.post('/logout', function (req, res) {
  res.clearCookie('auth_token');
  res.json({ ok: true });
});
```

#### 3.1.4 POST /api/change-password — 刷新 cookie（第 78 行之后）

密码修改成功后重新签发 token 并更新 cookie：

```javascript
// 在密码修改成功、新 token 签发后添加:
res.cookie('auth_token', newToken, {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'lax'
});
```

### 3.2 文件: `server/server.js`

确认 `cookie-parser` 中间件已挂载。如未安装：
```bash
npm install cookie-parser
```

在 Express 初始化处添加：
```javascript
var cookieParser = require('cookie-parser');
app.use(cookieParser());
```

### 3.3 文件: `server/middleware/auth.js`

**无需改动**。auth 中间件已从 `Authorization: Bearer` 和 `?token=` 解析 JWT。扩展通过 Bearer 头发送 token，中间件正常工作。

---

## 四、扩展端改动

### 4.1 文件: `sites/manifest.json`

添加 `cookies` 权限：

```json
{
  "permissions": ["activeTab", "scripting", "storage", "cookies"],
  "host_permissions": ["http://localhost:3000/*", "http://192.168.*.*:3000/*"]
}
```

`host_permissions` 已包含服务端地址，`chrome.cookies.get()` 需要对应域名的权限。

---

### 4.2 1688 扩展改造

#### 4.2.1 文件: `sites/1688/collect-data.js`

**替换 token 管理为 cookie 自动读取**：

```javascript
var TOKEN_KEY = '1688_token';

// ★ 新增: 从 cookie 自动获取 token
function autoGetToken(callback) {
  var serverUrl = getServerUrl();
  // 先检查本地缓存
  var cached = localStorage.getItem(TOKEN_KEY);
  if (cached) { callback(cached); return; }
  // 从 cookie 读取
  try {
    chrome.cookies.get({ url: serverUrl, name: 'auth_token' }, function (cookie) {
      if (cookie && cookie.value) {
        localStorage.setItem(TOKEN_KEY, cookie.value);
        try { var o = {}; o[TOKEN_KEY] = cookie.value; chrome.storage.local.set(o); } catch (e) {}
        callback(cookie.value);
      } else {
        callback('');
      }
    });
  } catch (e) {
    callback('');
  }
}

// 修改 getToken: 优先返回缓存，异步刷新
function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

// 修改 authHeaders: 增加 token 刷新检查
function authHeaders(headers) {
  var token = getToken();
  if (token) {
    headers = headers || {};
    headers['Authorization'] = 'Bearer ' + token;
  }
  return headers;
}

// ★ 新增: 处理 401 时重新读 cookie
function handleAuthError(response) {
  if (response.status === 401) {
    clearToken();
    // 异步刷新 token，下次请求自动使用新 token
    autoGetToken(function () {});
  }
}

// 启动时自动获取 token
autoGetToken(function (token) {
  if (!token) console.log('[1688] 未检测到管理平台登录，请先登录');
});
```

#### 4.2.2 文件: `sites/1688/float-btn.js`

**去掉登录 UI，改为显示当前用户信息**：

**删除**（第 135-142 行附近）:
```html
<div id="__1688_s_login_fields">
  <label>用户名</label>
  <input ...>
  <label>密码</label>
  <input ...>
  <button id="__1688_s_login_btn" ...>登录</button>
</div>
```

**替换为**:
```html
<div id="__1688_s_user_info">
  <div id="__1688_s_user_name" style="...">检测中...</div>
  <div id="__1688_s_user_hint" style="font-size:11px;color:#999">请先登录管理平台</div>
</div>
```

**修改** 初始化时的身份检查逻辑（第 340-380 行）:

```javascript
// 现有: 从本地 token 校验
// 改为: 自动读 cookie 后校验
CollectData.autoGetToken(function (token) {
  var loginFields = document.getElementById('__1688_s_login_fields');
  var userInfo = document.getElementById('__1688_s_user_info');
  var userName = document.getElementById('__1688_s_user_name');
  var userHint = document.getElementById('__1688_s_user_hint');

  if (!token) {
    // 无 token，显示提示
    if (loginFields) loginFields.style.display = 'none';
    if (userInfo) userInfo.style.display = 'block';
    if (userHint) userHint.textContent = '请先登录管理平台';
    return;
  }

  fetch(serverUrl + '/api/me', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.username) {
        if (loginFields) loginFields.style.display = 'none';
        if (userInfo) userInfo.style.display = 'block';
        if (userName) userName.textContent = d.display_name || d.username;
        if (userHint) userHint.textContent = '角色: ' + d.role;
      } else {
        if (loginFields) loginFields.style.display = 'none';
        if (userInfo) userInfo.style.display = 'block';
        if (userHint) userHint.textContent = 'Token 已过期，请重新登录管理平台';
      }
    })
    .catch(function () {
      if (loginFields) loginFields.style.display = 'none';
      if (userInfo) userInfo.style.display = 'block';
      if (userHint) userHint.textContent = '无法连接服务器';
    });
});
```

**删除** 登录按钮事件监听器（第 407 行附近）:
```javascript
// 删除整个 #__1688_s_login_btn 的 addEventListener
```

**删除** 登录 UI 相关样式:
```css
/* 删除 .s-btn-login 等登录按钮样式 */
```

---

### 4.3 店小蜜扩展改造

#### 4.3.1 文件: `sites/dianxiaomi/dxm-config.js`

**新增 token 管理**（在文件顶部，`getServerUrl` 之后）:

```javascript
var TOKEN_KEY = '1688_token';

function getToken(callback) {
  var cached = localStorage.getItem(TOKEN_KEY);
  if (cached) { callback(cached); return; }
  // 从 cookie 读取
  try {
    chrome.cookies.get({ url: getServerUrl(), name: 'auth_token' }, function (cookie) {
      if (cookie && cookie.value) {
        localStorage.setItem(TOKEN_KEY, cookie.value);
        callback(cookie.value);
      } else {
        callback('');
      }
    });
  } catch (e) {
    callback('');
  }
}

// 同步版（用于缓存命中场景）
function getCachedToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders(headers) {
  var token = getCachedToken();
  if (token) {
    headers = headers || {};
    headers['Authorization'] = 'Bearer ' + token;
  }
  return headers;
}

function handleAuthError(response) {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    getToken(function () {}); // 异步刷新
  }
}
```

**修改 `syncToServer`**（第 44-61 行）:

```javascript
function syncToServer(key, value) {
  pendingSyncs[key] = String(value);
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function () {
    var items = [];
    for (var k in pendingSyncs) items.push({ key: k, value: pendingSyncs[k] });
    pendingSyncs = {};
    if (!items.length) return;
    localStorage.setItem(SYNC_TS_KEY, new Date().toISOString());
    // ★ 改动: 添加 authHeaders
    getToken(function (token) {
      var headers = authHeaders({ 'Content-Type': 'application/json' });
      fetch(getServerUrl() + '/api/settings', {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({ items: items })
      }).then(function (r) { handleAuthError(r); }).catch(function () {});
    });
  }, 300);
}
```

**修改 `loadFromServer`**（第 63-76 行）:

```javascript
function loadFromServer() {
  var localTs = localStorage.getItem(SYNC_TS_KEY) || '';
  // ★ 改动: 添加 authHeaders
  getToken(function (token) {
    fetch(getServerUrl() + '/api/settings', { headers: authHeaders() })
      .then(function (r) { handleAuthError(r); return r.json(); })
      .then(function (settings) {
        for (var key in settings) {
          var entry = settings[key];
          if (!entry) continue;
          if (localTs && entry.updated_at && entry.updated_at <= localTs) continue;
          localStorage.setItem(key, typeof entry === 'string' ? entry : entry.value);
        }
      })
      .catch(function () {});
  });
}
```

**暴露给其他脚本**（在 `window.BeeConfig` 中添加）:

```javascript
window.BeeConfig = {
  // ...现有导出...
  getToken: getToken,           // 异步获取 token
  getCachedToken: getCachedToken, // 同步获取缓存 token
  authHeaders: authHeaders,
  handleAuthError: handleAuthError
};
```

#### 4.3.2 所有 API 调用添加鉴权头

以下列出**每个需要修改的 fetch 调用**，逐文件说明：

---

**文件: `sites/dianxiaomi/dxm-auto-fill.js`**

| 行号 | API | 当前 | 修改 |
|---|---|---|---|
| 72 | `GET /api/product/:id` | `fetch(serverUrl + '/api/product/' + collectId)` | `fetch(serverUrl + '/api/product/' + collectId, { headers: Config.authHeaders() })` |
| 790 | `POST /api/ai/suggest-category` | `fetch(serverUrl + '/api/ai/suggest-category', { method: 'POST', headers: {'Content-Type':...}, body:... })` | `fetch(serverUrl + '/api/ai/suggest-category', { method: 'POST', headers: Config.authHeaders({'Content-Type':...}), body:... })` |
| 833 | `POST /api/ai/save-category-mapping` | 同上模式 | 同上，加 `Config.authHeaders()` |

---

**文件: `sites/dianxiaomi/dxm-edit-desc.js`**

| 行号 | API | 修改 |
|---|---|---|
| 228 | `POST /api/product/:id` | headers 对象中添加 `Config.authHeaders()` |

---

**文件: `sites/dianxiaomi/dxm-auto-clean.js`**

| 行号 | API | 修改 |
|---|---|---|
| 29 | `POST /api/ai/detect-text` | fetch options 加 `headers: Config.authHeaders(headers)` |
| 45 | `POST /api/ai/auto-clean-chinese` | 同上 |
| 61 | `POST /api/ai/batch-clean-chinese` | 同上 |
| 73 | `GET /api/ai/ocr-status` | `fetch(url, { headers: Config.authHeaders() })` |

---

**文件: `sites/dianxiaomi/dxm-text-cleaner.js`**

| 行号 | API | 修改 |
|---|---|---|
| 59 | `GET /api/ai/ocr-status` | `fetch(url, { headers: Config.authHeaders() })` |
| 209 | `POST /api/ai/detect-text` | fetch options 加 authHeaders |
| 258 | `POST /api/ai/auto-clean-chinese` | 同上 |
| 400 | `POST /api/ai/batch-clean-chinese` | 同上 |

---

**文件: `sites/dianxiaomi/dxm-paste-img.js`**

| 行号 | API | 修改 |
|---|---|---|
| 16 | `POST /api/clear-signal` | headers 加 authHeaders |
| 30 | `POST /api/clear-signal` | 同上 |
| 73 | `POST /api/ai/auto-clean-chinese` | headers 加 authHeaders |
| 80 | `POST /api/ai/image-upload` | headers 加 authHeaders |
| 634 | `POST /api/clear-signal` | headers 加 authHeaders |

---

**文件: `sites/dianxiaomi/dxm-config-ui.js`**

| 行号 | API | 修改 |
|---|---|---|
| 487 | `GET /api/dxm-tree/root-status` | `fetch(url, { headers: Config.authHeaders() })` |

---

**文件: `sites/dianxiaomi/dxm-float-bee.js`**

| 行号 | API | 修改 |
|---|---|---|
| 1016 | `POST /api/clear-signal` | headers 加 authHeaders |
| 1313 | `POST /api/collage-import` | headers 加 authHeaders（此端点在白名单中，但加 auth 后 owner 字段可关联用户） |
| 1391 | `POST /api/dxm-tree/sync` | headers 加 authHeaders |

---

## 五、完整 API 调用清单

### 5.1 1688 扩展（3 个 API）

| API | 方法 | 文件 | 当前鉴权 | 改后 |
|---|---|---|---|---|
| `/api/product/check?offerId=` | GET | collect-data.js:63 | ✅ Bearer | ✅ cookie 自动 |
| `/api/product` | POST | collect-data.js:491 | ✅ Bearer | ✅ cookie 自动 |
| `/api/me` | GET | float-btn.js:359 | ✅ Bearer | ✅ cookie 自动 |

### 5.2 店小蜜扩展（17 个 API 调用）

| # | API | 方法 | 文件:行 | 当前鉴权 | 改后 |
|---|---|---|---|---|---|
| 1 | `/api/settings` | PUT | dxm-config.js:55 | ❌ 无 | ✅ cookie |
| 2 | `/api/settings` | GET | dxm-config.js:65 | ❌ 无 | ✅ cookie |
| 3 | `/api/product/:id` | GET | dxm-auto-fill.js:72 | ❌ 无 | ✅ cookie |
| 4 | `/api/product/:id` | POST | dxm-edit-desc.js:228 | ❌ 无 | ✅ cookie |
| 5 | `/api/ai/suggest-category` | POST | dxm-auto-fill.js:790 | ❌ 无 | ✅ cookie |
| 6 | `/api/ai/save-category-mapping` | POST | dxm-auto-fill.js:833 | ❌ 无 | ✅ cookie |
| 7 | `/api/ai/detect-text` | POST | dxm-auto-clean.js:29 | ❌ 无 | ✅ cookie |
| 8 | `/api/ai/auto-clean-chinese` | POST | dxm-auto-clean.js:45 | ❌ 无 | ✅ cookie |
| 9 | `/api/ai/batch-clean-chinese` | POST | dxm-auto-clean.js:61 | ❌ 无 | ✅ cookie |
| 10 | `/api/ai/ocr-status` | GET | dxm-auto-clean.js:73 | ❌ 无 | ✅ cookie |
| 11 | `/api/ai/detect-text` | POST | dxm-text-cleaner.js:209 | ❌ 无 | ✅ cookie |
| 12 | `/api/ai/auto-clean-chinese` | POST | dxm-text-cleaner.js:258 | ❌ 无 | ✅ cookie |
| 13 | `/api/ai/batch-clean-chinese` | POST | dxm-text-cleaner.js:400 | ❌ 无 | ✅ cookie |
| 14 | `/api/ai/ocr-status` | GET | dxm-text-cleaner.js:59 | ❌ 无 | ✅ cookie |
| 15 | `/api/ai/image-upload` | POST | dxm-paste-img.js:80 | ❌ 无 | ✅ cookie |
| 16 | `/api/clear-signal` | POST | dxm-paste-img.js:16,30,634 / dxm-float-bee.js:1016 | ❌ 无 | ✅ cookie |
| 17 | `/api/dxm-tree/root-status` | GET | dxm-config-ui.js:487 | ❌ 无 | ✅ cookie |
| 18 | `/api/collage-import` | POST | dxm-float-bee.js:1313 | ❌ 白名单 | ✅ cookie |
| 19 | `/api/dxm-tree/sync` | POST | dxm-float-bee.js:1391 | ❌ 无 | ✅ cookie |

---

## 六、实施步骤

### Step 1: 服务端 — 安装依赖 + cookie 中间件
```bash
npm install cookie-parser
```
在 `server/server.js` 添加 `app.use(require('cookie-parser')());`

### Step 2: 服务端 — 登录接口写 cookie
修改 `server/routes/users.js`:
- `POST /api/login` — `res.cookie('auth_token', token, ...)`
- `POST /api/plugin-login` — 同上
- `POST /api/logout` — 新增 `res.clearCookie('auth_token')`
- `POST /api/change-password` — 成功后刷新 cookie

### Step 3: 扩展 — manifest.json 加 cookies 权限
`sites/manifest.json` permissions 加 `"cookies"`

### Step 4: 1688 扩展 — collect-data.js 改 token 管理
- 新增 `autoGetToken()` 从 cookie 读取
- 修改 `handleAuthError()` 401 时刷新 token
- 启动时自动调用 `autoGetToken()`

### Step 5: 1688 扩展 — float-btn.js 去掉登录 UI
- 替换登录表单为用户信息展示
- 删除登录按钮事件
- 启动时显示当前用户名/角色

### Step 6: 店小蜜扩展 — dxm-config.js 加 token 管理
- 新增 `getToken()` / `authHeaders()` / `handleAuthError()`
- 改造 `syncToServer()` 和 `loadFromServer()` 加鉴权头
- 在 `window.BeeConfig` 导出新函数

### Step 7: 店小蜜扩展 — 19 处 fetch 调用加 authHeaders
按第五节清单逐文件修改

### Step 8: 测试验证
1. 管理平台登录 → 检查浏览器 DevTools Application > Cookies 有 `auth_token`
2. 打开 1688 页面 → 扩展自动显示用户名 → 点击采集成功
3. 打开店小蜜页面 → 小蜜蜂按钮可用 → 各功能正常
4. 管理平台退出 → 扩展提示「请先登录管理平台」
5. 修改密码 → cookie 更新 → 扩展继续正常工作

---

## 七、风险与边界情况

| 场景 | 处理 |
|---|---|
| 用户未登录管理平台 | 扩展显示「请先登录管理平台」，API 返回 401 |
| 管理平台和扩展服务器地址不同 | `chrome.cookies.get({url: serverUrl})` 使用配置的 serverUrl |
| Token 过期 | 401 触发 `handleAuthError` → 清缓存 → 重新读 cookie → 管理平台已重新登录则自动恢复 |
| 管理平台退出 | 服务端 `clearCookie` → 扩展下次检测到无 token → 提示登录 |
| 多用户环境 | 每个 JWT 绑定具体用户，owner 隔离正常生效 |
| 离线/服务器不可达 | 原有错误处理不变，catch 兜底 |

---

## 八、改动量估算

| 区域 | 文件数 | 改动量 |
|---|---|---|
| 服务端 | 2 (users.js, server.js) | ~15 行 |
| manifest | 1 | 1 行 |
| 1688 扩展 | 2 (collect-data.js, float-btn.js) | ~80 行（主要去掉登录 UI） |
| 店小蜜扩展 | 8 (dxm-config.js + 7 个调用文件) | ~60 行 |
| **合计** | **13 个文件** | **~155 行** |
