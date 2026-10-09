import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const release = process.argv.includes('--release');
const target = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (!target?.includes('windows')) throw new Error('Glim v0.1 packages are built on Windows.');
const binaries = resolve('src-tauri/binaries');
mkdirSync(binaries, { recursive: true });
// Tauri validates sidecar paths during the helper's own build. Seed a temporary file;
// it is overwritten with the actual native helper before the application is built.
const sidecar = resolve(binaries, `glim-bridge-${target}.exe`);
if (!existsSync(sidecar)) writeFileSync(sidecar, '');
execFileSync(
  'cargo',
  [
    'build',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--bin',
    'glim-bridge',
    ...(release ? ['--release'] : []),
  ],
  { stdio: 'inherit' },
);
copyFileSync(resolve(`src-tauri/target/${release ? 'release' : 'debug'}/glim-bridge.exe`), sidecar);
console.log(`Prepared Glim helper (${target}).`);
