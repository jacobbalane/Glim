use crate::model::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

pub fn data_dir() -> PathBuf {
    std::env::var_os("GLIM_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            dirs::data_local_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("Glim")
        })
}
pub fn agent_home() -> PathBuf {
    std::env::var_os("GLIM_AGENT_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(std::env::temp_dir))
}
pub fn provider_dir(provider: Provider) -> PathBuf {
    if std::env::var_os("GLIM_AGENT_HOME").is_some() {
        return agent_home().join(format!(".{}", provider.name()));
    }
    let override_var = if provider == Provider::Codex {
        "CODEX_HOME"
    } else {
        "CLAUDE_CONFIG_DIR"
    };
    std::env::var_os(override_var)
        .map(PathBuf::from)
        .unwrap_or_else(|| agent_home().join(format!(".{}", provider.name())))
}
pub fn config_path(provider: Provider) -> PathBuf {
    provider_dir(provider).join(if provider == Provider::Claude {
        "settings.json"
    } else {
        "hooks.json"
    })
}
fn manifest_path(root: &Path, provider: Provider) -> PathBuf {
    root.join("connectors")
        .join(format!("{}.json", provider.name()))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub commands: Vec<String>,
    pub status_command: Option<String>,
    pub previous_status_line: Option<Value>,
    pub relay_file: Option<String>,
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid file location")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = parent.join(format!(".glim-{}.tmp", uuid::Uuid::new_v4()));
    use std::io::Write;
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&tmp, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(tmp);
    }
    result
}
fn read_config(path: &Path) -> Result<(Vec<u8>, Value), String> {
    let bytes = match fs::read(path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => vec![],
        Err(e) => return Err(e.to_string()),
    };
    let value = if bytes.is_empty() {
        json!({})
    } else {
        serde_json::from_slice::<Value>(&bytes).map_err(|_| {
            format!(
                "{} contains invalid JSON. Glim left it unchanged.",
                path.display()
            )
        })?
    };
    if !value.is_object() {
        return Err("Agent configuration must be a JSON object. Glim left it unchanged.".into());
    }
    Ok((bytes, value))
}
fn manifest(root: &Path, p: Provider) -> Option<Manifest> {
    fs::read(manifest_path(root, p))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
}
fn remove_owned(config: &mut Value, m: &Manifest) {
    if let Some(hooks) = config.get_mut("hooks").and_then(Value::as_object_mut) {
        for groups in hooks.values_mut() {
            if let Some(groups) = groups.as_array_mut() {
                for group in groups.iter_mut() {
                    if let Some(handlers) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                        handlers.retain(|h| {
                            !m.commands.iter().any(|c| {
                                h.get("command").and_then(Value::as_str) == Some(c)
                                    || h.get("commandWindows").and_then(Value::as_str) == Some(c)
                            })
                        });
                    }
                }
                groups.retain(|g| {
                    g.get("hooks")
                        .and_then(Value::as_array)
                        .map(|a| !a.is_empty())
                        .unwrap_or(true)
                });
            }
        }
        hooks.retain(|_, groups| groups.as_array().map(|a| !a.is_empty()).unwrap_or(true));
    }
    if m.status_command.as_deref().is_some_and(|cmd| {
        config
            .pointer("/statusLine/command")
            .and_then(Value::as_str)
            == Some(cmd)
    }) {
        if let Some(old) = &m.previous_status_line {
            config["statusLine"] = old.clone();
        } else {
            config.as_object_mut().unwrap().remove("statusLine");
        }
    }
}
pub fn set_connector_at(
    provider: Provider,
    enabled: bool,
    path: &Path,
    root: &Path,
    bridge: &Path,
) -> Result<(), String> {
    let (original_bytes, mut config) = read_config(path)?;
    let old = manifest(root, provider);
    if !enabled && old.is_none() {
        return Ok(());
    }
    if let Some(m) = &old {
        remove_owned(&mut config, m);
    }
    let mut new_manifest = None;
    if enabled {
        let binary = bridge.to_string_lossy().replace('\\', "/");
        if binary.contains(['"', '\n', '\r']) {
            return Err(
                "The installation path cannot be represented safely in an agent command.".into(),
            );
        }
        let command = format!("\"{binary}\" hook {}", provider.name());
        let windows_command = format!(
            "& '{}' hook {}",
            bridge.to_string_lossy().replace('\'', "''"),
            provider.name()
        );
        let events = if provider == Provider::Claude {
            vec![
                "SessionStart",
                "SessionEnd",
                "UserPromptSubmit",
                "PreToolUse",
                "PostToolUse",
                "PermissionRequest",
                "Stop",
                "StopFailure",
                "PostToolUseFailure",
                "PreCompact",
                "SubagentStart",
                "SubagentStop",
                "TaskCreated",
                "TaskCompleted",
            ]
        } else {
            vec![
                "SessionStart",
                "SessionEnd",
                "UserPromptSubmit",
                "PreToolUse",
                "PostToolUse",
                "PermissionRequest",
                "Stop",
                "Interrupt",
                "PreCompact",
                "PostCompact",
                "SubagentStart",
                "SubagentStop",
            ]
        };
        if config.get("hooks").is_none() {
            config["hooks"] = json!({});
        }
        let hooks = config
            .get_mut("hooks")
            .and_then(Value::as_object_mut)
            .ok_or(
                "Existing hooks have an unsupported shape; Glim left the configuration unchanged.",
            )?;
        for event in events {
            let groups = hooks
                .entry(event)
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .ok_or("Existing hook groups have an unsupported shape.")?;
            let handler = if provider == Provider::Codex {
                json!({"type":"command","command":command,"commandWindows":windows_command,"timeout":1})
            } else {
                json!({"type":"command","command":command,"timeout":1})
            };
            groups.push(json!({"hooks":[handler]}));
        }
        let previous = config.get("statusLine").cloned();
        let relay = root.join("connectors/claude-statusline.json");
        let status_command = if provider == Provider::Claude {
            atomic_write(
                &relay,
                &serde_json::to_vec_pretty(&json!({"previous":previous}))
                    .map_err(|e| e.to_string())?,
            )?;
            let cmd = format!(
                "\"{binary}\" statusline --relay \"{}\"",
                relay.to_string_lossy().replace('\\', "/")
            );
            // Preserve all status-line options, including padding and refreshInterval.
            let mut status = previous
                .clone()
                .filter(Value::is_object)
                .unwrap_or_else(|| json!({}));
            status["type"] = json!("command");
            status["command"] = json!(cmd);
            config["statusLine"] = status;
            Some(cmd)
        } else {
            None
        };
        new_manifest = Some(Manifest {
            commands: vec![command, windows_command],
            status_command,
            previous_status_line: if provider == Provider::Claude {
                previous
            } else {
                None
            },
            relay_file: if provider == Provider::Claude {
                Some(relay.to_string_lossy().into())
            } else {
                None
            },
        });
    }
    if !original_bytes.is_empty() {
        let backup = root.join("backups").join(format!(
            "{}-{}-{}.json",
            provider.name(),
            now_ms(),
            uuid::Uuid::new_v4()
        ));
        atomic_write(&backup, &original_bytes)?;
    }
    if fs::read(path).unwrap_or_default() != original_bytes {
        return Err(
            "Agent settings changed during setup. Try again; Glim preserved the new settings."
                .into(),
        );
    }
    // Write the manifest first: a failed configuration write remains safely reversible.
    if let Some(m) = new_manifest {
        atomic_write(
            &manifest_path(root, provider),
            &serde_json::to_vec_pretty(&m).map_err(|e| e.to_string())?,
        )?;
    }
    // Disconnecting from a file that held only Glim's entries (Glim created it) removes the file,
    // as it was before.
    let nothing_left = config.as_object().is_some_and(|o| {
        o.iter()
            .all(|(k, v)| k == "hooks" && v.as_object().is_some_and(|h| h.is_empty()))
    });
    if !enabled && nothing_left {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    } else {
        // Written the way Claude Code and Codex write it, keys in their order, and ending as it
        // did, so disconnecting gives the file back byte for byte.
        let mut written = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
        if original_bytes.ends_with(b"\n") {
            written.push(b'\n');
        }
        atomic_write(path, &written)?;
    }
    if !enabled {
        let _ = fs::remove_file(manifest_path(root, provider));
        if let Some(relay) = old.and_then(|m| m.relay_file) {
            let _ = fs::remove_file(relay);
        }
    }
    Ok(())
}
/// The helper as Glim ships it: beside Glim's own program (inside Glim.app on macOS).
fn bundled_bridge() -> Result<PathBuf, String> {
    let name = if cfg!(windows) {
        "glim-bridge.exe"
    } else {
        "glim-bridge"
    };
    Ok(std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name(name))
}

