//! Which agent a hook came from, and whether it is still open. Glim lists the sessions you have
//! open: once an agent's process is gone, its session ends, even when the terminal was closed
//! without the agent saying goodbye. A process is its id plus its start time, so a later process
//! that reuses the id is never mistaken for it.

/// Every running process: its parent and its lowercase file name.
#[cfg(windows)]
fn processes() -> std::collections::HashMap<u32, (u32, String)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let mut all = std::collections::HashMap::new();
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return all;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        while more {
            let name = &entry.szExeFile;
            let len = name.iter().position(|&c| c == 0).unwrap_or(name.len());
            let name = String::from_utf16_lossy(&name[..len]).to_ascii_lowercase();
            all.insert(entry.th32ProcessID, (entry.th32ParentProcessID, name));
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
    }
    all
}

/// The agent that ran this hook: the nearest ancestor that is not a shell.
#[cfg(windows)]
pub fn agent() -> Option<(u32, u64)> {
    // Hooks run through Git Bash or cmd on Windows, sometimes through a launcher bash first.
    const SHELLS: [&str; 6] = [
        "bash.exe",
        "sh.exe",
        "cmd.exe",
        "powershell.exe",
        "pwsh.exe",
        "conhost.exe",
    ];
    let parents = processes();
    let mut pid = parents.get(&std::process::id())?.0;
    for _ in 0..8 {
        let (parent, name) = parents.get(&pid)?;
        if !SHELLS.contains(&name.as_str()) {
            return started(pid).filter(|&at| at != 0).map(|at| (pid, at));
        }
        pid = *parent;
    }
    None
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn agent() -> Option<(u32, u64)> {
    None
}

/// When a process started, as a Windows FILETIME; 0 once it has exited. None when Windows
/// would not open it.
#[cfg(windows)]
fn started(pid: u32) -> Option<u64> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut code = 0;
        let mut t = [FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        }; 4];
        let running = GetExitCodeProcess(handle, &mut code) != 0 && code == STILL_ACTIVE as u32;
        let timed = GetProcessTimes(handle, &mut t[0], &mut t[1], &mut t[2], &mut t[3]) != 0;
        CloseHandle(handle);
        Some(if running && timed {
            (t[0].dwHighDateTime as u64) << 32 | t[0].dwLowDateTime as u64
        } else {
            0
        })
    }
}

/// Whether the agent is still running.
#[cfg(windows)]
pub fn is_open((pid, at): (u32, u64)) -> bool {
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_INVALID_PARAMETER};
    match started(pid) {
        Some(time) => time == at,
        // Only "no such process" proves it closed; access denied does not.
        None => (unsafe { GetLastError() }) != ERROR_INVALID_PARAMETER,
    }
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn is_open(_: (u32, u64)) -> bool {
    true
}

/// Brings the window the agent runs in to the front: its console window (Windows Terminal hands
/// out a stand-in owned by its own window), else the window of the terminal that hosts its console
/// (VS Code), else the nearest window up its own family. Of several windows, the one named after the
/// project. Windows lets Glim do this only right after the person clicked it; a terminal's tabs stay
/// as they are.
#[cfg(windows)]
pub fn show(pid: u32, project: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };
    let Some(window) = console_window(pid)
        .or_else(|| console_host(pid).and_then(|host| family_window(host, project)))
        .or_else(|| family_window(pid, project))
    else {
        return false;
    };
    unsafe {
        if IsIconic(window) != 0 {
            ShowWindow(window, SW_RESTORE);
        }
        SetForegroundWindow(window) != 0
    }
}
#[cfg(not(any(windows, target_os = "macos")))]
pub fn show(_: u32, _: &str) -> bool {
    false
}

#[cfg(windows)]
type Window = windows_sys::Win32::Foundation::HWND;

#[cfg(windows)]
fn console_window(pid: u32) -> Option<Window> {
    use windows_sys::Win32::System::Console::{AttachConsole, FreeConsole, GetConsoleWindow};
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetAncestor, IsWindowVisible, GA_ROOTOWNER};
    unsafe {
        // Glim has no console of its own, so it can borrow the agent's for a moment.
        if AttachConsole(pid) == 0 {
            return None;
        }
        let console = GetConsoleWindow();
        FreeConsole();
        if console.is_null() {
            return None;
        }
        let owner = GetAncestor(console, GA_ROOTOWNER);
        let window = if owner.is_null() { console } else { owner };
        (IsWindowVisible(window) != 0).then_some(window)
    }
}

