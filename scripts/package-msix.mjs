import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const validationIdentity = {
  identityName: 'Glim.LocalValidation',
  publisher: 'CN=Glim Local Validation',
  publisherDisplayName: 'Glim Local Validation',
  displayName: 'Glim Validation',
  packageVersion: '1.0.0.0',
};

export function validateIdentity(input, validation = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Identity must be a JSON object. See packaging/msix/identity.example.json.');
  }
  const result = {};
  for (const key of Object.keys(validationIdentity)) {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
      throw new Error(`Missing or invalid identity field: ${key}`);
    }
    if (/[\u0000-\u001f\u007f]/u.test(value) || value.length > 256) {
      throw new Error(`Invalid characters or length in ${key}`);
    }
    if (!validation && /REPLACE_|Glim[. ]LocalValidation|Glim Local Validation/i.test(value)) {
      throw new Error(
        `Replace ${key} with the value from Partner Center; placeholders cannot be submitted.`,
      );
    }
    result[key] = value;
  }
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(result.identityName)) {
    throw new Error(
      'identityName must be the 3–50 character Package/Identity/Name from Partner Center.',
    );
  }
  if (!result.publisher.startsWith('CN=')) {
    throw new Error(
      'publisher must be the complete Package/Identity/Publisher value, including CN=.',
    );
  }
  const version = result.packageVersion.split('.');
  if (
    version.length !== 4 ||
    version.some((part) => !/^(0|[1-9]\d*)$/.test(part) || Number(part) > 65535) ||
    Number(version[0]) === 0 ||
    version[3] !== '0'
  ) {
    throw new Error(
      'packageVersion must be four integers (1–65535.0–65535.0–65535.0); the Store reserves the fourth part.',
    );
  }
  return result;
}

export function renderManifest(template, identity, validation = false) {
  const values = {
    ...validateIdentity(identity, validation),
    relayAlias: validation ? 'glim-validation-relay.exe' : 'glim-relay.exe',
  };
  const escape = (value) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&apos;',
        })[char],
    );
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown manifest field: ${key}`);
    return escape(values[key]);
  });
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}).`);
}

function findMakeAppx() {
  if (process.env.GLIM_MAKEAPPX) {
    const override = path.resolve(process.env.GLIM_MAKEAPPX);
    if (!existsSync(override)) throw new Error('GLIM_MAKEAPPX does not point to an existing tool.');
    return override;
  }
  const sdk = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Windows Kits',
    '10',
    'bin',
  );
  const versions = existsSync(sdk)
    ? readdirSync(sdk).filter((name) => /^10\.0\.\d+\.\d+$/.test(name))
    : [];
  versions.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  for (const version of versions) {
    const tool = path.join(sdk, version, 'x64', 'makeappx.exe');
    if (existsSync(tool)) return tool;
  }
  throw new Error('MakeAppx.exe was not found. Install the Windows SDK or set GLIM_MAKEAPPX.');
}

