use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, io, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

pub const MAX_PAYLOAD: usize = 256 * 1024;
pub fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
pub fn data_dir() -> io::Result<PathBuf> {
    directories::ProjectDirs::from("dev", "Glim", "Glim")
        .map(|p| p.data_local_dir().to_path_buf())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Local app data unavailable"))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessIdentity { pub pid: u32, pub started_at: u64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Observation {
    pub version: u8,
    pub id: String,
    pub provider: String,
    pub session_id: String,
    pub turn_id: Option<String>,
    pub project: String,
    pub activity: String,
    pub observed_at: u64,
    pub ancestry: Vec<ProcessIdentity>,
    pub agent: Option<ProcessIdentity>,
}

fn short_string(value: &Value, key: &str, max: usize) -> Option<String> {
    let text = value.get(key)?.as_str()?;
    (!text.is_empty() && text.len() <= max && !text.chars().any(char::is_control)).then(|| text.to_owned())
}

// Allowlist metadata. Prompts, tool inputs/results, transcripts and auth never reach disk.
pub fn normalize(provider: &str, input: &Value, timestamp: u64) -> Option<Observation> {
    if !matches!(provider, "claude" | "codex") { return None; }
    // Child-agent payloads cannot overwrite their parent session's status.
    if input.get("agent_id").is_some_and(|v| !v.is_null()) || input.get("parent_thread_id").is_some_and(|v| !v.is_null()) { return None; }
    let event = input.get("hook_event_name")?.as_str()?;
    let activity = match event {
        "SessionStart" => "ready",
        "UserPromptSubmit" => "working",
        "PreToolUse" => "tool",
        "PostToolUse" | "PostToolUseFailure" | "PreCompact" | "PostCompact" => "working",
        "PermissionRequest" => "approval",
        "Notification" => match input.get("notification_type")?.as_str()? {
            "permission_prompt" => "approval", "idle_prompt" => "input", _ => return None,
        },
        // A Stop hook is an observation of a response boundary, never proof of task success.
        "Stop" if input.get("stop_hook_active").and_then(Value::as_bool) != Some(true) => "responded",
        "Stop" => "working",
        "StopFailure" => "failed",
        "Interrupt" => "interrupted",
        "SessionEnd" => "closed",
        _ => return None,
    };
    let cwd = short_string(input, "cwd", 4096).unwrap_or_default();
    let project = cwd.trim_end_matches(['/', '\\']).rsplit(['/', '\\']).next().filter(|s| !s.is_empty()).unwrap_or("Untitled session").to_string();
    Some(Observation {
        version: 1, id: uuid::Uuid::new_v4().to_string(), provider: provider.into(),
        session_id: short_string(input, "session_id", 256)?, turn_id: short_string(input, "turn_id", 256),
        project, activity: activity.into(), observed_at: timestamp, ancestry: vec![], agent: None,
    })
}

pub fn processes() -> sysinfo::System {
    let mut system = sysinfo::System::new();
    system.refresh_processes_specifics(sysinfo::ProcessesToUpdate::All, true,
        sysinfo::ProcessRefreshKind::nothing());
    system
}
pub fn attach_ancestry(observation: &mut Observation) {
    let system = processes();
    let mut pid = sysinfo::Pid::from_u32(std::process::id());
    for _ in 0..20 {
        let Some(process) = system.process(pid) else { break; };
        let Some(parent) = process.parent() else { break; };
        pid = parent;
        let Some(process) = system.process(pid) else { break; };
        let identity = ProcessIdentity { pid: pid.as_u32(), started_at: process.start_time() };
        let name = process.name().to_string_lossy().to_lowercase();
        if observation.agent.is_none() && (name.contains(&observation.provider) || name == "node.exe") {
            observation.agent = Some(identity.clone());
        }
        observation.ancestry.push(identity);
    }
}
pub fn alive(system: &sysinfo::System, identity: &ProcessIdentity) -> bool {
    system.process(sysinfo::Pid::from_u32(identity.pid)).is_some_and(|p| p.start_time() == identity.started_at)
}

