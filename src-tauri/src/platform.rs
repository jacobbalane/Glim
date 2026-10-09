use crate::model::Preferences;
use tauri::{AppHandle, Manager, PhysicalPosition};

#[derive(serde::Serialize)]
pub struct Display {
    pub id: String,
    pub name: String,
}
pub fn monitors(app: &AppHandle) -> Result<Vec<Display>, String> {
    app.available_monitors()
        .map(|monitors| {
            monitors
                .iter()
                .enumerate()
                .map(|(i, m)| Display {
                    id: monitor_id(m),
                    name: m
                        .name()
                        .cloned()
                        .unwrap_or_else(|| format!("Display {}", i + 1)),
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}
fn monitor_id(m: &tauri::Monitor) -> String {
    format!(
        "{}:{}:{}",
        m.name().map(String::as_str).unwrap_or("display"),
        m.position().x,
        m.position().y
    )
}
pub fn position_island(app: &AppHandle, prefs: &Preferences) -> Result<(), String> {
    let window = app
        .get_webview_window("island")
        .ok_or("Island window not found")?;
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let monitor = prefs
        .monitor
        .as_ref()
        .and_then(|id| monitors.iter().find(|m| monitor_id(m) == *id).cloned())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| monitors.first().cloned())
        .ok_or("No display detected")?;
    let (left, top, width, height) = monitor_work_area(&monitor);
    let available_height = (height as f64 / monitor.scale_factor()).clamp(120., 640.);
    let current_size = window.inner_size().map_err(|e| e.to_string())?;
    if current_size.width != (680. * monitor.scale_factor()).round() as u32
        || current_size.height != (available_height * monitor.scale_factor()).round() as u32
    {
        window
            .set_size(tauri::LogicalSize::new(680., available_height))
            .map_err(|e| e.to_string())?;
    }
    let window_width = (680. * monitor.scale_factor()) as i32;
    let x = left + (width - window_width) / 2;
    let current = window.outer_position().map_err(|e| e.to_string())?;
    if current.x != x || current.y != top {
        window
            .set_position(PhysicalPosition::new(x, top))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn monitor_work_area(m: &tauri::Monitor) -> (i32, i32, i32, i32) {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::{
            Foundation::POINT,
            Graphics::Gdi::{
                GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
            },
        };
        let handle = MonitorFromPoint(
            POINT {
                x: m.position().x + 1,
                y: m.position().y + 1,
            },
            MONITOR_DEFAULTTONEAREST,
        );
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(handle, &mut info) != 0 {
            return (
                info.rcWork.left,
                info.rcWork.top,
                info.rcWork.right - info.rcWork.left,
                info.rcWork.bottom - info.rcWork.top,
            );
        }
    }
    (
        m.position().x,
        m.position().y,
        m.size().width as i32,
        m.size().height as i32,
    )
}

pub fn shape(app: &AppHandle, width: u32, height: u32, focus: Option<bool>) -> Result<(), String> {
    let window = app
        .get_webview_window("island")
        .ok_or("Island window not found")?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Gdi::{
            CombineRgn, CreateEllipticRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject,
            SetWindowRgn, RGN_DIFF, RGN_OR,
        };
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let width = width.clamp(144, 440) as f64;
        let height = height.clamp(42, 616) as f64;
        let x = ((680. - width) / 2. * scale).round() as i32;
        let w = (width * scale).round() as i32;
        let h = (height * scale).round() as i32;
        let radius = ((19. + (width - 144.) / 296. * 7.) * scale).round() as i32;
        let shoulder = (18. * scale).round() as i32;
        unsafe {
            let round = CreateRoundRectRgn(x, -radius, x + w + 1, h + 1, radius * 2, radius * 2);
            let top = CreateRectRgn(x, 0, x + w, radius);
            CombineRgn(round, round, top, RGN_OR);
            DeleteObject(top);
            let left = CreateRectRgn(x - shoulder, 0, x, shoulder);
            let left_cut = CreateEllipticRgn(x - 2 * shoulder, 0, x, 2 * shoulder);
            CombineRgn(left, left, left_cut, RGN_DIFF);
            CombineRgn(round, round, left, RGN_OR);
            let right = CreateRectRgn(x + w, 0, x + w + shoulder, shoulder);
            let right_cut = CreateEllipticRgn(x + w, 0, x + w + 2 * shoulder, 2 * shoulder);
            CombineRgn(right, right, right_cut, RGN_DIFF);
            CombineRgn(round, round, right, RGN_OR);
            for region in [left, left_cut, right, right_cut] {
                DeleteObject(region);
            }
            if SetWindowRgn(hwnd as _, round, 1) == 0 {
                DeleteObject(round);
                return Err(std::io::Error::last_os_error().to_string());
            }
            // Windows owns the region after successful SetWindowRgn.
        }
        if let Some(expanded) = focus {
            window.set_focusable(expanded).map_err(|e| e.to_string())?;
            if expanded {
                window.set_focus().map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
pub fn fullscreen_over_island(app: &AppHandle) -> bool {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::{
            Foundation::RECT,
            Graphics::Gdi::{
                GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
            },
            UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect},
        };
        let foreground = GetForegroundWindow();
        if foreground.is_null() {
            return false;
        }
        for name in ["island", "settings", "setup", "history"] {
            if app
                .get_webview_window(name)
                .and_then(|w| w.hwnd().ok())
                .map(|h| std::ptr::eq(h.0, foreground))
                .unwrap_or(false)
            {
                return false;
            }
        }
        let mut class = [0u16; 256];
        let count = GetClassNameW(foreground, class.as_mut_ptr(), class.len() as i32);
        let class = String::from_utf16_lossy(&class[..count.max(0) as usize]);
        if ["Progman", "WorkerW", "Shell_TrayWnd"].contains(&class.as_str()) {
            return false;
        }
        let mut rect: RECT = std::mem::zeroed();
        if GetWindowRect(foreground, &mut rect) == 0 {
            return false;
        }
        let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
        let Some(island) = app.get_webview_window("island").and_then(|w| w.hwnd().ok()) else {
            return false;
        };
        if MonitorFromWindow(island.0 as _, MONITOR_DEFAULTTONEAREST) != monitor {
            return false;
        }
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut info) != 0 {
            return rect.left <= info.rcMonitor.left
                && rect.top <= info.rcMonitor.top
                && rect.right >= info.rcMonitor.right
                && rect.bottom >= info.rcMonitor.bottom;
        }
    }
    false
}
pub fn autostart(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Registry::{
            RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegSetValueExW, HKEY_CURRENT_USER,
            KEY_SET_VALUE, REG_SZ,
        };
        let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        let name: Vec<u16> = "Glim".encode_utf16().chain(Some(0)).collect();
        let mut handle = std::ptr::null_mut();
        let status = RegOpenKeyExW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut handle,
        );
        if status != 0 {
            return Err(format!("Could not open startup settings ({status})"));
        }
        let status = if enabled {
            let value: Vec<u16> = format!(
                "\"{}\"",
                std::env::current_exe()
                    .map_err(|e| e.to_string())?
                    .display()
            )
            .encode_utf16()
            .chain(Some(0))
            .collect();
            RegSetValueExW(
                handle,
                name.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr().cast(),
                (value.len() * 2) as u32,
            )
        } else {
            RegDeleteValueW(handle, name.as_ptr())
        };
        RegCloseKey(handle);
        if status != 0 && status != 2 {
            return Err(format!("Could not update startup settings ({status})"));
        }
    }
    Ok(())
}
