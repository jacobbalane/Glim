// Drives a debug build of Glim on macOS through its test control (src-tauri/src/test_control.rs):
// scripts sent over a socket beside Glim's own run in the island and return their result.
import { execFileSync } from 'node:child_process';
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
  // Glim answers within 30 s, even when the island does not; a Glim that stops answering at all
  // is reported, not waited on.
  const run = (script) =>
    new Promise((done, fail) => {
      const connection = connect(socket);
      const sent = Date.now();
      // Whether the connection was made and the script fully sent, for a report of a stall.
      let connected = 0;
      let flushed = 0;
      connection.on('connect', () => (connected = Date.now()));
      connection.on('finish', () => (flushed = Date.now()));
      const timer = setTimeout(() => {
        connection.destroy();
        fail(
          new Error(
            `No answer from Glim in 45 s (asked at ${sent}, connected at ${connected}, sent at ${flushed}) to: ${script.trim().slice(0, 100)}`,
          ),
        );
      }, 45000);
      let answer = '';
      connection.on('data', (chunk) => {
        answer += chunk;
      });
      connection.on('error', (error) => {
        clearTimeout(timer);
        fail(error);
      });
      connection.on('end', () => {
        clearTimeout(timer);
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
  // Clicks the first enabled button whose accessible name matches, waiting up to five seconds for
  // it to appear. Buttons in a view that is closing don't count.
  const click = (name) =>
    run(`
      const name = new RegExp(${JSON.stringify(name.source ?? `^${name}$`)});
      const label = (b) => (b.getAttribute('aria-label') ?? b.textContent).trim();
      for (let tries = 0; tries < 50; tries++) {
        const button = [...document.querySelectorAll('button')].find(
          (b) => !b.disabled && !b.closest('[inert]') && name.test(label(b)),
        );
        if (button) {
          button.click();
          return true;
        }
        await new Promise((wait) => setTimeout(wait, 100));
      }
      throw new Error('No button named ' + name);`);
  const has = (selector) => run(`return !!document.querySelector(${JSON.stringify(selector)});`);
  const text = (selector) =>
    run(`return document.querySelector(${JSON.stringify(selector)})?.innerText ?? null;`);
  return { socket, run, invoke, click, has, text };
}

// A screenshot for review. It needs Screen Recording permission; without it the test goes on.
export function screencapture(file, region) {
  try {
    execFileSync('screencapture', ['-x', ...(region ? [`-R${region}`] : []), file], {
      stdio: 'pipe',
      timeout: 20000,
    });
  } catch (error) {
    console.log(`No screenshot ${file}: ${error.message}`);
  }
}