/// The helper agents' hooks call. On macOS, a copy in Glim's data folder: Glim.app can be
/// moved, or replaced by an update, without breaking the hooks.
fn hook_bridge() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        refresh_bridge();
        Ok(data_dir().join("bin").join("glim-bridge"))
    }
    #[cfg(not(target_os = "macos"))]
    bundled_bridge()
}

/// Copies the bundled helper into Glim's data folder when it is missing or out of date. The copy
/// loses the download's quarantine mark, so running it from a hook never stops at Gatekeeper.
#[cfg(target_os = "macos")]
pub fn refresh_bridge() {
    use std::os::unix::fs::PermissionsExt;
    let Ok(source) = bundled_bridge() else {
        return;
    };
    let target = data_dir().join("bin").join("glim-bridge");
    let same = match (fs::read(&source), fs::read(&target)) {
        (Ok(a), Ok(b)) => a == b,
        (Err(_), _) => return,
        _ => false,
    };
    if same {
        return;
    }
    let Some(folder) = target.parent() else {
        return;
    };
    let staged = folder.join(format!(".glim-bridge-{}", uuid::Uuid::new_v4()));
    let installed = fs::create_dir_all(folder)
        .and_then(|_| fs::copy(&source, &staged))
        .and_then(|_| fs::set_permissions(&staged, fs::Permissions::from_mode(0o755)))
        .and_then(|_| {
            remove_quarantine(&staged);
            // Replacing by rename leaves any hook already running the old copy undisturbed.
            fs::rename(&staged, &target)
        });
    if installed.is_err() {
        let _ = fs::remove_file(&staged);
    }
}
#[cfg(target_os = "macos")]
fn remove_quarantine(path: &Path) {
    use std::os::unix::ffi::OsStrExt;
    let (Ok(path), Ok(name)) = (
        std::ffi::CString::new(path.as_os_str().as_bytes()),
        std::ffi::CString::new("com.apple.quarantine"),
    ) else {
        return;
    };
    unsafe { libc::removexattr(path.as_ptr(), name.as_ptr(), 0) };
}

