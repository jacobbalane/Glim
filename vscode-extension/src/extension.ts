import * as vscode from 'vscode';
import { createConnection, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const MAX_MESSAGE = 64 * 1024;
export async function activate(context: vscode.ExtensionContext) {
  if (process.platform !== 'win32') return;
  const windowId = randomUUID();
  const ids = new Map<vscode.Terminal, string>();
  let socket: Socket | undefined;
  let disposed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let delay = 500;
  let endpoint = '';
  let registration = 0;
  const log = vscode.window.createOutputChannel('Glim');
  context.subscriptions.push(log);
  try {
    const { stdout } = await promisify(execFile)('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true,
      timeout: 3000,
    });
    const sid = stdout.match(/S-1-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw new Error('No user identity');
    endpoint = `\\\\.\\pipe\\glim-v1-${sid}`;
  } catch {
    log.appendLine('Unable to identify the current Windows user. Bridge is inactive.');
    return;
  }

  function send(value: unknown) {
    if (socket?.readyState === 'open' && socket.writableLength < MAX_MESSAGE)
      socket.write(`${JSON.stringify(value)}\n`);
  }
  async function register() {
    const generation = ++registration;
    const live = new Set(vscode.window.terminals);
    for (const terminal of ids.keys()) if (!live.has(terminal)) ids.delete(terminal);
    const terminals = await Promise.all(
      [...live].slice(0, 128).map(async (terminal) => {
        if (!ids.has(terminal)) ids.set(terminal, randomUUID());
        // processId can be unavailable for virtual terminals. Never guess their identity.
        const pid = await Promise.race([
          terminal.processId,
          new Promise<undefined>((resolve) => setTimeout(resolve, 1500)),
        ]);
        return {
          terminalId: ids.get(terminal)!,
          name: terminal.name.slice(0, 120),
          pid: pid ?? null,
        };
      }),
    );
    // Drop terminals that closed while resolving process IDs.
    if (!disposed && generation === registration)
      send({
        type: 'register',
        version: 1,
        windowId,
        terminals: terminals.filter((t) => [...ids.values()].includes(t.terminalId)),
      });
  }
  async function handle(line: string) {
    let request: { type?: unknown; windowId?: unknown; terminalId?: unknown; requestId?: unknown };
    try {
      request = JSON.parse(line);
    } catch {
      socket?.destroy();
      return;
    }
    if (
      request.type !== 'reveal' ||
      request.windowId !== windowId ||
      typeof request.requestId !== 'string' ||
      request.requestId.length > 100
    )
      return;
    const terminal = [...ids].find(
      ([candidate, id]) => id === request.terminalId && vscode.window.terminals.includes(candidate),
    )?.[0];
    if (!terminal) {
      send({ type: 'revealed', requestId: request.requestId, ok: false });
      return;
    }
    terminal.show(false);
    // Documented API reveals the exact terminal. OS foreground activation remains a native validation gate.
    send({ type: 'revealed', requestId: request.requestId, ok: true });
  }
  function connect() {
    if (disposed) return;
    let buffered = '';
    socket = createConnection(endpoint);
    socket.on('connect', () => {
      delay = 500;
      void register();
    });
    socket.on('data', (chunk) => {
      buffered += chunk.toString('utf8');
      if (Buffer.byteLength(buffered) > MAX_MESSAGE) {
        socket?.destroy();
        return;
      }
      let newline: number;
      while ((newline = buffered.indexOf('\n')) >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        void handle(line);
      }
    });
    socket.on('error', () => {}); // Glim being closed is normal, not an editor notification.
    socket.on('close', () => {
      if (!disposed) {
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15_000);
      }
    });
  }
  const heartbeat = setInterval(() => {
    if (socket?.readyState === 'open') void register();
  }, 10_000);
  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(() => void register()),
    vscode.window.onDidCloseTerminal((terminal) => {
      ids.delete(terminal);
      void register();
    }),
    vscode.commands.registerCommand('glim.connectionStatus', () =>
      vscode.window.showInformationMessage(
        socket?.readyState === 'open'
          ? 'Glim is connected to this VS Code window.'
          : 'Glim is not running. The bridge will reconnect automatically.',
      ),
    ),
    {
      dispose() {
        disposed = true;
        clearTimeout(retry);
        clearInterval(heartbeat);
        socket?.destroy();
        ids.clear();
      },
    },
  );
  connect();
}
