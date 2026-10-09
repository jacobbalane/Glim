use crate::{
    connectors::provider_dir,
    model::*,
    normalize::{apply_hook, parse_record},
    storage::Store,
};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

pub struct TrackedFile {
    pub provider: Provider,
    pub session_id: String,
    pub path: PathBuf,
}
pub struct Collector {
    pub store: Store,
    pub sessions: HashMap<String, Session>,
    pub preferences: Preferences,
    pub connectors: Vec<Connector>,
    pub files: HashMap<PathBuf, TrackedFile>,
    pub island_expanded: bool,
}
impl Collector {
    pub fn new(store: Store, connectors: Vec<Connector>) -> Self {
        let preferences = store.preferences();
        let mut sessions: HashMap<_, _> = store
            .sessions()
            .into_iter()
            .map(|mut s| {
                if s.activity != "finished" {
                    s.activity = "stale".into();
                    s.detail = "Waiting for fresh activity".into();
                }
                (s.key(), s)
            })
            .collect();
        sessions.retain(|_, s| s.updated_at > now_ms() - 86400000);
        Self {
            store,
            sessions,
            preferences,
            connectors,
            files: HashMap::new(),
            island_expanded: false,
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        let mut sessions: Vec<_> = self
            .sessions
            .values()
            .filter(|s| {
                self.connectors
                    .iter()
                    .any(|c| c.provider == s.provider && c.enabled)
            })
            .cloned()
            .collect();
        sessions.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
        Snapshot {
            sessions,
            preferences: self.preferences.clone(),
            connectors: self.connectors.clone(),
        }
    }
    pub fn ingest(&mut self, event: AgentEvent) -> bool {
        if self.preferences.paused
            || !self
                .connectors
                .iter()
                .any(|c| c.provider == event.provider && c.enabled)
            || !self.store.claim_event(&event.event_id)
        {
            return false;
        }
        let key = format!("{}:{}", event.provider.name(), event.session_id);
        let s = self.sessions.entry(key).or_insert_with(|| {
            let mut session = Session::new(event.provider, event.session_id.clone());
            // Receipt occurs after the helper stamped the event. Seed the clock from
            // that event so the first lifecycle transition is not mistaken for a replay.
            session.started_at = event.timestamp;
            session.updated_at = event.timestamp;
            session
        });
        apply_hook(s, &event);
        let _ = self.store.save_session(s);
        if let Some(path) = event.transcript_path {
            let path = PathBuf::from(path);
            // Only local JSONL under this provider's data root. Never follow arbitrary hook paths.
            if safe_transcript(&path, event.provider) {
                // Subagent hook transcripts can refer to the parent file; don't account it twice.
                let key = path.clone();
                if let std::collections::hash_map::Entry::Vacant(entry) = self.files.entry(key) {
                    entry.insert(TrackedFile {
                        provider: event.provider,
                        session_id: event.session_id,
                        path,
                    });
                }
            }
        }
        true
    }
    pub fn discover(&mut self) {
        if self.preferences.paused {
            return;
        }
        for c in self.connectors.clone().into_iter().filter(|c| c.enabled) {
            let base = provider_dir(c.provider).join(if c.provider == Provider::Codex {
                "sessions"
            } else {
                "projects"
            });
            let mut files = vec![];
            recent_files(&base, 0, &mut files);
            for path in files {
                if self.files.contains_key(&path) || !safe_transcript(&path, c.provider) {
                    continue;
                }
                let Ok(mut file) = File::open(&path) else {
                    continue;
                };
                let mut header = vec![];
                let _ = (&mut file).take(16384).read_to_end(&mut header);
                let meta: Vec<serde_json::Value> = header
                    .split(|b| *b == b'\n')
                    .take(8)
                    .filter_map(|line| serde_json::from_slice(line).ok())
                    .collect();
                let found = meta.iter().find_map(|v| {
                    if c.provider == Provider::Codex
                        && v.get("type").and_then(|v| v.as_str()) == Some("session_meta")
                    {
                        let p = v.get("payload")?;
                        Some((
                            p.get("id")?.as_str()?.to_string(),
                            p.get("cwd").and_then(|v| v.as_str()).map(basename),
                            p.pointer("/source/subagent").is_some(),
                        ))
                    } else if c.provider == Provider::Claude {
                        Some((
                            v.get("sessionId")?.as_str()?.to_string(),
                            v.get("cwd").and_then(|v| v.as_str()).map(basename),
                            v.get("isSidechain")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false),
                        ))
                    } else {
                        None
                    }
                });
                if let Some((id, project, child)) = found {
                    if child {
                        continue;
                    } // Child files are registered through hooks instead.
                    let s = self
                        .sessions
                        .entry(format!("{}:{id}", c.provider.name()))
                        .or_insert_with(|| {
                            let mut s = Session::new(c.provider, id.clone());
                            s.activity = "stale".into();
                            s.detail = "Session found; waiting for activity".into();
                            s.source = "Local session records".into();
                            if let Some(p) = project {
                                s.project = p;
                            }
                            s
                        });
                    let _ = self.store.save_session(s);
                    self.files.insert(
                        path.clone(),
                        TrackedFile {
                            provider: c.provider,
                            session_id: id,
                            path,
                        },
                    );
                }
            }
        }
    }
    pub fn poll(&mut self) -> bool {
        if self.preferences.paused {
            return false;
        }
        let mut changed = false;
        for tracked in self.files.values() {
            if !self
                .connectors
                .iter()
                .any(|c| c.provider == tracked.provider && c.enabled)
            {
                continue;
            }
            let key = format!("{}:{}", tracked.provider.name(), tracked.session_id);
            if let Some(session) = self.sessions.get_mut(&key) {
                match tail(&self.store, tracked, session) {
                    Ok(did_change) => changed |= did_change,
                    Err(_) => {
                        if session.measurement_note.is_none() {
                            session.measurement_note = Some("Local usage records could not be read. Activity tracking remains available.".into());
                            changed = true;
                        }
                    }
                }
            }
        }
        let now = now_ms();
        for s in self.sessions.values_mut() {
            s.limits.retain(|l| l.resets_at > now);
            // Quiet working sessions are explicitly uncertain, never inferred finished.
            if s.activity == "working" && now - s.updated_at > 300000 {
                s.activity = "stale".into();
                s.detail = "No recent agent activity".into();
                let _ = self.store.save_session(s);
                changed = true;
            }
        }
        changed
    }
}
fn safe_transcript(path: &Path, provider: Provider) -> bool {
    if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
        return false;
    }
    match (path.canonicalize(), provider_dir(provider).canonicalize()) {
        (Ok(file), Ok(root)) => file.starts_with(root),
        _ => false,
    }
}
fn recent_files(root: &Path, depth: usize, files: &mut Vec<PathBuf>) {
    if depth > 7 || files.len() >= 150 {
        return;
    }
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.take(3000).flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            recent_files(&path, depth + 1, files);
        } else if path.extension().and_then(|s| s.to_str()) == Some("jsonl")
            && meta
                .modified()
                .ok()
                .and_then(|m| m.elapsed().ok())
                .map(|age| age.as_secs() < 86400)
                .unwrap_or(false)
        {
            files.push(path);
        }
        if files.len() >= 150 {
            return;
        }
    }
}

