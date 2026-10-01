# Development checkpoint — 2026-10-01

This is the first implementation slice, not a completed Windows release. The native desktop now passes compilation checks and all workspace Rust tests run successfully. The device owner resolved the local Smart App Control blocker; stage 1's provider integration gates remain open.

## Verified on this machine

| Check | Result |
| --- | --- |
| Frontend and extension TypeScript | Pass |
| TypeScript unit tests | Eleven passing: data freshness/alerts, probe privacy, hook configuration preservation, idempotent reinstall, conservative removal and MSIX identity/manifest checks |
| Browser interaction tests | Four passing in installed Edge: empty/multiple sessions, focus/alerts, keyboard/reduced motion, interruption/narrow layout |
| Frontend production build | Pass |
| VS Code package | Generated `.local/glim-vscode-0.1.0.vsix`; not installed or published |
| Codex subscription feasibility | Read-only account and quota requests succeeded through installed CLI 0.159.2; both 300-minute and 10,080-minute windows were present |
| Rust installation | Rust 1.98.1 installed |
| C++ toolchain | Visual Studio Build Tools 2022 17.14.41 installed with MSVC; compiler and linker work |
| Rust tests | `cargo test --workspace --locked`: all four collector tests passed, including concurrent persistence; desktop and relay test targets compile |
| Native hook helper | `cargo build -p glim-relay --locked` succeeds; eight concurrent processes wrote separate sanitized records, and three malformed/oversized inputs exited silently |
| Native desktop check | `cargo check --workspace --locked`: pass, including tray controls |
| Rust formatting | `cargo fmt --all`: pass; formatting verification added to CI |
| Windows packaging | `npm run package:windows` produced `target/release/bundle/nsis/Glim_0.1.0_x64-setup.exe`, approximately 2.18 MiB; unsigned development artifact |
| Native window smoke checks | Compact/expanded UI, eight synthetic sessions, approval/response previews, stale readings, duplicate-launch reuse, clean Quit and saved-session discovery after restarting were observed in the compiled app |

The quota probe prints only sign-in type, plan type and numeric windows. No email, account identifier, tokens, transcripts, prompts or credit identifiers are emitted. Live percentages are intentionally not committed to this document.

## Implemented source

- React island with compact, expanded and attention states, six-session demonstration, account-scoped quota cards, quiet/empty state, session details, alert pause and connection help. Browser mode is always labelled demo; native mode never loads sample sessions.
- Motion layout transitions with a critically damped 0.4-second spring, separate content positioning to avoid stretched text, 160ms fades/press feedback, immediate keyboard behavior and reduced-motion support.
- Rust metadata allowlist, capped stdin, quiet 700ms relay deadline, per-event atomic file publication, bounded retention, process identity and lifecycle normalization. Unknown events and subagent events are ignored.
- Tauri host source with current-user named-pipe ACL, remote-client rejection, bounded messages, reconnectable terminal registry, unique ancestry-based matching, process creation-time validation, exact-terminal reveal acknowledgements and native rounded hit-region setup.
- Tray controls for showing, hiding, moving the island to the primary screen's top center and quitting. Closing hides to the tray; opening Glim again restores the existing instance. Background resizes respect an explicitly hidden island.
- Startup establishes the native size, rounded region and non-activating show directly. It does not rely on a ResizeObserver firing in a hidden WebView2 window.
- Companion extension enumerates current terminals on connect, updates on open/close and retries while Glim is closed. It never reads terminal output or executes terminal commands.

The collector, hook relay and desktop host are now compiler-validated on Windows. Synthetic relay tests establish sanitized metadata collection; they do not establish real CLI lifecycle compatibility or exact VS Code foreground behavior.

Native visual checks used a separate `GLIM_DATA_DIR` under `.local/native-smoke`, with clearly named test sessions and a helper process kept alive across app restarts. No real CLI hooks were installed. A blank restart was observed while initial visibility depended entirely on frontend layout; explicitly initializing the native first frame fixed the reproduced restart. The rebuilt app displayed its saved eight-session count without another launch or click. The test app and helper were closed after verification. Full tray-menu behavior, focus preservation, transparent hit testing, multiple monitors and 100/150/200% DPI remain unverified.

## Native build follow-up

After installing C++ Build Tools, the collector compiled successfully and all four Rust tests passed. The subsequent `cargo check --workspace --locked` stopped when Windows refused to execute `target/debug/build/serde_core-39a8ddc2f5dccb6d/build-script-build.exe`.

CodeIntegrity event 3077 identified policy `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`. Microsoft's [inbox policy reference](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/inbox-appcontrol-policies) identifies this as **VerifiedAndReputableDesktop**, the Smart App Control enforcement policy. The device owner subsequently reported changing the setting manually, after which the same build path passed. No security settings were changed by Glim or its setup scripts.