pub fn set_connector(provider: Provider, enabled: bool) -> Result<(), String> {
    let binary = hook_bridge()?;
    if enabled && !binary.exists() {
        return Err("The Glim helper is missing. Reinstall Glim or run npm run desktop.".into());
    }
    set_connector_at(
        provider,
        enabled,
        &config_path(provider),
        &data_dir(),
        &binary,
    )
}
fn executable(provider: Provider) -> Option<PathBuf> {
    let name = if provider == Provider::Claude {
        "claude"
    } else {
        "codex"
    };
    let names: Vec<String> = if cfg!(windows) {
        ["exe", "cmd", "ps1"]
            .iter()
            .map(|ext| format!("{name}.{ext}"))
            .collect()
    } else {
        vec![name.to_string()]
    };
    // Apps opened from the Dock or Finder get a short PATH on macOS, so also look where Claude
    // Code's and Codex's installers, Homebrew and npm put them.
    let mut folders: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if !cfg!(windows) {
        let home = agent_home();
        folders.extend([
            home.join(".local/bin"),
            home.join(".claude/local"),
            home.join(".npm-global/bin"),
            home.join(".bun/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ]);
    }
    folders
        .iter()
        .flat_map(|folder| names.iter().map(move |n| folder.join(n)))
        .find(|p| p.is_file())
}
pub fn detect(provider: Provider) -> Connector {
    let path = config_path(provider);
    let executable = executable(provider);
    let detected = executable.is_some() || provider_dir(provider).exists();
    let m = manifest(&data_dir(), provider);
    let mut error = None;
    let enabled = if let Some(m) = &m {
        match read_config(&path) {
            Ok((_, config)) => {
                let serialized = serde_json::to_string(&config).unwrap_or_default();
                m.commands
                    .iter()
                    .any(|c| serialized.contains(&serde_json::to_string(c).unwrap_or_default()))
            }
            Err(e) => {
                error = Some(e);
                false
            }
        }
    } else {
        false
    };
    let version = executable.and_then(|path| {
        let mut command = if path.extension().and_then(|s| s.to_str()) == Some("ps1") {
            let mut cmd = Command::new("powershell.exe");
            cmd.args(["-NoProfile", "-NonInteractive", "-File"])
                .arg(path);
            cmd
        } else if path.extension().and_then(|s| s.to_str()) == Some("cmd") {
            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/D", "/C"]).arg(path);
            cmd
        } else {
            Command::new(path)
        };
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        command
            .arg("--version")
            .output()
            .ok()
            .filter(|o| o.status.success())
            .and_then(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .split_whitespace()
                    .find(|word| word.chars().next().is_some_and(|c| c.is_ascii_digit()))
                    .map(str::to_owned)
            })
    });
    Connector { provider, detected, enabled, version, config_path: path.to_string_lossy().into(), changes: if provider == Provider::Claude { vec!["Add Glim lifecycle hooks alongside existing hooks".into(), "Relay usage while preserving your status line".into(), "Save a backup before changing settings".into()] } else { vec!["Add Glim lifecycle hooks alongside existing hooks".into(), "Read usage from the connected session’s local records".into(), "Save a backup before changing settings".into()] }, note: if provider == Provider::Codex { "In Codex, use /hooks to review and trust the Glim hooks. Start a new session after setup. Local transcript formats can change; unsupported usage is shown as unavailable." } else { "Start a new Claude Code session after setup. Context and account limits appear only when Claude Code reports them." }.into(), error }
}
pub fn disconnect_all() {
    for p in [Provider::Claude, Provider::Codex] {
        let _ = set_connector(p, false);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sandbox() -> PathBuf {
        let p = std::env::temp_dir().join(format!("glim-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn connector_roundtrip_preserves_hooks_and_statusline() {
        let root = sandbox();
        let path = root.join("settings.json");
        let original = json!({"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"my-script"}]}]},"statusLine":{"type":"command","command":"my-status","padding":2}});
        fs::write(&path, serde_json::to_vec(&original).unwrap()).unwrap();
        set_connector_at(
            Provider::Claude,
            true,
            &path,
            &root,
            Path::new("C:/Glim/glim-bridge.exe"),
        )
        .unwrap();
        set_connector_at(
            Provider::Claude,
            true,
            &path,
            &root,
            Path::new("C:/Glim/glim-bridge.exe"),
        )
        .unwrap();
        let (_, installed) = read_config(&path).unwrap();
        assert_eq!(installed["hooks"]["Stop"].as_array().unwrap().len(), 2);
        set_connector_at(
            Provider::Claude,
            false,
            &path,
            &root,
            Path::new("C:/Glim/glim-bridge.exe"),
        )
        .unwrap();
        let (_, restored) = read_config(&path).unwrap();
        assert_eq!(original, restored);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn disconnecting_gives_the_settings_file_back_byte_for_byte() {
        let root = sandbox();
        let path = root.join("settings.json");
        // As Claude Code writes it: its own key order, two-space indent, a final newline.
        let original = "{\n  \"model\": \"opus\",\n  \"hooks\": {\n    \"Stop\": [\n      {\n        \"hooks\": [\n          {\n            \"type\": \"command\",\n            \"command\": \"my-script\"\n          }\n        ]\n      }\n    ]\n  },\n  \"statusLine\": {\n    \"type\": \"command\",\n    \"command\": \"my-status\"\n  },\n  \"enabledPlugins\": {}\n}\n";
        fs::write(&path, original).unwrap();
        let bridge = Path::new("C:/Glim/glim-bridge.exe");
        set_connector_at(Provider::Claude, true, &path, &root, bridge).unwrap();
        let connected = fs::read_to_string(&path).unwrap();
        assert!(connected.starts_with("{\n  \"model\""));
        set_connector_at(Provider::Claude, false, &path, &root, bridge).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn a_file_glim_created_goes_when_glim_disconnects() {
        let root = sandbox();
        let path = root.join("hooks.json");
        let bridge = Path::new("C:/Glim/glim-bridge.exe");
        set_connector_at(Provider::Codex, true, &path, &root, bridge).unwrap();
        assert!(path.exists());
        set_connector_at(Provider::Codex, false, &path, &root, bridge).unwrap();
        assert!(!path.exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn disconnect_keeps_user_edits() {
        let root = sandbox();
        let path = root.join("settings.json");
        set_connector_at(
            Provider::Claude,
            true,
            &path,
            &root,
            Path::new("C:/Glim/glim-bridge.exe"),
        )
        .unwrap();
        let (_, mut value) = read_config(&path).unwrap();
        value["statusLine"] = json!({"type":"command","command":"new-user-status"});
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        set_connector_at(
            Provider::Claude,
            false,
            &path,
            &root,
            Path::new("C:/Glim/glim-bridge.exe"),
        )
        .unwrap();
        assert_eq!(
            read_config(&path).unwrap().1["statusLine"]["command"],
            "new-user-status"
        );
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn invalid_json_is_never_overwritten() {
        let root = sandbox();
        let path = root.join("hooks.json");
        fs::write(&path, b"broken").unwrap();
        assert!(set_connector_at(
            Provider::Codex,
            true,
            &path,
            &root,
            Path::new("C:/Glim/glim-bridge.exe")
        )
        .is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken");
        fs::remove_dir_all(root).unwrap();
    }
}
