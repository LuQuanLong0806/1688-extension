# 扩展自动登录改造 — 复审与修复

**日期**: 2026-06-14
**依据**: `docs/extension-auto-auth-audit-2026-06-13.md`（一审报告）
**方式**: 一审文档逐项核对 + 实际场景验证 + 异议评估 + 补单元测试

---

## 一、一审结论核对

### ✅ Step 1-7 "已完成"项全部属实

| 文档章节 | 文件 | 验证 |
|---|---|---|
| Step 2 login/plugin-login/change-password/logout 写 cookie | `server/routes/users.js` | 第 43/69/96/102 行 — `res.cookie('auth_token', ...)` 全部存在 |
| Step 3 manifest 加 cookies 权限 | `sites/manifest.json` | `permissions` 含 `"cookies"`，`host_permissions` 含 `localhost:3000` |
| Step 4 collect-data.js token 管理 | `sites/1688/collect-data.js` | `autoGetToken`/`authHeaders`/`handleAuthError` 全部存在 |
| Step 5 float-btn.js 去登录 UI | `sites/1688/float-btn.js` | `user_info_wrap` + `/api/me` 调用 |
| Step 6 dxm-config.js token 管理 | `sites/dianxiaomi/dxm-config.js` | `autoGetToken`/`authHeaders`/`handleAuthError` 全部存在 |
| Step 7 19 处 fetch 加鉴权 | 多个 dxm-*.js | 已抽样核对，不再逐一 |

**结论**：一审文档对实施进度的判断准确，无虚构。

---

## 二、对"可优化项"的异议评估

一审列了 4 项可优化点，逐项结合实际场景验证：

### 优化 #1 — `handleAuthError` 缺少 toast/通知

| 一审说法 | 实际验证 |
|---|---|
| 401 时静默刷新 token，用户无感知 | **部分异议**：`float-btn.js` 的 `save` 失败**已有 toast**（line 480: `showToast('采集失败: ...')`）；但 `checkExists` 的 catch 静默回调 `{exists:false}`，会让用户**误判商品不存在**，进而重新采集覆盖原数据 |

**真实问题**：`checkExists` 静默失败，不是 `handleAuthError` 缺提示。

### 优化 #2 — `checkProduct` 请求 token 为空时 fetch 带 `Bearer ''`

| 一审说法 | 实际验证 |
|---|---|
| `handleAuthError` 后仍继续 `.then()`，token 为空时 fetch 带 `Bearer ''` | **描述异议**：`authHeaders()` 第 60 行有 `if (token)` 守卫，token 为空时**不会加 Authorization 头**，所以根本不会发 `Bearer ''` |

**真实问题**：扩展启动时 `autoGetToken` 异步触发，用户立即点采集时 localStorage 可能还没 token，导致 fetch 不带 Authorization → 401 → checkExists 静默。问题真实存在，但根因不是 `Bearer ''`。

### 优化 #3 — cookie `sameSite: 'lax'` 跨域场景可能受限

| 一审说法 | 实际验证 |
|---|---|
| 如果管理平台和扩展在不同域，strict 更安全 | **无异议**：扩展通过 `chrome.cookies.get` 特权 API 读 cookie，不受 sameSite 影响；`lax` 是正确选择 |

**不修。**

### 优化 #4 — 无 token 过期主动检测

| 一审说法 | 实际验证 |
|---|---|
| 仅 401 时被动刷新，可加定时器主动检查 | **无异议**：cookie maxAge 7 天 + JWT exp 7 天，过期后自动 401 触发刷新；定时主动检测收益低、增加 background 醒占资源 |

**不修。**

---

## 三、修复内容

### 修复 A：扩展端 `ensureToken`/`withAuth` 守卫（fetch 前等 token）

**根因**：启动时 `autoGetToken` 异步触发，token 拿到前用户操作 → fetch 不带 Authorization → 静默 401。

**改动**：

