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
npm run package      # build helper and an unsigned installer: NSIS on Windows, .app and .dmg on macOS
```

On macOS, `npm run test:native` and `npm run test:install` are Windows-only; the Mac has its own [native tests](#macos).

After preparing the helper once, run backend checks:

```sh
node scripts/prepare-bridge.mjs
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Use a Visual Studio x64 Developer PowerShell when your MSVC toolchain is not available on PATH. The build needs a real Microsoft `link.exe`; Git also ships a different program with that name.

The browser tests use installed Chrome and start their own server on port 1421, so they always test the current checkout. Set `GLIM_TEST_PORT` to another unused port when testing multiple worktrees. Change `channel` in `playwright.config.ts` if another supported browser is available. Screenshots are written to ignored `test-results/`.

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

## macOS

Build on macOS 13 or later with the Xcode Command Line Tools. The same `npm run desktop` and `npm run package` work; a universal build for Apple silicon and Intel is what CI ships:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
node scripts/prepare-bridge.mjs --release --target universal-apple-darwin
npx tauri build --target universal-apple-darwin
```

WKWebView has no debugging port, so debug builds carry a test control instead (`src-tauri/src/test_control.rs`): with `GLIM_TEST_CONTROL` set, the test scripts run JavaScript in the island over a private socket. Release builds leave it out. `GLIM_TEST_NOTCH=200x32` draws the island around a notch on a screen without one.

- `node scripts/native-smoke-mac.mjs` is the Mac's native smoke. Build first with `cargo build --manifest-path src-tauri/Cargo.toml --bin glim --bin glim-bridge --features custom-protocol`. It covers onboarding, hooks from a path with a space, the quarantine-free hooks helper, the socket, counters, replay protection, pause, limits, the status-line relay through `/bin/sh`, a closed agent's process, the notch layout and, with `brew install cliclick`, click-through. Screenshots land in `.cache/native-smoke-mac-*/screenshots/`.
- `node scripts/install-smoke-mac.mjs <Glim .dmg>` installs Glim from the disk image and checks it: universal, ad-hoc signed, menu bar only. Then it builds two debug versions signed with a throwaway key, serves the newer one from the machine, and updates the older one from Settings. It needs no Apple account and leaves your own Glim alone, but quit it first: both use one single-instance lock.

Both run in CI on a macOS runner for every push, and their screenshots are uploaded with the run.

## Release

Before tagging, move the **Unreleased** entries in `CHANGELOG.md` under the new version and date; the website's changelog page reads that file. The CI workflow checks the frontend and Rust tests on both systems, and builds a Windows installer and a universal macOS app and disk image. A `v*` tag creates a **draft** GitHub release with both, their SHA-256 checksums, the signed update archives and `latest.json` for Windows, Apple silicon and Intel. Review and publish the draft to make the README download link work. No releases are published by local development commands.

The Mac app is ad-hoc signed, so it runs on Apple silicon, but it is not notarized: people choose Open Anyway once. Notarizing needs an Apple Developer ID; it can be added to the macOS job without other changes. For Windows signing, use an organization-owned Authenticode certificate or a signing service in CI. The initial workflow deliberately produces unsigned artifacts when no signing setup exists. Stable release acceptance requires signing and clean-machine install/upgrade/uninstall checks, native DPI/fullscreen/focus tests, and live provider validation.

## Layout

- `src/`: React island, panels, typed native API, browser-only preview fixtures.
- `src-tauri/src/`: provider normalization, connector merging, collector, SQLite, private IPC, Windows and macOS window/tray integration.
- `src-tauri/src/bin/bridge.rs`: native advisory hook and status-line relay.
- `src-tauri/tests/fixtures/`: sanitized provider usage examples.
- `tests/ui/`: browser interaction and accessibility behavior checks.
