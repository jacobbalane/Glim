# Windows corners and Codex setup — 2026-10-13

## Windows corner fix

Windows' non-client activation painting could show a pale frame through the transparent pixels around the notch after collapsing it and clicking another window. Tao retains native caption/edge styles and forwards activation to the default window procedure.

The island now installs a Windows window subclass before it is shown. It suppresses `WM_NCPAINT` and forwards `WM_NCACTIVATE` with `lParam = -1`, the [documented way to avoid repainting the frame](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-ncactivate). Activation still reaches Tao, preserving focus/blur notifications. The subclass removes itself when the window is destroyed. CSS curves, antialiasing room in the region, focus policy, and macOS behavior are unchanged.

A regression uses a real hidden Windows window and sends 100 activation changes. It verifies that activation still arrives, native frame painting is suppressed, unrelated messages are forwarded, and the subclass is removed on destruction. This is a native message test, not a screenshot comparison of the installed app: the Computer Use helper was unavailable in this session.

## Codex setup and website sync

The former **Connected** label only meant that Glim had written its configuration. It did not establish Codex hook trust. [Codex requires the user to review and trust non-managed hooks through `/hooks` in its CLI](https://learn.chatgpt.com/docs/hooks).

Changes in Settings and onboarding:

- Before setup: **Set up**, then **Add Codex hooks**.
- After adding hooks: **Hooks added**, with a neutral status dot.
- The Codex disclosure stays open and explains the remaining CLI `/hooks` review, trust, and new-session steps.
- Previously configured Codex entries retain these instructions when opened. Glim explicitly says it cannot confirm the trust setting.
- The success message says **Codex hooks added. Finish setup in Codex.**

The website's `site/AppIsland.tsx` imports the app's shared panels and styles, so its live notch preview receives these copy changes automatically. Any separate setup mock should use the wording above. **The Windows corner fix requires no website visual change.**

No hook trust, provider settings, or credentials were changed in the user's real environment. Connector tests use browser fixtures.

## Verification

Initial verification in the original `mac-support` checkout:

- Rust: all 35 tests passed, including the native activation/frame regression.
- Clippy: all targets passed with warnings treated as errors.
- Browser: seven distinct checks passed across Codex setup, existing Claude setup, connector errors, island expansion/interruption, onboarding, and narrow layouts.
- App and website production builds passed. The existing large 3D mascot chunk warning remains.
- `npm run package` passed and produced `src-tauri/target/release/bundle/nsis/Glim_0.1.3_x64-setup.exe` (4.59 MiB).
- The Codex setup screenshot was reviewed after shortening the success message to fit the island.

The installed Glim process was left running. These changes require rebuilding or installing the patched app before they can affect that copy. A visual check of collapse followed by clicking another window is still needed on the patched desktop app.

## Commit scope

The fixes were transferred to a separate checkout of `main`, based on `a0b379c`, without merging the macOS branch or its outstanding edits. The macOS smoke test's Codex button selector update remains in the original checkout because that script does not exist on `main` yet. The production app build, both Codex setup browser tests, and all 33 Rust tests passed again on `main`.
