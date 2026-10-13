//! A remote for the macOS native smoke test, compiled into debug builds only. Windows drives the
//! island through WebView2's debugging port; macOS's WebKit view has none, so the smoke test sends
//! JavaScript over a socket beside Glim's own, and Glim runs it in the island and answers with its
//! result. Off unless `GLIM_TEST_CONTROL` is set.

/// Results waiting for the test, by request.
#[cfg(debug_assertions)]
fn pending(
) -> &'static std::sync::Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<String>>> {
    static PENDING: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<u64, std::sync::mpsc::Sender<String>>>,
    > = std::sync::OnceLock::new();
    PENDING.get_or_init(Default::default)
}

/// Where the island hands back what a test's script returned.
#[tauri::command]
pub fn test_report(id: u64, result: String) {
    #[cfg(debug_assertions)]
    if let Some(sender) = pending().lock().ok().and_then(|mut p| p.remove(&id)) {
        let _ = sender.send(result);
    }
    #[cfg(not(debug_assertions))]
    let _ = (id, result);
}

/// Whether the pointer passes through the island's window where it is now (macOS debug builds).
#[tauri::command]
pub fn test_pointer() -> Option<bool> {
    pointer_passes()
}
#[cfg(all(debug_assertions, target_os = "macos"))]
fn pointer_passes() -> Option<bool> {
    match crate::platform::POINTER.load(std::sync::atomic::Ordering::Relaxed) {
        1 => Some(true),
        2 => Some(false),
        _ => None,
    }
}
#[cfg(not(all(debug_assertions, target_os = "macos")))]
fn pointer_passes() -> Option<bool> {
    None
}

#[cfg(all(debug_assertions, unix))]
pub fn start(app: tauri::AppHandle) {
    use std::io::{Read, Write};
    use std::os::unix::fs::PermissionsExt;
    use tauri::Manager;
    if std::env::var_os("GLIM_TEST_CONTROL").is_none() {
        return;
    }
    let path = crate::ipc::endpoint().with_extension("test");
    let _ = std::fs::remove_file(&path);
    let Ok(listener) = std::os::unix::net::UnixListener::bind(&path) else {
        return;
    };
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    std::thread::spawn(move || {
        let mut next = 0u64;
        for mut stream in listener.incoming().flatten() {
            let mut script = String::new();
            if stream.read_to_string(&mut script).is_err() {
                continue;
            }
            next += 1;
            let id = next;
            let (sender, receiver) = std::sync::mpsc::channel();
            if let Ok(mut waiting) = pending().lock() {
                waiting.insert(id, sender);
            }
            // The script is the body of an async function; its return value comes back as JSON.
            let wrapped = format!(
                "(async () => {{ {script}\n }})()\
                 .then(value => ({{ value: value === undefined ? null : value }}),\
                       error => ({{ error: String((error && error.stack) || error) }}))\
                 .then(result => window.__TAURI_INTERNALS__.invoke('test_report',\
                       {{ id: {id}, result: JSON.stringify(result) }}))"
            );
            let answer = match app.get_webview_window("island") {
                Some(island) if island.eval(&wrapped).is_ok() => receiver
                    .recv_timeout(std::time::Duration::from_secs(30))
                    .unwrap_or_else(|_| r#"{"error":"No answer from the island"}"#.into()),
                _ => r#"{"error":"The island is not open"}"#.into(),
            };
            let _ = stream.write_all(answer.as_bytes());
        }
    });
}
