// The macOS counterpart of install-smoke.ps1. First Glim as people get it: copied out of the release
// .dmg, checked (universal, ad-hoc signed, no Dock icon) and started. Then an update the way the
// updater delivers one: two debug builds, N and N+1, signed with a throwaway key and served from
// this machine; N updates itself from Settings and must come back as N+1 with its data intact.
// Usage: node scripts/install-smoke-mac.mjs <Glim .dmg>
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, openSync, readFileSync, readlinkSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { arch } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { control, endpoint, screencapture } from './mac-control.mjs';

assert.equal(process.platform, 'darwin', 'This test runs on macOS.');
const dmg = resolve(process.argv[2] ?? assert.fail('Name the Glim .dmg to install.'));
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
mkdirSync('.cache', { recursive: true });
const root = await mkdtemp(resolve('.cache/install-smoke-mac-'));
const shots = join(root, 'screenshots');
mkdirSync(shots);
// Glim's output, including the Glim an update restarts, which inherits these files.
const log = join(root, 'glim.log');
const output = () => openSync(log, 'a');

async function until(fn, description, timeout = 30000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out: ${description}${lastError ? ` (${lastError.message})` : ''}`);
}
const capture = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim();
// Isolated folders for one Glim: its data (with a space in the path) and the agents' homes.
function folders(name) {
  const data = join(root, name, 'Application Support', 'Glim');
  const home = join(root, name, 'agents');
  mkdirSync(data, { recursive: true });
  mkdirSync(join(home, '.claude'), { recursive: true });
  return { data, home, env: { ...process.env, GLIM_DATA_DIR: data, GLIM_AGENT_HOME: home } };
}
const launch = (app, env) =>
  spawn(join(app, 'Contents', 'MacOS', 'glim'), [], {
    env,
    stdio: ['ignore', output(), output()],
  });
// Runs a hook the way an agent would: through the shell, with the command Glim installed.
function hook(command, input, env) {
  const result = spawnSync('/bin/sh', ['-c', command], { env, input: JSON.stringify(input) });
  assert.equal(result.status, 0, 'Hooks must always succeed.');
}

try {
  // Install: what the .dmg holds, copied to an Applications folder the way Finder does.
  const mount = join(root, 'mount');
  const app = join(root, 'Applications', 'Glim.app');
  mkdirSync(mount);
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount]);
  try {
    assert.ok(existsSync(join(mount, 'Glim.app')), 'The disk image holds Glim.app.');
    assert.equal(
      readlinkSync(join(mount, 'Applications')),
      '/Applications',
      'The disk image offers Applications to drag Glim into.',
    );
    execFileSync('ditto', [join(mount, 'Glim.app'), app]);
  } finally {
    execFileSync('hdiutil', ['detach', mount]);
  }
  const plist = (key) =>
    capture('plutil', ['-extract', key, 'raw', join(app, 'Contents', 'Info.plist')]);
  assert.equal(plist('CFBundleShortVersionString'), version);
  assert.equal(plist('LSUIElement'), 'true', 'Glim lives in the menu bar, not the Dock.');
  assert.equal(plist('LSMinimumSystemVersion'), '13.0');
  assert.ok(plist('NSAppleEventsUsageDescription'), 'Go to agent explains its Automation prompt.');
  for (const binary of ['glim', 'glim-bridge']) {
    const archs = capture('lipo', ['-archs', join(app, 'Contents', 'MacOS', binary)]);
    assert.deepEqual(archs.split(' ').sort(), ['arm64', 'x86_64'], `${binary} is universal.`);
  }
  for (const license of ['glim.txt', 'manrope.txt', 'three.txt', 'third-party-notices.md']) {
    assert.ok(existsSync(join(app, 'Contents', 'Resources', 'licenses', license)), license);
  }
  execFileSync('codesign', ['--verify', '--deep', '--strict', app]);
  const signature = spawnSync('codesign', ['-dv', app], { encoding: 'utf8' }).stderr;
  assert.match(signature, /Signature=adhoc/, 'Glim is ad-hoc signed, so Apple Silicon runs it.');
  console.log(`Glim ${version} from the .dmg: universal, ad-hoc signed, menu-bar only, licensed.`);

  // The installed Glim starts, listens for its agents, and gives hooks their own helper.
  const installed = folders('installed');
  const helper = join(installed.data, 'bin', 'glim-bridge');
  const release = launch(app, installed.env);
  await until(
    () => existsSync(endpoint(installed.data)) && existsSync(helper),
    'Glim listening, with its hooks helper in place',
  );
  hook(
    `"${helper}" hook claude`,
    { session_id: 'install-smoke', hook_event_name: 'UserPromptSubmit', cwd: '/work/install' },
    installed.env,
  );
  await until(() => {
    const db = new DatabaseSync(join(installed.data, 'usage.sqlite3'), { readOnly: true });
    try {
      return JSON.stringify(db.prepare('SELECT * FROM sessions').all()).includes('install-smoke');
    } finally {
      db.close();
    }
  }, 'an agent event through the installed helper');
  await delay(1000);
  screencapture(join(shots, 'installed.png'));
  release.kill();
  console.log('The installed Glim runs and hears its agents through its own helper.');

  // Update: N and N+1, signed with a key made for this test, offered from this machine.
  const server = createServer(async (request, response) => {
    try {
      response.end(await readFile(join(root, request.url.slice(1))));
    } catch {
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const site = `http://127.0.0.1:${server.address().port}`;
  const key = join(root, 'updater.key');
  const password = 'glim-update-test';
  execFileSync('npx', ['tauri', 'signer', 'generate', '--ci', '-p', password, '-w', key], {
    stdio: 'inherit',
  });
  const pubkey = readFileSync(`${key}.pub`, 'utf8').trim();
  execFileSync('node', ['scripts/prepare-bridge.mjs'], { stdio: 'inherit' });
  const built = resolve('src-tauri/target/debug/bundle/macos');
  const build = (next) =>
    execFileSync(
      'npx',
      [
        'tauri',
        'build',
        '--debug',
        '--bundles',
        'app',
        '--config',
        JSON.stringify({
          version: next,
          plugins: {
            updater: {
              pubkey,
              endpoints: [`${site}/latest.json`],
              dangerousInsecureTransportProtocol: true,
            },
          },
        }),
      ],
      { stdio: 'inherit' },
    );
  build('9.9.1');
  execFileSync('tar', ['-czf', join(root, 'Glim.app.tar.gz'), '-C', built, 'Glim.app']);
  execFileSync(
    'npx',
    ['tauri', 'signer', 'sign', '-f', key, '-p', password, join(root, 'Glim.app.tar.gz')],
    { stdio: 'inherit' },
  );
  await writeFile(
    join(root, 'latest.json'),
    JSON.stringify({
      version: '9.9.1',
      notes: 'The update test',
      pub_date: new Date().toISOString(),
      platforms: {
        [`darwin-${arch() === 'arm64' ? 'aarch64' : 'x86_64'}`]: {
          signature: await readFile(join(root, 'Glim.app.tar.gz.sig'), 'utf8'),
          url: `${site}/Glim.app.tar.gz`,
        },
      },
    }),
  );
  build('9.9.0');
  const updating = join(root, 'update', 'Applications', 'Glim.app');
  execFileSync('ditto', [join(built, 'Glim.app'), updating]);

  // Glim N, set up the way a person leaves it: onboarded, Claude connected, an agent at work.
  const person = folders('person');
  const env = { ...person.env, GLIM_TEST_CONTROL: '1' };
  const { run, invoke, click, has } = control(person.data);
  launch(updating, env);
  await until(() => has('.glim-character'), 'Glim N drawn');
  assert.equal(await invoke('plugin:app|version'), '9.9.0');
  const { preferences } = await invoke('snapshot');
  await invoke('save_preferences', { preferences: { ...preferences, onboardingComplete: true } });
  await invoke('set_connector', { provider: 'claude', enabled: true });
  const settingsFile = join(person.home, '.claude', 'settings.json');
  const settings = await readFile(settingsFile, 'utf8');
  const claudeHook = JSON.parse(settings)
    .hooks.Stop.flatMap((g) => g.hooks)
    .find((h) => h.command.includes('hook claude')).command;
  hook(
    claudeHook,
    { session_id: 'update-smoke', hook_event_name: 'UserPromptSubmit', cwd: '/work/update' },
    env,
  );
  await until(
    async () => (await invoke('snapshot')).sessions.some((s) => s.id === 'update-smoke'),
    'the agent in Glim N',
  );

  // Settings, Check, Update: Glim installs N+1 over itself and opens it.
  await until(() => click(/^Glim:/), 'compact island');
  await until(() => click('Settings'), 'Settings button');
  await until(() => click('Check'), 'Check for updates');
  await until(
    () => run(`return document.body.innerText.includes('Glim 9.9.1 is available');`),
    'Glim 9.9.1 offered',
  );
  await click('Update');
  await until(
    async () => (await invoke('plugin:app|version')) === '9.9.1',
    'Glim N+1 running',
    60000,
  );
  assert.equal(
    capture('plutil', [
      '-extract',
      'CFBundleShortVersionString',
      'raw',
      join(updating, 'Contents', 'Info.plist'),
    ]),
    '9.9.1',
    'The update replaced Glim.app where it was.',
  );
  await until(() => has('.glim-character'), 'Glim N+1 drawn');
  const after = await invoke('snapshot');
  assert.equal(after.preferences.onboardingComplete, true, 'Preferences survive the update.');
  assert.ok(
    after.connectors.some((c) => c.provider === 'claude' && c.enabled),
    'Claude stays connected.',
  );
  assert.ok(
    after.sessions.some((s) => s.id === 'update-smoke'),
    'The agent at work is still there.',
  );
  assert.equal(await readFile(settingsFile, 'utf8'), settings, 'Agent settings are untouched.');
  assert.ok(
    readFileSync(join(person.data, 'bin', 'glim-bridge')).equals(
      readFileSync(join(updating, 'Contents', 'MacOS', 'glim-bridge')),
    ),
    "Hooks' helper is the new version's.",
  );
  await delay(1000);
  screencapture(join(shots, 'updated.png'));
  server.close();
  console.log('Glim 9.9.0 updated itself from Settings to 9.9.1 and kept its data.');
  console.log(`macOS install and update test passed. Screenshots: ${shots}`);
} catch (error) {
  if (existsSync(log)) console.error(`Glim's output:\n${readFileSync(log, 'utf8')}`);
  throw error;
} finally {
  // Every Glim this test started runs from inside its folder.
  spawnSync('pkill', ['-f', root]);
}
