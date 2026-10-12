# Changelog

What changed in each Glim release. Installers, checksums and build attestations are on [GitHub Releases](https://github.com/jacobbalane/Glim/releases).

## Unreleased

Glim now shows only the agents you have open, one project per row.

### New

- **One row per project.** A project with several agents lists them under its name, and the island counts projects.
- **Every agent is named by project and agent**, in the island and its notices: "Glim · Claude", "Glim · Codex".
- **The weekly limit** shows beside context and the 5-hour limit, with when it resets.
- **What the agent said.** When it hands over, the open island previews its last message, its question or the command it asks to run. Click it to read all of it in a panel beside the island, which never grows taller for it. It lives in memory only and is never written to disk.
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
