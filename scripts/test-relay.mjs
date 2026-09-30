import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const executable = path.join(root, 'target', 'debug', 'glim-relay.exe');
const fixtureRoot = path.join(root, '.local', 'relay-tests');
await mkdir(fixtureRoot, { recursive: true });
const directory = await mkdtemp(path.join(fixtureRoot, 'run-'));

function relay(provider, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [provider], {
      windowsHide: true,
      env: { ...process.env, GLIM_DATA_DIR: directory },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Relay exceeded its deadline.'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdin.on('error', () => {}); // A bounded reader may exit before consuming oversized input.
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

try {
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      relay(
        index % 2 ? 'claude' : 'codex',
        JSON.stringify({
          session_id: `synthetic-${index}`,
          hook_event_name: 'UserPromptSubmit',
          cwd: 'C:/test-workspace/example',
          prompt: 'PRIVATE_FIXTURE',
          tool_input: { command: 'PRIVATE_FIXTURE' },
          transcript_path: 'PRIVATE_FIXTURE',
        }),
      ),
    ),
  );
  for (const result of results) assert.deepEqual(result, { code: 0, stdout: '', stderr: '' });
  const names = await readdir(path.join(directory, 'observations'));
  assert.equal(names.filter((name) => name.endsWith('.json')).length, 8);
  for (const name of names) {
    const content = await readFile(path.join(directory, 'observations', name), 'utf8');
    assert.ok(!content.includes('PRIVATE_FIXTURE'));
    assert.ok(!content.includes('C:/test-workspace'));
    const record = JSON.parse(content);
    assert.equal(record.project, 'example');
    assert.equal(record.activity, 'working');
    assert.ok(record.ancestry.length > 0);
  }
  for (const input of [
    'not json',
    'x'.repeat(300_000),
    JSON.stringify({ hook_event_name: 'Stop' }),
  ]) {
    assert.deepEqual(await relay('codex', input), { code: 0, stdout: '', stderr: '' });
  }
  assert.equal(
    (await readdir(path.join(directory, 'observations'))).filter((name) => name.endsWith('.json'))
      .length,
    8,
  );
  console.log(
    'PASS: eight concurrent relay processes persisted sanitized metadata; malformed and oversized input exited silently.',
  );
} finally {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(`${path.resolve(fixtureRoot)}${path.sep}`))
    throw new Error('Refusing cleanup outside owned fixture directory.');
  await rm(resolved, { recursive: true, force: true });
}
