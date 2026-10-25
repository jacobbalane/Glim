# Provider compatibility

Glim targets macOS 13 or later (Apple silicon and Intel) and Windows 11 x64, with agents in **native CLI sessions**, including terminals inside IDEs. WSL, dedicated IDE extensions, desktop agent apps, and remote sessions are outside this release's supported scope.

| Capability             | Claude Code                                    | Codex CLI                                |
| ---------------------- | ---------------------------------------------- | ---------------------------------------- |
| Reference version      | 2.1.289                                        | 0.161.0                                  |
| Activity and approvals | Lifecycle hooks                                | Lifecycle hooks and local events         |
| Token usage            | Assistant request usage in JSONL               | Cumulative token events in JSONL         |
| Context usage          | Status-line measurements                       | Latest reported request / context window |
| Task steps             | TodoWrite plus TaskCreated/TaskCompleted hooks | Structured update_plan calls             |
| Account limits         | Status-line fields when supplied               | Not collected yet                        |
| Authentication         | Existing Claude Code login                     | Existing Codex login                     |

These are parser reference versions, not a claim that every provider configuration or future version works. Unit fixtures exercise known record shapes; live authenticated integration must be checked against the exact provider installation before a stable release.

## Measurement meaning

- Input includes cached reads. Cache writes are tracked separately. Output includes reasoning when the provider reports it as a subset. Cached and reasoning counts are breakdowns, not additional totals.
- Context usage is the current context measurement, not cumulative session usage. Codex's value is derived from the latest usage event; it is shown as an estimate in session details. Claude Code's comes from its status line. Without one, as in the Claude app, it is the latest request's input, cache reads and cache writes against the window the status line last reported, or else the window Claude Code gives the model (1M for Fable, Sonnet 5 and later, Haiku 5.5, Opus 4.7 and later, and `[1m]` variants; 200K otherwise, as Claude Code assumes for a model ID it does not know), shown as an estimate. Before a session's first request, and after a compaction until its next, the island says when context will show.
- Subscription limits are not derived from token counts. Optional windows disappear after their reset time until a fresh provider measurement arrives.
- Reported steps describe the agent's current structured plan; there is no general estimated task-completion percentage.
- A completed turn leaves the session idle. A turn a usage limit stopped reads **Limit reached** instead, never Your turn or Error: Claude Code's `StopFailure` hook with `error_type` `rate_limit` (or `billing_error`, a spend limit), or its short limit notice as the turn's last words; Codex's failed turn with `codex_error_info` `usage_limit_exceeded`. It stays until the agent works again. Session-end events mark a session ended, and so does its agent's process ending. Quiet working sessions become stale after five minutes without a supported activity event. A session whose agent's process Glim does not know, found in local records or from a hook it could not trace to its agent, leaves the island after 15 minutes without an event or a transcript change, and returns with its next.
- Resumed sessions can include previously recorded usage. Duplicate request IDs and cumulative snapshots do not add usage twice. Each linked subagent transcript is counted once; parent-inclusive aggregate counters are not imported.
- Pause stops live collection. Provider snapshots can catch up when monitoring resumes; pause is not a billing exclusion.

## Integration behavior

Codex hooks added by Glim include a `statusMessage` such as **Glim - PreToolUse** for each of the 12 events. This is the supported hook status text, not a custom event name: Codex's top-level `/hooks` rows keep their standard names. To add labels to an existing connection after installing this change, disconnect Codex in Glim and choose **Add Codex hooks** again, then review the changed entries in `/hooks`. Codex may require renewed trust when a hook definition changes. Glim does not approve hooks automatically.

Claude Code settings are merged in its configured user directory (`CLAUDE_CONFIG_DIR`, or `~/.claude`). Codex hooks are merged in `CODEX_HOME/hooks.json`, or `~/.codex/hooks.json`. Project configuration or managed policies can override or disable user integrations. Glim does not change managed policy or hook trust.

Claude's existing status line is wrapped by the helper. Its command receives the original stdin, working directory, and environment. On macOS the relay runs it with `/bin/sh`. On Windows the relay uses the configured Git Bash executable, or the default Git Bash installation when available. If no previous command exists, a simple model label is printed.

Local transcript formats are not stable APIs. Unsupported or missing counters are displayed as unavailable. Existing paginated or ephemeral Codex sessions without a readable JSONL transcript may have activity support without token support.

Useful official references: [Claude hooks](https://code.claude.com/docs/en/hooks), [Claude status line](https://code.claude.com/docs/en/statusline), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex app server](https://learn.chatgpt.com/docs/app-server).
