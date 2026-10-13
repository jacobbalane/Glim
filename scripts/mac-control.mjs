// Drives a debug build of Glim on macOS through its test control (src-tauri/src/test_control.rs):
// scripts sent over a socket beside Glim's own run in the island and return their result.
import { createHash } from 'node:crypto';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Matches ipc::endpoint(): one socket per data folder, in the per-user temporary folder. The test
// control's sits beside Glim's, as `.test`.
export const endpoint = (data, extension = 'sock') =>
  join(
    tmpdir(),
    `glim-${createHash('sha256').update(data.toLowerCase()).digest('hex').slice(0, 16)}.${extension}`,
  );

export function control(data) {
  const socket = endpoint(data, 'test');
  // Runs a script, the body of an async function, in the island; returns what it returns.
  const run = (script) =>
    new Promise((done, fail) => {
      const connection = connect(socket);
      let answer = '';
      connection.on('data', (chunk) => {
        answer += chunk;
      });
      connection.on('error', fail);
      connection.on('end', () => {
        try {
          const result = JSON.parse(answer);
          if (result.error) fail(new Error(result.error));
          else done(result.value);
        } catch (error) {
          fail(error);
        }
      });
      connection.end(script);
    });
  const invoke = (command, args = {}) =>
    run(
      `return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)});`,
    );
  // Clicks the first button whose accessible name matches.
  const click = (name) =>
    run(`
      const name = new RegExp(${JSON.stringify(name.source ?? `^${name}$`)});
      const label = (b) => (b.getAttribute('aria-label') ?? b.textContent).trim();
      const button = [...document.querySelectorAll('button')].find((b) => name.test(label(b)));
      if (!button) throw new Error('No button named ' + name);
      button.click();
      return true;`);
  const has = (selector) => run(`return !!document.querySelector(${JSON.stringify(selector)});`);
  const text = (selector) =>
    run(`return document.querySelector(${JSON.stringify(selector)})?.innerText ?? null;`);
  return { socket, run, invoke, click, has, text };
}