fn tail(store: &Store, file: &TrackedFile, s: &mut Session) -> Result<bool, String> {
    let mut reader = File::open(&file.path).map_err(|e| e.to_string())?;
    let metadata = reader.metadata().map_err(|e| e.to_string())?;
    let generation = format!("{:?}", metadata.created().ok());
    let path = file.path.to_string_lossy();
    let (mut offset, old_generation) = store.cursor(&path)?;
    if generation != old_generation || metadata.len() < offset {
        offset = 0;
    }
    if metadata.len() <= offset {
        return Ok(false);
    }
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::with_capacity(262144);
    reader
        .take(8 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let Some(end) = bytes.iter().rposition(|b| *b == b'\n') else {
        if bytes.len() == 8 * 1024 * 1024 {
            s.measurement_note = Some("An oversized local record is not supported.".into());
        }
        return Ok(false);
    };
    store
        .conn
        .execute_batch("SAVEPOINT transcript_batch")
        .map_err(|e| e.to_string())?;
    let original_session = s.clone();
    let result = (|| {
        let mut changed = false;
        for line in bytes[..=end]
            .split(|b| *b == b'\n')
            .filter(|l| !l.is_empty())
        {
            let Ok(v) = serde_json::from_slice(line) else {
                continue;
            };
            let parsed = parse_record(file.provider, &v);
            if let Some(tokens) = &parsed.usage {
                let delta = if parsed.cumulative {
                    store.cumulative_delta(&s.key(), tokens)?
                } else if let Some(id) = &parsed.request_id {
                    store.request_delta(&s.key(), id, tokens)?
                } else {
                    continue;
                };
                s.tokens.get_or_insert_default().add(&delta);
                // Each transcript describes its own requests. No aggregate parent counters are added.
                store.add_usage(s, &delta, parsed.timestamp)?;
                s.measurement_note = None;
                changed = true;
            }
            if let Some(context) = parsed.context_percent {
                s.context_percent = Some(context);
                changed = true;
            }
            if let Some(tasks) = parsed.tasks {
                s.tasks = tasks;
                changed = true;
            }
            if let Some(model) = parsed.model {
                s.model = model;
                changed = true;
            }
            if let Some((activity, detail)) = parsed.activity {
                if parsed.timestamp >= s.updated_at {
                    s.activity = activity;
                    s.detail = detail;
                    s.updated_at = parsed.timestamp;
                    changed = true;
                }
            }
        }
        store.save_cursor(&path, offset + end as u64 + 1, &generation)?;
        if changed {
            store.save_session(s)?;
        }
        Ok(changed)
    })();
    if result.is_ok() {
        store
            .conn
            .execute_batch("RELEASE transcript_batch")
            .map_err(|e| e.to_string())?;
    } else {
        *s = original_session;
        let _ = store
            .conn
            .execute_batch("ROLLBACK TO transcript_batch; RELEASE transcript_batch");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn first_hook_uses_event_clock_and_applies_activity() {
        let db = Store::open(Path::new(":memory:")).unwrap();
        let connector = Connector {
            provider: Provider::Codex,
            detected: true,
            enabled: true,
            version: None,
            config_path: String::new(),
            changes: vec![],
            note: String::new(),
            error: None,
        };
        let mut collector = Collector::new(db, vec![connector]);
        let mut event = crate::normalize::hook_event(Provider::Codex, serde_json::json!({ "session_id": "a", "hook_event_name": "UserPromptSubmit", "cwd": "C:/work/project" }), false).unwrap();
        event.timestamp -= 1000;
        let stamp = event.timestamp;
        assert!(collector.ingest(event));
        let session = &collector.sessions["codex:a"];
        assert_eq!(session.activity, "working");
        assert_eq!(session.project, "project");
        assert_eq!(session.started_at, stamp);
    }
    #[test]
    fn partial_lines_are_not_consumed_and_restart_replays_are_safe() {
        let path = std::env::temp_dir().join(format!("glim-tail-{}.jsonl", uuid::Uuid::new_v4()));
        let line = include_str!("../tests/fixtures/codex-token.json").trim();
        fs::write(&path, line).unwrap();
        let db = Store::open(Path::new(":memory:")).unwrap();
        let file = TrackedFile {
            provider: Provider::Codex,
            session_id: "a".into(),
            path: path.clone(),
        };
        let mut s = Session::new(Provider::Codex, "a".into());
        assert!(!tail(&db, &file, &mut s).unwrap());
        assert!(s.tokens.is_none());
        fs::write(&path, format!("{line}\n{line}\n")).unwrap();
        assert!(tail(&db, &file, &mut s).unwrap());
        assert_eq!(s.tokens.as_ref().unwrap().input, 10000);
        fs::write(&path, format!("{line}\n")).unwrap();
        tail(&db, &file, &mut s).unwrap();
        assert_eq!(s.tokens.unwrap().input, 10000);
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn failed_cursor_write_rolls_back_usage_and_live_state() {
        let path =
            std::env::temp_dir().join(format!("glim-rollback-{}.jsonl", uuid::Uuid::new_v4()));
        let line = include_str!("../tests/fixtures/codex-token.json").trim();
        fs::write(&path, format!("{line}\n")).unwrap();
        let db = Store::open(Path::new(":memory:")).unwrap();
        db.conn.execute_batch("CREATE TRIGGER fail_cursor BEFORE INSERT ON cursors BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
        let file = TrackedFile {
            provider: Provider::Codex,
            session_id: "a".into(),
            path: path.clone(),
        };
        let mut s = Session::new(Provider::Codex, "a".into());
        assert!(tail(&db, &file, &mut s).is_err());
        assert!(s.tokens.is_none());
        assert!(db.history().unwrap().is_empty());
        assert_eq!(db.baseline(&s.key()).unwrap(), Tokens::default());
        db.conn.execute_batch("DROP TRIGGER fail_cursor;").unwrap();
        tail(&db, &file, &mut s).unwrap();
        assert_eq!(s.tokens.unwrap().input, 10000);
        fs::remove_file(path).unwrap();
    }
}
