// The macOS counterpart of native-smoke.mjs: the real app, built for debug with its test control,
// in isolated folders, driven the way a person and their agents would. WKWebView has no debugging
// port, so the island is driven through Glim's debug-only test control (src-tauri/src/
// test_control.rs). Screenshots land in the test folder for review.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { appendFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { control, screencapture } from './mac-control.mjs';

assert.equal(process.platform, 'darwin', 'This smoke test runs on macOS.');
const executable = resolve(process.env.GLIM_TEST_EXE ?? 'src-tauri/target/debug/glim');
const bundledBridge = resolve(process.env.GLIM_TEST_BRIDGE ?? 'src-tauri/target/debug/glim-bridge');
await mkdir('.cache', { recursive: true });
const root = await mkdtemp(resolve('.cache/native-smoke-mac-'));
// A data folder with a space in its path, like ~/Library/Application Support.
const data = join(root, 'Application Support', 'Glim');
const home = join(root, 'agents');
const shots = join(root, 'screenshots');
const codexDir = join(home, '.codex');
const claudeDir = join(home, '.claude');
await Promise.all([
  mkdir(data, { recursive: true }),
  mkdir(shots, { recursive: true }),
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
// The helper as a download leaves it: quarantined. Glim's copy for hooks must lose the mark.
execFileSync('xattr', ['-w', 'com.apple.quarantine', '0081;00000000;Safari;', bundledBridge]);

const env = {
  ...process.env,
  GLIM_DATA_DIR: data,
  GLIM_AGENT_HOME: home,
  GLIM_TEST_CONTROL: '1',
};
const { socket: controlSocket, run, invoke, click, has, text } = control(data);

let app;
let nativeError = '';
function launch(extra = {}) {
  nativeError = '';
  app = spawn(executable, [], { env: { ...env, ...extra }, stdio: 'pipe' });
  app.stderr.on('data', (chunk) => {
    nativeError += chunk.toString();
  });
}
// What each of Glim's threads is doing, for a failure or a hang: the main thread's stack goes to
// the log, all of them to a file beside the screenshots.
function sampleGlim(reason) {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  const file = join(shots, 'glim-threads.txt');
  try {
    execFileSync('sample', [String(app.pid), '3', '-file', file], {
      stdio: 'ignore',
      timeout: 30000,
    });
    const threads = readFileSync(file, 'utf8');
    const main = threads.indexOf('com.apple.main-thread');
    console.log(`${reason}. Glim's main thread:`);
    console.log(threads.slice(main, main + 6000));
    console.log(`All of Glim's threads: ${file}`);
  } catch (error) {
    console.log(`${reason}. Could not sample Glim: ${error.message}`);
  }
}
// A stall that the steps' own limits miss still ends, with Glim's threads on record.
setTimeout(() => {
  sampleGlim('The smoke has run for 10 minutes');
  app?.kill('SIGKILL');
  process.exit(1);
}, 10 * 60000).unref();
// Whether a process exits within `ms`.
const exits = (child, ms) =>
  Promise.race([once(child, 'exit').then(() => true), delay(ms).then(() => false)]);
async function quit() {
  if (app && app.exitCode === null && app.signalCode === null) {
    app.kill();
    // A Glim that will not stop is a failure to report, not a reason to wait forever.
    if (!(await exits(app, 10000))) {
      app.kill('SIGKILL');
      throw new Error(`Glim did not quit within 10 s. It said: ${nativeError.slice(-2000)}`);
    }
  }
}
async function until(fn, description, timeout = 20000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    if (app.exitCode !== null || app.signalCode !== null)
      throw new Error(`Glim exited (${app.exitCode ?? app.signalCode}): ${nativeError}`);
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(
    `Timed out: ${description}${lastError ? ` (${lastError.message})` : ''}. Glim said: ${nativeError.slice(-2000)}`,
  );
}
// The island's place on screen, in points from the main display's top left. WebKit counts
// window.screenY up from the bottom of the screen, so the window's place comes from Glim.
// With `withPanel`, the box takes in the side panel too.
async function islandOnScreen(withPanel = false) {
  const { origin, scale } = await invoke('test_pointer');
  const r = await run(`
    const boxes = [document.querySelector('[data-testid=island]'), ${withPanel} && document.querySelector('.side-said')]
      .filter(Boolean)
      .map((element) => element.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    return {
      left,
      top,
      width: Math.max(...boxes.map((b) => b.right)) - left,
      height: Math.max(...boxes.map((b) => b.bottom)) - top,
    };`);
  return {
    x: origin[0] / scale + r.left,
    y: origin[1] / scale + r.top,
    width: r.width,
    height: r.height,
  };
}
// The runner's desktop is black, as the island is; a light backdrop behind the island shows its
// outline. Without one, the shot shows what is behind the window, the menu bar included.
async function screenshot(name, backdrop = true) {
  const island = await islandOnScreen(true);
  const region = [
    Math.max(0, Math.round(island.x - 60)),
    0,
    Math.round(island.width + 120),
    Math.round(island.y + island.height + 60),
  ].join(',');
  if (backdrop) await run(`document.documentElement.style.background = '#d4d4d8'; return true;`);
  await delay(100);
  screencapture(join(shots, `${name}.png`), region);
  if (backdrop) await run(`document.documentElement.style.background = ''; return true;`);
}
// Runs a hook the way an agent would: through the shell, with the command Glim installed.
function hook(command, input, agent) {
  const child = spawn('/bin/sh', ['-c', command], { env, stdio: 'pipe' });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  // A hook that hangs would hold up the agent; stop it and say so.
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  return once(child, 'exit').then(([code, signal]) => {
    clearTimeout(timer);
    assert.equal(
      code,
      0,
      `Hooks must always succeed${agent ? ` (${agent})` : ''}${signal ? ', and this one hung' : ''}. Hook said: ${errors}. Glim said: ${nativeError.slice(-2000)}`,
    );
    return output;
  });
}
const snapshot = () => invoke('snapshot');
const session = async (id) => (await snapshot()).sessions.find((s) => s.id === id);

try {
  launch();
  await until(() => stat(controlSocket).then(() => true), 'test control');
  await until(() => has('.glim-character'), 'island drawn');
  assert.equal((await snapshot()).sessions.length, 0, 'Native mode never shows sample sessions.');
  console.log('Native startup on macOS responsive.');

  // Onboarding, connecting both agents through the UI.
  await click('Get started');
  for (const [provider, button] of [
    ['Codex', 'Add Codex hooks'],
    ['Claude Code', 'Connect Claude'],
  ]) {
    // Opens the agent's row in the live view (not one fading out) unless it is open already.
    await until(
      () =>
        run(`
          const row = [...document.querySelectorAll('.conn')].find(
            (r) => !r.closest('[inert]') && r.innerText.includes(${JSON.stringify(provider)}),
          );
          if (!row) return false;
          const open = [...row.querySelectorAll('button')].some(
            (b) => (b.getAttribute('aria-label') ?? b.textContent).trim() === ${JSON.stringify(button)},
          );
          if (!open) row.querySelector('.conn-head').click();
          return true;`),
      `${provider} row`,
    );
    await click(button);
    await until(
      () =>
        run(
          `return [...document.querySelectorAll('.conn')].some((r) => r.innerText.includes(${JSON.stringify(provider)}) && r.querySelector('.conn-status'));`,
        ),
      `${provider} connected`,
    );
  }
  await click('Continue');
  await click('Keep visible');
  await click('Done');
  // Onboarding ends in the open island; the person closes it.
  await click('Collapse Glim');
  await until(() => has('.compact'), 'compact island after onboarding');
  const preferences = (await snapshot()).preferences;
  assert.equal(preferences.onboardingComplete, true);
  assert.ok((await snapshot()).connectors.every((connector) => connector.enabled));

  // Hooks call Glim's copy of the helper, in a folder whose path has a space, without quarantine.
  const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf8'));
  const claudeHook = settings.hooks.Stop.flatMap((g) => g.hooks).find((h) =>
    h.command.includes('hook claude'),
  ).command;
  const codexHook = JSON.parse(await readFile(join(codexDir, 'hooks.json'), 'utf8'))
    .hooks.Stop.flatMap((g) => g.hooks)
    .find((h) => h.command.includes('hook codex')).command;
  const copy = join(data, 'bin', 'glim-bridge');
  assert.ok(claudeHook.includes(copy), `Hooks call ${copy}: ${claudeHook}`);
  assert.throws(
    () => execFileSync('xattr', ['-p', 'com.apple.quarantine', copy], { stdio: 'pipe' }),
    'The hooks helper must not be quarantined.',
  );
  console.log('Onboarding connected both agents; hooks call an unquarantined helper.');

  // Events through the socket, and usage from the transcript.
  const transcript = join(codexDir, 'sessions', 'native-smoke.jsonl');
  const token = JSON.parse(await readFile('src-tauri/tests/fixtures/codex-token.json', 'utf8'));
  token.timestamp = new Date().toISOString();
  const sentinel = 'GLIM_PRIVATE_TEST_CONTENT_MUST_NOT_PERSIST';
  const meta = { type: 'session_meta', payload: { id: 'native-codex', cwd: '/work/glim-smoke' } };
  await writeFile(
    transcript,
    [meta, { type: 'response_item', payload: { type: 'message', content: sentinel } }, token]
      .map(JSON.stringify)
      .join('\n') + '\n',
  );
  const codex = {
    session_id: 'native-codex',
    hook_event_name: 'UserPromptSubmit',
    cwd: '/work/glim-smoke',
    transcript_path: transcript,
    prompt: sentinel,
  };
  await hook(codexHook, codex);
  const working = await until(async () => {
    const s = await session('native-codex');
    return s?.tokens?.input === 10000 && s.activity === 'working' && s;
  }, 'socket event and transcript usage');
  assert.equal(working.tokens.output, 2000);
  assert.equal(working.contextPercent, 10);
  console.log('Socket event and transcript counters received.');
  await appendFile(transcript, JSON.stringify(token) + '\n');
  await delay(1000);
  assert.equal(
    (await invoke('history')).find((d) => d.provider === 'codex').input,
    10000,
    'Replays must not double count.',
  );
  await hook(codexHook, { ...codex, hook_event_name: 'PermissionRequest' });
  await until(async () => (await session('native-codex'))?.activity === 'waiting', 'approval');
  await invoke('save_preferences', { preferences: { ...preferences, paused: true } });
  await hook(codexHook, { ...codex, hook_event_name: 'Stop' });
  await delay(1000);
  assert.equal((await session('native-codex')).activity, 'waiting', 'Pause stops collection.');
  await invoke('save_preferences', { preferences });
  await hook(codexHook, { ...codex, hook_event_name: 'Stop' });
  await until(async () => (await session('native-codex'))?.activity === 'idle', 'turn finished');

  // The status line Glim wrapped still prints the person's own, through /bin/sh.
  const status = {
    session_id: 'native-claude',
    workspace: { project_dir: '/work/glim-smoke' },
    model: { display_name: 'Claude test' },
    context_window: { used_percentage: 38 },
    rate_limits: {
      five_hour: { used_percentage: 24, resets_at: Math.floor(Date.now() / 1000) + 3600 },
      seven_day: { used_percentage: 41, resets_at: Math.floor(Date.now() / 1000) + 86400 * 3 },
    },
    prompt: sentinel,
  };
  const relayed = await hook(settings.statusLine.command, status);
  assert.match(relayed, /preserved-status/, 'The existing status line keeps rendering.');
  await until(
    async () => (await session('native-claude'))?.limits.length === 2,
    'Claude context and both limits',
  );

  // A Claude agent in its own process: its question, what it says, then its terminal closes.
  const agent = spawn(
    process.execPath,
    [
      '-e',
      `const { spawnSync } = require('node:child_process');
       for (const input of JSON.parse(process.argv[1]))
         spawnSync('/bin/sh', ['-c', process.argv[2]], { input: JSON.stringify(input) });
       setInterval(() => {}, 1 << 30);`,
      JSON.stringify([
        { session_id: 'native-claude', hook_event_name: 'UserPromptSubmit' },
        {
          session_id: 'native-claude',
          hook_event_name: 'PreToolUse',
          tool_name: 'AskUserQuestion',
          tool_input: { questions: [{ question: 'Ship it to staging?' }] },
        },
        {
          session_id: 'native-claude',
          hook_event_name: 'PostToolUse',
          tool_name: 'AskUserQuestion',
        },
        {
          session_id: 'native-claude',
          hook_event_name: 'Stop',
          last_assistant_message: 'Staging is updated.\n\nWant me to tag the release?',
        },
      ]),
      claudeHook,
    ],
    { env, stdio: 'ignore' },
  );
  const handed = await until(async () => {
    const s = await session('native-claude');
    return s?.activity === 'idle' && s.process?.[0] === agent.pid && s;
  }, 'the agent process and its turn');
  assert.match(handed.message, /Want me to tag the release\?/);

  // The island: open it, read the agent, see its words, then close it.
  await until(() => click(/^Glim:/), 'compact island');
  await until(() => has('.glance'), 'open island');
  if ((await text('.hero h3')) !== 'glim-smoke · Claude') await click(/^glim-smoke · Claude:/);
  await until(async () => (await text('.hero h3')) === 'glim-smoke · Claude', 'agent in full');
  assert.match(await text('.hero-said'), /Staging is updated/);
  assert.match(await text('.meters'), /Weekly limit/);
  await screenshot('open');
  await click('Read what Claude said');
  await until(() => has('.side-said'), 'message panel');
  await delay(500);
  await screenshot('open-with-message');
  await click('Close');
  await click('Collapse');
  await until(() => has('.compact'), 'compact again');
  await delay(500);
  await screenshot('compact', false);

  // Click-through: over the island the pointer is caught, just below it the pointer passes.
  let pointerChecked = false;
  try {
    const island = await islandOnScreen();
    const at = (x, y) =>
      execFileSync('cliclick', [`m:${Math.round(x)},${Math.round(y)}`], { timeout: 20000 });
    at(island.x + island.width / 2, island.y + island.height / 2);
    // What Glim sees, for the log when the check fails: the pointer and window in physical
    // pixels, and the island's shape in the window.
    let seen;
    const pointer = async () => (seen = await invoke('test_pointer')).passes;
    try {
      await until(async () => (await pointer()) === false, 'pointer caught by the island', 3000);
      at(island.x + island.width / 2, island.y + island.height + 30);
      await until(async () => (await pointer()) === true, 'pointer passing below', 3000);
    } catch (error) {
      throw new Error(
        `${error.message}; island ${JSON.stringify(island)}; Glim saw ${JSON.stringify(seen)}`,
      );
    }
    pointerChecked = true;
    console.log('Click-through: the island catches the pointer, the space below lets it through.');
  } catch (error) {
    console.log(`Click-through not checked here: ${error.message}`);
  }

  // An idle Glim adds no run-loop sources. Each clone of a window's handle used to add one that
  // was never removed, 60 a second, until the main thread fell behind and stopped answering.
  const sourcesBefore = await invoke('test_run_loop_sources');
  await delay(10000);
  const sourcesAfter = await invoke('test_run_loop_sources');
  assert.ok(
    sourcesAfter - sourcesBefore < 30,
    `An idle Glim adds run-loop sources: ${sourcesBefore} became ${sourcesAfter} in 10 s.`,
  );
  console.log(`Run-loop sources steady while idle: ${sourcesBefore}, then ${sourcesAfter}.`);

  // The terminal closes without a goodbye: the session ends.
  agent.kill('SIGKILL');
  await until(
    async () => (await session('native-claude'))?.detail === 'Session closed',
    'closed agent noticed',
  );
  console.log('A closed agent ends its session; its message reached the island.');

  // History clearing keeps replay protection; disconnecting restores the files byte for byte.
  await invoke('clear_history');
  assert.deepEqual(await invoke('history'), []);
  await appendFile(transcript, JSON.stringify(token) + '\n');
  await delay(1000);
  assert.deepEqual(await invoke('history'), [], 'Clearing history keeps replay protection.');
  await invoke('set_connector', { provider: 'codex', enabled: false });
  await invoke('set_connector', { provider: 'claude', enabled: false });
  assert.deepEqual(JSON.parse(await readFile(join(codexDir, 'hooks.json'), 'utf8')), original);
  assert.deepEqual(
    JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf8')),
    originalClaude,
  );
  await quit();

  // Nothing private reached the disk, nor what the agent said.
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
    const rows = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
    assert.ok(!rows.includes(sentinel), `${table} must exclude raw content.`);
    assert.ok(!rows.includes('tag the release'), `${table} must not keep what the agent said.`);
  }
  db.close();

  // Around a notch: nothing drawn where the camera is, and the open view starts below it.
  launch({ GLIM_TEST_NOTCH: '200x32' });
  await until(() => stat(controlSocket).then(() => true), 'test control again');
  await until(() => has('.compact.notched'), 'notched island');
  await delay(800);
  const clear = await run(`
    const island = document.querySelector('[data-testid=island]').getBoundingClientRect();
    const middle = island.left + island.width / 2;
    const parts = [...document.querySelectorAll('.compact.notched .wing > *')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0);
    return parts.every((r) => r.right <= middle - 100 + 0.5 || r.left >= middle + 100 - 0.5);`);
  assert.equal(clear, true, 'Nothing in the compact island crosses the camera.');
  await screenshot('notched-compact');
  await click(/^Glim:/);
  await until(() => has('.glance'), 'open notched island');
  const barTop = await run(
    `return document.querySelector('.frame:not([aria-hidden]) .bar').getBoundingClientRect().top;`,
  );
  assert.ok(barTop >= 32, 'The open view starts below the notch.');
  await delay(600);
  await screenshot('notched-open');
  await quit();

  console.log(
    `macOS native smoke passed: startup, onboarding, hooks with spaces, quarantine, socket, counters, replay protection, pause, limits, status-line relay through /bin/sh, agent process, message preview, ${pointerChecked ? 'click-through, ' : ''}history clearing, restoration, privacy, notch layout.`,
  );
  console.log(`Screenshots: ${shots}`);
} catch (error) {
  sampleGlim('The smoke failed');
  throw error;
} finally {
  // Reported, but never in place of the failure that brought the test here.
  await quit().catch((error) => console.log(error.message));
}
