# Glim

**A glimpse at your agents. Then back to your flow.**

A minimal Windows desktop island for Claude Code and Codex CLI. Live activity, context, token usage, and reported task progress stay above your workspace. Your data stays on your device.

[Website](https://jacobbalane.github.io/Glim/) · [Download for Windows](https://github.com/jacobbalane/Glim/releases/latest) · [Compatibility](docs/compatibility.md) · [Development](docs/development.md)

> The installer is not code-signed yet, so Windows SmartScreen may warn on first run: choose **More info**, then **Run anyway**.

## What it does

- A compact island attached to the top of your selected display. Its width fits the live status, and long text scrolls into view.
- Rotating session previews, with new approvals, questions, and completions briefly taking priority. An attached banner keeps their counts visible.
- Click the preview to expand; click its header again or outside the island to collapse. The expanded view keeps your selected session stable.
- Reported token counts, cached reads, context usage, and structured task steps.
- Account limits and reset times when Claude Code supplies them.
- Local daily usage charts and 30-day retention.
- One-click, reversible connectors that preserve existing agent configuration.
- System tray, optional Windows startup, fullscreen hiding, reduced motion, and keyboard navigation.

## Getting started

1. Download the Windows setup executable from the [website](https://jacobbalane.github.io/Glim/) or [Releases](https://github.com/jacobbalane/Glim/releases/latest), and run it.
2. Open Glim. Connect Claude Code, Codex, or both in onboarding. Glim previews the configuration entries it will add and saves backups.
3. For Codex, open `/hooks` and review and trust the Glim hooks. Glim never bypasses provider trust checks.
4. Start a new agent session as usual. No separate Glim account or API key is required.
5. Click the island for details. Use the tray to open settings, pause, or quit.

Glim needs to stay running to monitor activity. Closing settings returns to the agent in the same notch; **Quit Glim** stops collection. Choose whether to keep a small idle pill or hide it until activity.

## Try the interface

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. The browser preview explicitly uses sample sessions; it does not track your PC. Add `?demo=0` to view the empty state. The installed desktop app never displays sample data.

Open **`http://127.0.0.1:1420/preview`** for all app views, including notch states, setup, settings, history, logos, and the mascot. The interactive notch lets you switch activity and views without reloading, so you can inspect transitions. Live mode renders the actual components and updates as you edit. Use Screenshots for a saved comparison, or open any view on its own.

With the development server running, capture every view:

```sh
npm run preview:capture
```

This uses installed Chrome by default (`npx playwright install chromium` and `GLIM_TEST_BROWSER=chromium` are an alternative). PNG captures stay in ignored `.cache/preview-screenshots/`, appear automatically in the gallery, and can be downloaded individually. The gallery and capture server are available only during development and are excluded from the desktop bundle.

## Build the Windows app

Install Node.js 22.12+ (or 24+), the Rust MSVC toolchain, and Visual Studio C++ Build Tools with the Windows SDK. WebView2 is required for desktop development; the installer handles it for users.

```sh
npm ci
npm run desktop
```

Create an installer:

```sh
npm run package
```

The setup executable is in `src-tauri/target/release/bundle/nsis/`. See [development instructions](docs/development.md) for checks, isolated testing, and packaging.

See [architecture](docs/architecture.md) for the collection pipeline, native windows, and provider adapters.

## Privacy

Glim collects locally. It stores counters, provider/model/project names, task labels, and session state in `%LOCALAPPDATA%\Glim\usage.sqlite3`. It does not store prompts, assistant messages, tool arguments, tool outputs, or provider authentication tokens. Agent transcripts are read in memory to extract usage and structured tasks.

Configuration backups and connector manifests are in `%LOCALAPPDATA%\Glim`. Backups preserve the original agent configuration and may contain values you already saved in that configuration; treat them as private. Clearing usage history keeps ingestion cursors and deduplication baselines so old records cannot refill the chart.

There is no telemetry or cloud sync. The helper sends a small allow-listed event to a local named pipe accessible only by the current Windows user. Uninstall removes Glim-owned agent hooks and the Windows startup entry; local history is retained unless cleared in settings or you tick **Also delete my usage history** when uninstalling.

## Contributing

Glim's original code is MIT licensed. See [third-party notices](THIRD_PARTY_NOTICES.md) for Three.js, the bundled Manrope font and the provider marks, and [CONTRIBUTING.md](CONTRIBUTING.md) to contribute. Agent record formats evolve; sanitized adapter fixtures and compatibility reports are especially useful. Please never attach real prompts, credentials, or unredacted transcripts to issues. Report security issues privately, as described in [SECURITY.md](SECURITY.md).
