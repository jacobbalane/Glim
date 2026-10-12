import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';

// Runs only against a locally built executable and isolated provider directories.
// It never enables startup or uses the developer's provider credentials.
assert.equal(process.platform, 'win32', 'Native smoke tests require Windows.');
const executable = resolve(process.env.GLIM_TEST_EXE ?? 'src-tauri/target/debug/glim.exe');
const bridge = resolve(process.env.GLIM_TEST_BRIDGE ?? 'src-tauri/target/debug/glim-bridge.exe');
await mkdir('.cache', { recursive: true });
const root = process.env.GLIM_TEST_ROOT
  ? resolve(process.env.GLIM_TEST_ROOT)
  : await mkdtemp(resolve('.cache/native-smoke-'));
const data = join(root, 'data');
const home = join(root, 'agents');
const codexDir = join(home, '.codex');
const claudeDir = join(home, '.claude');
await Promise.all([
  mkdir(data, { recursive: true }),
  mkdir(join(codexDir, 'sessions'), { recursive: true }),
  mkdir(join(claudeDir, 'projects'), { recursive: true }),
]);
const original = {
  hooks: { Stop: [{ hooks: [{ type: 'command', command: 'existing-user-hook' }] }] },
  userSetting: 'preserve-me',
};
const originalClaude = {
  ...original,
  statusLine: { type: 'command', command: 'echo preserved-status', padding: 2 },
};
await writeFile(join(codexDir, 'hooks.json'), JSON.stringify(original));
await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(originalClaude));
const port = Number(process.env.GLIM_TEST_CDP_PORT ?? 9223);
const debuggerInUse = await fetch(`http://127.0.0.1:${port}/json/version`, {
  signal: AbortSignal.timeout(1000),
}).then(
  () => true,
  () => false,
);
assert.equal(
  debuggerInUse,
  false,
  'Test debugger port is already in use; refusing to attach to another app.',
);
const env = {
  ...process.env,
  GLIM_DATA_DIR: data,
  GLIM_AGENT_HOME: home,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
};
const app = spawn(executable, [], { env, windowsHide: true, stdio: 'pipe' });
let nativeError = '';
app.stderr.on('data', (chunk) => {
  nativeError += chunk.toString();
});
let browser;
async function until(fn, description, timeout = 20000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    if (app.exitCode !== null) throw new Error(`Glim exited (${app.exitCode}): ${nativeError}`);
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out: ${description}${lastError ? ` (${lastError.message})` : ''}`);
}
async function helper(args, input) {
  const child = spawn(bridge, args, { env, windowsHide: true, stdio: 'pipe' });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stdin.on('error', () => {});
  child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, 'Advisory helper must always succeed.');
  return output;
}
try {
  await until(
    async () => (await fetch(`http://127.0.0.1:${port}/json/version`)).ok,
    'WebView2 debugger',
  );
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await until(
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => !p.url().includes('view=') && p.url().includes('tauri.localhost')),
    'island WebView',
  );
  await page.waitForFunction(() => !!window.__TAURI_INTERNALS__);
  page.setDefaultTimeout(15000);
  await page.locator('.glim-character[data-renderer="3d"]').first().waitFor();
  const invoke = async (command, args = {}) => {
    const watchdog = setTimeout(() => app.kill(), 20000);
    try {
      return await page.evaluate(
        ({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args),
        { command, args },
      );
    } finally {
      clearTimeout(watchdog);
    }
  };
  const regionChecks = [];
  const checkRegion = async (label) => {
    await delay(600); // Let the surface spring and its native IPC updates settle.
    const surface = await page.getByTestId('island').evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, viewportWidth: innerWidth };
    });
    const probe = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-File',
        resolve('scripts/inspect-native-region.ps1'),
        '-GlimProcessId',
        String(app.pid),
      ],
      { windowsHide: true, stdio: 'pipe' },
    );
    let output = '',
      error = '';
    probe.stdout.on('data', (chunk) => {
      output += chunk;
    });
    probe.stderr.on('data', (chunk) => {
      error += chunk;
    });
    const [code] = await once(probe, 'exit');
    assert.equal(code, 0, error);
    const native = JSON.parse(output);
    regionChecks.push({ label, surface, ...native });
    await writeFile(join(root, 'native-regions.json'), JSON.stringify(regionChecks, null, 2));
    const scale = native.dpi / 96;
    assert.ok(
      Math.abs(native.region.Bottom - Math.round(surface.height) * scale) <= 1,
      `${label}: region follows painted height`,
    );
    assert.equal(native.region.Top, 0);
    assert.equal(native.lastRowInside, true);
    assert.equal(native.firstRowBelowOutside, true);
    assert.equal(
      native.actualHitInside,
      true,
      `${label}: native body receives pointer hits: ${native.insideHitWindow}`,
    );
    assert.equal(
      native.actualHitBelowPassesThrough,
      true,
      `${label}: first transparent row passes through`,
    );
    console.log(
      `Native ${label}: ${native.dpi} DPI, ${native.region.Bottom}px region; actual click-through below verified.`,
    );
  };
  const initial = await invoke('snapshot');
  assert.equal(initial.sessions.length, 0, 'Native mode must never include demo sessions.');
  console.log('Native startup and onboarding responsive.');
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  for (const provider of ['Codex', 'Claude Code']) {
    const row = page.locator('.conn').filter({ hasText: provider });
    await row.locator('.conn-head').click();
    if (provider === 'Codex')
      assert.match(await row.innerText(), /\/hooks/, 'Setup must explain Codex hook trust.');
    await row
      .getByRole('button', {
        name: `Connect ${provider === 'Codex' ? 'Codex' : 'Claude'}`,
        exact: true,
      })
      .click();
    await row.locator('.conn-status').waitFor();
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Keep visible', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const preferences = (await invoke('snapshot')).preferences;
  assert.equal(preferences.onboardingComplete, true);
  await page.getByRole('button', { name: 'Collapse Glim' }).click();
  await checkRegion('compact');
  assert.ok((await invoke('snapshot')).connectors.every((connector) => connector.enabled));
  console.log('Onboarding completed and isolated provider connectors installed through the UI.');
  await page
    .getByTestId('island')
    .evaluate((node) => node.setAttribute('data-persistence-check', 'same'));
  for (const view of ['settings', 'history']) {
    await invoke('open_panel', { view });
    await page
      .getByRole('heading', { name: view === 'settings' ? 'Settings' : 'Usage', exact: true })
      .waitFor();
    assert.equal(
      browser.contexts().flatMap((c) => c.pages()).length,
      1,
      'All views must share one WebView.',
    );
    assert.equal(await page.getByTestId('island').getAttribute('data-persistence-check'), 'same');
    await checkRegion(view);
    await page.mouse.click(40, 100);
    await page.getByRole('button', { name: /^Glim:/ }).waitFor();
    assert.equal(await page.getByTestId('island').getAttribute('data-expanded'), 'false');
  }
  await invoke('open_panel', { view: 'setup' });
  await page.getByRole('button', { name: 'Get started', exact: true }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.getByRole('button', { name: /^Glim:/ }).waitFor();
  console.log('Settings, history, and setup collapse on outside clicks or focus loss.');
  const transcript = join(codexDir, 'sessions', 'native-smoke.jsonl');
  const token = JSON.parse(await readFile('src-tauri/tests/fixtures/codex-token.json', 'utf8'));
  token.timestamp = new Date().toISOString();
  const sentinel = 'GLIM_PRIVATE_TEST_CONTENT_MUST_NOT_PERSIST';
  const meta = { type: 'session_meta', payload: { id: 'native-codex', cwd: 'C:/work/glim-smoke' } };
  await writeFile(
    transcript,
    [meta, { type: 'response_item', payload: { type: 'message', content: sentinel } }, token]
      .map(JSON.stringify)
      .join('\n') + '\n',
  );
  const hook = {
    session_id: 'native-codex',
    hook_event_name: 'UserPromptSubmit',
    cwd: 'C:/work/glim-smoke',
    transcript_path: transcript,
    prompt: sentinel,
  };
  await helper(['hook', 'codex'], hook);
  const working = await until(async () => {
    const session = (await invoke('snapshot')).sessions.find((s) => s.id === 'native-codex');
    return session?.tokens?.input === 10000 && session.activity === 'working' && session;
  }, 'native pipe event and transcript usage');
  assert.equal(working.tokens.output, 2000);
  assert.equal(working.tokens.cached, 6000);
  assert.equal(working.contextPercent, 10);
  console.log('Named pipe event and transcript counters received.');
  await appendFile(transcript, JSON.stringify(token) + '\n');
  await delay(1000);
  assert.equal(
    (await invoke('history')).find((d) => d.provider === 'codex').input,
    10000,
    'Replays must not double count.',
  );
  await helper(['hook', 'codex'], { ...hook, hook_event_name: 'PermissionRequest' });
  await until(
    async () =>
      (await invoke('snapshot')).sessions.find((s) => s.id === 'native-codex')?.activity ===
      'waiting',
    'permission state',
  );
  await invoke('save_preferences', { preferences: { ...preferences, paused: true } });
  await helper(['hook', 'codex'], { ...hook, hook_event_name: 'Stop' });
  await delay(1000);
  assert.equal(
    (await invoke('snapshot')).sessions.find((s) => s.id === 'native-codex').activity,
    'waiting',
    'Pause must stop collection.',
  );
  await invoke('save_preferences', { preferences });
  await helper(['hook', 'codex'], { ...hook, hook_event_name: 'Stop' });
  await until(
    async () =>
      (await invoke('snapshot')).sessions.find((s) => s.id === 'native-codex')?.activity === 'idle',
    'turn completion',
  );
  const status = {
    session_id: 'native-claude',
    workspace: { project_dir: 'C:/work/glim-smoke' },
    model: { display_name: 'Claude test' },
    context_window: { used_percentage: 38 },
    rate_limits: {
      five_hour: { used_percentage: 24, resets_at: Math.floor(Date.now() / 1000) + 3600 },
    },
    prompt: sentinel,
  };
  const relayOutput = await helper(
    ['statusline', '--relay', join(data, 'connectors/claude-statusline.json')],
    status,
  );
  assert.match(relayOutput, /preserved-status/, 'Existing status line must keep rendering.');
  await until(
    async () =>
      (await invoke('snapshot')).sessions.find((s) => s.id === 'native-claude')?.limits[0]
        ?.usedPercent === 24,
    'Claude context and limits',
  );
  await helper(['hook', 'claude'], {
    session_id: 'native-claude',
    hook_event_name: 'UserPromptSubmit',
  });
  await helper(['hook', 'claude'], {
    session_id: 'native-claude',
    hook_event_name: 'PreToolUse',
    tool_name: 'AskUserQuestion',
  });
  await until(
    async () =>
      (await invoke('snapshot')).sessions.find((s) => s.id === 'native-claude')?.detail ===
      'Waiting for your answer',
    'question attention',
  );
  await helper(['hook', 'claude'], {
    session_id: 'native-claude',
    hook_event_name: 'PostToolUse',
    tool_name: 'AskUserQuestion',
  });
  await helper(['hook', 'codex'], { ...hook, hook_event_name: 'PermissionRequest' });
  await until(
    async () =>
      (await invoke('snapshot')).sessions.find((s) => s.id === 'native-codex')?.activity ===
      'waiting',
    'UI attention state',
  );
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await page.getByRole('button', { name: 'Collapse Glim' }).waitFor();
  await page.getByRole('button', { name: /^glim-smoke · Claude:/ }).click();
  await page.locator('.hero .glim-character[data-renderer="3d"]').waitFor();
  await checkRegion('live-agent');
  assert.equal(await page.locator('.hero-head .logo').getAttribute('src'), '/providers/claude.svg');
  await delay(400);
  await page
    .getByTestId('island')
    .screenshot({ path: join(root, 'native-island.png'), omitBackground: true });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByRole('region', { name: 'Session usage details' }).waitFor();
  assert.match(
    await page.getByRole('region', { name: 'Session usage details' }).innerText(),
    /24%/,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Glim:/ }).waitFor({ state: 'visible' });
  await invoke('clear_history');
  assert.deepEqual(await invoke('history'), []);
  await appendFile(transcript, JSON.stringify(token) + '\n');
  await delay(1000);
  assert.deepEqual(await invoke('history'), [], 'Clear history must retain replay protection.');
  await invoke('set_connector', { provider: 'codex', enabled: false });
  await invoke('set_connector', { provider: 'claude', enabled: false });
  assert.deepEqual(JSON.parse(await readFile(join(codexDir, 'hooks.json'), 'utf8')), original);
  assert.deepEqual(
    JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf8')),
    originalClaude,
  );
  const db = new DatabaseSync(join(data, 'usage.sqlite3'), { readOnly: true });
  for (const table of [
    'sessions',
    'requests',
    'baselines',
    'cursors',
    'events',
    'usage',
    'preferences',
  ]) {
    assert.ok(
      !JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()).includes(sentinel),
      `${table} must exclude raw content.`,
    );
  }
  db.close();
  await helper(['hook', 'codex'], '{malformed');
  if (process.env.GLIM_TEST_KEEP_CONNECTORS === '1') {
    await invoke('set_connector', { provider: 'codex', enabled: true });
    await invoke('set_connector', { provider: 'claude', enabled: true });
  }
  await writeFile(
    join(root, 'result.json'),
    JSON.stringify({ preferences, original, originalClaude }),
  );
  console.log(
    'Native smoke passed: empty startup, connectors, named pipe, counters, replay protection, pause, limits, status-line relay, UI, history clearing, restoration, privacy.',
  );
  console.log(`Isolated test artifacts: ${root}`);
} finally {
  if (browser) await browser.close();
  if (app.exitCode === null) {
    app.kill();
    await once(app, 'exit');
  }
}
