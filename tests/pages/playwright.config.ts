import { defineConfig } from '@playwright/test';

const basePath = process.env.PAGES_TEST_BASE_PATH || '/CoreTaxGPT/';
const deployedURL = process.env.PAGES_TEST_URL;

export default defineConfig({
  testDir: '.',
  testMatch: 'pages.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../qa/playwright-report/pages' }]],
  outputDir: '../../qa/test-results/pages',
  use: {
    baseURL: deployedURL || `http://127.0.0.1:4174${basePath}`,
    viewport: { width: 1366, height: 768 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: deployedURL ? undefined : {
    command: 'node tests/pages/static-server.mjs',
    cwd: '../..',
    url: `http://127.0.0.1:4174${basePath}`,
    reuseExistingServer: false,
    timeout: 20000,
  },
});
