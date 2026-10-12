# Development

## Commands

```sh
npm run dev          # browser preview, labeled sample data
npm run build        # TypeScript and production UI bundle
npm test             # token math and session ranking
npm run test:ui      # installed Chrome, island interaction tests
npm run test:native  # built Windows app, isolated native integration test (Node 24+)
npm run test:install # NSIS install, onboarding, restart, and uninstall (Node 24+)
npm run desktop      # build helper, then launch Tauri
npm run package      # build helper and unsigned NSIS installer
```

After preparing the helper once, run backend checks:

```sh
node scripts/prepare-bridge.mjs
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Use a Visual Studio x64 Developer PowerShell when your MSVC toolchain is not available on PATH. The build needs a real Microsoft `link.exe`; Git also ships a different program with that name.

The browser tests use installed Chrome. Change `channel` in `playwright.config.ts` if another supported browser is available. Screenshots are written to ignored `test-results/`.

## Isolated native testing

To avoid reading or modifying your usual provider configuration, set these variables before launching a desktop build:

```powershell
$env:GLIM_DATA_DIR = Join-Path (Get-Location) '.cache\native-data'
$env:GLIM_AGENT_HOME = Join-Path (Get-Location) '.cache\native-agents'
npm run desktop
```

The helper inherits these overrides from the agent environment during testing. Do not enable Windows startup from an isolated test instance; that intentionally changes your real user startup entry.

`npm run test:native` launches a standalone build with isolated directories automatically. First build the helper and application with `node scripts/prepare-bridge.mjs` and `cargo build --manifest-path src-tauri/Cargo.toml --bin glim --features custom-protocol` after `npm run build`. It exercises the real WebView2, private named pipe, connector installation/restoration, usage replay handling, pause, status-line relay, limits, history clearing, and raw-content exclusion. Test artifacts remain in ignored `.cache/native-smoke-*` directories. Set `GLIM_TEST_EXE` and `GLIM_TEST_BRIDGE` to test release executables. This uses synthetic provider records, not an authenticated provider session.

The native smoke also calls `scripts/inspect-native-region.ps1` for the compact notch, Settings, Usage, and live-agent views. It saves the actual Windows region, DPI, and pointer-hit results in `native-regions.json`, alongside the WebView screenshot. The probe is read-only and checks that the first transparent row below the notch reaches another window. It uses the display's current scaling without changing Windows settings. Rust geometry tests cover 100%, 125%, 150%, and 200%; actual desktop rendering and monitor transitions still need separate checks on those displays. The smoke refuses to start if its debugger port is already in use.

The collector accepts only local JSONL files under the configured provider directory. Event input is capped at 1 MB; pipe messages at 64 KB; each transcript poll at 8 MB. App state changes occur under a collector lock; ingestion cursor and usage updates share a SQLite transaction.

## Installer testing

After `npm run package`, run `npm run test:install` on Windows with WebView2 installed. This runs the actual NSIS installer in an isolated `.cache/installation-*` directory, checks the helper and licenses, completes onboarding through the UI, runs synthetic monitoring checks, restarts the installed app, verifies single-instance behavior, and uninstalls it. It verifies configuration restoration and local data retention afterward. The test refuses to replace an existing Glim installation, startup entry, or shortcut. Agent data and credentials remain isolated; Windows installer registration and shortcuts are created temporarily and removed by uninstall.

The test does not cover downloading WebView2 on a fresh machine, SmartScreen/signing, upgrading from an older release, or authenticated provider sessions. Those require separate release acceptance checks.

## Release

Before tagging, move the **Unreleased** entries in `CHANGELOG.md` under the new version and date; the website's changelog page reads that file. The CI workflow checks the frontend and Rust tests and builds a Windows installer. A `v*` tag creates a **draft** GitHub release containing the installer and SHA-256 checksums. Review and publish the draft to make the README download link work. No releases are published by local development commands.

For signing, use an organization-owned Windows Authenticode certificate or a signing service in CI. The initial workflow deliberately produces unsigned artifacts when no signing setup exists. Stable release acceptance requires signing and clean-machine install/upgrade/uninstall checks, native DPI/fullscreen/focus tests, and live provider validation.

## Layout

- `src/`: React island, panels, typed native API, browser-only preview fixtures.
- `src-tauri/src/`: provider normalization, connector merging, collector, SQLite, private IPC, Windows window/tray integration.
- `src-tauri/src/bin/bridge.rs`: native advisory hook and status-line relay.
- `src-tauri/tests/fixtures/`: sanitized provider usage examples.
- `tests/ui/`: browser interaction and accessibility behavior checks.
