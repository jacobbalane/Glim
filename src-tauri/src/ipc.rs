//! How agents' hooks reach Glim: a named pipe on Windows, a socket file on macOS. Each is open to
//! the signed-in user only, and carries one small JSON event per connection.
use crate::connectors::data_dir;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

/// Where the helper sends events. One per data folder, so isolated test instances never meet.
pub fn endpoint() -> PathBuf {
    let hash = Sha256::digest(data_dir().to_string_lossy().to_lowercase().as_bytes());
    #[cfg(windows)]
    return format!(r"\\.\pipe\glim-{:x}", hash)
        .chars()
        .take(50)
        .collect::<String>()
        .into();
    // The per-user temporary folder (mode 0700 on macOS) keeps the path within the 104 bytes a
    // socket address can hold.
    #[cfg(unix)]
    return std::env::temp_dir().join(format!("glim-{}.sock", &format!("{hash:x}")[..16]));
}

/// Reads one event from a connection: at most 64 KB, within half a second.
async fn receive<R: tokio::io::AsyncRead + Unpin>(
    stream: R,
    sender: std::sync::mpsc::Sender<crate::model::AgentEvent>,
) {
    use tokio::io::AsyncReadExt;
    let mut bytes = vec![];
    if tokio::time::timeout(
        std::time::Duration::from_millis(500),
        stream.take(65537).read_to_end(&mut bytes),
    )
    .await
    .is_ok()
        && bytes.len() <= 65536
    {
        if let Ok(event) = serde_json::from_slice::<crate::model::AgentEvent>(&bytes) {
            let _ = sender.send(event);
        }
    }
}

#[cfg(windows)]
pub fn create_server(
    first: bool,
) -> std::io::Result<tokio::net::windows::named_pipe::NamedPipeServer> {
    use std::{ffi::c_void, ptr};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, LocalFree},
        Security::{
            Authorization::{
                ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            },
            GetTokenInformation, TokenUser, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER,
        },
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    };
    unsafe {
        let mut token = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(std::io::Error::last_os_error());
        }
        let mut length = 0;
        GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut length);
        // TOKEN_USER requires pointer alignment, hence a usize buffer.
        let mut buffer = vec![0usize; (length as usize).div_ceil(std::mem::size_of::<usize>())];
        let ok = GetTokenInformation(
            token,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            length,
            &mut length,
        );
        CloseHandle(token);
        if ok == 0 {
            return Err(std::io::Error::last_os_error());
        }
        let user = &*(buffer.as_ptr() as *const TOKEN_USER);
        let mut sid_string = ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut sid_string) == 0 {
            return Err(std::io::Error::last_os_error());
        }
        let mut len = 0;
        while *sid_string.add(len) != 0 {
            len += 1;
        }
        let sid = String::from_utf16_lossy(std::slice::from_raw_parts(sid_string, len));
        LocalFree(sid_string.cast());
        let sddl: Vec<u16> = format!("D:P(A;;GA;;;{sid})")
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return Err(std::io::Error::last_os_error());
        }
        let mut attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        let result = tokio::net::windows::named_pipe::ServerOptions::new()
            .first_pipe_instance(first)
            .reject_remote_clients(true)
            .access_outbound(false)
            .create_with_security_attributes_raw(
                endpoint(),
                (&mut attributes as *mut SECURITY_ATTRIBUTES).cast::<c_void>(),
            );
        LocalFree(descriptor);
        result
    }
}

#[cfg(windows)]
pub async fn serve(
    sender: std::sync::mpsc::Sender<crate::model::AgentEvent>,
) -> Result<(), String> {
    let mut server = create_server(true).map_err(|e| e.to_string())?;
    loop {
        server.connect().await.map_err(|e| e.to_string())?;
        let next = create_server(false).map_err(|e| e.to_string())?;
        let connected = server;
        server = next;
        tokio::spawn(receive(connected, sender.clone()));
    }
}

#[cfg(unix)]
pub async fn serve(
    sender: std::sync::mpsc::Sender<crate::model::AgentEvent>,
) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let path = endpoint();
    // A socket left by an earlier run; the single-instance guard means nothing still listens.
    let _ = std::fs::remove_file(&path);
    let listener = tokio::net::UnixListener::bind(&path).map_err(|e| e.to_string())?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    let me = unsafe { libc::getuid() };
    loop {
        let (stream, _) = listener.accept().await.map_err(|e| e.to_string())?;
        // Only the signed-in user's own processes, whatever the file's mode.
        if stream.peer_cred().map(|c| c.uid()).ok() != Some(me) {
            continue;
        }
        tokio::spawn(receive(stream, sender.clone()));
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    // Two threads: the test waits for the event while the server accepts it.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn an_event_crosses_the_socket_and_the_socket_is_private() {
        use std::os::unix::fs::PermissionsExt;
        std::env::set_var(
            "GLIM_DATA_DIR",
            std::env::temp_dir().join(format!("glim-ipc-{}", uuid::Uuid::new_v4())),
        );
        let (sender, receiver) = std::sync::mpsc::channel();
        tokio::spawn(serve(sender));
        let path = endpoint();
        for _ in 0..50 {
            if path.exists() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        let event = crate::normalize::hook_event(
            crate::model::Provider::Claude,
            serde_json::json!({ "session_id": "s", "hook_event_name": "Stop" }),
            false,
        )
        .unwrap();
        use std::io::Write;
        let mut stream = std::os::unix::net::UnixStream::connect(&path).unwrap();
        stream
            .write_all(&serde_json::to_vec(&event).unwrap())
            .unwrap();
        drop(stream);
        let got = receiver
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        assert_eq!(got.session_id, "s");
    }
}
