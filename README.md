# Glim

**Your agents, at a glance.**

A Windows floating island for Claude Code and Codex CLI sessions. Keep working, watching, or playing while Glim brings the moments that need you into view.

[![Download Glim for Windows — development preview](assets/download-windows.svg)](https://github.com/jacobbalane/Glim/releases/download/v0.1.0-preview.1/Glim_0.1.0_x64-setup.exe)

Windows x64 · **v0.1.0-preview.1** · [Release notes and checksum](https://github.com/jacobbalane/Glim/releases/tag/v0.1.0-preview.1)

**Development preview — unsigned.** This build lets you try the native island. Automatic Claude/Codex setup, live subscription usage and end-to-end terminal navigation are still in development. It is not yet a complete agent monitor. Windows may warn about or block the unsigned installer.

## Install the preview

1. [Download the Windows installer](https://github.com/jacobbalane/Glim/releases/download/v0.1.0-preview.1/Glim_0.1.0_x64-setup.exe).
2. Run `Glim_0.1.0_x64-setup.exe` and complete setup for your Windows account.
3. Open **Glim** from Start and click the pill to expand it.

The tray menu provides Show, Hide, Move to top center and Quit controls. The installer bundles the relay and companion VSIX, but does not configure your agents or install the VS Code extension automatically yet. No developer tools are needed to run the packaged app; setup may download Microsoft's WebView2 runtime if it is missing.

The download is a GitHub **prerelease** for development evaluation. Clean-machine install/upgrade testing and trusted code signing remain pending. See the [implementation checkpoint](docs/IMPLEMENTATION.md) for what has been verified.

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

`npm run package:windows` builds the per-user NSIS installer at `target/release/bundle/nsis/Glim_0.1.0_x64-setup.exe`, including the hook relay and VS Code companion under `integrations`. Native window checks use isolated synthetic sessions. Hook onboarding, real provider integration and clean-install validation remain unfinished.

The selected public distribution route is **Microsoft Store MSIX**, where Microsoft signs the approved package. Packaging preparation is in progress; Glim is not yet available in the Store. See the [Store setup and build guide](docs/MICROSOFT_STORE.md). The existing GitHub EXE remains an unsigned development preview.

Stable releases require trusted distribution and clean installation tests with Windows protections enabled. Direct EXE distribution would still require trusted signing of the installer, application and executable helpers. Ordinary users should be able to install the finished app without developer tools or security-setting changes.

## Structure

| Folder | Role |
| --- | --- |
| `desktop/src` | React, TypeScript, Motion and CSS island |
| `desktop/src-tauri` | Rust/Tauri Windows host and named-pipe bridge |
| `crates/glim-core` | Sanitized observations, process identity and metadata persistence |
| `hook-relay` | Small, quiet Rust CLI hook executable |
| `vscode-extension` | Terminal discovery and exact-terminal reveal |
| `contracts` | Frontend contracts, freshness and attention policy |
| `scripts` | Packaging, verification and read-only capability probes |
| `packaging/msix` | Microsoft Store package manifest and identity template |
| `tests/ui` | Browser interaction checks |

[PLANNING.md](PLANNING.md) contains the agreed product plan. [Implementation checkpoint](docs/IMPLEMENTATION.md) records verified behavior, native blockers and the next integration gates.

No prompts, code, terminal output or authentication tokens belong in Glim's status registry. Provider quotas are account-scoped; a finished response is never presented as proof that a task succeeded.

The [privacy policy](PRIVACY.md) describes local metadata processing, retention, the optional VS Code companion and how to stop collection.

Source: [jacobbalane/Glim](https://github.com/jacobbalane/Glim).
