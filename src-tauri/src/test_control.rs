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

/// Whether the pointer passes through the island's window where it is now, with where Glim sees
/// the pointer, the window and the island's shape (macOS debug builds).
#[tauri::command]
pub fn test_pointer(app: tauri::AppHandle) -> serde_json::Value {
    pointer_state(&app)
}
#[cfg(all(debug_assertions, target_os = "macos"))]
fn pointer_state(app: &tauri::AppHandle) -> serde_json::Value {
    let passes = match crate::platform::POINTER.load(std::sync::atomic::Ordering::Relaxed) {
        1 => Some(true),
        2 => Some(false),
        _ => None,
    };
    let window = crate::platform::island(app);
    serde_json::json!({
        "passes": passes,
        "pointer": app.cursor_position().ok().map(|p| [p.x, p.y]),
        "origin": window.as_ref().and_then(|w| w.outer_position().ok()).map(|p| [p.x, p.y]),
        "scale": window.as_ref().and_then(|w| w.scale_factor().ok()),
        "shape": crate::platform::shape_box(app),
    })
}
#[cfg(not(all(debug_assertions, target_os = "macos")))]
fn pointer_state(app: &tauri::AppHandle) -> serde_json::Value {
    let _ = app;
    serde_json::json!({ "passes": null })
}

/// How many sources the main run loop holds (macOS debug builds). Each clone of a window's
/// handle adds one that tao never removes (see platform::island); the smoke test checks that an
/// idle Glim no longer adds them.
#[tauri::command]
pub fn test_run_loop_sources() -> Option<usize> {
    run_loop_sources()
}
#[cfg(all(debug_assertions, target_os = "macos"))]
fn run_loop_sources() -> Option<usize> {
    use std::ffi::{c_char, c_void, CStr};
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRunLoopGetMain() -> *const c_void;
        fn CFCopyDescription(cf: *const c_void) -> *const c_void;
        fn CFStringGetLength(string: *const c_void) -> isize;
        fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut c_char,
            size: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(cf: *const c_void);
    }
    const UTF8: u32 = 0x0800_0100;
    // The run loop's own description lists every source in each of its modes.
    unsafe {
        let description = CFCopyDescription(CFRunLoopGetMain());
        if description.is_null() {
            return None;
        }
        let size = CFStringGetMaximumSizeForEncoding(CFStringGetLength(description), UTF8) + 1;
        let mut buffer = vec![0 as c_char; size as usize];
        let copied = CFStringGetCString(description, buffer.as_mut_ptr(), size, UTF8);
        CFRelease(description);
        copied.then(|| {
            CStr::from_ptr(buffer.as_ptr())
                .to_string_lossy()
                .matches("<CFRunLoopSource ")
                .count()
        })
    }
}
#[cfg(not(all(debug_assertions, target_os = "macos")))]
fn run_loop_sources() -> Option<usize> {
    None
}

#[cfg(all(debug_assertions, unix))]
pub fn start(app: tauri::AppHandle) {
    use std::io::{Read, Write};
    use std::os::unix::fs::PermissionsExt;
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
                       error => ({{ error: [String(error), error && error.stack].filter(Boolean).join('\\n') }}))\
                 .then(result => window.__TAURI_INTERNALS__.invoke('test_report',\
                       {{ id: {id}, result: JSON.stringify(result) }}))"
            );
            let answer = match crate::platform::island(&app) {
                Some(island) if island.eval(&wrapped).is_ok() => receiver
                    .recv_timeout(std::time::Duration::from_secs(30))
                    .unwrap_or_else(|_| r#"{"error":"No answer from the island"}"#.into()),
                _ => r#"{"error":"The island is not open"}"#.into(),
            };
            let _ = stream.write_all(answer.as_bytes());
        }
    });
}
