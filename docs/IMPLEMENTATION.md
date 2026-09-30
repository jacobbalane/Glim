# Development checkpoint — 2026-09-30

This is the first implementation slice. It is a runnable browser prototype plus native integration source, not a completed Windows release. Stage 1's native integration gates remain open.

## Verified on this machine

| Check | Result |
| --- | --- |
| Frontend and extension TypeScript | Pass |
| Unit tests | Four passing: stale session counts, alert deduplication, quota reset freshness, probe privacy |
| Browser interaction tests | Four passing in installed Edge: empty/multiple sessions, focus/alerts, keyboard/reduced motion, interruption/narrow layout |
| Frontend production build | Pass |
| VS Code package | Generated `.local/glim-vscode-0.1.0.vsix`; not installed or published |
| Codex subscription feasibility | Read-only account and quota requests succeeded through installed CLI 0.159.2; both 300-minute and 10,080-minute windows were present |
| Rust installation | Rust 1.98.1 installed |
| Native compile/tests | Blocked: MSVC `link.exe` missing. Microsoft Build Tools installer exited 1602 |
| Rust formatting | `cargo fmt` was blocked by Windows Application Control, error 4551 |

The quota probe prints only sign-in type, plan type and numeric windows. No email, account identifier, tokens, transcripts, prompts or credit identifiers are emitted. Live percentages are intentionally not committed to this document.

## Implemented source

- React island with compact, expanded and attention states, six-session demonstration, account-scoped quota cards, quiet/empty state, session details, alert pause and connection help. Browser mode is always labelled demo; native mode never loads sample sessions.
- Motion layout transitions with a critically damped 0.4-second spring, separate content positioning to avoid stretched text, 160ms fades/press feedback, immediate keyboard behavior and reduced-motion support.
- Rust metadata allowlist, capped stdin, quiet 700ms relay deadline, per-event atomic file publication, bounded retention, process identity and lifecycle normalization. Unknown events and subagent events are ignored.
- Tauri host source with current-user named-pipe ACL, remote-client rejection, bounded messages, reconnectable terminal registry, unique ancestry-based matching, process creation-time validation, exact-terminal reveal acknowledgements and native rounded hit-region setup.
- Companion extension enumerates current terminals on connect, updates on open/close and retries while Glim is closed. It never reads terminal output or executes terminal commands.

The Rust code is **not yet compiler-validated or exercised on Windows**. Its tests are present, but are not counted among the passing tests above.

## Deliberate prototype limits

- Native snapshot polling currently runs once per second and scans metadata. This does not meet the planned 250ms latency target. Replace it with a file watcher/in-memory collector before performance validation.
- Metadata retention is 24 hours, with a rolling target of 2,048 events plus up to 128 protected latest session records. Long-quiet sessions older than retention need a new hook event to reappear. Long-term durable session snapshots are still required for the release launch/reconnect contract.
- Hook receipt timestamps order observations. Delayed provider events, parallel tools, other Stop hooks requesting continuation, and cross-turn events need real provider fixtures before state labels can be release-grade. No task success or percentage is inferred.
- A process that still exists proves existence, not agent activity. Old readings become stale after 90 seconds. This threshold is a prototype default.
- Usage is proven by the standalone Codex probe, but is **not wired into the native island**. Claude usage requires a compatible version and preservation/composition of the existing status line. Neither CLI's settings have been changed.
- Native shell source positions at the primary display and permits dragging. Monitor selection, persistent placement, edge snapping, disconnect/reconnect, tray recovery and native glass remain unfinished.
- `Terminal.show(false)` targets the exact terminal in its own VS Code window. It does not yet establish that Windows brings the correct window to the foreground. That remains a release-blocking feasibility check.
- No installer or native executable has been built. The `.vsix` is a development artifact, not a proven end-to-end integration.

## Next native work, in order

1. Finish installing Microsoft's **Desktop development with C++** workload and Windows SDK. Reopen the development terminal and confirm `cargo test -p glim-core` and `cargo check --workspace` can run. Resolve the managed Application Control block on Rust formatting through the normal system-administration path; do not disable security controls.
2. Fix any native compiler findings, run Rust tests, and start `npm run desktop`. Check no-focus previews, rounded input region, window resizing and 100/150/200% DPI before adding more visual effects.
3. Build the relay. Test synthetic JSON on stdin for a zero exit code, empty stdout/stderr and a sanitized observation. Do not install hooks pointing to a missing/unverified executable.
4. Generate and review merged provider hook configuration, preserving all existing hooks and status-line settings. Install only Glim-owned entries and document removal. Complete Codex's `/hooks` trust flow rather than editing trust records.
5. Install the companion VSIX and prove exact terminal selection across two VS Code windows, two sessions in one folder, split terminals and closed/recreated shells. Add a reliable Windows foreground route before describing this as complete “Return to agent.”
6. Verify real lifecycle events and restart discovery for both providers. Wire validated quota sources to native account adapters, then replace polling and harden snapshots/order handling.

## References

- [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Microsoft C++ installation](https://learn.microsoft.com/en-us/cpp/overview/acquire-msvc?view=msvc-170)
- [Codex hooks and trust](https://learn.chatgpt.com/docs/hooks)
- [Codex app-server account reads](https://learn.chatgpt.com/docs/app-server)
- [Claude hooks](https://code.claude.com/docs/en/hooks)
- [Claude status-line quota fields](https://code.claude.com/docs/en/statusline)
- [VS Code terminal API](https://code.visualstudio.com/api/references/vscode-api#Terminal)

The companion app-server probe observes account usage; it does not subscribe to or infer another CLI process's live session status.
