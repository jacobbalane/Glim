use crate::model::*;
use serde_json::{json, Value};

pub fn str_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}
fn number(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or(0)
}
fn bounded(s: &str, max: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(max).collect()
}

pub fn hook_event(provider: Provider, value: Value, statusline: bool) -> Option<AgentEvent> {
    let session_id = str_field(&value, "session_id")?;
    if session_id.is_empty() || session_id.len() > 200 {
        return None;
    }
    let event = if statusline {
        "StatusLine"
    } else {
        str_field(&value, "hook_event_name")?
    };
    let task = if matches!(event, "TaskCreated" | "TaskCompleted") {
        str_field(&value, "task_id").map(|id| Task {
            id: bounded(id, 100),
            label: bounded(str_field(&value, "task_subject").unwrap_or("Task"), 120),
            status: if event == "TaskCompleted" {
                "completed"
            } else {
                "pending"
            }
            .into(),
        })
    } else {
        None
    };
    // Subagents identify their parent differently across providers. Codex hook session_id is the root.
    // Claude Code adds agent_id to every hook fired inside a subagent: its tool calls belong to the
    // subagent, not to the main session, which may be waiting on the person meanwhile.
    let child = str_field(&value, "agent_id").filter(|c| !c.is_empty() && c.len() <= 200);
    let (id, parent) = match child {
        Some(child) => (child, Some(session_id.to_string())),
        None if event.starts_with("Subagent") => (session_id, None),
        None => (
            session_id,
            str_field(&value, "parent_session_id").map(str::to_owned),
        ),
    };
    // What the person is told or asked when the agent hands over: its last words at the end of a
    // turn, its question, what it wants to run, or the notice it sends.
    let tool = str_field(&value, "tool_name").unwrap_or("");
    let message = match event {
        "Stop" => str_field(&value, "last_assistant_message").map(str::to_owned),
        "Notification" => str_field(&value, "message").map(str::to_owned),
        "PreToolUse" if tool.eq_ignore_ascii_case("AskUserQuestion") => value
            .pointer("/tool_input/questions/0/question")
            .and_then(Value::as_str)
            .map(str::to_owned),
        "PermissionRequest" => ["command", "file_path", "url", "pattern", "description"]
            .iter()
            .find_map(|key| value.get("tool_input")?.get(*key)?.as_str())
            .map(|what| format!("{tool}: {what}")),
        _ => None,
    }
    .map(|text| preview(&text));
    // A turn a usage limit stopped is its own state, not a handed-back turn or an error. Claude
    // Code names the failure in StopFailure, or says so as the turn's last words.
    let event = match event {
        "StopFailure" => match str_field(&value, "error_type") {
            Some("rate_limit") => "LimitReached",
            Some("billing_error") => "SpendLimitReached",
            _ => event,
        },
        "Stop" if message.as_deref().is_some_and(is_limit_notice) => "LimitReached",
        _ => event,
    };
    let status_data = statusline.then(|| {
        let mut limits = serde_json::Map::new();
        for key in ["five_hour", "seven_day", "spend_limit"] { if let Some(v) = value.get("rate_limits").and_then(|v| v.get(key)) { limits.insert(key.into(), json!({ "used_percentage": v.get("used_percentage"), "resets_at": v.get("resets_at") })); } }
        json!({ "context_window": { "used_percentage": value.pointer("/context_window/used_percentage"), "context_window_size": value.pointer("/context_window/context_window_size") }, "rate_limits": limits })
    });
    Some(AgentEvent {
        event_id: uuid::Uuid::new_v4().to_string(),
        provider,
        session_id: id.into(),
        parent_id: parent,
        event: bounded(event, 40),
        // The project's folder, not wherever the agent last changed directory to.
        cwd: str_field(&value, "project_dir")
            .or_else(|| {
                value
                    .pointer("/workspace/project_dir")
                    .and_then(Value::as_str)
            })
            .or_else(|| str_field(&value, "cwd"))
            .map(|s| bounded(s, 2000)),
        model: str_field(&value, "model")
            .or_else(|| value.pointer("/model/display_name").and_then(Value::as_str))
            .map(|s| bounded(s, 100)),
        tool: str_field(&value, "tool_name").map(|s| bounded(s, 80)),
        transcript_path: str_field(&value, "transcript_path")
            .filter(|s| s.len() <= 4000)
            .map(str::to_owned),
        timestamp: now_ms(),
        status_data,
        task,
        process: None,
        message,
    })
}
/// The text as written, paragraphs kept, at most 4,000 characters: the island shows its first
/// lines, and all of it in a panel beside the island.
fn preview(text: &str) -> String {
    let mut clean = String::new();
    let mut blank = 0;
    for line in text.trim().lines().map(str::trim_end) {
        blank = if line.is_empty() { blank + 1 } else { 0 };
        if blank < 2 {
            clean.push_str(line);
            clean.push('\n');
        }
    }
    let clean = clean.trim_end();
    let mut short: String = clean.chars().take(4000).collect();
    if clean.chars().count() > 4000 {
        short.push('…');
    }
    short
}

