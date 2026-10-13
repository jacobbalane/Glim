import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    headless: true,
    // Installed Chrome by default; GLIM_TEST_BROWSER=chromium or webkit (Safari's engine, the one
    // the macOS app's view runs on) picks Playwright's own.
    browserName: process.env.GLIM_TEST_BROWSER === 'webkit' ? 'webkit' : 'chromium',
    channel: process.env.GLIM_TEST_BROWSER ? undefined : 'chrome',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: true },
});
