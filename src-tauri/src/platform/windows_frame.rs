//! Keep Windows' activation border out of the transparent corners of the island.
//!
//! Tao retains caption/edge styles on a frameless top-level window and forwards WM_NCACTIVATE
//! to DefWindowProc. That default painting can expose a white frame inside our shaped region
//! after collapse and an outside click. Do not tighten the region: that clips the CSS curve's
//! antialiasing. Suppress only native frame painting, preserving Tao's focus notifications.
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{WM_NCACTIVATE, WM_NCDESTROY, WM_NCPAINT},
    },
};

const SUBCLASS_ID: usize = 0x474c494d; // GLIM

// Called from Tauri's setup on the window's owning thread, before showing it.
pub fn install(hwnd: HWND) -> Result<(), String> {
    if unsafe { SetWindowSubclass(hwnd, Some(frame_proc), SUBCLASS_ID, 0) } == 0 {
        return Err("Could not disable the island's native window frame".into());
    }
    Ok(())
}

unsafe extern "system" fn frame_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    _data: usize,
) -> LRESULT {
    match message {
        // lParam = -1 tells DefWindowProc to update activation without repainting the frame.
        // Forwarding still lets Tao emit the focus/blur events used to collapse the island.
        // https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-ncactivate
        WM_NCACTIVATE => DefSubclassProc(hwnd, message, wparam, -1),
        WM_NCPAINT => 0,
        WM_NCDESTROY => {
            RemoveWindowSubclass(hwnd, Some(frame_proc), id);
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, message, wparam, lparam),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, ptr};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, GetWindowLongPtrW, RegisterClassW,
        SendMessageW, SetWindowLongPtrW, UnregisterClassW, GWLP_USERDATA, WM_APP, WNDCLASSW,
        WS_CAPTION, WS_EX_WINDOWEDGE,
    };

    #[derive(Default)]
    struct Observed {
        frames: Cell<u32>,
        activations: Cell<u32>,
        active: Cell<bool>,
        activation_lparam: Cell<LPARAM>,
        removed_on_destroy: Cell<bool>,
    }

    unsafe extern "system" fn original(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        let state = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const Observed;
        if let Some(state) = state.as_ref() {
            match message {
                WM_NCPAINT => state.frames.set(state.frames.get() + 1),
                WM_NCACTIVATE => {
                    state.activations.set(state.activations.get() + 1);
                    state.active.set(wparam != 0);
                    state.activation_lparam.set(lparam);
                }
                WM_NCDESTROY => {
                    state
                        .removed_on_destroy
                        .set(RemoveWindowSubclass(hwnd, Some(frame_proc), SUBCLASS_ID) == 0);
                }
                WM_APP => return 42,
                _ => {}
            }
        }
        DefWindowProcW(hwnd, message, wparam, lparam)
    }

    #[test]
    fn activation_keeps_focus_notifications_without_repainting_the_frame() {
        // Real HWND and subclass dispatch; no input is sent to the user's windows.
        let class: Vec<u16> = "GlimFrameRegression\0".encode_utf16().collect();
        let state = Observed::default();
        unsafe {
            let definition = WNDCLASSW {
                lpfnWndProc: Some(original),
                lpszClassName: class.as_ptr(),
                ..std::mem::zeroed()
            };
            assert_ne!(RegisterClassW(&definition), 0);
            let hwnd = CreateWindowExW(
                WS_EX_WINDOWEDGE,
                class.as_ptr(),
                class.as_ptr(),
                WS_CAPTION,
                0,
                0,
                300,
                34,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null(),
            );
            assert!(!hwnd.is_null());
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, &state as *const Observed as isize);

            SendMessageW(hwnd, WM_NCPAINT, 1, 0);
            assert_eq!(
                state.frames.get(),
                1,
                "baseline reaches native frame painting"
            );
            install(hwnd).unwrap();
            for _ in 0..50 {
                for active in [1, 0] {
                    SendMessageW(hwnd, WM_NCACTIVATE, active, 0);
                    assert_eq!(state.active.get(), active != 0);
                    assert_eq!(state.activation_lparam.get(), -1);
                    SendMessageW(hwnd, WM_NCPAINT, 1, 0);
                }
            }
            assert_eq!(state.activations.get(), 100);
            assert_eq!(
                state.frames.get(),
                1,
                "no native frame paint after activation changes"
            );
            assert_eq!(
                SendMessageW(hwnd, WM_APP, 0, 0),
                42,
                "other messages still arrive"
            );
            DestroyWindow(hwnd);
            assert!(state.removed_on_destroy.get());
            UnregisterClassW(class.as_ptr(), ptr::null_mut());
        }
    }
}