pub fn apply_hook(s: &mut Session, e: &AgentEvent) {
    if e.timestamp < s.updated_at {
        return;
    }
    s.updated_at = e.timestamp;
    if let Some(cwd) = &e.cwd {
        s.project = project_name(cwd);
    }
    if let Some(model) = &e.model {
        s.model = model.clone();
    }
    if e.parent_id.is_some() {
        s.parent_id = e.parent_id.clone();
    }
    if e.process.is_some() {
        s.process = e.process;
    }
    // A new turn starts clean; a Notification never replaces what the agent itself said.
    match e.event.as_str() {
        "UserPromptSubmit" | "Stop" | "PermissionRequest" => s.message = e.message.clone(),
        "PreToolUse" if e.message.is_some() => s.message = e.message.clone(),
        "Notification" if s.message.is_none() => s.message = e.message.clone(),
        _ => {}
    }
    match e.event.as_str() {
        "SessionStart" => {
            s.activity = "idle".into();
            s.detail = "Ready for your next idea".into();
        }
        "UserPromptSubmit" | "SubagentStart" => {
            s.activity = "working".into();
            s.detail = "Thinking".into();
        }
        "PreToolUse" | "PostToolUse" => {
            let tool = e.tool.as_deref().unwrap_or("Tool");
            let question = tool.eq_ignore_ascii_case("AskUserQuestion")
                || tool.to_lowercase().ends_with("request_user_input");
            if e.event == "PreToolUse" && question {
                s.activity = "waiting".into();
                s.detail = "Waiting for your answer".into();
            } else {
                s.activity = "working".into();
                s.detail = if question {
                    "Thinking".into()
                } else {
                    tool_category(tool)
                };
            }
        }
        "PermissionRequest" => {
            s.activity = "waiting".into();
            s.detail = "Waiting for approval".into();
        }
        "Notification" => {
            s.activity = "waiting".into();
            s.detail = "Agent needs your attention".into();
        }
        "Stop" => {
            s.activity = "idle".into();
            s.detail = "Turn finished".into();
        }
        "SubagentStop" | "SessionEnd" => {
            s.activity = "finished".into();
            s.detail = "Session ended".into();
        }
        "Interrupt" => {
            s.activity = "interrupted".into();
            s.detail = "Turn interrupted".into();
        }
        "StopFailure" | "PostToolUseFailure" => {
            s.activity = "error".into();
            s.detail = "Agent reported an error".into();
        }
        "LimitReached" => {
            s.activity = "limited".into();
            s.detail = "Usage limit reached".into();
        }
        "SpendLimitReached" => {
            s.activity = "limited".into();
            s.detail = "Spend limit reached".into();
        }
        "PreCompact" => {
            s.activity = "working".into();
            s.detail = "Compacting context".into();
        }
        "PostCompact" => {
            s.activity = "working".into();
            s.detail = "Context compacted".into();
        }
        "StatusLine" => {
            if let Some(data) = &e.status_data {
                apply_status(s, data);
            }
        }
        _ => {}
    }
    if let Some(task) = &e.task {
        if let Some(existing) = s.tasks.iter_mut().find(|t| t.id == task.id) {
            *existing = task.clone();
        } else {
            s.tasks.push(task.clone());
        }
    }
}
/// How a failed Codex turn reads: Limit reached when its usage limit stopped it, else an error.
fn codex_failure(error: &Value) -> (String, String) {
    if str_field(error, "codex_error_info") == Some("usage_limit_exceeded") {
        ("limited".into(), "Usage limit reached".into())
    } else {
        ("error".into(), "Agent reported an error".into())
    }
}
/// Claude Code's own words when a usage limit ends a turn: "You've hit your limit · resets 3pm",
/// "5-hour limit reached ∙ resets 3pm", "Claude usage limit reached". Only short messages count,
/// so an agent's long reply that mentions a limit never reads as one.
fn is_limit_notice(text: &str) -> bool {
    let text = text.to_lowercase();
    text.len() <= 240
        && ["limit reached", "hit your limit", "hit your usage limit"]
            .iter()
            .any(|phrase| text.contains(phrase))
}
fn tool_category(tool: &str) -> String {
    let t = tool.to_lowercase();
    if t.contains("write") || t.contains("edit") || t.contains("patch") {
        "Editing files"
    } else if t.contains("read") || t.contains("glob") || t.contains("grep") {
        "Exploring files"
    } else if t.contains("bash") || t.contains("exec") || t.contains("shell") {
        "Running a command"
    } else if t.contains("search") || t.contains("web") {
        "Researching"
    } else if t.contains("task") || t.contains("agent") {
        "Coordinating tasks"
    } else {
        "Using a tool"
    }
    .into()
}
pub fn apply_status(s: &mut Session, data: &Value) {
    s.context_percent = data
        .pointer("/context_window/used_percentage")
        .and_then(Value::as_f64)
        .map(|v| v.clamp(0.0, 100.0));
    s.context_estimated = false;
    if let Some(window) = data
        .pointer("/context_window/context_window_size")
        .and_then(Value::as_u64)
        .filter(|w| *w > 0)
    {
        s.context_window = Some(window);
    }
    s.limits = [
        ("five_hour", "5 hour"),
        ("seven_day", "7 day"),
        ("spend_limit", "Spend limit"),
    ]
    .into_iter()
    .filter_map(|(key, label)| {
        let v = data.get("rate_limits")?.get(key)?;
        let reset = v.get("resets_at")?.as_i64()? * 1000;
        if reset <= now_ms() {
            return None;
        }
        Some(Limit {
            label: label.into(),
            used_percent: v.get("used_percentage")?.as_f64()?.clamp(0., 100.),
            resets_at: reset,
        })
    })
    .collect();
}

