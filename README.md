# Glim

**Your agents, at a glance.**

A Windows floating island for Claude Code and Codex CLI sessions. Keep working, watching, or playing while Glim brings the moments that need you into view.

**Status:** first development prototype. Frontend, extension and native desktop checks pass, along with nine TypeScript tests and four Rust collector tests. Agent onboarding, native subscription usage and end-to-end terminal navigation are still in development. The browser preview uses clearly labelled sample data; this is not yet a complete agent monitor.

## Install the local development preview

A Windows x64 installer has been built locally at:

```text
target\release\bundle\nsis\Glim_0.1.0_x64-setup.exe
```

Run it to install Glim for your Windows account, then open Glim from the Start menu. Click the pill to expand it. The tray menu provides Show, Hide, Move to top center and Quit controls. The installer bundles the relay and companion VSIX, but does not configure your agents or install the VS Code extension automatically yet.

This artifact is unsigned and is for development evaluation. Windows may block it on protected machines. No public release or clean-machine installation test has been completed. The installer is generated locally, not committed to GitHub.

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

`npm run package:windows` builds the per-user NSIS `.exe` installer above, including the hook relay and VS Code companion under `integrations`. Native window checks use isolated synthetic sessions. Hook onboarding, real provider integration and clean-install validation remain unfinished.

Public distribution requires trusted signing of the installer, application and executable helpers, plus installation tests with Windows Smart App Control enabled. Unsigned local builds are development previews. Ordinary users should install Glim through its setup executable without developer tools or security-setting changes.

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
