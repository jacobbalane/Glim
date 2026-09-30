Glim — implementation plan, 2026-09-30

This document records the product decisions made so far and the proposed implementation. Glim is the chosen app name. The current phase is planning; implementation and installation of integrations have not started. Proposed defaults and feasibility checks below are not confirmed requirements unless explicitly marked as confirmed.

The product is a Windows desktop companion that keeps coding-agent status visible while the user works in another application, watches video, or plays a game. Success means the user can tell when an agent needs attention and return to the relevant terminal without repeatedly checking VS Code.

The following choices are confirmed:

| Decision | Agreed behavior |
| --- | --- |
| Agents | Claude Code CLI and Codex CLI |
| Authentication | Subscription sign-in for both CLIs; exact plan tiers are not yet specified |
| Expected concurrency | 4–8 simultaneous agent sessions |
| Environment | Native Windows, primarily VS Code's integrated terminal; exact shell is not yet identified |
| Scope | View status, usage/limits, and alerts; click to return to the agent |
| Audience | Personal use first, with a path to public release |
| Integration setup | One-time status hooks; preserve normal claude and codex launch commands |
| Launch behavior | Open the Windows executable and automatically discover supported running sessions; detect new sessions and reconnect after app restarts |
| Return to agent | Select the exact VS Code terminal tab; a small companion extension is accepted |
| Compact appearance | Dark capsule |
| Expanded appearance | Subtle frosted glass, legible over busy backgrounds |
| Default placement | Top center; draggable with edge snapping |
| Displays | Multiple monitors, with one island on a user-selected screen |
| Attention behavior | Remain compact; briefly expand for approvals, errors, or a finished response without taking foreground focus |
| Motion | Polished iOS-inspired transitions and direct manipulation |

The core product questions are answered: subscription sign-in for both agents, 4–8 concurrent sessions, and one island on a chosen monitor. Exact plan tiers remain unspecified and can be checked during integration feasibility. Prioritize provider-reported subscription usage windows and reset times, keeping session context usage separate. Subscription sign-in alone does not guarantee access to every quota field. Minimum Windows version, representative games, and performance measurements should be recorded during the feasibility stage. Sound defaults to off as a proposed setting.

