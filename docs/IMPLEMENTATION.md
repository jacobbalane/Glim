# Development checkpoint — 2026-09-30

This is the first implementation slice. It is a runnable browser prototype plus native integration source, not a completed Windows release. Stage 1's native integration gates remain open. The C++ prerequisite is now installed; the remaining local compilation blocker is Windows Smart App Control.

## Verified on this machine

| Check | Result |
| --- | --- |
| Frontend and extension TypeScript | Pass |
| TypeScript unit tests | Nine passing: data freshness/alerts, probe privacy, hook configuration preservation, idempotent reinstall and conservative removal |
| Browser interaction tests | Four passing in installed Edge: empty/multiple sessions, focus/alerts, keyboard/reduced motion, interruption/narrow layout |
| Frontend production build | Pass |
| VS Code package | Generated `.local/glim-vscode-0.1.0.vsix`; not installed or published |
| Codex subscription feasibility | Read-only account and quota requests succeeded through installed CLI 0.159.2; both 300-minute and 10,080-minute windows were present |
| Rust installation | Rust 1.98.1 installed |
| C++ toolchain | Visual Studio Build Tools 2022 17.14.41 installed with MSVC; compiler and linker work |
| Rust collector tests | `cargo test -p glim-core --locked`: all four tests passed, including concurrent persistence |
| Native hook helper | `cargo build -p glim-relay --locked` succeeds; eight concurrent processes wrote separate sanitized records, and three malformed/oversized inputs exited silently |
| Native desktop check | Blocked: Windows Smart App Control rejected a generated dependency build helper, error 4551 |
| Rust formatting | `cargo fmt` was blocked by Windows Application Control, error 4551 |

The quota probe prints only sign-in type, plan type and numeric windows. No email, account identifier, tokens, transcripts, prompts or credit identifiers are emitted. Live percentages are intentionally not committed to this document.

## Implemented source

- React island with compact, expanded and attention states, six-session demonstration, account-scoped quota cards, quiet/empty state, session details, alert pause and connection help. Browser mode is always labelled demo; native mode never loads sample sessions.
- Motion layout transitions with a critically damped 0.4-second spring, separate content positioning to avoid stretched text, 160ms fades/press feedback, immediate keyboard behavior and reduced-motion support.
- Rust metadata allowlist, capped stdin, quiet 700ms relay deadline, per-event atomic file publication, bounded retention, process identity and lifecycle normalization. Unknown events and subagent events are ignored.
- Tauri host source with current-user named-pipe ACL, remote-client rejection, bounded messages, reconnectable terminal registry, unique ancestry-based matching, process creation-time validation, exact-terminal reveal acknowledgements and native rounded hit-region setup.
- Companion extension enumerates current terminals on connect, updates on open/close and retries while Glim is closed. It never reads terminal output or executes terminal commands.

The shared Rust collector and hook relay now compile and have been exercised on Windows. The desktop host is **not yet compiler-validated or exercised**; a dependency build helper was blocked before desktop checking finished.

## Native build follow-up

After installing C++ Build Tools, the collector compiled successfully and all four Rust tests passed. The subsequent `cargo check --workspace --locked` stopped when Windows refused to execute `target/debug/build/serde_core-39a8ddc2f5dccb6d/build-script-build.exe`.

CodeIntegrity event 3077 identifies policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. Microsoft's [inbox policy reference](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/inbox-appcontrol-policies) identifies this as **VerifiedAndReputableDesktop**, the Smart App Control enforcement policy. The helper is unsigned. This establishes a security-policy block, not another missing compiler component. No policies or security settings were changed, and the blocked helper was not executed by another route.

The npm native launcher now finds the installed Cargo directory even when the parent application has an old PATH. A packaging-only Tauri config and preparation script build and include the hook relay and companion VSIX under the installed application's `integrations` directory. This packaging path is prepared but not validated by a successful installer build. It does not install CLI hooks automatically.

Resume native work in an approved development environment, or after the device owner/administrator resolves the policy through an approved process. Building elsewhere does not establish that an unsigned Glim executable will be allowed to run on this PC.

### Integration progress — 2026-10-01

The separate relay target builds using the collector dependencies that already passed. Its process-level test uses an isolated `.local/relay-tests` directory through an absolute `GLIM_DATA_DIR` override, verifies eight simultaneous sessions and privacy filtering, then cleans up only its own fixture directory. No real provider sessions are launched and no CLI configuration is changed.

Hook setup planning is implemented as pure functions in `contracts/src/hook-config.ts`. A receipt records only newly added groups. Reinstallation is idempotent; removal preserves unrelated configuration, existing status lines, preexisting identical hooks, modified groups and duplicates with ambiguous ownership. Invalid configuration fails without modification. File transactions, provider-specific command generation, installed-version checks and native onboarding remain pending; the planning functions do not install hooks themselves.

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

1. The C++ toolchain and collector tests are now verified. Resolve the Smart App Control build-helper block through an approved development/signing environment before resuming `cargo check --workspace`. Rust formatting also remains affected by Application Control. Do not disable or bypass security controls as part of automated setup.
2. Fix any native compiler findings, run Rust tests, and start `npm run desktop`. Check no-focus previews, rounded input region, window resizing and 100/150/200% DPI before adding more visual effects.
3. Relay compilation and synthetic stdin checks now pass. Validate provider-specific hook invocation and installed CLI compatibility next. Keep the development relay uninstalled until setup can verify the complete lifecycle path.
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
