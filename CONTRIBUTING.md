# Contributing to Glim

Glim is an early Windows desktop application for coding-agent workflows. Bug reports, focused fixes, documentation and design feedback are welcome. Read the [product plan](PLANNING.md) and [implementation checkpoint](docs/IMPLEMENTATION.md) first: the current build is a development preview, and real agent integration is still being completed.

## Start a contribution

For a substantial feature or architecture change, open an issue describing the user problem and proposed behavior before investing in implementation. Small fixes can go straight to a pull request. Fork the repository, create a branch, and keep each pull request focused on one problem.

For bug reports, include the Glim version, Windows version, relevant CLI/VS Code versions, reproduction steps, expected behavior and actual behavior. State whether you used the native app or browser demo. Remove private project details from screenshots and diagnostics; never post prompts, transcripts, credentials or account data.

## Development setup

Use Windows 11 x64 for native development. The interface preview also runs in a browser.

1. Install Node.js 22.12 or newer and npm. CI currently uses Node.js 24.
2. Clone your fork and run `npm ci` in the repository root.
3. Run `npm run dev` for the browser preview, or follow the [native prerequisites and commands](README.md#native-windows-development) for the Windows app.

The browser preview deliberately labels sample sessions and usage. It does not prove that installed CLI integrations work. Keep test sessions isolated from real user data and preserve existing agent settings when working on setup or removal.

## Validate your changes

Run checks relevant to what changed. For TypeScript, UI and scripts:

```powershell
npm run check
npm test
npm run format:check
```

For interface behavior, also run `npm run build` and `npm run test:ui`. The UI tests use Microsoft Edge on Windows. For Rust changes:

```powershell
cargo fmt --all --check
cargo test --workspace --locked
cargo check --workspace --locked
```

For extension packaging, run `npm run package:extension`; this copies the root MIT license into the VSIX. Generated builds and local configuration belong in ignored directories. Keep the tracked dependency lockfiles consistent, and avoid unrelated dependency upgrades.

Documentation-only changes need a content/link review and `git diff --check`; they do not need the entire application test suite. The repository's GitHub Actions workflow supplies the shared baseline checks.

## Pull requests

Describe the user-visible problem, the resulting behavior and the validation you performed. Include before/after screenshots or a short recording for visual or motion changes. Mention any limits that remain untested, especially native focus behavior, multiple monitors and packaged installation. Use synthetic data when demonstrating the UI.

Keep status wording honest: a completed response is not proof of task success, stale observations must remain visibly stale, and unavailable usage must not be presented as a measured zero. Preserve reduced-motion and keyboard behavior.

## License and attribution

Contributions are accepted under the project's [MIT license](LICENSE). By submitting a contribution, you agree to license that contribution under MIT. Only contribute material you have the right to share; retain the required attribution and license notices for reused third-party material. Dependencies retain their own licenses.

The `private: true` fields in the npm workspaces prevent accidental package publishing. They do not make this GitHub repository private or restrict its MIT license.
