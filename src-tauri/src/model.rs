use serde::{Deserialize, Serialize};
use serde_json::Value;

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Claude,
    Codex,
}
impl Provider {
    pub fn name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    pub input: u64,
    pub output: u64,
    pub cached: u64,
    pub cache_write: u64,
    pub reasoning: u64,
}
impl Tokens {
    pub fn delta(&self, old: &Self) -> Self {
        Self {
            input: self.input.saturating_sub(old.input),
            output: self.output.saturating_sub(old.output),
            cached: self.cached.saturating_sub(old.cached),
            cache_write: self.cache_write.saturating_sub(old.cache_write),
            reasoning: self.reasoning.saturating_sub(old.reasoning),
        }
    }
    pub fn add(&mut self, t: &Self) {
        self.input += t.input;
        self.output += t.output;
        self.cached += t.cached;
        self.cache_write += t.cache_write;
        self.reasoning += t.reasoning;
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub label: String,
    pub status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Limit {
    pub label: String,
    pub used_percent: f64,
    pub resets_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub provider: Provider,
    pub parent_id: Option<String>,
    pub project: String,
    pub model: String,
    pub activity: String,
    pub detail: String,
    pub started_at: i64,
    pub updated_at: i64,
    pub tokens: Option<Tokens>,
    pub context_percent: Option<f64>,
    /// The context window Claude Code's status line reported, which its transcript then measures
    /// against exactly.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    /// Whether the context was measured against the model's usual window instead: no status line
    /// said, as in the Claude app, which runs none.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub context_estimated: bool,
    pub tasks: Vec<Task>,
    pub limits: Vec<Limit>,
    pub source: String,
    pub measurement_note: Option<String>,
    /// The agent's process, while known: its id and start time. See process.rs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub process: Option<(u32, u64)>,
    /// What the agent last said or asked, for the open island. Never stored: see storage.rs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}
impl Session {
    pub fn new(provider: Provider, id: String) -> Self {
        let now = now_ms();
        Self {
            id,
            provider,
            parent_id: None,
            project: "Untitled workspace".into(),
            model: String::new(),
            activity: "idle".into(),
            detail: "Session detected".into(),
            started_at: now,
            updated_at: now,
            tokens: None,
            context_percent: None,
            context_window: None,
            context_estimated: false,
            tasks: vec![],
            limits: vec![],
            source: "Local hooks".into(),
            measurement_note: None,
            process: None,
            message: None,
        }
    }
    pub fn key(&self) -> String {
        format!("{}:{}", self.provider.name(), self.id)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub idle_behavior: String,
    /// The closed island: "island", "mini" for Glim in a notch just its size, or "glim" for Glim
    /// alone with nothing around it.
    pub compact_style: String,
    /// Whether Glim, in a mini notch or alone, shows the island while the pointer rests on it.
    pub hover_opens: bool,
    pub start_at_login: bool,
    pub hide_fullscreen: bool,
    pub monitor: Option<String>,
    pub island_position: f64,
    /// How strongly a waiting, finished or failed agent lights the island, 0 to 100.
    pub glow: u8,
    pub quick_options_enabled: bool,
    pub quick_options: Vec<String>,
    pub quick_options_order: Vec<String>,
    pub paused: bool,
    pub onboarding_complete: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            idle_behavior: "pill".into(),
            compact_style: "island".into(),
            hover_opens: true,
            start_at_login: false,
            hide_fullscreen: true,
            monitor: None,
            island_position: 0.5,
            glow: 50,
            quick_options_enabled: false,
            quick_options: vec!["centre".into(), "quit".into()],
            quick_options_order: ["centre", "pause", "settings", "usage", "setup", "quit"]
                .into_iter()
                .map(String::from)
                .collect(),
            paused: false,
            onboarding_complete: false,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connector {
    pub provider: Provider,
    pub detected: bool,
    pub enabled: bool,
    pub version: Option<String>,
    pub config_path: String,
    pub changes: Vec<String>,
    pub note: String,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub preferences: Preferences,
    pub connectors: Vec<Connector>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub day: String,
    pub provider: String,
    pub project: String,
    pub input: u64,
    pub output: u64,
    pub cached: u64,
    pub cache_write: u64,
    pub reasoning: u64,
    pub sessions: u64,
}

/// Only this allow-listed envelope crosses the pipe. Prompts never do; of what the agent says
/// or wants to run, only a short preview for the island.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub event_id: String,
    pub provider: Provider,
    pub session_id: String,
    pub parent_id: Option<String>,
    pub event: String,
    pub cwd: Option<String>,
    pub model: Option<String>,
    pub tool: Option<String>,
    pub transcript_path: Option<String>,
    pub timestamp: i64,
    pub status_data: Option<Value>,
    pub task: Option<Task>,
    /// Filled in by the helper, which can see the agent's process. Older helpers leave it out.
    #[serde(default)]
    pub process: Option<(u32, u64)>,
    /// A short preview of what the agent said or asks, on the events that hand over to the person.
    #[serde(default)]
    pub message: Option<String>,
}
pub fn basename(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("Workspace")
        .to_owned()
}