/// Parsed counters are separate from activity: a delayed usage record must not undo a hook state.
pub struct ParsedRecord {
    pub usage: Option<Tokens>,
    pub cumulative: bool,
    pub request_id: Option<String>,
    pub context_percent: Option<f64>,
    /// The tokens a Claude request sent, which is the context in use. Its window is the
    /// session's: see collector.rs.
    pub context_tokens: Option<u64>,
    pub tasks: Option<Vec<Task>>,
    pub model: Option<String>,
    pub activity: Option<(String, String)>,
    pub timestamp: i64,
}
pub fn parse_record(provider: Provider, v: &Value) -> ParsedRecord {
    let timestamp = v
        .get("timestamp")
        .and_then(Value::as_str)
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp_millis())
        .unwrap_or_else(now_ms);
    let mut result = ParsedRecord {
        usage: None,
        cumulative: false,
        request_id: None,
        context_percent: None,
        context_tokens: None,
        tasks: None,
        model: None,
        activity: None,
        timestamp,
    };
    match provider {
        Provider::Codex => {
            let payload = v.get("payload").unwrap_or(&Value::Null);
            match (str_field(v, "type"), str_field(payload, "type")) {
                (Some("event_msg"), Some("token_count")) => {
                    if let Some(t) = payload.pointer("/info/total_token_usage").filter(|t| {
                        t.get("input_tokens").and_then(Value::as_u64).is_some()
                            && t.get("output_tokens").and_then(Value::as_u64).is_some()
                    }) {
                        result.usage = Some(Tokens {
                            input: number(t, "input_tokens"),
                            output: number(t, "output_tokens"),
                            cached: number(t, "cached_input_tokens"),
                            cache_write: number(t, "cache_write_input_tokens"),
                            reasoning: number(t, "reasoning_output_tokens"),
                        });
                        result.cumulative = true;
                        if let Some(window) = payload
                            .pointer("/info/model_context_window")
                            .and_then(Value::as_f64)
                            .filter(|w| *w > 0.)
                        {
                            result.context_percent = payload
                                .pointer("/info/last_token_usage/total_tokens")
                                .and_then(Value::as_f64)
                                .map(|last| (last / window * 100.).clamp(0., 100.));
                        }
                    }
                }
                (Some("event_msg"), Some("task_started")) => {
                    result.activity = Some(("working".into(), "Thinking".into()))
                }
                (Some("event_msg"), Some("task_complete")) => {
                    // A turn that failed ends with an error, or with Limit reached when the usage
                    // limit stopped it, never as a handed-back turn. Only the error kind is read,
                    // never its message.
                    result.activity = Some(match payload.get("error").filter(|e| !e.is_null()) {
                        Some(error) => codex_failure(error),
                        None => ("idle".into(), "Turn finished".into()),
                    })
                }
                (Some("event_msg"), Some("error")) => {
                    result.activity = Some(codex_failure(payload));
                }
                (Some("event_msg"), Some("turn_aborted")) => {
                    result.activity = Some(("interrupted".into(), "Turn interrupted".into()))
                }
                (Some("response_item"), Some("function_call")) => {
                    let tool = str_field(payload, "name").unwrap_or("");
                    result.activity = Some(("working".into(), tool_category(tool)));
                    if tool == "update_plan" || tool.ends_with("__update_plan") {
                        if let Some(args) = str_field(payload, "arguments")
                            .and_then(|s| serde_json::from_str::<Value>(s).ok())
                        {
                            result.tasks =
                                args.get("plan").and_then(Value::as_array).map(|steps| {
                                    steps
                                        .iter()
                                        .enumerate()
                                        .filter_map(|(i, t)| {
                                            Some(Task {
                                                id: format!("step-{i}"),
                                                label: bounded(str_field(t, "step")?, 120),
                                                status: normalized_task_status(
                                                    str_field(t, "status").unwrap_or("pending"),
                                                ),
                                            })
                                        })
                                        .collect()
                                });
                        }
                    }
                }
                _ => {}
            }
            if str_field(v, "type") == Some("turn_context") {
                result.model = str_field(payload, "model").map(str::to_owned);
            }
        }
        Provider::Claude => {
            if str_field(v, "type") == Some("assistant") {
                let message = v.get("message").unwrap_or(&Value::Null);
                result.model = str_field(message, "model").map(str::to_owned);
                if let Some(t) = message.get("usage").filter(|t| {
                    t.get("input_tokens").and_then(Value::as_u64).is_some()
                        && t.get("output_tokens").and_then(Value::as_u64).is_some()
                }) {
                    result.usage = Some(Tokens {
                        input: number(t, "input_tokens") + number(t, "cache_read_input_tokens"),
                        output: number(t, "output_tokens"),
                        cached: number(t, "cache_read_input_tokens"),
                        cache_write: number(t, "cache_creation_input_tokens"),
                        reasoning: 0,
                    });
                    result.request_id = str_field(message, "id")
                        .map(str::to_owned)
                        .or_else(|| str_field(v, "uuid").map(str::to_owned));
                    // As Claude Code counts it: input, cache reads and cache writes, no output.
                    result.context_tokens = Some(
                        number(t, "input_tokens")
                            + number(t, "cache_read_input_tokens")
                            + number(t, "cache_creation_input_tokens"),
                    )
                    .filter(|used| *used > 0);
                }
                if let Some(content) = message.get("content").and_then(Value::as_array) {
                    for item in content {
                        if str_field(item, "type") == Some("tool_use")
                            && matches!(str_field(item, "name"), Some("TodoWrite"))
                        {
                            result.tasks = item
                                .pointer("/input/todos")
                                .and_then(Value::as_array)
                                .map(|tasks| {
                                    tasks
                                        .iter()
                                        .enumerate()
                                        .filter_map(|(i, t)| {
                                            Some(Task {
                                                id: format!("todo-{i}"),
                                                label: bounded(str_field(t, "content")?, 120),
                                                status: normalized_task_status(
                                                    str_field(t, "status").unwrap_or("pending"),
                                                ),
                                            })
                                        })
                                        .collect()
                                });
                        }
                    }
                }
            }
        }
    }
    result
}
/// The context window Claude Code gives a model when no status line says: 1M for Fable, Sonnet 5
/// and later, Haiku 5.5 and Opus 4.7 and later, or a `[1m]` variant; 200K for the rest, as for a
/// model ID Claude Code does not know. A request larger than 200K ran on 1M.
pub fn claude_window(model: &str, used: u64) -> u64 {
    let name = model
        .find("claude-")
        .map_or("", |at| &model[at + "claude-".len()..]);
    let mut parts = name.split(['-', '[', '@']);
    let family = parts.next().unwrap_or("");
    let mut number = || parts.next().and_then(|p| p.parse::<u32>().ok());
    let major = number();
    // The minor version, unless what follows is the date: claude-sonnet-4-20250514.
    let minor = number().filter(|m| *m < 100).unwrap_or(0);
    let long = model.contains("[1m]")
        || match (family, major) {
            ("fable" | "mythos", _) => true,
            ("opus", Some(major)) => (major, minor) >= (4, 7),
            ("sonnet" | "haiku", Some(major)) => major >= 5,
            _ => false,
        };
    if long || used > 200_000 {
        1_000_000
    } else {
        200_000
    }
}
fn normalized_task_status(s: &str) -> String {
    match s {
        "completed" => "completed",
        "in_progress" | "inProgress" => "in_progress",
        _ => "pending",
    }
    .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn privacy_envelope_excludes_content() {
        let e = hook_event(Provider::Claude, json!({"session_id":"a","hook_event_name":"PreToolUse","tool_name":"Bash","prompt":"secret","tool_input":{"command":"secret"},"tool_response":"secret"}), false).unwrap();
        assert!(!serde_json::to_string(&e).unwrap().contains("secret"));
    }
    #[test]
    fn codex_cumulative_usage_and_context_are_distinct() {
        let v: Value =
            serde_json::from_str(include_str!("../tests/fixtures/codex-token.json")).unwrap();
        let p = parse_record(Provider::Codex, &v);
        assert!(p.cumulative);
        assert_eq!(p.usage.unwrap().input, 10000);
        assert_eq!(p.context_percent, Some(10.0));
    }
    #[test]
    fn claude_cache_reads_are_in_input_not_added_to_total_twice() {
        let v: Value =
            serde_json::from_str(include_str!("../tests/fixtures/claude-usage.json")).unwrap();
        let t = parse_record(Provider::Claude, &v).usage.unwrap();
        assert_eq!(t.input, 1200);
        assert_eq!(t.cached, 1000);
        assert_eq!(t.cache_write, 50);
    }
    #[test]
    fn claude_context_is_what_a_request_sent_against_its_models_window() {
        let v: Value =
            serde_json::from_str(include_str!("../tests/fixtures/claude-usage.json")).unwrap();
        // Input, cache reads and cache writes; output is not in the context yet.
        assert_eq!(
            parse_record(Provider::Claude, &v).context_tokens,
            Some(1250)
        );
        for (model, window) in [
            ("claude-fable-5-1", 1_000_000),
            ("claude-opus-5-5", 1_000_000),
            ("claude-sonnet-5", 1_000_000),
            ("claude-haiku-5-5", 1_000_000),
            ("claude-opus-4-7", 1_000_000),
            ("us.anthropic.claude-opus-4-8-v1:0", 1_000_000),
            ("claude-opus-4-6", 200_000),
            ("claude-sonnet-4-6[1m]", 1_000_000),
            ("claude-sonnet-4-5-20250929", 200_000),
            ("claude-haiku-4-5-20251001", 200_000),
            ("claude-sonnet-4-20250514", 200_000),
            ("claude-3-7-sonnet-20250219", 200_000),
            // A gateway's own name for a model: Claude Code assumes 200K too.
            ("team-default", 200_000),
        ] {
            assert_eq!(claude_window(model, 1250), window, "{model}");
        }
        // A request larger than 200K ran on 1M, whatever the model.
        assert_eq!(claude_window("claude-opus-4-6", 300_000), 1_000_000);
    }
    #[test]
    fn a_status_line_measures_the_context_exactly_and_names_its_window() {
        let status = hook_event(
            Provider::Claude,
            json!({"session_id":"s","context_window":{"used_percentage":12.5,"context_window_size":1000000}}),
            true,
        )
        .unwrap();
        let mut s = Session::new(Provider::Claude, "s".into());
        s.updated_at = 0;
        s.context_estimated = true;
        apply_hook(&mut s, &status);
        assert_eq!(
            (s.context_percent, s.context_window, s.context_estimated),
            (Some(12.5), Some(1_000_000), false)
        );
    }
    #[test]
    fn turn_completion_does_not_end_session() {
        let e = hook_event(
            Provider::Codex,
            json!({"session_id":"a","hook_event_name":"Stop"}),
            false,
        )
        .unwrap();
        let mut s = Session::new(Provider::Codex, "a".into());
        apply_hook(&mut s, &e);
        assert_eq!(s.activity, "idle");
    }
    #[test]
    fn a_failed_codex_turn_is_an_error_not_a_handed_back_turn() {
        let done = |error: Value| {
            parse_record(
                Provider::Codex,
                &json!({"type":"event_msg","payload":{"type":"task_complete","error":error}}),
            )
            .activity
            .unwrap()
        };
        assert_eq!(done(Value::Null), ("idle".into(), "Turn finished".into()));
        let limit = done(
            json!({"message":"You've hit your usage limit.","codex_error_info":"usage_limit_exceeded"}),
        );
        assert_eq!(limit, ("limited".into(), "Usage limit reached".into()));
        assert_eq!(done(json!({"message":"stream disconnected"})).0, "error");
        // The same failure as an error event of its own.
        let event = parse_record(
            Provider::Codex,
            &json!({"type":"event_msg","payload":{"type":"error","message":"You've hit your usage limit.","codex_error_info":"usage_limit_exceeded"}}),
        )
        .activity
        .unwrap();
        assert_eq!(event, ("limited".into(), "Usage limit reached".into()));
    }
    #[test]
    fn a_claude_turn_stopped_by_a_limit_reads_limit_reached_not_your_turn() {
        let after = |payload: Value| {
            let mut session = Session::new(Provider::Claude, "limit".into());
            let mut input = json!({"session_id":"limit"});
            input
                .as_object_mut()
                .unwrap()
                .extend(payload.as_object().unwrap().clone());
            apply_hook(
                &mut session,
                &hook_event(Provider::Claude, input, false).unwrap(),
            );
            (session.activity, session.detail)
        };
        let limited = ("limited".to_string(), "Usage limit reached".to_string());
        assert_eq!(
            after(json!({"hook_event_name":"StopFailure","error_type":"rate_limit"})),
            limited
        );
        assert_eq!(
            after(json!({"hook_event_name":"StopFailure","error_type":"billing_error"})),
            ("limited".to_string(), "Spend limit reached".to_string())
        );
        assert_eq!(
            after(json!({"hook_event_name":"StopFailure","error_type":"overloaded"})).0,
            "error"
        );
        for words in [
            "You've hit your limit · resets 3pm (Europe/London)",
            "5-hour limit reached ∙ resets 3pm",
            "Claude usage limit reached. Your limit will reset at 5pm.",
        ] {
            assert_eq!(
                after(json!({"hook_event_name":"Stop","last_assistant_message":words})),
                limited,
                "{words}"
            );
        }
        // An ordinary reply, even one about limits, is still the person's turn.
        let long = format!(
            "I added a guard for when the rate limit reached zero. {}",
            "More. ".repeat(40)
        );
        for words in ["Done. The tests pass.", long.as_str()] {
            assert_eq!(
                after(json!({"hook_event_name":"Stop","last_assistant_message":words})).0,
                "idle"
            );
        }
    }
    #[test]
    fn questions_wait_for_an_answer_then_resume() {
        for (provider, tool) in [
            (Provider::Claude, "AskUserQuestion"),
            (Provider::Codex, "functions.request_user_input"),
        ] {
            let mut session = Session::new(provider, "question".into());
            for (event, expected) in [("PreToolUse", "waiting"), ("PostToolUse", "working")] {
                let hook = hook_event(provider, json!({"session_id":"question", "hook_event_name":event, "tool_name":tool, "tool_input":{"question":"private"}}), false).unwrap();
                apply_hook(&mut session, &hook);
                assert_eq!(session.activity, expected);
                assert!(!serde_json::to_string(&hook).unwrap().contains("private"));
            }
        }
    }
    #[test]
    fn malformed_and_unknown_records_have_no_usage() {
        assert!(parse_record(Provider::Codex, &json!({"type":"future"}))
            .usage
            .is_none());
        assert!(hook_event(Provider::Codex, json!({"hook_event_name":"Stop"}), false).is_none());
    }
    #[test]
    fn parent_and_child_are_distinct() {
        let e = hook_event(
            Provider::Codex,
            json!({"session_id":"parent","agent_id":"child","hook_event_name":"SubagentStart"}),
            false,
        )
        .unwrap();
        assert_eq!(e.session_id, "child");
        assert_eq!(e.parent_id.as_deref(), Some("parent"));
    }
    #[test]
    fn the_island_previews_what_the_agent_says_or_asks() {
        let hook = |v| hook_event(Provider::Claude, v, false).unwrap();
        let stop = hook(
            json!({"session_id":"s","hook_event_name":"Stop","last_assistant_message":"Done.\n\n\n\nWant me to push?  \n"}),
        );
        // Paragraphs stay; runs of blank lines and trailing spaces do not.
        assert_eq!(stop.message.as_deref(), Some("Done.\n\nWant me to push?"));
        let approval = hook(
            json!({"session_id":"s","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"npm run deploy"}}),
        );
        assert_eq!(approval.message.as_deref(), Some("Bash: npm run deploy"));
        let long = hook(
            json!({"session_id":"s","hook_event_name":"Stop","last_assistant_message":"x".repeat(5000)}),
        );
        assert_eq!(long.message.unwrap().chars().count(), 4001);
        // A notice never replaces what the agent said; the next turn starts clean.
        let mut s = Session::new(Provider::Claude, "s".into());
        s.updated_at = 0; // Older than the events above, which would otherwise read as replays.
        apply_hook(&mut s, &stop);
        apply_hook(
            &mut s,
            &hook(
                json!({"session_id":"s","hook_event_name":"Notification","message":"Claude is waiting for your input"}),
            ),
        );
        assert_eq!(s.message.as_deref(), Some("Done.\n\nWant me to push?"));
        apply_hook(
            &mut s,
            &hook(json!({"session_id":"s","hook_event_name":"UserPromptSubmit"})),
        );
        assert_eq!(s.message, None);
    }
    #[test]
    fn a_session_keeps_its_project_folder_when_the_agent_changes_directory() {
        let hook = hook_event(
            Provider::Claude,
            json!({"session_id":"s","hook_event_name":"Stop","cwd":"C:/work/glim/site","project_dir":"C:/work/glim"}),
            false,
        )
        .unwrap();
        assert_eq!(hook.cwd.as_deref(), Some("C:/work/glim"));
        let status = hook_event(
            Provider::Claude,
            json!({"session_id":"s","cwd":"C:/work/glim/site","workspace":{"project_dir":"C:/work/glim"}}),
            true,
        )
        .unwrap();
        assert_eq!(status.cwd.as_deref(), Some("C:/work/glim"));
    }
    #[test]
    fn a_subagent_tool_call_is_the_subagents_not_the_waiting_parents() {
        let e = hook_event(
            Provider::Claude,
            json!({"session_id":"parent","agent_id":"child","hook_event_name":"PreToolUse","tool_name":"Bash"}),
            false,
        )
        .unwrap();
        assert_eq!(e.session_id, "child");
        assert_eq!(e.parent_id.as_deref(), Some("parent"));
        let own = hook_event(
            Provider::Claude,
            json!({"session_id":"parent","hook_event_name":"PreToolUse","tool_name":"Bash"}),
            false,
        )
        .unwrap();
        assert_eq!(own.session_id, "parent");
        assert_eq!(own.parent_id, None);
    }
    #[test]
    fn a_session_in_a_worktree_belongs_to_its_project() {
        for (dir, project) in [
            ("/Users/me/work/veyl/.claude/worktrees/fuzzy-otter", "veyl"),
            ("C:\\work\\veyl\\.claude\\worktrees\\fuzzy-otter\\", "veyl"),
            ("/Users/me/work/veyl", "veyl"),
            // Only Claude Code's own worktree folder counts.
            ("/Users/me/notes/worktrees/draft", "draft"),
        ] {
            let mut s = Session::new(Provider::Claude, "s".into());
            s.updated_at = 0;
            let hook = hook_event(
                Provider::Claude,
                json!({"session_id":"s","hook_event_name":"Stop","project_dir":dir}),
                false,
            )
            .unwrap();
            apply_hook(&mut s, &hook);
            assert_eq!(s.project, project, "{dir}");
        }
    }
}
