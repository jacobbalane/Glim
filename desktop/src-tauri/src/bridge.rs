use glim_core::ProcessIdentity;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio::sync::{mpsc, oneshot};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub window_id: String,
    pub terminal_id: String,
    pub name: String,
}
#[derive(Clone)]
pub struct Terminal {
    pub target: Target,
    pub process: ProcessIdentity,
}
pub struct Window {
    pub owner: String,
    pub terminals: Vec<Terminal>,
    pub sender: mpsc::Sender<String>,
}
#[derive(Default)]
pub struct Registry {
    pub windows: HashMap<String, Window>,
    pub pending: HashMap<String, (String, oneshot::Sender<bool>)>,
}
pub type Shared = Arc<Mutex<Registry>>;

pub fn match_terminal(
    registry: &Registry,
    observation: &glim_core::Observation,
    system: &sysinfo::System,
) -> Option<Target> {
    // Choose only a unique, still-live shell in the hook's ancestry. Never guess by project name.
    let matches: Vec<_> = registry
        .windows
        .values()
        .flat_map(|w| &w.terminals)
        .filter(|t| {
            observation.ancestry.contains(&t.process) && glim_core::alive(system, &t.process)
        })
        .collect();
    (matches.len() == 1).then(|| matches[0].target.clone())
}
pub async fn reveal(registry: Shared, target: Target) -> Result<(), String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();
    let (sender, owner) = {
        let state = registry.lock().map_err(|_| "Bridge unavailable")?;
        let window = state
            .windows
            .get(&target.window_id)
            .ok_or("VS Code window disconnected")?;
        let terminal = window
            .terminals
            .iter()
            .find(|t| t.target.terminal_id == target.terminal_id)
            .ok_or("Terminal closed")?;
        if !glim_core::alive(&glim_core::processes(), &terminal.process) {
            return Err("Terminal process exited".into());
        }
        (window.sender.clone(), window.owner.clone())
    };
    registry
        .lock()
        .map_err(|_| "Bridge unavailable")?
        .pending
        .insert(request_id.clone(), (owner, tx));
    let message = serde_json::json!({"type":"reveal","requestId":request_id,"windowId":target.window_id,"terminalId":target.terminal_id}).to_string();
    let result = async {
        sender
            .send(message)
            .await
            .map_err(|_| "Bridge disconnected")?;
        match tokio::time::timeout(std::time::Duration::from_secs(2), rx).await {
            Ok(Ok(true)) => Ok(()),
            _ => Err("Terminal did not confirm reveal"),
        }
    }
    .await;
    if let Ok(mut state) = registry.lock() {
        state.pending.remove(&request_id);
    }
    result.map_err(str::to_string)
}

