import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargoDirectory = path.join(homedir(), '.cargo', 'bin');
const environment = { ...process.env };
if (existsSync(path.join(cargoDirectory, 'cargo.exe'))) {
  // Existing VS Code/ChatGPT processes may have an older PATH after Rust installation.
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  environment[pathKey] = `${cargoDirectory}${path.delimiter}${environment[pathKey] ?? ''}`;
}
const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...process.argv.slice(2)],
  { cwd: path.join(root, 'desktop'), env: environment, stdio: 'inherit', windowsHide: true },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
