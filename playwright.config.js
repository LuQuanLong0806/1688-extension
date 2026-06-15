// playwright.config.js — E2E 测试配置
// 运行: npx playwright test
// 报告: npx playwright show-report

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,        // 单个测试超时 30s
  expect: { timeout: 5_000 },
  fullyParallel: false,    // E2E 串行（共享服务端状态）
  retries: 0,
  reporter: [
    ['html', { open: 'never', outputFolder: 'e2e-report' }],
    ['list']
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',   // 失败时保留 trace
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          // 使用系统 Chrome，共享 cookie/登录态
          // 如果想用独立浏览器，注释掉 executablePath
          // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        },
      },
    },
  ],

  // 全局 setup/teardown
  globalSetup: undefined,
  globalTeardown: undefined,
});