#[cfg(windows)]
pub async fn serve(registry: Shared) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    use tokio::net::windows::named_pipe::ServerOptions;
    let output = std::process::Command::new("whoami.exe")
        .args(["/user", "/fo", "csv", "/nh"])
        .creation_flags(0x08000000)
        .output()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let sid = text
        .split('"')
        .find(|s| {
            s.starts_with("S-1-")
                && s.chars()
                    .all(|c| c.is_ascii_digit() || c == '-' || c == 'S')
        })
        .ok_or_else(|| std::io::Error::other("Current user SID unavailable"))?;
    let endpoint = format!(r"\\.\pipe\glim-v1-{sid}");
    let descriptor_text: Vec<u16> = format!("D:P(A;;GA;;;{sid})\0").encode_utf16().collect();
    fn create(
        endpoint: &str,
        descriptor_text: &[u16],
        first: bool,
    ) -> std::io::Result<tokio::net::windows::named_pipe::NamedPipeServer> {
        use windows_sys::Win32::{
            Foundation::LocalFree,
            Security::{
                Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW,
                SECURITY_ATTRIBUTES,
            },
        };
        let mut descriptor = std::ptr::null_mut();
        unsafe {
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                descriptor_text.as_ptr(),
                1,
                &mut descriptor,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(std::io::Error::last_os_error());
            }
            let mut attributes = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor,
                bInheritHandle: 0,
            };
            let result = ServerOptions::new()
                .first_pipe_instance(first)
                .reject_remote_clients(true)
                .max_instances(16)
                .create_with_security_attributes_raw(endpoint, &mut attributes as *mut _ as *mut _);
            LocalFree(descriptor);
            result
        }
    }
    let mut server = create(&endpoint, &descriptor_text, true)?;
    loop {
        server.connect().await?;
        let connection = server;
        // Keep a listener alive throughout: another process cannot take the endpoint between connections.
        server = create(&endpoint, &descriptor_text, false)?;
        let registry = registry.clone();
        tokio::spawn(async move {
            let _ = handle(connection, registry).await;
        });
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisteredTerminal {
    terminal_id: String,
    name: String,
    pid: Option<u32>,
}

#[cfg(windows)]
async fn handle(
    pipe: tokio::net::windows::named_pipe::NamedPipeServer,
    registry: Shared,
) -> std::io::Result<()> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let owner = uuid::Uuid::new_v4().to_string();
    let (mut reader, mut writer) = tokio::io::split(pipe);
    let (sender, mut outgoing) = mpsc::channel::<String>(16);
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 4096];
    let result = async {
        loop {
            tokio::select! {
                read = reader.read(&mut chunk) => {
                    let count = read?; if count == 0 { break; }
                    buffer.extend_from_slice(&chunk[..count]);
                    if buffer.len() > 65536 { break; }
                    while let Some(end) = buffer.iter().position(|b| *b == b'\n') {
                        let line: Vec<u8> = buffer.drain(..=end).collect();
                        let Ok(value) = serde_json::from_slice::<serde_json::Value>(&line) else { continue; };
                        match value.get("type").and_then(|v| v.as_str()) {
                            Some("register") => {
                                if value.get("version").and_then(|v| v.as_u64()) != Some(1) { continue; }
                                let Some(window_id) = value.get("windowId").and_then(|v| v.as_str()).filter(|s| s.len() <= 100) else { continue; };
                                let Ok(terminals) = serde_json::from_value::<Vec<RegisteredTerminal>>(value["terminals"].clone()) else { continue; };
                                let system = glim_core::processes();
                                let records = terminals.into_iter().take(128).filter_map(|t| {
                                    if t.terminal_id.len() > 100 || t.name.len() > 512 { return None; }
                                    let pid = t.pid?; let process = system.process(sysinfo::Pid::from_u32(pid))?;
                                    Some(Terminal { target: Target { window_id: window_id.into(), terminal_id: t.terminal_id, name: t.name }, process: ProcessIdentity { pid, started_at: process.start_time() } })
                                }).collect();
                                if let Ok(mut state) = registry.lock() {
                                    if state.windows.get(window_id).is_some_and(|w| w.owner != owner) { continue; }
                                    state.windows.insert(window_id.into(), Window { owner: owner.clone(), terminals: records, sender: sender.clone() });
                                }
                            }
                            Some("revealed") => {
                                if let Some(id) = value.get("requestId").and_then(|v| v.as_str()) {
                                    if let Ok(mut state) = registry.lock() {
                                        if state.pending.get(id).is_some_and(|(source, _)| source == &owner) {
                                            if let Some((_, tx)) = state.pending.remove(id) { let _ = tx.send(value["ok"].as_bool() == Some(true)); }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                },
                message = outgoing.recv() => {
                    let Some(message) = message else { break; };
                    tokio::time::timeout(std::time::Duration::from_secs(2), writer.write_all(format!("{message}\n").as_bytes())).await??;
                },
                _ = tokio::time::sleep(std::time::Duration::from_secs(35)) => { break; }
            }
        }
        Ok(())
    }.await;
    if let Ok(mut state) = registry.lock() {
        state.windows.retain(|_, w| w.owner != owner);
        state.pending.retain(|_, (source, _)| source != &owner);
    }
    result
}
