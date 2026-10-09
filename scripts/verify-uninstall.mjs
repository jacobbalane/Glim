import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(process.argv[2], 'smoke');
const result = JSON.parse(await readFile(join(root, 'result.json'), 'utf8'));
assert.deepEqual(
  JSON.parse(await readFile(join(root, 'agents/.codex/hooks.json'), 'utf8')),
  result.original,
);
assert.deepEqual(
  JSON.parse(await readFile(join(root, 'agents/.claude/settings.json'), 'utf8')),
  result.originalClaude,
);
await access(join(root, 'data/usage.sqlite3'));
console.log('Uninstall restored existing hooks and status line, and retained local data.');
