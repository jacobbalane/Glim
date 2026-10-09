import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    headless: true,
    channel: process.env.GLIM_TEST_BROWSER === 'chromium' ? undefined : 'chrome',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: true },
});
