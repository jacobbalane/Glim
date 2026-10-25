# Changelog

What changed in each Glim release. Installers, checksums and build attestations are on [GitHub Releases](https://github.com/jacobbalane/Glim/releases).

## Unreleased

### Improved

- **Opening Glim on a Mac the first time.** The README and website walk through macOS's “Glim.app” Not Opened message step by step: click Done, not Move to Trash, then Open Anyway under Privacy & Security, where the button lasts about an hour. Troubleshooting adds the Terminal alternative.
- **Context in the Claude app.** Claude Code in the Claude app runs no status line, so its context read Unavailable. Glim now measures it from the session's records against the model's context window and marks it Estimated. Account limits still need a terminal.

### Fixed

- **Only the agents you have open.** A session Glim found in local records, or whose agent it could not trace, stayed on the island for a day, often as Quiet. It now leaves after 15 minutes without activity and comes back when the agent works again, and a found session is dated by its transcript, not by when Glim found it.
- **Worktree sessions under their project.** A session in a Claude Code worktree, in `.claude/worktrees/` as the Claude app and `claude -w` make them, showed under the worktree's name. It now shows under its project's.

## 0.2.3 (2026-10-23)

### New

- **Mini.** Under **Compact** in Settings, a third choice beside Island and Glim only: a small black notch holding just Glim. Like Glim only, it grows into the island while you rest the pointer on Glim.

### Improved

- **Show the island on hover** slides open under Compact when it applies, and away again when it does not.

### Fixed

- Mini and Glim only now close down as soon as Settings closes. Closing Settings with Esc, or on Windows by clicking outside it, used to leave the full island showing until you clicked somewhere else, and could keep the rotating preview paused.

## 0.2.2 (2026-10-23)

### New

- **Glim only.** Under **Compact** in Settings, close the island to Glim alone, in the color of what it shows. Hover it and the island grows out of Glim, then shrinks back into it when you move away; turn off **Show the island on hover** to keep just Glim. A click still opens the island, and quick options and moving it work as before.

### Improved

- **Out of the way, smoothly.** Over a fullscreen app on Windows, or while idle when set to hide, the island slides up into the top of the screen instead of vanishing, and slides back down when it returns. When Glim starts, the island comes down out of the top edge.

## 0.2.1 (2026-10-21)

### Improved

- **A new app icon.** Glim leans into a night-blue tile from its lower corner and looks up at the open sky, on macOS, Windows and the website's tab. On a Mac it keeps the margin and shadow of the icons beside it in the Dock.
- **The website** shows one download button for your system, with both systems in a menu beside it, and the nine states three to a row.

## 0.2.0 (2026-10-17)

Glim comes to the Mac.

### New

- **Glim for macOS.** macOS 13 or later, on Apple silicon and Intel. Open the disk image and drag Glim to Applications. It lives in the menu bar and stays out of the Dock. Apple has not notarized Glim yet, so the first time, open System Settings, Privacy & Security, and click Open Anyway.
- **Around the notch.** On a MacBook, the island grows out of the notch: the agent on the left, its step and state on the right, and nothing where the camera is. The open island starts below the notch. On other screens it hangs from the top of the menu bar.
- **Go to the agent, on a Mac.** The button brings the agent's app to the front, and in Terminal and iTerm2 it selects the agent's own tab. macOS asks once whether Glim may control them.
- **Open at login**, **Hide over fullscreen apps** and updates from Settings work on the Mac as they do on Windows.
- **The website** offers both downloads, macOS and Windows. The docs cover both systems.
- **Move the island.** Hold the preview or header for 350 ms, then drag left or right. It presses in slightly when picked up, carries on when thrown, and settles in the middle when let go near it. It stays at the top of the display and remembers its position. On a MacBook with a notch it stays on the notch. Alt + Left/Right also moves a focused preview.
- **Quick options.** Hidden by default; enable them in Settings, choose shortcuts and drag them into order. A small black circle buds from the island; click it and its icons slide out into one pill, each in its own circle. It opens to the left near the right screen edge. Centre horizontally glides the island back to the middle. Centre and Quit are also in Settings. Right click and Shift + F10 open enabled shortcuts. Hover labels no longer cover the collapsed preview.
- **Notices fold away.** What waits for you no longer grows a long list under the island. A new notice shows as a row under the notch for a few seconds, then folds into a slim strip with one dot per waiting agent in its state's color. Click the strip to see the list again; Hide folds it at once.
- **Limit reached.** When Claude Code or Codex stops at a usage limit, the agent says Limit reached in its own violet, instead of Your turn or Error. It interrupts once like any notice, says when the limit resets if the agent reported it, and stays until the agent works again.
- **A brighter glow, your way.** A waiting, finished or failed agent lights the island itself, so the glow shows on Windows too. Settings > Island > Glow sets it from Off to 100%.

### Improved

- **The full message** slides out beside the island, shows its own scrollbar and fades where there is more to read. Esc closes it before the island.
- **The header stays put** while a long list of agents scrolls, so Usage and Settings are always in reach.
- **Codex setup says what it did.** Glim offers to add Codex hooks, then shows Hooks added with the steps left to do in Codex, since only Codex can trust them. Each Glim hook is labeled "Glim - <event>" in Codex's `/hooks`.

### Fixed

- A view opened again while it was still closing no longer comes back with what it had loaded before: Usage could show history from before it was cleared.
- The island's corners no longer show a pale frame after you click another window.

## 0.1.3 (2026-10-12)

Glim now shows only the agents you have open, one project per row.

### New

- **One row per project.** A project with several agents lists them under its name, and the island counts projects.
- **Just the list.** Fold the open agent into the list to see every agent as a row; the island stays that way until you pick an agent or open a notice.
- **Every agent is named by project and agent**, in the island and its notices: "Glim · Claude", "Glim · Codex".
- **The weekly limit** shows beside context and the 5-hour limit, with when it resets.
- **What the agent said.** When it hands over, the open island previews its last message, its question or the command it asks to run. Click it to read all of it in a panel to the right of the island, which never grows taller for it; a long message scrolls inside the panel. It lives in memory only and is never written to disk.
- **Go to the agent.** A button in the open island brings the window the agent runs in to the front: Windows Terminal, VS Code or a console. Glim can't pick a tab inside it.

### Fixed

- **Closed agents leave the island.** Glim notices when an agent's process ends, even when its terminal was closed without a goodbye, shows it as Done for a few minutes, then drops it.
- Scrolling with a touchpad no longer pulls the island down from the top of the screen.
- A session keeps its project's name when the agent changes into a subfolder.
- A new agent in a project is no longer numbered "Claude 2" because of one that just ended.
- Restarting Glim no longer turns every open session "Quiet".
- Subagents that were cancelled, or ran out of usage, no longer fill a session's list. Only working subagents get a row; the rest fold into "finished" and "quiet" lines.
- When a session ends, any subagent still open under it ends too.
- The **+N** next to a session counts only its working subagents.
- The island's rounded corners keep their soft edge instead of a pixel staircase, and its icons no longer jitter while it resizes.

## 0.1.2 (2026-10-11)

Glim can now update itself.

### New

- **Updates in Settings.** Click **Check**, then **Update**: Glim downloads the new version, verifies its signature and installs it in place. Glim goes online only when you click Check.
- **Agents in the same folder are told apart:** "Glim · Claude", "Glim · Codex", "Glim · Claude 2".
- **Finished subagents fold into one line** instead of filling the list.

### Fixed

- A session waiting for your answer no longer turns "Quiet" while its background subagents are working.
- Setup and the uninstaller: **Finish** now sits at the far right.

## 0.1.1 (2026-10-11)

A fix for Setup.

### Fixed

- The last page of Setup and of the uninstaller now shows its **Finish** button. In 0.1.0 it was missing, so the window could not be closed.

### Improved

- The 3D Glim reads its place on screen four times a second instead of on every frame, which saves work while windows move.

## 0.1.0 (2026-10-10)

First release of Glim, a small island at the top of your screen that shows what Claude Code and Codex are doing.
