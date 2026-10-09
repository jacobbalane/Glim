use crate::connectors::data_dir;
use sha2::{Digest, Sha256};

pub fn pipe_name() -> String {
    let hash = Sha256::digest(data_dir().to_string_lossy().to_lowercase().as_bytes());
    format!(r"\\.\pipe\glim-{:x}", hash)
        .chars()
        .take(50)
        .collect()
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
                pipe_name(),
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
    use tokio::io::AsyncReadExt;
    let mut server = create_server(true).map_err(|e| e.to_string())?;
    loop {
        server.connect().await.map_err(|e| e.to_string())?;
        let next = create_server(false).map_err(|e| e.to_string())?;
        let connected = server;
        server = next;
        let sender = sender.clone();
        tokio::spawn(async move {
            let mut bytes = vec![];
            if tokio::time::timeout(
                std::time::Duration::from_millis(500),
                connected.take(65537).read_to_end(&mut bytes),
            )
            .await
            .is_ok()
                && bytes.len() <= 65536
            {
                if let Ok(event) = serde_json::from_slice::<crate::model::AgentEvent>(&bytes) {
                    let _ = sender.send(event);
                }
            }
        });
    }
}
