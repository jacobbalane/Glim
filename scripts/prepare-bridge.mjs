// Builds the helper agents' hooks run (glim-bridge) and puts it where Tauri bundles it beside
// Glim. `--target universal-apple-darwin` builds it for Apple Silicon and Intel and joins the two.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const release = args.includes('--release');
const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : host;
if (!target) throw new Error('Could not tell which system to build the helper for.');
const parts =
  target === 'universal-apple-darwin' ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : [target];
const exe = target.includes('windows') ? '.exe' : '';
const binaries = resolve('src-tauri/binaries');
mkdirSync(binaries, { recursive: true });
// Tauri validates sidecar paths during the helper's own build. Seed temporary files; the helper
// replaces them before the application is built.
for (const name of new Set([target, ...parts])) {
  const placeholder = resolve(binaries, `glim-bridge-${name}${exe}`);
  if (!existsSync(placeholder)) writeFileSync(placeholder, '');
}
const built = parts.map((part) => {
  const cross = part === host ? [] : ['--target', part];
  execFileSync(
    'cargo',
    [
      'build',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      '--bin',
      'glim-bridge',
      ...(release ? ['--release'] : []),
      ...cross,
    ],
    { stdio: 'inherit' },
  );
  const folder = cross.length ? `${part}/` : '';
  return resolve(`src-tauri/target/${folder}${release ? 'release' : 'debug'}/glim-bridge${exe}`);
});
const sidecar = resolve(binaries, `glim-bridge-${target}${exe}`);
if (built.length > 1) {
  execFileSync('lipo', ['-create', '-output', sidecar, ...built]);
  // A universal Tauri build joins only Glim's own binary for both, yet bundles every binary of
  // the crate from the universal folder, the helper included.
  const universal = resolve(`src-tauri/target/${target}/${release ? 'release' : 'debug'}`);
  mkdirSync(universal, { recursive: true });
  copyFileSync(sidecar, resolve(universal, 'glim-bridge'));
} else copyFileSync(built[0], sidecar);
console.log(`Prepared Glim helper (${target}).`);
