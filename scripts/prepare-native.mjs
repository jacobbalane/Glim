import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run native:prepare.');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync(path.join(root, '.local', 'bundle'), { recursive: true });
run(path.join(homedir(), '.cargo', 'bin', 'cargo.exe'), [
  'build',
  '--locked',
  '--release',
  '-p',
  'glim-relay',
]);
run(process.execPath, [npm, 'run', 'package:extension']);
copyFileSync(
  path.join(root, 'target', 'release', 'glim-relay.exe'),
  path.join(root, '.local', 'bundle', 'glim-relay.exe'),
);
copyFileSync(
  path.join(root, '.local', 'glim-vscode-0.1.0.vsix'),
  path.join(root, '.local', 'bundle', 'glim-vscode.vsix'),
);
console.log('Native integration files prepared.');
