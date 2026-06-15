// e2e/fixtures.js — 共享测试工具

const { test: base, expect } = require('@playwright/test');

// ⚠️ 测试用户密码（需要与服务端一致）
// 如果默认密码不对，运行时设置环境变量:
//   set E2E_ADMIN_PWD=你的密码
//   set E2E_OPERATOR_PWD=运营密码
//   set E2E_OPERATOR_USER=运营用户名 (默认 suyu)
//   set E2E_VIEWER_PWD=只读密码
//   set E2E_VIEWER_USER=只读用户名  (默认 viewer)
const USERS = {
  admin:    { username: 'admin',    password: process.env.E2E_ADMIN_PWD    || 'admin' },
  operator: { username: process.env.E2E_OPERATOR_USER || 'suyu', password: process.env.E2E_OPERATOR_PWD || 'suyu' },
  viewer:   { username: process.env.E2E_VIEWER_USER  || 'viewer',  password: process.env.E2E_VIEWER_PWD  || 'viewer' },
};

// 扩展 base test，注入登录能力
const test = base.extend({
  // 以 admin 身份登录的页面
  adminPage: async ({ page }, use) => {
    await loginAs(page, USERS.admin);
    await use(page);
  },

  // 以 operator 身份登录的页面
  operatorPage: async ({ page }, use) => {
    await loginAs(page, USERS.operator);
    await use(page);
  },

  // 以 viewer 身份登录的页面
  viewerPage: async ({ page }, use) => {
    await loginAs(page, USERS.viewer);
    await use(page);
  },

  // 已登录的页面（默认 admin）
  authedPage: async ({ page }, use) => {
    await loginAs(page, USERS.admin);
    await use(page);
  },
});

// 登录辅助函数
async function loginAs(page, user) {
  await page.goto('/login.html');
  // 等待登录表单
  await page.waitForSelector('input[placeholder*="用户名"], input[id*="username"], input[name="username"], .login-form input', { timeout: 5000 });
  
  // 填写用户名
  const usernameInput = page.locator('input[placeholder*="用户名"], input[id*="username"], input[name="username"], .login-form input').first();
  await usernameInput.fill(user.username);
  
  // 填写密码
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(user.password);
  
  // 点击登录
  const loginBtn = page.locator('button:has-text("登录"), button[type="submit"], .login-btn').first();
  await loginBtn.click();
  
  // 等待跳转到主页（检测商品列表或统计区域出现）
  await page.waitForURL(/\/(#.*)?$/, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000); // Vue 渲染
  
  // 验证登录成功 — 页面不应还停留在 login
  const currentUrl = page.url();
  if (currentUrl.includes('login')) {
    throw new Error(`登录失败，仍在登录页。URL: ${currentUrl}`);
  }
}

// API 请求辅助（绕过 UI 直接调接口）
async function apiRequest(page, method, path, body = null) {
  const token = await page.evaluate(() => {
    return localStorage.getItem('jwt_token') || '';
  });
  
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  const res = await page.request.fetch(`http://localhost:3000${path}`, options);
  return {
    status: res.status(),
    data: await res.json().catch(() => null),
  };
}

// 等待 Vue 组件渲染完成
async function waitForVueReady(page) {
  await page.waitForFunction(() => {
    return document.getElementById('app') && document.getElementById('app').__vue__;
  }, { timeout: 10000 });
  await page.waitForTimeout(500);
}

// 获取 Ant Design Modal/Drawer 的确认按钮
async function confirmModal(page) {
  // iView 的确认按钮文本
  const okBtn = page.locator('.ivu-btn-primary:has-text("确定"), .ivu-btn-text:has-text("确定"), button:has-text("确定")').last();
  await okBtn.click();
}

// 选择 Ant Design Select 的选项
async function selectOption(page, triggerSelector, optionText) {
  await page.click(triggerSelector);
  await page.waitForTimeout(300);
  const option = page.locator(`.ivu-select-dropdown-list .ivu-select-item:has-text("${optionText}")`).last();
  await option.click();
}

module.exports = { test, expect, USERS, loginAs, apiRequest, waitForVueReady, confirmModal, selectOption };
