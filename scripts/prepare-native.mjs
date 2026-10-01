import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script through npm run native:prepare.');
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
mkdirSync(path.join(root, '.local', 'bundle'), { recursive: true });
// The packaged relay must also work on PCs without the Visual C++ developer runtime.
// Use an explicit target so the static CRT flags do not affect host proc-macro builds.
const target = 'x86_64-pc-windows-msvc';
const relayEnvironment = { ...process.env };
if (relayEnvironment.CARGO_ENCODED_RUSTFLAGS !== undefined) {
  relayEnvironment.CARGO_ENCODED_RUSTFLAGS = [
    relayEnvironment.CARGO_ENCODED_RUSTFLAGS,
    '-Ctarget-feature=+crt-static',
  ]
    .filter(Boolean)
    .join('\u001f');
} else {
  relayEnvironment.RUSTFLAGS = `${relayEnvironment.RUSTFLAGS ?? ''} -C target-feature=+crt-static`;
}
run(
  path.join(homedir(), '.cargo', 'bin', 'cargo.exe'),
  ['build', '--locked', '--release', '--target', target, '-p', 'glim-relay'],
  relayEnvironment,
);
run(process.execPath, [npm, 'run', 'package:extension']);
copyFileSync(
  path.join(root, 'target', target, 'release', 'glim-relay.exe'),
  path.join(root, '.local', 'bundle', 'glim-relay.exe'),
);
copyFileSync(
  path.join(root, '.local', 'glim-vscode-0.1.0.vsix'),
  path.join(root, '.local', 'bundle', 'glim-vscode.vsix'),
);
console.log('Native integration files prepared.');
