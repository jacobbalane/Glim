import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Observation only: these three methods are the complete RPC allowlist.
export async function probe(command, args = []) {
  const child = spawn(command, [...args, 'app-server'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
  const pending = new Map();
  let id = 0;
  const lines = createInterface({ input: child.stdout });
  const timeout = setTimeout(() => child.kill(), 20_000);
  function fail() {
    for (const { reject } of pending.values()) reject(new Error('Codex probe connection ended.'));
    pending.clear();
  }
  child.on('error', fail);
  child.on('exit', fail);
  lines.on('line', (line) => {
    if (line.length > 1_000_000) {
      child.kill();
      return;
    }
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      return;
    }
    const handler = pending.get(value.id);
    if (handler) {
      pending.delete(value.id);
      value.error
        ? handler.reject(new Error('Codex rejected the read-only request.'))
        : handler.resolve(value.result);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      child.stdin.write(
        `${JSON.stringify({ id: requestId, method, ...(params ? { params } : {}) })}\n`,
      );
    });
  try {
    await request('initialize', {
      clientInfo: { name: 'glim_probe', title: 'Glim capability probe', version: '0.1.0' },
    });
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    const account = await request('account/read', { refreshToken: false });
    const usage = await request('account/rateLimits/read');
    return sanitize(account, usage);
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.stdin.end();
    child.kill();
  }
}

export function sanitize(account, usage) {
  const windows = [];
  for (const key of ['primary', 'secondary']) {
    const window = usage?.rateLimits?.[key];
    if (window && Number.isFinite(window.usedPercent))
      windows.push({
        window: key,
        usedPercent: window.usedPercent,
        durationMinutes: window.windowDurationMins ?? null,
        resetsAt: window.resetsAt ?? null,
      });
  }
  return {
    authenticated: Boolean(account?.account),
    accountType: account?.account?.type ?? null,
    planType: account?.account?.planType ?? null,
    windows,
  };
}
if (
  process.argv[1] &&
  import.meta.url === new URL(`file:///${path.resolve(process.argv[1]).replaceAll('\\', '/')}`).href
) {
  try {
    // Pass a native exe path explicitly on Windows to avoid shell interpolation.
    const binary = process.argv[2];
    if (!binary || !existsSync(binary) || path.extname(binary).toLowerCase() !== '.exe')
      throw new Error(
        'Pass the installed native codex.exe path: npm run probe:codex -- "C:\\...\\codex.exe"',
      );
    console.log(JSON.stringify(await probe(binary), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
