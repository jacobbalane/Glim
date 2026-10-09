#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use glim_lib::{connectors, ipc, model::Provider, normalize::hook_event};
use std::io::{Read, Write};

fn main() {
    // Monitoring is advisory: malformed input, a busy pipe, or a stopped app never fails an agent hook.
    let _ = run();
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("disconnect-all") {
        connectors::disconnect_all();
        return Ok(());
    }
    let statusline = args.first().map(String::as_str) == Some("statusline");
    let provider = if statusline {
        Provider::Claude
    } else {
        match args.get(1).and_then(|s| Provider::parse(s)) {
            Some(p) => p,
            None => return Ok(()),
        }
    };
    let mut bytes = Vec::new();
    std::io::stdin().take(1024 * 1024).read_to_end(&mut bytes)?;
    if let Ok(input) = serde_json::from_slice(&bytes) {
        if let Some(event) = hook_event(provider, input, statusline) {
            let payload = serde_json::to_vec(&event)?;
            if payload.len() <= 65536 {
                for attempt in 0..3 {
                    match std::fs::OpenOptions::new()
                        .write(true)
                        .open(ipc::pipe_name())
                    {
                        Ok(mut pipe) => {
                            let _ = pipe.write_all(&payload);
                            break;
                        }
                        Err(_) if attempt < 2 => {
                            std::thread::sleep(std::time::Duration::from_millis(5))
                        }
                        Err(_) => {}
                    }
                }
            }
        }
    }
    if statusline {
        if let Some(relay) = args
            .iter()
            .position(|s| s == "--relay")
            .and_then(|i| args.get(i + 1))
        {
            let previous: Option<serde_json::Value> = std::fs::read(relay)
                .ok()
                .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
                .and_then(|v| v.get("previous").cloned());
            if let Some(command) = previous
                .as_ref()
                .and_then(|v| v.get("command"))
                .and_then(|v| v.as_str())
            {
                relay_command(command, &bytes);
            } else if let Ok(input) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                let model = input
                    .pointer("/model/display_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Claude Code");
                let _ = writeln!(std::io::stdout(), "{model}");
            }
        }
    }
    Ok(())
}
fn relay_command(command: &str, input: &[u8]) {
    use std::process::{Command, Stdio};
    let bash = std::env::var_os("CLAUDE_CODE_GIT_BASH_PATH")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            [
                "C:/Program Files/Git/bin/bash.exe",
                "C:/Program Files/Git/usr/bin/bash.exe",
            ]
            .into_iter()
            .map(std::path::PathBuf::from)
            .find(|p| p.exists())
        });
    let mut child = if let Some(bash) = bash {
        let mut cmd = Command::new(bash);
        cmd.args(["-c", command]);
        cmd
    } else {
        let mut cmd = Command::new("cmd.exe");
        cmd.args(["/D", "/S", "/C", command]);
        cmd
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        child.creation_flags(0x08000000);
    }
    if let Ok(mut process) = child
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
    {
        if let Some(mut stdin) = process.stdin.take() {
            let _ = stdin.write_all(input);
        }
        let _ = process.wait();
    }
}
