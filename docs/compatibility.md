# Provider compatibility

Glim v0.1 targets Windows 11 x64 and **native Windows CLI sessions**, including terminals inside IDEs. WSL, dedicated IDE extensions, desktop agent apps, and remote sessions are outside this release's supported scope.

| Capability             | Claude Code                                    | Codex CLI                                |
| ---------------------- | ---------------------------------------------- | ---------------------------------------- |
| Reference version      | 2.1.289                                        | 0.161.0                                  |
| Activity and approvals | Lifecycle hooks                                | Lifecycle hooks and local events         |
| Token usage            | Assistant request usage in JSONL               | Cumulative token events in JSONL         |
| Context usage          | Status-line measurements                       | Latest reported request / context window |
| Task steps             | TodoWrite plus TaskCreated/TaskCompleted hooks | Structured update_plan calls             |
| Account limits         | Status-line fields when supplied               | Not collected in v0.1                    |
| Authentication         | Existing Claude Code login                     | Existing Codex login                     |

These are parser reference versions, not a claim that every provider configuration or future version works. Unit fixtures exercise known record shapes; live authenticated integration must be checked against the exact provider installation before a stable release.

## Measurement meaning

- Input includes cached reads. Cache writes are tracked separately. Output includes reasoning when the provider reports it as a subset. Cached and reasoning counts are breakdowns, not additional totals.
- Context usage is the current context measurement, not cumulative session usage. Codex's value is derived from the latest usage event; it is shown as an estimate in session details.
- Subscription limits are not derived from token counts. Optional windows disappear after their reset time until a fresh provider measurement arrives.
- Reported steps describe the agent's current structured plan; there is no general estimated task-completion percentage.
- A completed turn leaves the session idle. Session-end events mark a session ended. Quiet working sessions become stale after five minutes without a supported activity event.
- Resumed sessions can include previously recorded usage. Duplicate request IDs and cumulative snapshots do not add usage twice. Each linked subagent transcript is counted once; parent-inclusive aggregate counters are not imported.
- Pause stops live collection. Provider snapshots can catch up when monitoring resumes; pause is not a billing exclusion.

## Integration behavior

Codex hooks added by Glim include a `statusMessage` such as **Glim - PreToolUse** for each of the 12 events. This is the supported hook status text, not a custom event name: Codex's top-level `/hooks` rows keep their standard names. To add labels to an existing connection after installing this change, disconnect Codex in Glim and choose **Add Codex hooks** again, then review the changed entries in `/hooks`. Codex may require renewed trust when a hook definition changes. Glim does not approve hooks automatically.

Claude Code settings are merged in its configured user directory (`CLAUDE_CONFIG_DIR`, or `~/.claude`). Codex hooks are merged in `CODEX_HOME/hooks.json`, or `~/.codex/hooks.json`. Project configuration or managed policies can override or disable user integrations. Glim does not change managed policy or hook trust.

Claude's existing status line is wrapped by the helper. Its command receives the original stdin, working directory, and environment. On Windows the relay uses the configured Git Bash executable, or the default Git Bash installation when available. If no previous command exists, a simple model label is printed.

Local transcript formats are not stable APIs. Unsupported or missing counters are displayed as unavailable. Existing paginated or ephemeral Codex sessions without a readable JSONL transcript may have activity support without token support.

Useful official references: [Claude hooks](https://code.claude.com/docs/en/hooks), [Claude status line](https://code.claude.com/docs/en/statusline), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex app server](https://learn.chatgpt.com/docs/app-server).