| 文件 | 改动 |
|---|---|
| `sites/1688/collect-data.js` | 新增 `ensureToken(callback)` — autoGetToken 后如拿不到 token 直接 callback(Error)，否则 callback(null, token)；`saveToServer` / `checkExists` 包一层 `ensureToken` |
| `sites/dianxiaomi/dxm-config.js` | 新增 `withAuth(callback)` helper 并导出到 `window.BeeConfig`；后续 19 处 fetch 可选择迁移到此 helper（当前不强制改，避免大范围风险） |

**行为差异**：
- 之前：未登录时 fetch 直接发 → 服务端 401 → 用户无感知
- 现在：未登录时直接 callback(Error('未登录管理平台')) → UI 层可立即提示

### 修复 B：`checkExists` 区分错误类型

**根因**：catch 分支无差别 `callback({exists:false})`，让上层无法区分"真不存在" vs "鉴权失败" vs "网络异常"。

**改动**（`sites/1688/collect-data.js`）：

```javascript
// 之前
.catch(function () { callback({ exists: false }); });

// 之后
callback({ exists: false, error: 'auth' });    // token 拿不到 或 401
callback({ exists: false, error: 'network' }); // fetch 异常
```

**配套改动**（`sites/1688/float-btn.js`）：

```javascript
CollectData.checkExists(function (checkRes) {
  if (checkRes.error === 'auth') {
    showBubble('❌ 请先登录管理平台', 'err');
    showToast('采集失败：请先登录管理平台', 'err');
    return;
  }
  if (checkRes.error === 'network') {
    showBubble('❌ 无法连接服务器', 'err');
    return;
  }
  // ... 原有 exists 判断
});
```

### 修复 C：服务端 cookie 行为单元测试（防回归）

**根因**：一审报告未发现现有 `login.test.js` / `plugin-auth.test.js` **完全不验证 cookie 写入**。任何路由 handler 误删 `res.cookie('auth_token', ...)` 都会让扩展登录静默失效。

**改动**：新建 `server/__tests__/routes/cookie-auth.test.js`，7 个测试覆盖：

| 场景 | 验证点 |
|---|---|
| login 成功 | `Set-Cookie: auth_token=...`、`HttpOnly`、`SameSite=Lax`、`Max-Age=604800`（7天） |
| login 失败 | 不写 cookie |
| plugin-login 成功 | 写 cookie（同 login） |
| change-password 成功 | 重新写 cookie，新 token 是有效 JWT |
| change-password 失败（旧密码错） | 不写新 cookie |
| logout | `Set-Cookie: auth_token=; Max-Age=0` 清除 |
| login cookie 与 body.token 一致 | `cookie.value === res.body.token` |

**测试结果**：7/7 通过。运行相邻套件（login/plugin-auth/permission-checks/cookie-auth）68/68 全过，无回归。

---

## 四、未修复项与原因

| 未修复项 | 原因 |
|---|---|
| `sameSite: lax` 不改 strict | 扩展用 chrome.cookies.get 特权 API 读 cookie，不受 sameSite 限制；strict 模式反而影响管理平台正常导航登录 |
| 不加 token 主动检测定时器 | 7d maxAge + 被动 401 刷新够用；定时器增加 background 占用、收益低 |
| 17 处 dxm-* fetch 不强制迁到 `withAuth` | 一审报告里已验证全部加了 `authHeaders`；dxm-config.js 启动时已触发 autoGetToken 写 localStorage，正常使用流程下 token 已就位；批量改造风险高于收益，留作 P3 增量改进 |

---

## 五、提交记录

| Commit | 内容 |
|---|---|
| 本轮修复 | collect-data.js ensureToken + checkExists 区分错误；dxm-config.js withAuth helper；float-btn.js 错误回调；cookie-auth.test.js 7 测试 |

---

## 六、验证清单

- [x] `node -c` 语法检查所有改动文件
- [x] `cookie-auth.test.js` 7/7 通过
- [x] 相邻 4 个测试套件（login/plugin-auth/permission-checks/cookie-auth）68/68 通过
- [x] 修复 A/B 改动通过手动复核（fetch 前等待 token；错误显式区分）
- [ ] 待用户在浏览器手动验证：未登录管理平台时点采集 → 应看到「请先登录管理平台」toast