/// The process hosting the agent's console: a terminal's OpenConsole or conhost. The agent's own
/// parents may be long gone; its console host lives as long as the terminal tab.
#[cfg(windows)]
fn console_host(pid: u32) -> Option<u32> {
    use windows_sys::Wdk::System::Threading::NtQueryInformationProcess;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    // ProcessConsoleHostProcess: not in the SDK headers, used the same way by Process Explorer.
    const CONSOLE_HOST: i32 = 49;
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut host: usize = 0;
        let status = NtQueryInformationProcess(
            handle,
            CONSOLE_HOST,
            &mut host as *mut usize as *mut _,
            std::mem::size_of::<usize>() as u32,
            std::ptr::null_mut(),
        );
        CloseHandle(handle);
        // The two low bits are flags.
        (status == 0 && host > 3).then_some((host & !3) as u32)
    }
}

#[cfg(windows)]
fn family_window(pid: u32, project: &str) -> Option<Window> {
    use windows_sys::Win32::Foundation::{LPARAM, TRUE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
    };
    unsafe extern "system" fn collect(window: Window, list: LPARAM) -> i32 {
        let list = &mut *(list as *mut Vec<(Window, u32, String)>);
        if IsWindowVisible(window) != 0 && GetWindow(window, GW_OWNER).is_null() {
            let mut title = [0u16; 256];
            let len = GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32);
            if len > 0 {
                let mut pid = 0;
                GetWindowThreadProcessId(window, &mut pid);
                let title = String::from_utf16_lossy(&title[..len as usize]).to_lowercase();
                list.push((window, pid, title));
            }
        }
        TRUE
    }
    let mut windows: Vec<(Window, u32, String)> = vec![];
    unsafe { EnumWindows(Some(collect), &mut windows as *mut _ as LPARAM) };
    let all = processes();
    let project = project.to_lowercase();
    let mut pid = pid;
    for _ in 0..12 {
        let (parent, name) = all.get(&pid)?;
        // The desktop and taskbar are not where an agent runs.
        if name == "explorer.exe" {
            return None;
        }
        let own: Vec<_> = windows.iter().filter(|w| w.1 == pid).collect();
        if let Some(first) = own.first() {
            return Some(
                own.iter()
                    .find(|w| w.2.contains(&project))
                    .unwrap_or(first)
                    .0,
            );
        }
        pid = *parent;
    }
    None
}

// macOS: the kernel's own record of each process, through proc_pidinfo.

/// A process's record: its parent, name, start and terminal. None once it has exited (ESRCH) or
/// when the kernel will not say (EPERM).
#[cfg(target_os = "macos")]
fn record(pid: u32) -> Option<libc::proc_bsdinfo> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let size = std::mem::size_of::<libc::proc_bsdinfo>() as i32;
    let read = unsafe {
        libc::proc_pidinfo(
            pid as i32,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size,
        )
    };
    (read == size).then_some(info)
}
#[cfg(target_os = "macos")]
fn name_of(info: &libc::proc_bsdinfo) -> String {
    let raw: &[libc::c_char] = if info.pbi_name[0] != 0 {
        &info.pbi_name
    } else {
        &info.pbi_comm
    };
    let bytes: Vec<u8> = raw
        .iter()
        .take_while(|&&c| c != 0)
        .map(|&c| c as u8)
        .collect();
    String::from_utf8_lossy(&bytes).to_ascii_lowercase()
}
/// When it started, in microseconds since 1970.
#[cfg(target_os = "macos")]
fn start_of(info: &libc::proc_bsdinfo) -> u64 {
    info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec
}

#[cfg(target_os = "macos")]
pub fn agent() -> Option<(u32, u64)> {
    // Hooks run through the person's shell, sometimes through login first.
    const SHELLS: [&str; 8] = ["zsh", "bash", "sh", "dash", "fish", "tcsh", "ksh", "login"];
    let mut pid = std::os::unix::process::parent_id();
    for _ in 0..8 {
        let info = record(pid)?;
        if !SHELLS.contains(&name_of(&info).trim_start_matches('-')) {
            return Some((pid, start_of(&info)));
        }
        pid = info.pbi_ppid;
    }
    None
}

#[cfg(target_os = "macos")]
pub fn is_open((pid, at): (u32, u64)) -> bool {
    match record(pid) {
        Some(info) => start_of(&info) == at,
        // Only "no such process" proves it closed; "not permitted" does not.
        None => std::io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH),
    }
}

