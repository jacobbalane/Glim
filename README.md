# Glim

**Your agents, at a glance.**

A Windows floating island for Claude Code and Codex CLI sessions. Keep working, watching, or playing while Glim brings the moments that need you into view.

**Status:** first development prototype. The browser UI and VS Code extension build, and all four Rust collector tests pass. Native desktop compilation is blocked locally by Windows Smart App Control rejecting a generated dependency helper. The UI preview uses clearly labelled sample data. This is not yet an installable, working agent monitor.

## Try the interface

Requires Node.js 22.12+ and npm. From this directory:

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:1420**. Click the pill, then use the preview controls to try six sessions, approvals, response completion, stale readings and the quiet state. Escape collapses the island. The preview respects reduced motion.

## Development checks

```powershell
npm run check
npm test
npm run test:ui
npm run build
npm run package:extension
```

UI tests use installed Microsoft Edge on Windows. The extension package is written to `.local/glim-vscode-0.1.0.vsix`. Building the package does not install it into VS Code.

The native hook helper can be checked separately:

```powershell
cargo build -p glim-relay --locked
npm run test:relay
```

This test runs synthetic sessions in an isolated local directory, without changing your Claude or Codex settings.

## Native Windows development

Install [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/): Rust, Microsoft C++ Build Tools with **Desktop development with C++** and a Windows SDK, and WebView2. Then reopen the terminal:

```powershell
cargo test -p glim-core
cargo check --workspace
npm run desktop
```

Once the native validation gates pass, `npm run package:windows` targets a per-user NSIS `.exe` installer, including the hook relay and VS Code companion under `integrations`. The packaging configuration is prepared but has not produced a verified installer. Hook onboarding and end-to-end validation are unfinished; this command is not a release claim.

## Structure

| Folder | Role |
| --- | --- |
| `desktop/src` | React, TypeScript, Motion and CSS island |
| `desktop/src-tauri` | Rust/Tauri Windows host and named-pipe bridge |
| `crates/glim-core` | Sanitized observations, process identity and metadata persistence |
| `hook-relay` | Small, quiet Rust CLI hook executable |
| `vscode-extension` | Terminal discovery and exact-terminal reveal |
| `contracts` | Frontend contracts, freshness and attention policy |
| `scripts` | Read-only capability probe |
| `tests/ui` | Browser interaction checks |

[PLANNING.md](PLANNING.md) contains the agreed product plan. [Implementation checkpoint](docs/IMPLEMENTATION.md) records verified behavior, native blockers and the next integration gates.

No prompts, code, terminal output or authentication tokens belong in Glim's status registry. Provider quotas are account-scoped; a finished response is never presented as proof that a task succeeded.

Source: [jacobbalane/Glim](https://github.com/jacobbalane/Glim).
