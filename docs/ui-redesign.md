# UI redesign: implementation reference

Status: approved by the owner as the target design. Parts of the notch behavior already exist in the app; [Starting point](#starting-point) maps what is there to what changes. This document tells an implementing agent how to move the rest into the app. Start with [Before you start](#before-you-start): it sets the order of work and what to ask the owner.

The working reference is the dev-only page at `http://127.0.0.1:1420/preview-claude` (run `npm run dev`). Vite serves `preview-claude.html` there without a router change, and the desktop build does not include it.

| File                           | Contains                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `preview-claude/island.tsx`    | Every island component, the state rules, and the sample scenarios              |
| `preview-claude/brand.tsx`     | The character (`Eyes`), `podPath()`, the logo, the app icon, installer art     |
| `preview-claude/installer.tsx` | First mocks of the NSIS screens, superseded by the dark installer              |
| `preview-claude/style.css`     | The review page theme first, then the island tokens and styles, then installer |
| `preview-claude/main.tsx`      | The review page itself                                                         |

When this document and the preview disagree, the preview wins. Copy its components and values; do not reinterpret them.

Contents: [Before you start](#before-you-start) · [Ground rules](#ground-rules) · [Starting point](#starting-point) · [The idea](#the-idea) · [State language](#state-language) · [Tokens](#tokens) · [Surface and motion](#surface-and-motion) · [Views](#views) · [Notch rotation and banner](#notch-rotation-and-banner) · [Interaction state](#interaction-state-in-apptsx) · [Native window](#native-window) · [Logo, mascot and icon](#logo-mascot-and-icon) · [Installer](#installer) · [Review page theme](#review-page-theme) · [File plan](#file-plan) · [Tests to update](#tests-to-update) · [Acceptance checks](#acceptance-checks) · [Pitfalls](#pitfalls-found-while-building-the-preview)

## Before you start

This document is the whole brief. Read it to the end before you change anything, then work through it in phases, one phase per session.

### Prerequisites

Do these once, before the first phase:

1. Run `git status` and `git log`. If the repository has no commits, or holds changes you did not make, stop and ask the owner to commit them. Every phase starts from a clean tree, so each one can be reviewed and reverted on its own.
2. Run `npm install`, then take a baseline: `npm run build`, `npm test`, `npm run test:ui` and `npm run check:rust` (`cargo test`). Write down what already fails, so you never chase a failure you did not cause.
3. Run `npm run dev` and compare `http://127.0.0.1:1420/preview-claude` (the target) with the current app's gallery at `http://127.0.0.1:1420/preview`. If you cannot open a browser, take Playwright screenshots of both.
4. Read `preview-claude/island.tsx`, `brand.tsx` and `style.css` in full. They are the spec; this document explains them.

### Phases

| Phase               | File plan steps                            | Done when                                                                                                                                  |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Interface        | 1–3: styles, components, surface and notch | Every view matches the preview, the notch rotates, presents and docks as described, and the build and tests pass                           |
| 2. Native and brand | 4–5                                        | `npm run check:rust` passes, and the new mark, character and icons are in place                                                            |
| 3. Installer        | 6                                          | The installer builds with the new art, copy, template and hooks                                                                            |
| 4. Cleanup          | 7–9                                        | React Bits and `ogl` are gone from the app, `/preview` and the capture script work, and every [acceptance check](#acceptance-checks) holds |

- Update the tests a phase breaks within that phase, using [Tests to update](#tests-to-update). Do not leave them for phase 4.
- Do not start the next phase in the same session. Stop and report.

Progress is the one part of this document you may edit. Tick a phase when its "Done when" holds, and add the date:

- [x] Phase 1: Interface — 2026-10-09
- [x] Phase 2: Native and brand — 2026-10-10. Native geometry and 3D brand implemented; 20 Rust tests and isolated native smoke passed. Actual desktop testing covered 100% scaling; a physical 150% display and mixed-DPI monitor move still need visual review.
- [x] Phase 3: Installer — 2026-10-10. Built with the 3D art, copy, template and hooks. `npm run test:install` passed, and an isolated passive upgrade from 0.1.0 to 0.1.1 kept both agents connected and the usage history. The welcome screen was checked by eye. Still for the owner to check by eye: the update, finish and uninstall screens, and that uninstalling with the checkbox ticked removes the usage history (a silent uninstall cannot tick it).
- [x] Phase 4: Cleanup — 2026-10-10. React Bits, `WorkingIndicator` and the `/preview-3d` page are gone from the app; `ogl` is a dev dependency for the website. The `sessions` scene is removed. Build, 8 unit tests, 20 UI tests, 20 Rust tests, Clippy, `/preview` and `npm run preview:capture` (31 views) pass, and a scripted user walkthrough of the browser preview found no errors.

**Owner update, 2026-10-10:** Use the website's 3D Glim throughout the app, with its enlarged eyes and satin finish. This supersedes the SVG-only character and no-WebGL requirements below. App and website share `src/mascot-renderer.ts`; the app uses `src/Character.tsx` at the original 24/28px footprints, lazy-loads Three.js, and keeps the flat character as a rendering fallback. Reduced motion and still previews draw one frame per state change. Native app/tray icons and favicon use rendered PNG/ICO assets from `npm run brand:render`. This change does not mark the remaining native-window or installer phases complete.

**Phase 2 implementation note, 2026-10-10:** The later owner-approved 8px circular shoulders supersede the 26×15px shoulder dimensions in the original native-window section. The Windows region now follows the current 34px compact height, 17–24px bottom radius, and 8px shoulders already used by the app and website. No frontend notch design changed in this phase; the website needs no corresponding edits. Future visible notch changes must be listed for the owner to mirror on the website.

Start each session from the first unticked phase.

### Stop and ask the owner

- Before changing anything the [Ground rules](#ground-rules) leave out: the Rust collector, `src/types.ts`, the Tauri commands and events, the `api.ts` contract, or privacy behavior.
- Before the optional [tray icon per state](#tray-icon-per-state-optional-needs-the-owners-approval). Skip it unless the owner approves it.
- Before deleting `backups\` on uninstall. The default is to keep it.
- Before running `npm run test:install`. It installs and uninstalls Glim on the machine.
- Before editing or removing `preview-claude/`.
- Before committing or pushing. The owner reviews each phase and commits it.

### End of each phase

Report:

- What changed, file by file.
- Test results, next to the baseline.
- What you skipped or could not verify, and why.
- What the owner needs to check by eye.

The owner checks what an agent cannot see:

- After phase 1: the app next to `/preview-claude`. Check the rotation, the banner, the scrolling status, the shoulders, the glows and the character's motion.
- After phase 2: `npm run desktop` at 100% and 150% scaling. The window region matches the island, and clicks just below it reach the window underneath.
- After phase 3: an install, an upgrade over the previous version, and an uninstall with `Also delete my usage history` ticked, on a machine where that is safe.

## Ground rules

- Change the interface only. Leave the Rust collector, `src/types.ts`, the Tauri commands and events, the `api.ts` contract, and privacy behavior as they are. The Rust changes allowed are the window region in [Native window](#native-window) and the installer hooks in [Installer](#installer).
- Keep `data-testid="island"` and `data-expanded` on the island surface, plus the `island` class on its black surface element (tests use them).
- Keep the existing behavior: Esc, outside click and window blur collapse the island. Background updates never expand it or take focus. Onboarding opens setup when `onboardingComplete` is false. Reduced motion is honored.
- Keep the internal view id `history` for the Usage sheet. The tray and `open_panel` (`src-tauri/src/lib.rs`) only accept `settings`, `history` and `setup`.
- Keep `preview-claude/` until the owner says to remove it. It is the visual spec.
- The website in `site/` (`npm run site`, port 3000) imports the island, the character and the page theme from `preview-claude/`. Do not move or rename anything there. The website also uses `ogl` and `three`; leave both installed. The website renders the app's own notch: `site/AppIsland.tsx` imports `src/IslandSurface`, `src/island-views` (`Compact`, `Glance`), `src/panels` (`Details`, `SettingsSheet`, `UsageSheet`, `SetupSheet`), `src/session-presentation` (`groupSessions`, `notchView`), `src/useSessionPreview`, `src/useReducedMotion` and `src/styles.css`. Renaming or changing the props of these breaks the website build (`npm run site:build`), so run it after such changes. Once the components live in `src/`, the site can import them from there instead; ask the owner first.

## Starting point

The app moved on after this document was first written. Build on what is there:

| Already in the app                                                                               | Where                                                         | What changes                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The compact width follows its text, 144–360px                                                    | Measuring in `App.tsx`, `compactWidth` in `IslandSurface.tsx` | Keep. Measure the banner rows too. The height becomes 34px.                                                                                                                         |
| Long compact text scrolls back and forth at 28px/s                                               | `LiveText.tsx`                                                | Switch to the one-direction loop (`Ticker` in `island.tsx`). Only the status scrolls; the project stays put. See [Compact](#compact-always-on-screen).                              |
| Working sessions rotate every 6s, new attention jumps the queue, and hovering holds the rotation | `useSessionPreview.ts`, `session-presentation.ts`             | Keep the queue, the hold, `attentionKind` and `data-session-id`. Stop rotating notices back into the notch; dock them, see [Notch rotation and banner](#notch-rotation-and-banner). |
| A one-line attention summary under the notch                                                     | `attention-banner` in `App.tsx`, `attentionSummary()`         | Replace it with one row per agent.                                                                                                                                                  |
| Native width clamp 144–440                                                                       | `src-tauri/src/platform.rs`                                   | Keep the width clamp. Change the height clamp, radius and shoulder, see [Native window](#native-window).                                                                            |

## The idea

The island speaks in states, not numbers. Working agents take turns in the notch; anything that needs you takes over for a moment, then waits in a banner below it until it is handled. Inside the island, color only ever means state. The Glim character is the status light: its fill is the state color and its eyes are the mood. Glim indigo belongs to the logo alone. Provider color appears only in provider logos and the usage chart.

## State language

Group sessions first: a session whose `parentId` matches another session folds into that parent as a subagent. Sort the top-level groups by `rank` ascending, then `updatedAt` descending. Implementation: `lookOf()` and `groupSessions()` in `preview-claude/island.tsx`.

| `activity`    | Condition                                | Label          | Tone      | Eyes   | Rank |
| ------------- | ---------------------------------------- | -------------- | --------- | ------ | ---- |
| `waiting`     | `detail` is `Agent needs your attention` | Needs you      | attention | wide   | 0    |
| `waiting`     | otherwise                                | Needs approval | attention | wide   | 0    |
| `error`       |                                          | Error          | error     | cross  | 1    |
| `idle`        | `updatedAt > seenAt`                     | Your turn      | success   | happy  | 2    |
| `working`     |                                          | Working        | active    | scan   | 3    |
| `interrupted` |                                          | Interrupted    | calm      | half   | 4    |
| `finished`    |                                          | Done           | done      | happy  | 5    |
| `idle`        | `updatedAt <= seenAt`                    | Ready          | calm      | open   | 6    |
| `stale`       |                                          | Quiet          | off       | closed | 7    |

`seenAt` is interface state only. It is never persisted and the backend does not change.

- Initialize it to the time the app starts, so idle sessions start as Ready.
- Set it to `Date.now()` every time the island collapses.
- Subagent rows always treat `seenAt` as infinite, so they never show Your turn.

Each tone has one color. Light in that color spills under the compact notch only for the tones that want you to look:

| Tone        | Used for                          | Color                     | Glow under the notch       |
| ----------- | --------------------------------- | ------------------------- | -------------------------- |
| `active`    | Working                           | `--blue` `#5cc8ff`        | No, it is the normal state |
| `attention` | Needs approval, an answer, or you | `--amber` `#ffc53d`       | Yes                        |
| `error`     | Error                             | `--red` `#ff6a5f`         | Yes                        |
| `success`   | Your turn                         | `--teal` `#36d4c4`        | Yes                        |
| `done`      | Done (session ended)              | `--green` `#3ddc84`       | No                         |
| `calm`      | Ready, Interrupted, Paused        | `#8f8f99`                 | No                         |
| `off`       | Quiet                             | `#5e5e68` (graphics only) | No                         |

Grey stays for the states that need nothing from you. While working, the compact row shows the task text in `--fg-2`; the blue is on the character, the chip and the `Working` label.

Monitoring paused (`preferences.paused`) overrides the compact pill with calm tone, closed eyes, and the title `Monitoring paused`.

Times use `ago(ms)`: under 5 seconds `now`, under a minute `41s`, under an hour `2m`, otherwise `1h 5m`.

| Activity        | Time shown                                                           |
| --------------- | -------------------------------------------------------------------- |
| `working`       | `elapsed(startedAt, now)` from `src/format.ts`, for example `5m 12s` |
| `waiting`       | `ago(now - updatedAt)`, for example `2m`                             |
| Everything else | `${ago(now - updatedAt)} ago`, or just `now`                         |

## Tokens

All island values live on the `.gl` scope in `preview-claude/style.css`.

| Token                           | Value                   | Use                                                            |
| ------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `--glim`                        | `#6366f1`               | The logo's body, with white eyes. Logo only.                   |
| `--ink`                         | `#000`                  | Island surface, the character's eyes                           |
| `--fg-1`                        | `#f4f4f5`               | Primary text, primary button                                   |
| `--fg-2`                        | `#a9a9b1`               | Secondary text                                                 |
| `--fg-3`                        | `#82828c`               | Meta text and times (5.5:1 on black)                           |
| `--hair`                        | `rgba(255,255,255,.09)` | Dividers                                                       |
| `--hover`                       | `rgba(255,255,255,.06)` | Row and icon hover                                             |
| `--control` / `--control-hover` | `#1c1c20` / `#27272d`   | Buttons, segmented controls, selects                           |
| `--blue`                        | `#5cc8ff`               | active tone (Working), the current plan step                   |
| `--teal`                        | `#36d4c4`               | success tone (Your turn), and its glow under the island        |
| `--amber`                       | `#ffc53d`               | attention tone                                                 |
| `--red`                         | `#ff6a5f`               | error tone                                                     |
| `--green`                       | `#3ddc84`               | done tone, connected status, completed plan steps              |
| calm / off tones                | `#8f8f99` / `#5e5e68`   | Ready, Interrupted, Paused / Quiet. Use off for graphics only. |
| Claude / Codex series           | `#d97757` / `#7a9dff`   | Usage chart and its legend only                                |

Remove the old lavender accent (`#b09afa`) from toggles, focus rings, step numbers and the star border. Glim's color is indigo, and it lives only in the logo, as `--glim` (`#6366f1`): deep enough that white eyes stay visible on it.

Meters use a `rgba(255,255,255,.12)` track and an `#e6e6ea` fill. The fill turns amber at 75% and red at 90%.

Switches have three states:

- Off: track `#3a3a42` with an inset `rgba(255,255,255,.07)` hairline, knob `#c4c4cc`.
- On: track `--fg-1`, knob `#000`.
- Toggled: 220ms ease-out.

Contrast mode (`prefers-contrast: more`) raises `--fg-2` to `#cfcfd5` and `--fg-3` to `#b4b4bc`.

The font stays the bundled Manrope Variable. Sizes run from 11px (the floor) through 12, 12.5, 13 (body), 15 (sheet titles) and 16 (hero project) to 30 (welcome title). Weights run 560 to 800. Every number uses `font-variant-numeric: tabular-nums` (the `.num` class).

Easing: `--ease-out: cubic-bezier(.23,1,.32,1)` and `--ease-in-out: cubic-bezier(.65,0,.35,1)`.

## Surface and motion

|               | Compact                | Expanded                       |
| ------------- | ---------------------- | ------------------------------ |
| Width         | Its content, 144–360px | `min(440, viewport - 40)`      |
| Height        | 34px                   | Measured from the current view |
| Bottom radius | 17px                   | 24px                           |

The compact island is as wide as its content (the notch row and any banner rows), between 144px and a cap of `min(360, expanded width − 60)`. When the text changes, the width springs to the new size. A status that would push past the cap scrolls instead, while the project stays put; see [Compact](#compact-always-on-screen).

The radius interpolates from 17px at the cap to 24px at the expanded width, so every compact width keeps 17px.

The shoulders, where the island meets the screen edge, are 26px wide and 15px tall. Each one is a single cubic curve. It leaves the screen edge almost flat and meets the island's side upright, so the island flows out of the edge instead of turning a corner. The control points sit at 70% of each leg.

- Draw each shoulder as a black box with `clip-path: path()`. Do not use a circular or elliptical radial-gradient mask: its edge ramp leaves a visible step where the shoulder meets the side.
- Make each box 27px wide and tuck it 1px under the island (`right: calc(100% - 1px)` on the left, `left: calc(100% - 1px)` on the right). Otherwise a hairline seam shows whenever the island sits at a fractional position, which the springs cause all the time.
- Left: `clip-path: path('M0 0H27V15H26C26 4.5 18.2 0 0 0Z')`.
- Right: `clip-path: path('M27 0H0V15H1C1 4.5 8.8 0 27 0Z')`.

The width and height springs use `stiffness: 420, damping: 40, mass: 1` and keep the existing retargeting. Under reduced motion they jump.

Content fade ("ink") follows the real spring position, not a timer:

- Compact content fades 1→0 over the first 26px of growth past the cap, so resizing between compact widths never fades the text.
- Expanded content fades 0→1 over the last 30px.

`IslandSurface.tsx` already works this way. Change its constants (42 becomes 34, 154 is no longer used, radius 19–26 becomes 17–24) and replace the fixed 292 compact width with the measured one.

View changes crossfade opacity together with `blur(3px)` in 200ms (60ms under reduced motion). Each expanded view keeps the width it was created with (`ViewFrame` in the preview), so a view on its way out never reflows. The compact view is `max-content` wide, clamped to 144px and the cap, hung from the left edge (`left: 0`), and reports its measured width and height to the surface through a `ResizeObserver`. Views on their way out are `inert`.

When the compact content changes width (rotation, a new notice, a banner row), the change is one morph, shape first:

1. The compact view hangs from the island's left edge (`left: 0`, not centered), so the character travels with that edge and never jumps.
2. The old text fades out in 120ms. It is popped out of the layout (`AnimatePresence mode="popLayout"`) so it does not affect the new width.
3. The new text is laid out at once but stays transparent. After a 90ms guard, so the new width has been measured, it waits until `settle` reaches 0.97, then fades in over 180ms. `settle = clamp(1 − (|width − target| − 3) ÷ 16)`.
4. Once shown, the text stays visible. A later width change caused by something else never blinks it.
5. The end slot (dots, count, time) follows `settle` the whole time, because it sits on the moving right edge.
6. Banner rows enter after a 180ms delay.

A new notice is presented in the same frame it is detected, not on the next tick, so the dots and the text change in that single morph.

The character's motion is listed under [Logo, mascot and icon](#logo-mascot-and-icon).

When the compact notch row shows an attention, error or success tone, light in that color (`--glow`) spills under the island: a blurred ellipse whose opacity pulses between 0.6 and 0.18 over 2s. It follows the notch row, not the banner, so a rotating working agent never glows.

The in-progress pip breathes to 40% opacity. Meter fills animate `transform` over 600ms.

Reduced motion stops every animation. The motion budget is the spring plus the character, nothing else.

## Views

The status glyph in every view is the character (`Eyes` from `brand.tsx`). Sizes: compact 28, chips 24, paused banner 24, empty 60, welcome 128.

Provider logos:

- Claude: `<img src="/providers/claude.svg">`.
- Codex: the PNG has an opaque black square, so render a `<span>` with `background: var(--fg-1)` and `mask: url('/providers/codex.png') center / contain no-repeat luminance`. Do not use `mix-blend-mode`; it fails inside the opacity and blur groups used by transitions.

### Compact (always on screen)

Shows what [Notch rotation and banner](#notch-rotation-and-banner) picks: a new notice, else the working agents in turn, else the most urgent thing at rest. Never a sticky selection.

Layout: the character, then the title (13px/680), then the status (12.5px/620 in tone color; `--fg-2` when working), 8px apart.

- Title: the project, or `Monitoring paused` or `No agents running`.
- Status while working: the in-progress task's label, or `detail` when there is no plan. Task labels change less often than tool details, so the width stays calmer.
- Status otherwise: the label.

Width and long text (`Ticker` in `island.tsx`):

- The text sets the island's width, as described in [Surface and motion](#surface-and-motion).
- The title never moves. Only the status scrolls. A title wider than 150px ends in an ellipsis, so a long folder name cannot squeeze the status out.
- When the status overflows the space the cap leaves it, it scrolls right to left in a seamless loop: two copies, each followed by 40px of space, moving one copy's width at 40px/s (at least 6s), starting after 1.4s.
- The status's right edge fades over 18px. Its left edge stays hard until the scroll starts, so the first letter is never dimmed at rest. Then a 14px fade grows in over 240ms, so letters leaving on the left fade out after the 8px gap and never run into the title. The fade width is a registered custom property (`@property --fade-l`, a `<length>`) animated inside the mask gradient.
- Hovering the island pauses the scroll and the fade.
- Under reduced motion there is no scroll: the status ends in an ellipsis, and the button's `title` holds the full text.
- Each new text remounts the ticker, so it always starts from the left.

The end slot shows one of:

- Several working agents: one 5px dot per working agent, at most five. The one on screen is lit and slightly larger.
- Waiting: `ago()` in amber.
- Tasks: `done/total` in `--fg-3`.

It is a button with `aria-expanded="false"`, `data-session-id` and the name `Glim: {title}, {status}. {n} agents. Open.`. Its text is a polite live region.

### Notch rotation and banner

Implementation: `notchView()` and `useNotch()` in `island.tsx`. The app's `useSessionPreview.ts` already has a queue, a hold on hover and a dwell for scrolling text. Reshape it to this model rather than starting over.

What counts as a notice: a top-level session that needs you, or that just changed in a way worth knowing.

| Notice                           | Condition                                                            | Holds the notch | Leaves the banner when                    |
| -------------------------------- | -------------------------------------------------------------------- | --------------- | ----------------------------------------- |
| Needs approval / an answer / you | `waiting`                                                            | 7s              | it stops waiting                          |
| Error                            | `error`                                                              | 7s              | it stops erroring                         |
| Your turn / Done                 | `idle` or `finished`, `updatedAt > seenAt`, less than 10 minutes old | 5s              | the island is opened, or after 10 minutes |
| Interrupted                      | `interrupted`, `updatedAt > seenAt`                                  | 3.5s            | the island is opened                      |

What the notch row shows, in this order:

1. **A notice being presented.** Each notice is presented once, when it first appears: a new activity or a new `updatedAt`. Several new notices queue and present one at a time, most urgent first.
2. **Otherwise, the working agents in turn.** They are sorted by project, so the order never jumps. Each stays 6s, or longer when its text scrolls: `max(6s, 2.6s + text width ÷ 40px per second)`.
3. **Otherwise, nothing is working.** The notch shows the most urgent docked notice, then the top group, then `No agents running`.

Docking:

- When a presented notice's hold ends, it docks. It leaves the notch and becomes a row in the banner below.
- Docked notices never rotate back into the notch. The app's current version brings them back every third turn; drop that.
- Notices that already exist when Glim starts are docked silently, without being presented.

The banner sits inside the same black surface, below the notch row and under a hairline. It replaces the one-line `attention-banner` summary ("1 needs approval · 1 done"):

- One row per notice, most urgent first, at most three. Further notices collapse into a `{n} more` row.
- Each row is 30px tall: a 6px dot in the notice's color, the project (12px/660, ellipsis), the label in the tone color, and the time on the right (`now`, `2m`, `7s ago`). No character in the rows; the notch row keeps the only one.
- Each row is a button named `{project}: {label}. Open.` It opens the glance focused on that agent. `{n} more` opens the glance on the fourth notice.
- New rows slide down 12px and fade in over 320ms after a 180ms delay. Rows that leave fade upward.
- The compact width covers both the notch row and the banner rows, within 144–360px. The height grows with the rows.
- The banner is hidden while monitoring is paused.

Timing:

- A tick every 250ms drives presenting, docking and rotation. It pauses while the document is hidden, and while the island is expanded or paused.
- While the pointer is over the island, nothing rotates. A presented notice keeps holding until the pointer leaves.
- Clicking the notch row opens the glance focused on the agent it shows. The row's button carries `data-session-id`, which the app's tests already use.
- Collapsing the island sets `seenAt`, which clears Your turn, Done and Interrupted rows.

### Glance

The bar is 42px tall.

- Left: `{n} agents`, then `{n} needs you` in amber and `{n} errors` in red when nonzero.
- Right: icon buttons Usage (`ChartColumn`), Settings (`Settings2`) and Collapse (`ChevronUp`).

When paused, a banner (`Monitoring is paused. What you see is frozen.` with a Resume button) sits above the body, and the body drops to 50% opacity.

The hero is the focused group: `focusId`, or `groups[0]`.

- Head: logo (20px), then the project (16px/740), then a chip (character plus label in tone color).
- Body, indented 29px:
  - The detail and its time.
  - A hint in tone color: `Respond in {Claude|Codex} to keep it going.` when waiting, `Open the {agent} session to see what failed.` on error.
  - The task row: the current step (in progress, else the next pending, else `All steps done`), then 12×4 pips (completed `--green`, current `--blue` breathing, pending white at 14%), then `step/total`.
  - Meters (`minmax(130px,1fr)` grid): Context (Codex adds `Estimated`), and the first unexpired limit named by `limitName()`, for example `5-hour limit`, with `Resets in {ago}`.
  - A subagent list: `{n} subagents`, one row each with a dot, detail and time.
  - A footer: `{total} tokens · {model}`, then a Details link.

Other groups are 40px rows below a hairline: logo (16px), project, a `+{subagents}` badge, a dot plus label in tone color, and the time. Clicking a row focuses it. Its accessible name is `{project}, {provider}: {label}`.

There is no separate session picker any more.

Empty state: the character (60px, follows the pointer), `No agents running`, `Start Claude Code or Codex as usual. Glim lights up when they do.`

### Details

The sheet header has a Back icon button, the project as title, `{provider} · {model} · started {ago} ago` beneath it, and the state chip.

Sections:

- Budget: large meters (6px track) for `Context window` and each unexpired limit. When there are none, show `{agent} hasn't reported account limits.`
- Plan: shown only when there are tasks, headed `{done} of {n} done`, as a checklist with 16px circles: completed is a `--green` disc with a black check, current is a `--blue` ring with a blue center, pending is a grey ring.
- Tokens: a ledger with Input, Output, Cache writes and, when nonzero, `Reasoning, within output`. Then `Total` (`totalTokens`) above a hairline, then `Read from cache` muted. End with `As {agent} reports them. Cache reads sit outside the total. Not a billing estimate.` and the `measurementNote`.

Missing values read `Unavailable`, never a bare dash.

### Settings

Agents uses the connector flow below.

Island fields, separated by hairlines:

- `When idle`: segmented control, Keep visible or Hide.
- `Display`: select. Its open list is styled with `appearance: base-select` (the `@supports` block after `.gl select` in `preview-claude/style.css`): a `--control` panel with rounded rows and a check on the current display, never the system's white menu.
- Switches: `Start with Windows`, `Hide over fullscreen apps`, `Pause monitoring`.

Data:

- The privacy line: `Usage stays on this device for 30 days. No prompts or responses are saved.`
- `Usage history` with View and `Clear…`. `Clear…` turns into Keep and Clear history, with `Deletes Glim's saved counters. Agent files stay intact.`

The footer shows `Glim {version}` and a Releases link (`api.openRelease`).

### Connector flow (settings and setup)

Each agent is a card (`rgba(255,255,255,.045)`, 12px radius) whose head is a disclosure button (`aria-expanded`).

- Head: logo, name, then `v{version}`, `Detected` or `Not installed`.
- When connected: `● Connected` in green as plain text. It is a status, not a button. Today one click on "✓ Connected" disconnects the agent (`src/panels.tsx:142`); that must not survive.
- When not connected: a Connect pill.

The open body shows `Glim added` or `Glim will add`, the `changes` with green checks, the `configPath` in Cascadia Code or Consolas, and either `c.note` or `Disconnecting removes only these entries.` Opening and closing a connector, and the notice after connecting or disconnecting, spring their height open and shut (motion `AnimatePresence`, height `auto`, the island spring) instead of jumping; the swapped buttons fade in.

Actions:

- Not connected: a primary `Connect {short}` button, disabled when the agent isn't detected.
- Connected: `Disconnect…`. It becomes Keep and a danger button, `Remove from {config file name}`.

After a change, show a status notice: `{name} connected. {note}` or `{name} disconnected. Its other settings are untouched.`

Keep showing `c.error` and failed calls inline.

### Usage (`history`)

- Segmented Period (7, 14 or 30 days) and Agent (All, Claude or Codex). The project filter is replaced by the By project list.
- `{total} tokens in the last {n} days`, then `Input · Output · Cache writes · Read from cache`.
- The chart: stacked daily bars, Codex on top of Claude with a 1px gap, a dashed line at the maximum, and its value top right. Hovering a day dims the others to 40% and replaces the readout with that day's values. The axis reads the first date and Today.
- By project: name, value, and a 3px bar relative to the largest.
- `Totals count input, output and cache writes as each agent reports them. Not a billing estimate.`
- The empty period shows `Nothing recorded in this period.`

### Setup

Header `Set up Glim` with three 18×4 step bars.

1. Welcome: the character (128px), `Glim`, `A glimpse at your agents.`, a large Get started button, `Local. No extra account.`
2. `Connect your agents`, `Glim shows every change before it makes it, and keeps a backup.`, then the connector flow.
3. `The island`, `All of this lives in Settings later.`, then When idle, Start with Windows and Hide over fullscreen apps.

The footer has a Back link and a Continue or Done primary button. Done saves `onboardingComplete: true` and opens the glance.

Buttons are plain: the primary is `--fg-1` on black with `#0a0a0b` text. No animated border.

## Interaction state in `App.tsx`

Replace `selectedId`, `sessionList` and `detailsOpen` with three pieces of state:

- `view`: `compact`, `glance`, `details`, `settings`, `history` or `setup`.
- `focusId`: set by a glance row click, Details, the notch row (the agent it shows) or a banner row. Reset on collapse. If that session disappears, fall back to `groups[0]`. Do not reset it on snapshot updates, because snapshots arrive constantly.
- `seenAt`: described above.

`collapse()` sets the view to compact, clears `focusId` and updates `seenAt`.

Esc in a sheet returns to the glance. Esc in the glance collapses and focuses the compact button.

`glim:expand` opens the glance. `glim:view` opens the named sheet.

## Native window

`src-tauri/src/platform.rs` `shape()` builds the Win32 region from the old geometry. Without these changes, the region is 8px taller than the 34px pill and its corners are rounder than the drawn ones, so it swallows clicks just below the island. The frontend already sends every spring frame's width and height through `api.shape()`, so the region follows the text-driven width with no other change.

| Value                                      | Today                                                 | New                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Width clamp                                | `width.clamp(144, 440)`                               | No change                                                                                                                                           |
| Height clamp                               | `height.clamp(42, 616)`                               | `height.clamp(34, 616)`                                                                                                                             |
| Radius                                     | `19. + (width - 144.) / 296. * 7.`                    | `17. + ((width - 360.) / 80.).clamp(0., 1.) * 7.`                                                                                                   |
| Shoulder                                   | `18.`, one circular size                              | Width `26.` and height `15.` (`sw`, `sh`): the rect `(x - sw, 0, x, sh)` minus `CreateEllipticRgn(x - 2 * sw, 0, x, 2 * sh)`, mirrored on the right |
| Initial shape (`src-tauri/src/lib.rs:168`) | `platform::shape(app.handle(), 292, 42, Some(false))` | `300, 34`                                                                                                                                           |

The drawn shoulder is a cubic and the region's cut is an ellipse of the same size. The ellipse lies inside the cubic's curve everywhere, so the region always covers the drawing and never clips it. At most it adds 2px of clickable transparent area in the middle of each curve. If exact hit testing ever matters, build the shoulders with `CreatePolygonRgn` from the sampled cubic instead.

Run `cargo test` afterwards, then check the region against the visible island in `npm run desktop` at 100% and 150% scaling.

## Logo, mascot and icon

One character, drawn from the island's pod. It is the logo, the island's status glyph, the app icon and the installer art, and it moves with the island's state. Source of truth: `preview-claude/brand.tsx`. Copy its functions; do not redraw the shapes by hand.

### Geometry

`podPath(cx, w, h, r, top)` draws the island's pod with its flat top at `top`:

- Width `w` and total height `h`.
- Top corners rounded to radius `r`. The sides go straight up into them, with no flare, so nothing sticks out past the sides.
- A round bottom. The curve starts at `h − 0.375w`, and its control points sit `0.235w` below that and `0.2875w` from the center.

The notch itself keeps its concave shoulders where it meets the screen edge. The character does not need them.

`glimPath(cx, top, w, eyeScale)` gives the character at any size, in the logo's proportions:

| Part       | Value                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Body       | `podPath(cx, w, 0.75w, 0.15w, top)`                                                                |
| Eyes       | Two capsules `0.2w` wide and `0.32w` tall, centered `0.19w` either side of `cx`, at `top + 0.36w`  |
| Happy arcs | From `0.1w` left to `0.1w` right of each eye, `0.075w` below its center, peaking `0.115w` above it |

The top corners are round, with a radius of 15% of the body width, so no edge of the silhouette is sharp. The eyes are large on purpose: a fifth of the body wide, so they stay readable at 16px.

### The character (`Eyes`)

`viewBox="11 -1 42 32"`, body `glimPath(32, 0, 40).body`.

- Eyes: 8×12.8 capsules (`rx` 4) at x 20.4 and 35.6, y 8.
- Line moods: strokes 3 units wide, round caps and joins.
- `tone`:
  - A state tone fills the body with that color and draws the eyes in `--ink` (#000).
  - `brand` is the primary logo: the body in `--glim` indigo and the eyes in white, on any background.

| Mood     | Drawing                                                              | Motion                                                                                                                                  | Used for               |
| -------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `open`   | Capsules                                                             | Blink every 6s (`scaleY` 0.1 at 96%)                                                                                                    | Ready, empty, welcome  |
| `scan`   | Capsules                                                             | Drift ±2.8 units over 3.6s, plus blink                                                                                                  | Working                |
| `wide`   | Capsules at `scale(1.12, 1.16)`                                      | The whole character bobs 1.5px per 1.8s                                                                                                 | Needs approval / you   |
| `half`   | Capsules at `translateY(3.3px) scaleY(.48)`                          | A sleepy blink every 7s, starting 1s in: the lids drop to `translateY(5.5px) scaleY(.14)` at 94% and lift again                         | Interrupted            |
| `happy`  | `M20.4 17.4Q24.4 9.8 28.4 17.4M35.6 17.4Q39.6 9.8 43.6 17.4`         | The whole character skips twice (2px, then 1px) in the first 0.9s of every 3s. With the `done` tone: one 2px hop over 600ms, then still | Your turn, Done, hello |
| `cross`  | `M21.6 11.6l5.6 5.6m0-5.6l-5.6 5.6M36.8 11.6l5.6 5.6m0-5.6l-5.6 5.6` | The whole character shakes, ±1.6px and settling, in the first 0.55s of every 3.2s                                                       | Error                  |
| `closed` | `M20.6 16h7.6M35.8 16h7.6`                                           | A slow breath: the whole character scales to 1.03 and back over 4.8s                                                                    | Paused, Quiet          |

Motion follows need. The states that want you (Needs you, Your turn, Error) move on a loop. The calm ones only blink, glance or hop once. The asleep ones breathe.

Moods that use capsules change through CSS transforms with a 220ms transition, so they ease into each other. The half-closed blink starts 1s late so that ease still plays. The body fill transitions over 300ms.

The welcome screen and the "Hello" mascot use the `brand` tone. On the welcome and empty screens only, the eyes follow the pointer: up to 3 units sideways and 2 units vertically, reaching the maximum about 280px away. Clicking the large character shows happy eyes, a 560ms hop and the text `Hello.` (button name `Say hello to Glim`). Reduced motion turns off every character motion: following, blinking, drifting, bobbing, skipping, shaking, hopping and breathing. Scope that rule to the character itself (`.eyes, .eyes *`), not only to the island, so logos outside it stop too.

The character replaces the artwork in `src/Mascot.tsx` and `WorkingIndicator.tsx`.

### Logo

- Mark: `Mark` in `brand.tsx`, the character in `brand` tone: Glim indigo with white eyes, on light and dark backgrounds alike. It never changes color.
- For static files (`public/brand/*.svg`, favicon), use two paths from `glimPath(32, 0, 40)` in the same viewBox: `body` filled `#6366f1`, then `eyes` filled `#fff`.
- Lockup: the mark centered above the word `Glim` in Manrope 800 with `-0.045em` tracking.
- The logo's eyes move with the state; its color does not. Pass the top group's mood, as in `LOGO_STATES`:

| State       | Mood     |
| ----------- | -------- |
| Ready       | `open`   |
| Working     | `scan`   |
| Needs you   | `wide`   |
| Your turn   | `happy`  |
| Error       | `cross`  |
| Interrupted | `half`   |
| Paused      | `closed` |

State color belongs to the island's character and the tray, never to the logo. The review page's header logo follows the live island this way: indigo, with eyes that scan, widen or close.

The static files already carry this mark in indigo: `public/brand/glim-mark.svg`, `public/brand/glim-mark-dark.svg` and `public/favicon.svg` (the browser tab icon). Replace `GlimMark` in `src/components.tsx` and the mark in `BrandPreview.tsx` with it. Keep CONTRIBUTING's rule that the static mark, `components.tsx` and the animated character stay consistent.

### App icon

The primary logo centered on a slice of desktop (`AppIcon` in `brand.tsx`, 256-unit box).

- Tile: rounded square, `rx` 56 (48 at 32px and below). Vertical gradient `#fdfdfe` to `#d6d9e1`. A 1.5px inner stroke in `rgba(24,24,27,.14)`.
- Above 32px: `glimPath(128, 128 − 0.35w, w)` with `w` 132. The body is `#6366f1` with `drop-shadow(0 8px 10px rgba(9,9,11,.22))`, and the eyes are white.
- 32px and below: `w` 168 with `eyeScale` 1.1 and no shadow, so the eyes stay visible at 16px.

Export (already done in indigo at the owner’s request: `public/glim.svg` and every file in `src-tauri/icons/`, with the small character in the 16, 24 and 32px frames of `icon.ico` and in `32x32.png`; repeat only if the shapes change):

1. Write the large version as `public/glim.svg`.
2. Render the small version as 16, 24 and 32px PNGs.
3. Run `npx tauri icon public/glim.svg`. It builds every size from one source, so rebuild `src-tauri/icons/icon.ico` afterwards with the small PNGs for the 16, 24 and 32 frames, for example `magick 16.png 24.png 32.png 48.png 256.png icon.ico`.

### Tray icon per state (optional, needs the owner's approval)

The tray uses `app.default_window_icon()` (`src-tauri/src/lib.rs`), so it picks up the small frames with no code change.

To let a hidden island still say "an agent needs you", the tray can switch between four variants: the normal indigo icon, attention, success and error. Each is `AppIcon` with `tone`. In the state variants, the body takes the state color and the eyes turn black. The variants are shown on the review page at 24px.

1. Ship the variants as 16, 20, 24 and 32px PNGs.
2. Call `TrayIcon::set_icon` when the top group's tone changes, either from the Rust snapshot or through a small command the island invokes.

This is the only part of the brand that changes behavior, so it waits for approval.

## Installer

**Owner update, 2026-10-10:** The installer and uninstaller wear the website: its dark background, its copy and its 3D Glims, which move, with different art for installing and uninstalling. This supersedes the light sidebar design and the mocks in `preview-claude/installer.tsx`.

Glim ships Tauri 2's NSIS wizard (`installMode: currentUser`) with a custom template. Every flow is three screens and one click, then Glim opens and its own setup takes over.

### Screens and copy

Setup decides what it is doing before the first screen (`GlimDetect` in the template): a fresh install, an update, a reinstall of the same version, or replacing a newer version.

| Flow      | First screen (title, button)                                                        | Progress header     | Last screen                                                              |
| --------- | ----------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| Install   | `A glimpse at your agents.`, Install                                                | `Installing Glim`   | `Glim is ready when you are.` Open Glim now (on), desktop shortcut (off) |
| Update    | `Update Glim`, Update                                                               | `Updating Glim`     | `Glim is up to date.`                                                    |
| Reinstall | `Reinstall Glim`, Reinstall                                                         | `Reinstalling Glim` | `Glim is reinstalled.`                                                   |
| Uninstall | `Uninstall Glim`, Uninstall, with the checkbox `Also delete my usage history` (off) | `Uninstalling Glim` | `Glim is uninstalled.` and where the settings backups stay               |

The install screen's fine print says there are no administrator rights, no account and nothing online, and where Glim installs. An update or a reinstall says the connections, settings and usage history stay. After Finish with `Open Glim now` ticked, the app starts and opens setup by itself, because `onboardingComplete` is false.

### Theme (`src-tauri/installer/theme.nsh`)

Windows draws NSIS with system colors, so the theme sets each part:

- The title bar and the window go dark through DWM and `SetCtlColors`, `#0A0B12` like the top of the website's hero. The buttons, the details list and the checkbox boxes take Windows' own dark theme (`DarkMode_Explorer`).
- MUI shows its etched lines again on every page; on dark they read as white rules, so every page hides them. The version line is one flat grey label.
- The full-window pages are laid out like the website's hero: the art across the top, the title (Segoe UI Bold) and the text centered under it.
- Checkboxes take the same dark theme, which draws their words light (Windows' default theme ignores text colors, NSIS bug #443), with the page color filling behind them and a space between box and words. Focus outlines and access-key underlines appear once the keyboard is used, as in Windows' own dialogs.
- The banners move, about 15 frames a second: a timer draws each frame from a background and sprites and copies it straight onto the banner, so nothing else on the page repaints. The crowd bobs and blinks, and hops once on the finish page; the uninstaller's Glim breathes and blinks, then sleeps under rising Zs. The motion stops when its page goes, costs about 1% CPU, and holds still when Windows' animation effects are off.
- The progress page has an indigo bar on a dark track, and only Cancel in the footer.
- With high contrast on, Windows' own colors stay.

### Art

`npm run installer:art` (`scripts/render-installer-art.mjs`, with `npm run dev` running) renders everything from the shared 3D renderer, at twice its size at 100% scaling; the installer scales each frame to the screen with HALFTONE, so it stays sharp at any scaling. The art holds no text.

| File (in `src-tauri/installer/`) | Shows                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `crowd.bmp`                      | The crowd's background: the hero's faint terminal dots and indigo light rising (994×300)       |
| `crowd-sprites.bmp`              | One Glim in each state color, with its eyes open, closed and happy, and the fade at the bottom |
| `sky.bmp`                        | The Pause card's night sky with its stars (994×300)                                            |
| `sky-sprites.bmp`                | The grey Glim awake and asleep, the three sleep Zs, and the fade                               |
| `art.nsh`                        | Generated: where each sprite sits in its sheet and on the banner, and its moves                |
| `header.bmp`                     | The indigo Glim at the right of the progress page's header (300×114)                           |
| `header-uninstall.bmp`           | The grey Glim, for the uninstaller                                                             |

The sprite sheets are 32-bit with premultiplied alpha, as `AlphaBlend` needs.

### Configuration (`src-tauri/tauri.conf.json`, `bundle.windows.nsis`)

```json
{
  "installMode": "currentUser",
  "installerHooks": "installer/hooks.nsh",
  "installerIcon": "icons/icon.ico",
  "uninstallerIcon": "icons/icon.ico",
  "sidebarImage": "installer/crowd.bmp",
  "headerImage": "installer/header.bmp",
  "uninstallerHeaderImage": "installer/header-uninstall.bmp",
  "customLanguageFiles": { "English": "installer/english.nsh" },
  "template": "installer/installer.nsi"
}
```

`installer/english.nsh` overrides Tauri's strings: `createDesktop` is `Add a desktop shortcut`, `deleteAppData` is `Also delete my usage history`.

### Template (`installer/installer.nsi`)

Tauri's handlebars template for `tauri-cli` 2.12.1, with Glim's changes marked `; Glim:`. When Tauri is upgraded, start from the new template and reapply them:

1. The welcome, finish and progress texts come from variables that `GlimDetect` sets in `.onInit`. The folder page is gone; `/D=` still chooses the folder.
2. Tauri's maintenance page with radio buttons is gone. Replacing an older or a newer version happens on the progress page, after Setup has asked to close a running Glim (`GlimReplacePrevious`): the old uninstaller runs silently with `/UPDATE`, so it keeps the agents connected, the startup entry and the usage history. No second wizard appears.
3. The uninstaller has a welcome page with the checkbox, the progress page and a finish page. It skips its pages when run with `/P` or `/UPDATE`.
4. The art is extracted to `$PLUGINSDIR` in `.onInit` and `un.onInit`, and `theme.nsh` is included after the pages and languages. Each full-window page starts its banner when it shows and stops it when it leaves (`GlimAnimStart`, `GlimAnimStop`).

### Hooks (`src-tauri/installer/hooks.nsh`)

- `NSIS_HOOK_PREUNINSTALL` disconnects the agents and removes the startup entry, except during an update (`$UpdateMode = 1`).
- `NSIS_HOOK_POSTUNINSTALL` deletes `usage.sqlite3` (and its `-wal` and `-shm`) in `%LOCALAPPDATA%\Glim` when the checkbox is ticked, and not during an update. `backups\`, which holds the original agent configurations, stays.

### Tests

`npm run test:install` installs into an isolated folder, connects isolated agents through the app, and checks that uninstalling restores them. Updating with agents connected, by clicking Update and passively, keeps both connected and the usage history. Check the screens by eye at 100% and 150% scaling after changing the theme or the art, and watch each banner move on screen: every frame should move, and the text under it should never flicker.

## Review page theme

The owner likes the review page's own style: the fonts, the spacing, the simplicity. Reuse it for Glim's web surfaces: a docs site, a landing or download page, release notes, and the dev gallery at `/preview`.

It is a neutral stage. The page stays quiet and light, so the product carries the only strong contrast and the only color: the black island and the indigo mark.

Source: the first section of `preview-claude/style.css`, before `/* Island */`.

### Tokens

| Token         | Value                                                                         | Use                                  |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| `--page`      | `#f1f1f3`                                                                     | Page background                      |
| `--page-ink`  | `#18181b`                                                                     | Text, focus ring, checkbox accent    |
| `--page-2`    | `#55555f`                                                                     | Secondary text (6.5:1 on the page)   |
| `--page-line` | `rgba(24,24,27,.1)`                                                           | Hairlines between items and sections |
| Desk          | `radial-gradient(130% 120% at 50% 0%, #fdfdfe 0%, #e5e7ed 58%, #d8dbe3 100%)` | Product frames and the app icon tile |
| Quiet fill    | `rgba(24,24,27,.065)`                                                         | Segmented control track, toggle chip |
| Hover fill    | `rgba(24,24,27,.06)`                                                          | Link hover                           |
| `--ease-out`  | `cubic-bezier(.23,1,.32,1)`                                                   | Every transition, 150ms              |

### Type

One typeface: Manrope Variable with `font-optical-sizing: auto` and antialiasing. Hierarchy comes from size and weight, never from color or capitals.

| Role            | Size                                 | Weight  | Tracking | Line height |
| --------------- | ------------------------------------ | ------- | -------- | ----------- |
| Page title      | `clamp(36px, 4.4vw, 54px)`           | 800     | -0.04em  | 1.02        |
| Section title   | `clamp(24px, 3vw, 30px)`             | 780     | -0.03em  | 1.15        |
| Item title      | 19px (view notes), 15–15.5px (lists) | 740–770 | -0.02em  | 1.25        |
| Lead paragraph  | 16.5px, `--page-2`                   | 400     | 0        | 1.6         |
| Body            | 14px                                 | 400     | 0        | 1.5         |
| Notes, captions | 13.5–14px, `--page-2`                | 400     | 0        | 1.55        |
| Labels, links   | 12.5–13px                            | 650–750 | 0        | 1.4         |

Titles use `text-wrap: balance`. Paragraphs use `text-wrap: pretty` and stop at 60–62ch.

### Space and layout

- Content is at most 1180px wide, with side padding `clamp(16px, 4vw, 48px)`.
- 96px between sections (72px under 640px). A section title sits 26px above its content.
- The first view is two columns: the pitch and its controls on the left (`minmax(280px, 360px)`), the product on the right. Under 960px it stacks as pitch, product, then controls.
- A view row pairs a product frame (up to 560px) with its notes, with 40px between them. Rows are 72px apart.
- Lists are grids (`auto-fill, minmax(290px, 1fr)`, gaps 26px by 44px). Each item has a hairline on top and 14px of padding. There are no cards.

### Components

- **Desk frame.** The desk gradient, 14px radius (18px for the main stage), an inset `rgba(24,24,27,.07)` hairline, and a 3px black strip along the top edge that stands in for the edge of the screen. The product hangs from the strip's lower edge (`padding-top: 3px` on the frame), so its shoulders start from a flat edge. If the strip covered the top of the curve, the curve would meet it at an angle.
- **Segmented control.** A quiet-fill track with 3px padding and 11px radius. Buttons are 13px/650 with `7px 11px` padding. The active button is white with a shadow of `0 1px 2px rgba(24,24,27,.12), 0 2px 6px rgba(24,24,27,.05)`.
- **Notes list.** 14px text in `--page-2`, each line marked by a 6px `--page-ink` dot at 40% opacity.
- **Toggle chip.** A native checkbox (`accent-color: --page-ink`) inside a quiet-fill chip with 10px radius.
- **Header and footer.** Logo and wordmark on the left, plain text links on the right that pick up the hover fill. The footer sits above a top hairline.
- **Browser parts.** Selection `rgba(24,24,27,.16)`. Focus is a 2px `--page-ink` outline with a 2px offset. Scrollbar thumb `rgba(24,24,27,.28)`.

### Rules

- Leave out eyebrows above headings, gradient text, decorative icons and cards around text.
- Separate with space first and hairlines second.
- Keep the page still. Motion belongs to the product being shown.

## File plan

1. **Styles.** Build one stylesheet from the island section of `preview-claude/style.css`, either kept under a `.gl` root class or with the tokens moved to `:root`. It replaces `styles.css`, `details.css`, `design.css` and `island.css`. Many of their selectors already match nothing (`.glance-grid`, `.session-row`, `.avatar-stack`, `.panel-header`, `.detail-limits`…).

   Carry over only the shell rules the app still renders: `.native-stage`, `.preview-stage`, `.island-anchor`, `.idle-hidden`, `.error-toast` and the browser preview controls (`.preview-bottom`, `.preview-controls`, `.preview-badge`, `.simulation-controls`, `.preview-navigation`). Keep `preview-embed.css` and `preview-page.css`.

2. **Components.** Port `Eyes`, `podPath`, `glimPath`, `Logo`, `Meter`, `Switch`, `Segmented`, `Compact`, `Glance` (hero, rows, empty), `Sheet`, `Details`, `Connectors`, `SettingsSheet`, `UsageSheet` and `SetupSheet` into `src/`. Then replace the preview's stand-ins:

   - `previewHistory` and `T0` → `api.history()` and `Date.now()`
   - Local connector state → `api.connector()`
   - Local preferences → `api.savePreferences()`
   - The Releases link → `api.openRelease()`

   Keep the loading, busy and error states from `panels.tsx`.

3. **Surface and notch.** Update the `IslandSurface.tsx` constants and keep its `api.shape()` sync. Reshape `useSessionPreview.ts` and `session-presentation.ts` into the notch model, replace `attention-banner` with banner rows, and replace the back-and-forth scroll in `LiveText.tsx` with the `Ticker` loop.
4. **Native.** Make the `platform.rs` and `lib.rs` changes above.
5. **Brand.** Replace the mark, the character and the app icon as described in [Logo, mascot and icon](#logo-mascot-and-icon), then regenerate the icons.
6. **Installer.** Add the bitmaps, the language file, the template and the hook changes from [Installer](#installer).
7. **Remove.**
   - Delete `WorkingIndicator.tsx`, `AccentButton` and `AgentTile`.
   - Delete `src/react-bits/` (CrystalizedBall, StarBorder, `LICENSE.react-bits`, `UPSTREAM`). Move `ogl` to `devDependencies` instead of removing it: the website draws its hero background with it (`site/react-bits/FaultyTerminal.tsx`).
   - Update `THIRD_PARTY_NOTICES.md` and the README line that mentions React Bits.
   - Remove the `../src/react-bits/LICENSE.react-bits` resource from `src-tauri/tauri.conf.json`, or the bundle fails.
   - Remove `licenses\react-bits.txt` from the expected files in `scripts/install-smoke.ps1`.
   - Rewrite the motion paragraph in `docs/architecture.md`.
8. **Dev gallery.** Keep `/preview`, `preview-scenes.json` and `npm run preview:capture` working. `detailsOpen` scenes become the details view. Remove or repurpose the `sessions` scene, because the glance now lists every session. Compact scenes are 34px tall. `/preview` can adopt the [Review page theme](#review-page-theme).
9. **Tests.** Update them as listed below, then run `npm run build`, `npm test`, `npm run test:ui`, `cargo test` and, on a machine where it is safe, `npm run test:install`.

## Tests to update

| Old assertion (`tests/ui`)                                                                        | New target                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Button `Expand Glim`                                                                              | Button named `/^Glim:/` (the compact pill)                                                                   |
| Heading `Claude Code` after expanding                                                             | Heading `api-service` (most urgent in demo data)                                                             |
| Progressbar `Context used`, value 38                                                              | Progressbar `Context`. 21 for api-service, or 38 after clicking the glim-desktop row                         |
| `Back to agent` / `Close panel`                                                                   | `Back`                                                                                                       |
| `Choose session`, headings `Codex` and `Approval needed`                                          | The row named `/api-service/`, text `Needs approval`                                                         |
| Region `Session usage details` with `Cached reads` and `24% used`                                 | Put `aria-label="Session usage details"` on the details body. Expect `Read from cache` and `24%`.            |
| Heading `Agents` in setup                                                                         | `Connect your agents`                                                                                        |
| `getByLabel('When idle').selectOption('pill')`                                                    | Button `Keep visible`                                                                                        |
| Heading `Paused`                                                                                  | Text `Monitoring is paused`                                                                                  |
| `Open settings` / `History`                                                                       | `Settings` / `Usage`                                                                                         |
| `getByLabel('Filter by agent').selectOption('codex')`, `.usage-agent-row` count 1                 | Button `Codex` in group `Agent`, `.projects li` count 1                                                      |
| Heading `No active agents`                                                                        | `No agents running`                                                                                          |
| `.working-indicator` count 0                                                                      | Remove the assertion                                                                                         |
| `preview.spec.ts` compact height 42                                                               | 34                                                                                                           |
| `preview.spec.ts` WebGL canvas pixel diff                                                         | `.mood-scan .eyes-pair` has a running CSS animation                                                          |
| `live-preview.spec.ts`: button `View sessions` containing `1 needs an answer` or `1 done`         | A banner row named `/^{project}: Needs an answer\. Open\./` or `/: Your turn\. Open\./`. Count `.inbox-row`. |
| `live-preview.spec.ts`: `.live-text-value` moves left (marquee)                                   | `.ticker-box.is-marquee .ticker` moves left while `.compact-title` keeps its position                        |
| `live-preview.spec.ts`: `.working-dots` and its `still` class                                     | Remove. The character's `scan` mood shows work; under reduced motion the ticker has no animation.            |
| `live-preview.spec.ts`: rotation via `data-session-id`, hover holds, new attention takes over     | Unchanged, plus: after the hold, the notice is a banner row and does not return to the notch.                |
| `live-preview.spec.ts`: `.notch-toolbar` 42px, `.notch-status .status-dot` amber, heading `Ready` | `.bar` 42px; the hero chip's color is `rgb(255, 197, 61)`; the label `Ready` is chip text, not a heading.    |

## Acceptance checks

- With three agents working, the notch shows each in turn every 6s, with one lit dot for the agent on screen.
- A new approval, error or finished turn takes over the notch at once (light in its color spills under the island for an approval, an error or your turn), stays for its hold, then becomes a banner row and never rotates back. Hovering the island holds both the rotation and the notice.
- Clicking a banner row opens the glance on that agent. Opening and closing the island clears Your turn rows. Approval and error rows stay until the agent moves on.
- Subagents never count as agents in the dots, the bar or the rows.
- Your turn appears when a turn finishes, and becomes Ready after the island is opened and closed.
- Connected cannot be clicked away. Disconnecting takes two clicks and names the file.
- No text is smaller than 11px. No lavender accent remains; indigo appears only in the logo. No `ogl` in the app (`src/`); its only WebGL is the shared 3D Glim renderer, per the owner update above. The website in `site/` keeps `ogl` for its hero.
- The native region matches the visible island when compact (34px, radius 17, at any width from 144px to 360px, banner included) and expanded (440 wide, radius 24), shoulders included.
- Each mood moves as listed in [The character](#the-character-eyes). Reduced motion shows no movement anywhere, logos included, and the springs jump. Keyboard: Tab reaches every control, and Esc steps back as described.
- The compact island is as wide as its content between 144px and 360px, springs when the text changes, and scrolls a status longer than the cap without growing, while the project name stays still. Hover pauses the scroll; reduced motion shows an ellipsis.
- The logo is Glim indigo with white eyes everywhere, including the app icon and installer art. Where it is animated, only its eyes follow the state.
- An interactive install takes three screens and one click. Finish opens Glim, and its setup appears.
- An upgrade keeps Claude Code and Codex connected. Uninstalling with the checkbox ticked removes the usage history.
- Build, unit tests, UI tests and `cargo test` pass. `/preview` and the capture script still work.

## Pitfalls found while building the preview

- Element resets such as `.gl button { padding: 0 }` outrank component classes and silently stripped button padding. Write resets with `:where()`.
- A page class `.live` collided with the island's `shell live` class. Scope island classes.
- The compact wrapper is a grid. Its column must be `minmax(0, 1fr)`: a plain `auto` column grows to the full text's min-content width, so the status never overflows its box and the scroll never starts, and the text is cut off by the island instead.
- The Codex PNG needs the luminance mask described above.
- A view on its way out must keep its original width. Content fade must follow the spring position, or text shows clipped mid-resize.
- The shoulders need `clip-path: path()` and a 1px tuck under the island, as described in [Surface and motion](#surface-and-motion). A radial mask leaves a step at the side, and edge-to-edge boxes leave a hairline seam.
- WebGL without a GPU (a VM, a remote desktop, a CI runner) is drawn on the CPU by SwiftShader or WARP. The 3D stage then blocks the page for seconds and every frame stalls on the copy out, which timed out the UI tests on CI. `buildStage` refuses those renderers so Glim stays flat, and `tests/ui/gpu.ts` tells the tests which to expect. `failIfMajorPerformanceCaveat` does not catch SwiftShader.
- The Tauri CSP already allows what the design needs: a same-origin mask URL, an SVG `data:` URI for the select chevron, and inline styles from motion.