/// Brings the app the agent runs in to the front: the nearest ancestor macOS knows as an app
/// (Terminal, iTerm2, VS Code, Warp, Ghostty…). In Terminal and iTerm2 it also selects the agent's
/// own tab, by the agent's terminal device; macOS asks once whether Glim may do that.
#[cfg(target_os = "macos")]
pub fn show(pid: u32, _project: &str) -> bool {
    use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication};
    let tty = record(pid).and_then(|info| tty_of(info.e_tdev));
    let mut ancestor = pid;
    for _ in 0..16 {
        if let Some(app) =
            NSRunningApplication::runningApplicationWithProcessIdentifier(ancestor as libc::pid_t)
        {
            if app.activationPolicy() == NSApplicationActivationPolicy::Regular {
                let bundle = app.bundleIdentifier().map(|id| id.to_string());
                // AppleScript may wait on the permission prompt; never on the main thread.
                std::thread::spawn(move || {
                    if let (Some(bundle), Some(tty)) = (bundle, tty) {
                        select_tab(&bundle, &tty);
                    }
                    activate(ancestor);
                });
                return true;
            }
        }
        match record(ancestor) {
            Some(info) if info.pbi_ppid > 1 => ancestor = info.pbi_ppid,
            _ => break,
        }
    }
    false
}
#[cfg(target_os = "macos")]
fn activate(pid: u32) {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    if let Some(app) =
        NSRunningApplication::runningApplicationWithProcessIdentifier(pid as libc::pid_t)
    {
        // Needed on macOS 13; macOS 14 and later activate cooperatively and ignore it.
        #[allow(deprecated)]
        app.activateWithOptions(NSApplicationActivationOptions::ActivateIgnoringOtherApps);
    }
}
/// The terminal device a process writes to, such as "/dev/ttys003".
#[cfg(target_os = "macos")]
fn tty_of(device: u32) -> Option<String> {
    if device == 0 || device == u32::MAX {
        return None;
    }
    let name = unsafe { libc::devname(device as libc::dev_t, libc::S_IFCHR) };
    if name.is_null() {
        return None;
    }
    let name = unsafe { std::ffi::CStr::from_ptr(name) }.to_string_lossy();
    (name != "??").then(|| format!("/dev/{name}"))
}
#[cfg(target_os = "macos")]
fn select_tab(bundle: &str, tty: &str) {
    let script = match bundle {
        "com.apple.Terminal" => format!(
            r#"tell application "Terminal"
                repeat with w in windows
                    repeat with t in tabs of w
                        if tty of t is "{tty}" then
                            set selected of t to true
                            set index of w to 1
                        end if
                    end repeat
                end repeat
            end tell"#
        ),
        "com.googlecode.iterm2" => format!(
            r#"tell application "iTerm2"
                repeat with w in windows
                    repeat with t in tabs of w
                        repeat with s in sessions of t
                            if tty of s is "{tty}" then
                                tell w to select
                                tell t to select
                                tell s to select
                            end if
                        end repeat
                    end repeat
                end repeat
            end tell"#
        ),
        _ => return,
    };
    let _ = std::process::Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .output();
}

#[cfg(all(test, target_os = "macos"))]
mod mac_tests {
    use super::*;
    #[test]
    fn a_running_process_is_open_and_a_gone_or_reused_one_is_not() {
        let me = std::process::id();
        let at = start_of(&record(me).unwrap());
        assert!(is_open((me, at)));
        // The same id with another start time is a different process.
        assert!(!is_open((me, at - 1)));
        // Above the kernel's process id limit, so it never exists.
        assert!(!is_open((999_999_999, 1)));
    }
    #[test]
    fn a_process_knows_its_parent_and_name() {
        let info = record(std::process::id()).unwrap();
        assert_eq!(info.pbi_ppid, std::os::unix::process::parent_id());
        assert!(!name_of(&info).is_empty());
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn a_running_process_is_open_and_a_gone_or_reused_one_is_not() {
        let me = std::process::id();
        let at = started(me).unwrap();
        assert!(is_open((me, at)));
        // The same id with another start time is a different process.
        assert!(!is_open((me, at - 1)));
        // Process ids are multiples of four, so this one never exists.
        assert!(!is_open((u32::MAX - 2, 1)));
    }
}