The npm native launcher finds the installed Cargo directory even when the parent application has an old PATH. The packaging-only Tauri config and preparation script successfully built the NSIS installer. Its generated installer script includes the hook relay and companion VSIX under `integrations`. CLI hooks and the extension are not installed automatically. Running the compiled executable is separate from testing the installer's clean-install, upgrade and uninstall behavior; those checks remain pending.

Stable public releases require trusted distribution and installation testing with Windows protections enabled. The owner has selected Microsoft Store MSIX, where Microsoft signs the approved package; direct EXE releases would still require signing the application, relay and installer. Users must not need to weaken Windows protections. At the owner's request, the current unsigned build is shared as a clearly labelled GitHub development prerelease with a README download button and checksum. This does not complete stable-release validation. Building elsewhere does not make an unsigned executable trusted.

### Microsoft Store preparation — 2026-10-01

`npm run package:msix -- --validation` builds an unsigned Windows 11 x64 MSIX with an explicitly temporary identity. MakeAppx manifest validation and pack/unpack SHA-256 comparisons pass for the application, relay, VSIX, manifest and three icon files. The script supports the actual Partner Center identity through a separate local JSON file, rejects placeholder identities in Store mode and emits checksums/build reports. It does not sign, install or submit packages.

The manifest declares a full-trust desktop application at normal user integrity and a console execution alias for the relay. This prepares a stable helper command across Store updates; installed alias invocation, packaged storage, process ancestry and the VS Code bridge still require validation. No provider hooks or extension settings were modified.

Dependency inspection found that the original packaged relay imported `VCRUNTIME140.dll`. The packaging preparation now builds the helper with a static C runtime. Inspection of the rebuilt helper shows only Windows system DLL imports, and its process-level checks passed with eight concurrent synthetic sessions plus malformed/oversized inputs. This change applies to future builds; the published preview has not been replaced.

Partner Center registration, name reservation and the assigned package identity are still required. Store availability, clean-account package installation, upgrade/uninstall behavior and Windows App Certification Kit results are not yet established. The native product limitations below also remain. See the [Store preparation guide](MICROSOFT_STORE.md) for the exact account fields and remaining validation steps.

### Integration progress — 2026-10-01

The separate relay target builds using the collector dependencies that already passed. Its process-level test uses an isolated `.local/relay-tests` directory through an absolute `GLIM_DATA_DIR` override, verifies eight simultaneous sessions and privacy filtering, then cleans up only its own fixture directory. No real provider sessions are launched and no CLI configuration is changed.

Hook setup planning is implemented as pure functions in `contracts/src/hook-config.ts`. A receipt records only newly added groups. Reinstallation is idempotent; removal preserves unrelated configuration, existing status lines, preexisting identical hooks, modified groups and duplicates with ambiguous ownership. Invalid configuration fails without modification. File transactions, provider-specific command generation, installed-version checks and native onboarding remain pending; the planning functions do not install hooks themselves.

## Deliberate prototype limits

- Native snapshot polling currently runs once per second and scans metadata. This does not meet the planned 250ms latency target. Replace it with a file watcher/in-memory collector before performance validation.
- Metadata retention is 24 hours, with a rolling target of 2,048 events plus up to 128 protected latest session records. Long-quiet sessions older than retention need a new hook event to reappear. Long-term durable session snapshots are still required for the release launch/reconnect contract.
- Hook receipt timestamps order observations. Delayed provider events, parallel tools, other Stop hooks requesting continuation, and cross-turn events need real provider fixtures before state labels can be release-grade. No task success or percentage is inferred.
- A process that still exists proves existence, not agent activity. Old readings become stale after 90 seconds. This threshold is a prototype default.
- Usage is proven by the standalone Codex probe, but is **not wired into the native island**. Claude usage requires a compatible version and preservation/composition of the existing status line. Neither CLI's settings have been changed.
- Native shell positions at the primary display and permits dragging, with tray recovery controls. Monitor selection, persistent placement, edge snapping, disconnect/reconnect and native glass remain unfinished.
- `Terminal.show(false)` targets the exact terminal in its own VS Code window. It does not yet establish that Windows brings the correct window to the foreground. That remains a release-blocking feasibility check.
- An unsigned installer and native executable now build successfully. Trusted signing, clean-machine installation and real provider integration remain pending. The bundled VSIX is a development artifact, not a proven end-to-end integration.

## Next native work, in order

1. Native compilation, Rust tests and packaging pass. Complete installed-app checks. Do not change Windows security controls as part of automated setup.
2. Exercise no-focus previews, rounded input region, tray recovery, window resizing and 100/150/200% DPI before adding more visual effects.
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
