# Glim

*Your agents, at a glance.*

Glim is a planned Windows desktop companion for monitoring Claude Code and Codex CLI sessions. A compact floating island keeps agent activity, attention requests, and available subscription usage visible while you use another application.

The product plan is complete. Application implementation has not started, and there is no executable release yet. Read the [implementation plan](PLANNING.md) for the agreed scope, architecture, integration findings, and acceptance criteria.

The first version will support:

- 4–8 simultaneous Claude Code and Codex CLI sessions, primarily in VS Code's native Windows terminals.
- One-time status hooks while preserving the usual claude and codex commands.
- Automatic discovery of supported sessions when Glim opens, plus reconnection after app restarts.
- A dark pill that expands into a frosted panel, with responsive and interruptible motion.
- One island on a chosen monitor, starting at the top center, with dragging and edge snapping.
- Brief attention alerts that leave the current application focused.
- Returning to the exact VS Code terminal through a small companion extension.
- Provider-reported usage and reset times, with unavailable or stale values identified clearly.

| Component | Planned technology |
| --- | --- |
| Desktop host and collector | Tauri 2 and Rust |
| Interface | React, TypeScript, Vite, and CSS |
| Motion | Motion for React |
| Hook helper | Rust |
| VS Code extension | TypeScript |
| Distribution | Windows .exe installer and VS Code .vsix extension |

The first milestone proves real lifecycle events, supported subscription data, automatic session discovery, and exact terminal navigation. The next milestone is an interactive Windows overlay prototype that validates appearance, focus, hit testing, and multi-monitor behavior before the full application is built.

The current CLI versions and compatibility findings are documented in [PLANNING.md](PLANNING.md). Fullscreen-game behavior and provider telemetry require validation; they are not established release capabilities yet.

This repository currently contains the initial project documentation and development-file conventions. Source repository: [jacobbalane/Glim](https://github.com/jacobbalane/Glim). Application releases will follow implementation.
