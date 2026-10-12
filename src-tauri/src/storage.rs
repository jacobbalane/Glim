use crate::model::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub struct Store {
    pub conn: Connection,
}
fn sql_integer(v: u64) -> Result<i64, String> {
    i64::try_from(v).map_err(|_| "Reported usage exceeds the supported integer range".into())
}
impl Store {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000;
          CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS requests (session TEXT NOT NULL, id TEXT NOT NULL, counters TEXT NOT NULL, observed INTEGER NOT NULL, PRIMARY KEY(session,id));
          CREATE TABLE IF NOT EXISTS cursors (path TEXT PRIMARY KEY, offset INTEGER NOT NULL, generation TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, observed INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, session TEXT NOT NULL, provider TEXT NOT NULL, project TEXT NOT NULL, input INTEGER NOT NULL, output INTEGER NOT NULL, cached INTEGER NOT NULL, cache_write INTEGER NOT NULL, reasoning INTEGER NOT NULL, PRIMARY KEY(day,session));
          CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS baselines (session TEXT PRIMARY KEY, counters TEXT NOT NULL);").map_err(|e| e.to_string())?;
        let s = Self { conn };
        s.prune()?;
        Ok(s)
    }
    pub fn prune(&self) -> Result<(), String> {
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(30))
            .format("%Y-%m-%d")
            .to_string();
        let cutoff_ms = now_ms() - 30 * 86400000;
        self.conn
            .execute("DELETE FROM usage WHERE day < ?", [&cutoff])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM sessions WHERE updated < ?", [cutoff_ms])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM requests WHERE observed < ?", [cutoff_ms])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM events WHERE observed < ?", [cutoff_ms])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn sessions(&self) -> Vec<Session> {
        let Ok(mut stmt) = self.conn.prepare("SELECT data FROM sessions") else {
            return vec![];
        };
        stmt.query_map([], |row| row.get::<_, String>(0))
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|s| serde_json::from_str(&s).ok())
            .collect()
    }
    pub fn save_session(&self, s: &Session) -> Result<(), String> {
        // What an agent said is shown while Glim runs and never written down.
        let data = Session {
            message: None,
            ..s.clone()
        };
        self.conn.execute("INSERT INTO sessions VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated=excluded.updated", params![s.key(), serde_json::to_string(&data).map_err(|e| e.to_string())?, s.updated_at]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn preferences(&self) -> Preferences {
        self.conn
            .query_row("SELECT data FROM preferences WHERE id=1", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn save_preferences(&self, p: &Preferences) -> Result<(), String> {
        self.conn.execute("INSERT INTO preferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data", [serde_json::to_string(p).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn claim_event(&self, id: &str) -> bool {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO events VALUES (?,?)",
                params![id, now_ms()],
            )
            .unwrap_or(0)
            > 0
    }
    /// Request snapshots can occur repeatedly during streaming. Only their positive delta is new usage.
    pub fn request_delta(&self, session: &str, id: &str, t: &Tokens) -> Result<Tokens, String> {
        let previous = self
            .conn
            .query_row(
                "SELECT counters FROM requests WHERE session=? AND id=?",
                params![session, id],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let old: Tokens = previous
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        let merged = Tokens {
            input: old.input.max(t.input),
            output: old.output.max(t.output),
            cached: old.cached.max(t.cached),
            cache_write: old.cache_write.max(t.cache_write),
            reasoning: old.reasoning.max(t.reasoning),
        };
        self.conn.execute("INSERT INTO requests VALUES (?,?,?,?) ON CONFLICT(session,id) DO UPDATE SET counters=excluded.counters, observed=excluded.observed", params![session, id, serde_json::to_string(&merged).map_err(|e| e.to_string())?, now_ms()]).map_err(|e| e.to_string())?;
        Ok(merged.delta(&old))
    }
    pub fn baseline(&self, session: &str) -> Result<Tokens, String> {
        let previous = self
            .conn
            .query_row(
                "SELECT counters FROM baselines WHERE session=?",
                [session],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        previous
            .map(|s| serde_json::from_str(&s))
            .transpose()
            .map(|v| v.unwrap_or_default())
            .map_err(|e| e.to_string())
    }
    pub fn cumulative_delta(&self, session: &str, t: &Tokens) -> Result<Tokens, String> {
        let old = self.baseline(session)?;
        // A lower snapshot can be a replay; keep the high-water mark. Session IDs scope resets.
        let merged = Tokens {
            input: old.input.max(t.input),
            output: old.output.max(t.output),
            cached: old.cached.max(t.cached),
            cache_write: old.cache_write.max(t.cache_write),
            reasoning: old.reasoning.max(t.reasoning),
        };
        self.conn.execute("INSERT INTO baselines VALUES (?,?) ON CONFLICT(session) DO UPDATE SET counters=excluded.counters", params![session, serde_json::to_string(&merged).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
        Ok(merged.delta(&old))
    }
    pub fn add_usage(&self, s: &Session, delta: &Tokens, timestamp: i64) -> Result<(), String> {
        if delta == &Tokens::default() {
            return Ok(());
        }
        let date = chrono::DateTime::from_timestamp_millis(timestamp)
            .unwrap_or_else(chrono::Utc::now)
            .format("%Y-%m-%d")
            .to_string();
        self.conn.execute("INSERT INTO usage VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(day,session) DO UPDATE SET input=input+excluded.input,output=output+excluded.output,cached=cached+excluded.cached,cache_write=cache_write+excluded.cache_write,reasoning=reasoning+excluded.reasoning,project=excluded.project", params![date, s.key(), s.provider.name(), s.project, sql_integer(delta.input)?, sql_integer(delta.output)?, sql_integer(delta.cached)?, sql_integer(delta.cache_write)?, sql_integer(delta.reasoning)?]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn cursor(&self, path: &str) -> Result<(u64, String), String> {
        self.conn
            .query_row(
                "SELECT offset,generation FROM cursors WHERE path=?",
                [path],
                |r| Ok((r.get::<_, i64>(0)?.max(0) as u64, r.get(1)?)),
            )
            .optional()
            .map(|v| v.unwrap_or((0, String::new())))
            .map_err(|e| e.to_string())
    }
    pub fn save_cursor(&self, path: &str, offset: u64, generation: &str) -> Result<(), String> {
        self.conn.execute("INSERT INTO cursors VALUES (?,?,?) ON CONFLICT(path) DO UPDATE SET offset=excluded.offset,generation=excluded.generation", params![path, sql_integer(offset)?, generation]).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn history(&self) -> Result<Vec<DailyUsage>, String> {
        let mut stmt = self.conn.prepare("SELECT day,provider,project,SUM(input),SUM(output),SUM(cached),SUM(cache_write),SUM(reasoning),COUNT(DISTINCT session) FROM usage GROUP BY day,provider,project ORDER BY day").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(DailyUsage {
                    day: r.get(0)?,
                    provider: r.get(1)?,
                    project: r.get(2)?,
                    input: r.get::<_, i64>(3)?.max(0) as u64,
                    output: r.get::<_, i64>(4)?.max(0) as u64,
                    cached: r.get::<_, i64>(5)?.max(0) as u64,
                    cache_write: r.get::<_, i64>(6)?.max(0) as u64,
                    reasoning: r.get::<_, i64>(7)?.max(0) as u64,
                    sessions: r.get::<_, i64>(8)?.max(0) as u64,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn clear_history(&self) -> Result<(), String> {
        // Keep request/cumulative baselines and cursors so old provider records cannot reappear.
        self.conn
            .execute_batch("DELETE FROM usage; DELETE FROM sessions;")
            .map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn store() -> Store {
        Store::open(Path::new(":memory:")).unwrap()
    }
    #[test]
    fn cumulative_snapshots_and_replays_dont_double_count() {
        let db = store();
        let t = Tokens {
            input: 100,
            cached: 80,
            ..Default::default()
        };
        assert_eq!(db.cumulative_delta("a", &t).unwrap().input, 100);
        assert_eq!(db.cumulative_delta("a", &t).unwrap().input, 0);
        assert_eq!(
            db.cumulative_delta(
                "a",
                &Tokens {
                    input: 50,
                    ..Default::default()
                }
            )
            .unwrap()
            .input,
            0
        );
    }
    #[test]
    fn streaming_request_updates_only_add_the_increment() {
        let db = store();
        let t = Tokens {
            input: 100,
            output: 10,
            ..Default::default()
        };
        assert_eq!(db.request_delta("a", "r", &t).unwrap().input, 100);
        assert_eq!(
            db.request_delta(
                "a",
                "r",
                &Tokens {
                    output: 20,
                    ..t.clone()
                }
            )
            .unwrap()
            .output,
            10
        );
        assert_eq!(db.request_delta("a", "r", &t).unwrap().output, 0);
    }
    #[test]
    fn clear_keeps_deduplication() {
        let db = store();
        let t = Tokens {
            input: 100,
            ..Default::default()
        };
        db.cumulative_delta("a", &t).unwrap();
        db.clear_history().unwrap();
        assert_eq!(db.cumulative_delta("a", &t).unwrap().input, 0);
    }
    #[test]
    fn history_keeps_agents_and_projects_separate() {
        let db = store();
        let mut s = Session::new(Provider::Claude, "a".into());
        s.project = "repo".into();
        db.add_usage(
            &s,
            &Tokens {
                input: 100,
                output: 20,
                cached: 80,
                ..Default::default()
            },
            now_ms(),
        )
        .unwrap();
        let rows = db.history().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].input, 100);
        assert_eq!(rows[0].cached, 80);
    }
}
