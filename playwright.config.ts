import { defineConfig } from '@playwright/test';
const port = Number(process.env.GLIM_TEST_PORT ?? 1421);
const url = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: url,
    headless: true,
    channel: process.env.GLIM_TEST_BROWSER === 'chromium' ? undefined : 'chrome',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Always serve this checkout; an existing preview may belong to a different worktree.
  webServer: { command: `npm run dev -- --port ${port}`, url, reuseExistingServer: false },
});
