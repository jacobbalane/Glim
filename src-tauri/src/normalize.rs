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
    let child = str_field(&value, "agent_id");
    let (id, parent) = if event.starts_with("Subagent") {
        (
            child.unwrap_or(session_id),
            child.map(|_| session_id.to_string()),
        )
    } else {
        (
            session_id,
            str_field(&value, "parent_session_id").map(str::to_owned),
        )
    };
    let status_data = statusline.then(|| {
        let mut limits = serde_json::Map::new();
        for key in ["five_hour", "seven_day", "spend_limit"] { if let Some(v) = value.get("rate_limits").and_then(|v| v.get(key)) { limits.insert(key.into(), json!({ "used_percentage": v.get("used_percentage"), "resets_at": v.get("resets_at") })); } }
        json!({ "context_window": { "used_percentage": value.pointer("/context_window/used_percentage") }, "rate_limits": limits })
    });
    Some(AgentEvent {
        event_id: uuid::Uuid::new_v4().to_string(),
        provider,
        session_id: id.into(),
        parent_id: parent,
        event: bounded(event, 40),
        cwd: str_field(&value, "cwd")
            .or_else(|| {
                value
                    .pointer("/workspace/project_dir")
                    .and_then(Value::as_str)
            })
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
    })
}

pub fn apply_hook(s: &mut Session, e: &AgentEvent) {
    if e.timestamp < s.updated_at {
        return;
    }
    s.updated_at = e.timestamp;
    if let Some(cwd) = &e.cwd {
        s.project = basename(cwd);
    }
    if let Some(model) = &e.model {
        s.model = model.clone();
    }
    if e.parent_id.is_some() {
        s.parent_id = e.parent_id.clone();
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
                    // A turn that failed (a usage limit, a network error) ends with an error, not a
                    // handed-back turn. Only the error kind is read, never its message.
                    result.activity = Some(match payload.get("error").filter(|e| !e.is_null()) {
                        Some(error) => (
                            "error".into(),
                            if str_field(error, "codex_error_info") == Some("usage_limit_exceeded")
                            {
                                "Usage limit reached"
                            } else {
                                "Agent reported an error"
                            }
                            .into(),
                        ),
                        None => ("idle".into(), "Turn finished".into()),
                    })
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
        assert_eq!(limit, ("error".into(), "Usage limit reached".into()));
        assert_eq!(done(json!({"message":"stream disconnected"})).0, "error");
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
}