function assertX64(file) {
  const pe = readFileSync(file);
  if (pe.length < 64 || pe.toString('ascii', 0, 2) !== 'MZ')
    throw new Error(`Not a PE executable: ${file}`);
  const offset = pe.readUInt32LE(0x3c);
  if (
    offset + 6 > pe.length ||
    pe.readUInt32LE(offset) !== 0x4550 ||
    pe.readUInt16LE(offset + 4) !== 0x8664
  ) {
    throw new Error(`Expected an x64 Windows executable: ${file}`);
  }
}

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function main() {
  const args = process.argv.slice(2);
  const validation = args.length === 1 && args[0] === '--validation';
  const useIdentity = args.length === 2 && args[0] === '--identity';
  if (!validation && !useIdentity) {
    throw new Error(
      'Use npm run package:msix -- --validation OR --identity .local/msix-identity.json',
    );
  }
  const identity = validateIdentity(
    validation ? validationIdentity : JSON.parse(readFileSync(path.resolve(args[1]), 'utf8')),
    validation,
  );
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('This packaging script currently requires Windows x64.');
  const makeappx = findMakeAppx();
  const mode = validation ? 'validation' : 'store-candidate';
  // Always build from the current source, rather than silently packaging an old release binary.
  run(process.execPath, [
    path.join(root, 'scripts/tauri.mjs'),
    'build',
    '--no-bundle',
    '--config',
    'src-tauri/tauri.bundle.conf.json',
  ]);

  const outputRoot = path.join(root, '.local', 'msix');
  mkdirSync(outputRoot, { recursive: true });
  const output = mkdtempSync(path.join(outputRoot, `${mode}-`));
  const layout = path.join(output, 'layout');
  mkdirSync(path.join(layout, 'integrations'), { recursive: true });
  mkdirSync(path.join(layout, 'Assets'), { recursive: true });
  const inputs = [
    ['target/release/glim.exe', 'glim.exe'],
    ['.local/bundle/glim-relay.exe', 'integrations/glim-relay.exe'],
    ['.local/bundle/glim-vscode.vsix', 'integrations/glim-vscode.vsix'],
  ];
  for (const [source, destination] of inputs) {
    const file = path.join(root, source);
    if (source.endsWith('.exe')) assertX64(file);
    copyFileSync(file, path.join(layout, destination));
  }

  const generatedIcons = path.join(output, 'generated-icons');
  run(process.execPath, [
    path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'),
    'icon',
    path.join(root, 'assets/glim.svg'),
    '--output',
    generatedIcons,
    '--png',
    '44',
    '--png',
    '50',
    '--png',
    '150',
  ]);
  const files = inputs.map(([, destination]) => destination);
  for (const [size, name] of [
    [44, 'Square44x44Logo'],
    [50, 'StoreLogo'],
    [150, 'Square150x150Logo'],
  ]) {
    const destination = `Assets/${name}.png`;
    copyFileSync(path.join(generatedIcons, `${size}x${size}.png`), path.join(layout, destination));
    files.push(destination);
  }
  const manifest = renderManifest(
    readFileSync(path.join(root, 'packaging/msix/AppxManifest.xml'), 'utf8'),
    identity,
    validation,
  );
  writeFileSync(path.join(layout, 'AppxManifest.xml'), manifest, 'utf8');
  files.push('AppxManifest.xml');
  const packagePath = path.join(output, `Glim_${identity.packageVersion}_x64_${mode}.msix`);
  // Keep MakeAppx's manifest/semantic validation enabled. A passing pack is not Store certification.
  run(makeappx, ['pack', '/d', layout, '/p', packagePath, '/h', 'SHA256', '/no']);
  const unpacked = path.join(output, 'unpacked');
  run(makeappx, ['unpack', '/p', packagePath, '/d', unpacked, '/no']);
  for (const file of files) {
    if (hash(path.join(layout, file)) !== hash(path.join(unpacked, file))) {
      throw new Error(`Pack/unpack verification failed: ${file}`);
    }
  }
  const checksum = hash(packagePath);
  writeFileSync(
    path.join(output, 'SHA256SUMS.txt'),
    `${checksum}  ${path.basename(packagePath)}\n`,
  );
  writeFileSync(
    path.join(output, 'build-report.json'),
    JSON.stringify(
      {
        mode,
        identity,
        builtAt: new Date().toISOString(),
        makeappx,
        packagePath,
        sha256: checksum,
        signed: false,
        installed: false,
        storeCertified: false,
        files: files.map((file) => ({ path: file, sha256: hash(path.join(unpacked, file)) })),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`\nMSIX packed and payload verified: ${packagePath}`);
  console.log(
    validation
      ? 'LOCAL VALIDATION ONLY: placeholder identity; do not upload or distribute this package.'
      : 'Unsigned Store candidate: identity must match Partner Center. Complete installation/integration checks before submission.',
  );
  console.log(
    'This script does not sign, install, register, submit, or change Windows security settings.',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