// One immutable file per observation avoids shared read/modify/write races between hooks.
// Reader selects newest observations; bounded retention is maintained by the helper and host.
pub fn persist(dir: &Path, event: &Observation) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let file_id = uuid::Uuid::new_v4(); // never construct paths from provider-controlled IDs
    let temporary = dir.join(format!("{file_id}.tmp"));
    let destination = dir.join(format!("{file_id}.json"));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
    use io::Write;
    file.write_all(&serde_json::to_vec(event)?)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temporary, destination)?;
    prune(dir);
    Ok(())
}
pub fn read_observations(dir: &Path) -> Vec<Observation> {
    let Ok(entries) = fs::read_dir(dir) else { return vec![]; };
    entries.flatten().filter_map(|entry| {
        if entry.path().extension()?.to_str()? != "json" { return None; }
        if entry.metadata().ok()?.len() > 16_384 { return None; }
        let event: Observation = serde_json::from_slice(&fs::read(entry.path()).ok()?).ok()?;
        (event.version == 1 && matches!(event.provider.as_str(), "claude" | "codex")
            && event.observed_at <= now_ms() + 5000).then_some(event)
    }).collect()
}
pub fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return; };
    let mut files: Vec<_> = entries.flatten().filter_map(|e| {
        let extension = e.path().extension()?.to_str()?.to_owned();
        if extension != "json" && extension != "tmp" { return None; }
        Some((e.metadata().ok()?.modified().ok()?, e.path()))
    }).collect();
    files.sort_by_key(|entry| entry.0);
    let excess = files.len().saturating_sub(2048);
    if excess == 0 && files.iter().all(|(time, path)| {
        let age = time.elapsed().unwrap_or_default().as_secs();
        age <= 86_400 && !(path.extension().is_some_and(|e| e == "tmp") && age > 60)
    }) { return; }
    // Preserve the newest record for up to 128 sessions even when a busy peer floods the log.
    // Once these age out after 24h, fresh hooks will rediscover the session.
    let mut latest = std::collections::HashMap::new();
    for (_, path) in &files {
        if path.extension().is_some_and(|e| e == "json") {
            if let Ok(bytes) = fs::read(path) {
                if let Ok(event) = serde_json::from_slice::<Observation>(&bytes) {
                    let key = format!("{}:{}", event.provider, event.session_id);
                    if latest.len() < 128 || latest.contains_key(&key) { latest.insert(key, path.clone()); }
                }
            }
        }
    }
    for (index, (modified, path)) in files.into_iter().enumerate() {
        let age = modified.elapsed().unwrap_or_default().as_secs();
        let retained = latest.values().any(|p| p == &path);
        if (index < excess && !retained) || age > 86_400 || (path.extension().is_some_and(|e| e == "tmp") && age > 60) { let _ = fs::remove_file(path); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn payload_is_allowlisted_and_session_identity_does_not_use_project() {
        let event = normalize("claude", &json!({"session_id":"one", "hook_event_name":"PreToolUse", "cwd":"C:\\work\\glim", "prompt":"SECRET", "tool_input":{"secret":"SECRET"}}), 1).unwrap();
        let data = serde_json::to_string(&event).unwrap();
        assert!(!data.contains("SECRET")); assert!(!data.contains("C:"));
        assert_eq!(event.project, "glim"); assert_eq!(event.session_id, "one");
    }
    #[test]
    fn tool_error_does_not_end_the_agent_and_continuation_is_not_finished() {
        for (hook, activity) in [("PostToolUseFailure", "working"), ("StopFailure", "failed")] {
            assert_eq!(normalize("claude", &json!({"session_id":"a", "hook_event_name":hook}), 1).unwrap().activity, activity);
        }
        assert_eq!(normalize("codex", &json!({"session_id":"a", "hook_event_name":"Stop", "stop_hook_active":true}), 1).unwrap().activity, "working");
    }
    #[test]
    fn unsupported_events_and_child_agents_are_ignored() {
        assert!(normalize("codex", &json!({"session_id":"a", "hook_event_name":"SubagentStop"}), 1).is_none());
        assert!(normalize("claude", &json!({"session_id":"a", "hook_event_name":"Stop", "agent_id":"child"}), 1).is_none());
        assert!(normalize("claude", &json!({"session_id":"a", "hook_event_name":"Stop", "agent_id":null}), 1).is_some());
    }
    #[test]
    fn concurrent_writers_and_reopening_preserve_complete_records() {
        let temp = tempfile::tempdir().unwrap();
        std::thread::scope(|scope| {
            for n in 0..16 {
                let path = temp.path();
                scope.spawn(move || {
                    let event = normalize("codex", &json!({"session_id":format!("session-{n}"),"hook_event_name":"UserPromptSubmit"}), now_ms()).unwrap();
                    persist(path, &event).unwrap();
                });
            }
        });
        assert_eq!(read_observations(temp.path()).len(), 16);
    }
}
