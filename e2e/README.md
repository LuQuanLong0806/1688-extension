# Playwright E2E 测试

1688-extension 管理端的端到端自动化测试，使用 Playwright + Chromium。

## 快速开始

### 1. 初始化测试环境

```bash
# 如果 admin 密码不是默认的，先设置环境变量
set E2E_ADMIN_PWD=你的admin密码

# 初始化（检查用户、清理旧测试数据）
node e2e/setup.js
```

### 2. 运行测试

```bash
# 默认运行（headless）
npx playwright test

# 有头模式（能看到浏览器操作）
npx playwright test --headed

# 调试模式（逐步执行）
npx playwright test --debug

# 只运行某个文件
npx playwright test e2e/auth.spec.js

# 只运行某个测试用例
npx playwright test -g "admin 登录成功"
```

### 3. 查看报告

```bash
npx playwright show-report
```

## 测试文件说明

| 文件 | 测试数 | 覆盖范围 |
|------|--------|---------|
| `auth.spec.js` | 9 | 登录/登出/权限/密码错误/空输入 |
| `products.spec.js` | 14 | 商品列表/搜索/筛选/详情/编辑/批量操作/采集/统计 |
| `multi-user.spec.js` | 12 | scope 过滤/owner 隔离/认领/分配/权限检查 |
| `categories.spec.js` | 11 | 映射 CRUD/DXM 分类树/关键词管理/权限 |
| `settings.spec.js` | 18 | 设置读写/AI 配置/图床/云同步/用户 CRUD/密码 |
| `ui-navigation.spec.js` | 12 | 导航/表格交互/SSE/错误处理/性能基线 |
| **总计** | **~76** | |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `E2E_ADMIN_PWD` | admin 密码 | `admin` |
| `E2E_OPERATOR_USER` | operator 用户名 | `suyu` |
| `E2E_OPERATOR_PWD` | operator 密码 | `suyu` |
| `E2E_VIEWER_USER` | viewer 用户名 | `viewer` |
| `E2E_VIEWER_PWD` | viewer 密码 | `viewer` |

## 前提条件

1. 服务运行在 `localhost:3000`
2. admin 账号可用
3. Node.js 18+ 已安装
4. Playwright 已安装 (`npm install @playwright/test`)