A read-only local check found Claude Code 2.1.220, Codex CLI 0.159.2, and x64 Windows build 26200. These executables are available from the current Windows shell; VS Code could use a different PATH, so confirm its versions in the first stage. The current Claude status-line documentation requires 2.1.251 or later for the documented subscription rate-limit fields. Plan a compatible Claude version update before promising those fields on this machine, or expose their unavailability until supported. No CLI settings or installed versions have been changed. See the [Claude rate-limit status-line reference](https://code.claude.com/docs/en/statusline).

Return-to-agent is confirmed as exact VS Code terminal selection, and a small companion extension is accepted. Include the extension in the v1 architecture and validate session-to-terminal matching early. Focusing a project window alone does not meet this requirement.

The proposed technology stack is Tauri 2 for the desktop host, Rust for collection and Windows integration, React with TypeScript and Vite for the interface, CSS design tokens for visual consistency, and Motion for React for gestures and layout transitions. Include a small TypeScript VS Code extension for exact terminal navigation. Keep settings in local versioned JSON and active session state in memory, backed by a small durable local registry of session metadata and last-observed events for discovery after app startup. This registry is required for reconnecting to sessions that ran while the island was closed; it is not a transcript archive. Add SQLite only if persistence/concurrency needs justify it.

Tauri uses a Rust host and the platform webview, including WebView2 on Windows. Its APIs expose window effects and cursor-event controls, and its tooling produces Windows installers. These capabilities are documented, but their combined behavior in a morphing desktop overlay must be prototyped. See the [Tauri architecture](https://v2.tauri.app/concept/architecture/), [Windows webview](https://v2.tauri.app/reference/webview-versions/), [window APIs](https://v2.tauri.app/reference/javascript/api/namespacewindow/), and [installer documentation](https://v2.tauri.app/distribute/windows-installer/).

The stack remains provisional until a Windows shell prototype passes the overlay checks. If Tauri cannot meet the input, visual, and resource requirements after a bounded investigation, compare it with C# and WinUI 3 before investing in the full UI. [WinUI 3](https://learn.microsoft.com/windows/apps/winui) is the native alternative under consideration; no second implementation is planned unless the first approach fails the agreed checks.

The proposed system has five parts:

1. A small Rust helper receives lifecycle payloads from the installed CLI hooks. It extracts necessary metadata, writes bounded local event records or reconciled snapshots even when the island is not running, and forwards live updates to the desktop collector when available. Writes must be atomic and handle concurrent sessions without corrupting the registry.
2. Provider adapters normalize Claude and Codex events. Usage collectors are separate from lifecycle hooks, since status and quota have different sources and refresh behavior.
3. The Rust collector owns session identity, ordering, freshness, deduplication, connection recovery, and attention rules. Closing a frontend window must not stop tracking while the tray app remains running.
4. A transparent island window displays compact, expanded, and attention states. A separate ordinary settings window handles setup and preferences.
5. A narrowly scoped VS Code bridge associates sessions with windows and terminals and reveals the exact target after a user click. On activation and reconnect it registers each VS Code window and all of its existing terminals with the collector, then reports terminal lifecycle changes. Its connection retries with backoff while the island is closed, allowing either application to start first. The island addresses the correct bridge connection rather than a generic VS Code process.

Local communication should use a Windows named pipe restricted to the current user. The helper must have bounded work, bounded messages, and a short connection/write deadline. If the island is unavailable, monitoring should end quietly and leave normal agent behavior intact. Lifecycle handlers must not output prompts, grant or deny permissions, restart turns, or modify the agent's workflow. Hook installation merges with existing configuration, records its own entries, and removes only those entries on disconnect. Existing status-line customizations must also be preserved. Onboarding completes the provider-required hook review/trust steps; installing hook files is not sufficient evidence that an already-running CLI has loaded and enabled them.

For Claude, the initial design uses documented hooks for lifecycle and attention, and a status-line bridge for supported context and usage data. Rate-window fields are conditional on CLI version, account type, and available responses; absence must remain visible as unavailable. Validate composition with the user's current status-line command before changing it. See the [Claude hooks reference](https://code.claude.com/docs/en/hooks) and [status-line reference](https://code.claude.com/docs/en/statusline).

For Codex, use documented lifecycle hooks supported by the installed version. Evaluate account rate-limit reads through a compatible local app-server connection separately. This is an observation-only integration; the island does not launch inference tasks. App-server capabilities and transport maturity require version checks. A separate app-server process must not be assumed to expose another process's live sessions. Transcript parsing is a last-resort compatibility option requiring a separate decision because the format is not stable. See [Codex hooks](https://learn.chatgpt.com/docs/hooks) and [app-server documentation](https://learn.chatgpt.com/docs/app-server).

Every provider adapter reports its supported capabilities. The UI must distinguish a live value, a stale last-known value, an unsupported metric, and a disconnected source. The initial model should include provider, session identifier, optional turn identifier, project/worktree identity, activity, last update time, connection health, optional usage measurements, and optional terminal target. Account quotas are account-scoped and must not be summed across sessions. Session identity must not rely on project path alone, since several agents can work in the same folder. When a reported quota reset time passes, refresh the source or mark its value stale/unavailable; do not infer a fresh zero-percent reading from the clock alone.

Useful activity states are ready, working, using a tool, waiting for permission, waiting for input, response finished, interrupted, failed, and closed. Connection health is a separate dimension. Only expose finer labels such as running tests when there is reliable evidence; a generic tool event does not prove test execution. An agent finishing a response does not establish that the requested work succeeded. A quiet interval does not prove the agent is stuck or finished. Interpret stop hooks using provider semantics, including the case where another hook requests continuation; observing a hook invocation is not by itself proof that the whole task ended. Do not invent task-completion percentages or ETAs.

For click-to-return, first test matching hook process ancestry to VS Code terminal shell process IDs. An extension can enumerate terminal identities and reveal a chosen terminal through documented APIs, but cross-window routing, closed/recreated terminals, split panes, and process reuse require validation. Include terminal lifecycle identity and process creation information where available so reused process IDs cannot silently point to a different session. If automatic mapping is ambiguous, provide explicit session-to-terminal pairing in setup while keeping normal CLI launch commands. If the target terminal has closed, show that it is unavailable. A clearly labelled project-window fallback may remain useful, but cannot count as successful exact navigation. Foreground activation should happen only after a user action. [VS Code terminal APIs](https://code.visualstudio.com/api/references/vscode-api#Terminal) support the primitives; the mapping is our proposed implementation.

Opening the app should be sufficient for everyday connection after one-time integration setup. Distribution includes an installer (planned filename Glim-Setup.exe) and the installed application executable (Glim.exe), accessible through a normal Start menu or desktop shortcut. The installer handles the desktop runtime dependency. Launching the executable twice reuses the existing instance and island.

On launch, the collector opens its local communication endpoint, reads the durable session registry, and reconciles records with current-user process identity, creation time, and the VS Code terminal registry. Expired or exited process records must not appear as live sessions. The extension sends the terminals that are already open, rather than only listening for newly opened terminals. Restore last-known state with its timestamp and freshness; obtain new provider events and supported usage snapshots before claiming live detail. Detecting a running process establishes existence, not whether the agent is currently working, waiting for permission, or finished. The stable session identity and terminal target should still be recovered whenever supported.

| Situation | Required behavior |
| --- | --- |
| Instrumented sessions already exist when the island opens | Discover and list them automatically, reconcile their terminal targets, and refresh available telemetry |
| A new agent starts while the island is open | Add its session without a Connect button or special launch command |
| The island is fully quit and reopened during a task | Reconnect using the local metadata registry and terminal bridge; do not require restarting the agent |
| No sessions are running | Show a quiet empty state and automatically pick up the next supported session |
| A session predates first-time hook setup | Detect the process/terminal where possible, but mark detailed telemetry as unavailable until integration activates; offer provider-supported hook reload or a user-initiated CLI restart/resume if required |
| An agent exits or crashes while the island is closed | Reject stale live-session records during startup reconciliation |

For pre-setup sessions, validate each installed provider's reload and hook-trust behavior before promising live attachment. Never automatically restart an active coding session or replay missed events as fresh notifications. If exact state cannot be recovered, display a clear last-known/awaiting-updates state while monitoring resumes. Hiding the island to the tray keeps its collector active; explicitly quitting the app closes the collector while the installed hook helper can continue storing bounded metadata. Startup-at-sign-in is an optional preference.

The VS Code API exposes the current open terminals, so initial enumeration is available. Process correlation, the durable session registry, and reconnection are application features we still need to implement and validate. See [VS Code window APIs](https://code.visualstudio.com/api/references/vscode-api#window) and [Codex hook setup and trust](https://learn.chatgpt.com/docs/hooks).

The initial interface has three presentation states:

| State | Content and interaction |
| --- | --- |
| Compact | Provider identity and aggregate status, such as "6 working / 2 need attention"; prioritize outstanding attention without cycling through eight names |
| Expanded | Stable list of 4–8 sessions with project, activity, elapsed time, and available context usage; selecting a session reveals details and an explicit return action; show subscription usage once per account |
| Attention preview | Brief description of the event and project, followed by automatic collapse; unresolved attention remains accessible |

The proposed compact size is approximately 220–300 by 44–52 device-independent pixels. The expanded panel starts around 360–420 pixels wide and has a bounded height with scrolling when necessary. These are prototype values to review, not fixed final dimensions. Text scaling and monitor DPI must be accommodated. Compact and expanded content should share a stable visual anchor. Panels near an edge expand toward usable screen space.

Click expands the island; hover gives only subtle feedback to avoid accidental openings near browser tabs. Escape collapses an interactive panel, and a configurable shortcut shows or hides the island. Dragging follows the pointer directly, with a small movement threshold and a distinct drag area. On release, snap using position and velocity, remembering the selected display and edge offset. Keep exactly one island; do not migrate it when focus moves between monitors. Settings allow choosing its display, and an explicit drag to another display changes the preference. If that monitor disconnects, clamp the island into the primary monitor's work area. Restore the preferred display when it reconnects unless the user chose a new location in the meantime. Use per-monitor DPI and available work areas when positioning and expanding.

Critical alerts briefly expand without activating the window or moving keyboard focus. Proposed dwell time is four seconds, adjustable in settings. Pause collapse while the user is deliberately interacting with the panel. Keep a pending-approval marker after collapse. Deduplicate repeat events and coalesce bursts; preserve readable session order while the pointer or keyboard is inside the panel. Proposed attention order is pending approval, failure, limit warning, response finished, then ordinary activity. Use icons and text as well as color. Sound is off by default. Respect an explicit quiet/snooze setting.

The motion design uses immediate press feedback, restrained ordinary transitions, and interruptible springs for expansion and drag release. Start with 150–250 ms for ordinary transitions and a critically damped spring for expansion; tune perceived settling in the prototype. Reserve modest overshoot for momentum-driven repositioning. Keep text independent from surface scaling to avoid stretching, and preserve the visual path when reversing an animation. Use transform/opacity where practical, test native window bounds separately, and stop unnecessary animation when nothing changes. Reduced-motion mode uses short fades or immediate changes. Keyboard shortcuts should respond immediately. [Motion layout documentation](https://motion.dev/docs/react-layout-animations) describes the layout tools and scaling pitfalls.

Frosted glass must be tested against actual desktop content. CSS effects inside a webview are not sufficient evidence that content behind the native window is blurred correctly. Use supported native composition effects where appropriate, with a solid readable fallback. Maintain contrast on bright pages and fast-moving video. Use the Windows system font initially, consistent spacing/radius tokens, tabular numerals for counters, and limited status accents. Never make color the sole signal.

The first native prototype must validate transparent-area hit testing, non-activating attention previews, animation clipping/shadows, transitions interrupted halfway, dragging at different DPI scales, and native window resizing without flashes. Do not leave an oversized invisible rectangle intercepting desktop clicks. A fully click-through mode needs an explicit keyboard/tray recovery path because hover cannot be assumed to work while the window ignores cursor events.

Windowed and borderless gaming are the initial compatibility targets. Exclusive-fullscreen behavior remains unpromised until tested with the user's games; ordinary topmost-window behavior is not enough to establish compatibility. The project does not require game-process injection. Test fullscreen video, Alt-Tab, taskbar interaction, sleep/wake, and monitor disconnect/reconnect. See [Microsoft's fullscreen presentation discussion](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/d3d10-graphics-programming-guide-dxgi).

The proposed implementation sequence is:

| Stage | Deliverable | Completion evidence |
| --- | --- | --- |
| 1. Integration feasibility | Compatibility matrix, discovery proof, and a minimal VS Code bridge | Observe real lifecycle events and quota availability; validate any required CLI update; open the island after sessions already started; prove exact terminal routing across two VS Code windows; verify normal commands and existing hooks keep working |
| 2. Native overlay and design prototype | Compact/expanded/attention island using simulated events | Review appearance in Windows, interruption behavior, hit testing, focus, and DPI |
| 3. First real workflow | One provider connected from prompt to attention to exact terminal return | End-to-end observation without influencing agent permissions or prompts; reveal the correct terminal only after a user click |
| 4. Both providers and session handling | Claude and Codex together, with capability-aware usage display | Concurrent sessions, shared account quotas, failures, stale data, and reconnection behave correctly |
| 5. Windows installation | Personal-use NSIS installer, VSIX companion extension, and onboarding | Clean install, upgrade, disconnect, and uninstall preserve user configuration; ordinary use requires no developer toolchain |
| 6. Public-release readiness | Distribution decisions and maintenance plan | Signing, version compatibility, update integrity, documentation, and broader hardware testing |

Verification should focus on state transitions and reliability, not tests that repeat implementation details. Replay synthetic and redacted lifecycle fixtures for duplicates, late events, interrupted turns, missing fields, and reconnection. Test return-to-terminal routing across multiple VS Code windows. Exercise real Windows overlays under a busy browser and a representative game. Use frontend interaction tests for keyboard/focus behavior and visual comparisons, then validate the packaged application as well as the browser-rendered UI.

Initial performance goals are smooth 60 Hz animation, correct pacing on high-refresh displays, and below 1% total CPU while idle on a documented reference machine. Treat these as targets to measure, not claims. Report total process-tree memory, including WebView2 and any helper/app-server processes, before agreeing a memory ceiling. Target local event-to-display latency below 250 ms at the 95th percentile after collector receipt, while measuring hook overhead separately. Prefer event-driven collection, bounded queues, and quota refresh backoff to frequent polling.

Monitoring metadata stays local by default. The island does not need its own cloud account. Avoid persisting prompts, source code, tool arguments, or transcript content merely to show status. Redact diagnostic exports and keep settings/schema versioned. The app should operate as the normal user. Public distribution can add signed installers and verified updates later without changing the provider-adapter boundary.

The proposed source layout keeps each executable small and its responsibilities clear:

| Location | Responsibility |
| --- | --- |
| desktop/src | React components, design tokens, and interaction state |
| desktop/src-tauri | Rust collector, provider adapters, native windows, tray, settings |
| hook-relay | Small Rust executable invoked by CLI hooks |
| vscode-extension | TypeScript extension for terminal registration and exact navigation |
| contracts | Versioned event/message definitions and generated TypeScript types where practical |
| test-fixtures | Synthetic or redacted lifecycle sequences and compatibility samples |

The first personal release is complete when both providers report their supported lifecycle and subscription fields, eight sessions remain distinguishable, every mapped session opens its exact VS Code terminal, and the island passes the Windows interaction checks on the selected display. Test a pending approval, provider failure, interrupted turn, disconnected source, missing quota field, closed terminal, monitor removal, and sleep/wake. Also test starting agents before the island, restarting the island mid-task, starting agents while the island is closed, first-time setup with an uninstrumented session, and launching the app twice. Unsupported telemetry must be presented honestly; an unsupported essential feature triggers an explicit scope decision rather than silently lowering the release bar.

Product planning is complete. The remaining uncertainties are implementation checks: installed CLI hook support; exact account tiers and exposed quota fields; session-to-terminal mapping; native composition and input behavior; and representative game compatibility. Begin implementation with the bounded integration and terminal-routing feasibility work, followed by the native interaction prototype. Review motion in the actual Windows app before expanding the implementation.
