import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';

assert.ok(process.env.GLIM_TEST_ROOT, 'Run through install-smoke.ps1.');
const result = JSON.parse(await readFile(join(process.env.GLIM_TEST_ROOT, 'result.json'), 'utf8'));
const env = {
  ...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9224',
};
const app = spawn(process.env.GLIM_TEST_EXE, [], { env, windowsHide: true, stdio: 'pipe' });
let browser;
let secondary;
let nativeError = '';
app.stderr.on('data', (chunk) => {
  nativeError += chunk.toString();
});
try {
  const end = Date.now() + 20000;
  while (true) {
    assert.equal(app.exitCode, null, `Glim exited: ${nativeError}`);
    try {
      if ((await fetch('http://127.0.0.1:9224/json/version')).ok) break;
    } catch {}
    if (Date.now() > end) throw new Error('Restart did not expose its WebView.');
    await delay(200);
  }
  browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const page = browser.contexts().flatMap((context) => context.pages())[0];
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
  const snapshot = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('snapshot'));
  assert.deepEqual(
    snapshot.preferences,
    result.preferences,
    'Preferences must persist across restarts.',
  );
  assert.ok(
    snapshot.connectors.every((connector) => connector.enabled),
    'Connections must persist.',
  );
  assert.equal(
    await page.getByRole('button', { name: 'Get started', exact: true }).count(),
    0,
    'Onboarding must appear only once.',
  );
  secondary = spawn(process.env.GLIM_TEST_EXE, [], { env, windowsHide: true, stdio: 'ignore' });
  const timeout = setTimeout(() => secondary.kill(), 15000);
  const [code] = await once(secondary, 'exit');
  clearTimeout(timeout);
  assert.equal(code, 0, 'A second launch must route to the existing app.');
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  assert.equal(
    browser.contexts().flatMap((context) => context.pages()).length,
    1,
    'A second launch must not create another window.',
  );
  console.log(
    'Installed app restart, saved preferences/connections, and single-instance navigation verified.',
  );
} finally {
  if (secondary && secondary.exitCode === null) secondary.kill();
  if (browser) await browser.close();
  if (app.exitCode === null) {
    app.kill();
    await once(app, 'exit');
  }
}
