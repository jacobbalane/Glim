use crate::model::Preferences;
use tauri::{AppHandle, Manager, PhysicalPosition};

#[derive(Default)]
pub struct IslandShape(std::sync::Mutex<ShapeState>);

struct ShapeState {
    width: u32,
    height: u32,
    side: Option<Side>,
    applied: Option<RegionGeometry>,
}
impl Default for ShapeState {
    fn default() -> Self {
        Self {
            width: 300,
            height: 34,
            side: None,
            applied: None,
        }
    }
}

/// A panel beside the open island, such as an agent's full message, in logical pixels from the
/// window's top left.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
pub struct Side {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// Logical dimensions match IslandSurface.tsx and the 8px shoulders in styles.css.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct RegionGeometry {
    x: i32,
    width: i32,
    height: i32,
    radius: i32,
    shoulder: i32,
    /// The side panel's left, top, width, height and corner radius.
    side: Option<[i32; 5]>,
}
impl RegionGeometry {
    fn new(width: u32, height: u32, scale: f64, host_width: u32, side: Option<Side>) -> Self {
        let px = |v: f64| (v * scale).round() as i32;
        let wide = (host_width as f64 / scale - 40.).clamp(204., 440.);
        let cap = 360_f64.min(wide - 60.);
        // Around a Mac's notch the compact island can be wider than the open one.
        let logical_width = (width as f64).clamp(144., (host_width as f64 / scale).max(144.));
        let radius = 17. + ((logical_width - cap) / (wide - cap)).clamp(0., 1.) * 7.;
        let width = (logical_width * scale).round() as i32;
        Self {
            x: ((host_width as f64 - width as f64) / 2.).round() as i32,
            width,
            height: (height.clamp(34, 616) as f64 * scale).round() as i32,
            radius: (radius * scale).round() as i32,
            shoulder: (8. * scale).round() as i32,
            side: side.map(|s| [px(s.x), px(s.y), px(s.width), px(s.height), px(14.)]),
        }
    }
    /// Whether a point, in the window's physical pixels, is on the island or its side panel.
    #[cfg(any(target_os = "macos", test))]
    fn contains(&self, x: f64, y: f64) -> bool {
        let within = |left: i32, top: i32, width: i32, height: i32| {
            x >= left as f64
                && x < (left + width) as f64
                && y >= top as f64
                && y < (top + height) as f64
        };
        within(self.x, 0, self.width, self.height)
            || self
                .side
                .is_some_and(|[left, top, width, height, _]| within(left, top, width, height))
    }
}

#[cfg(windows)]
mod region {
    use super::RegionGeometry;
    use windows_sys::Win32::Graphics::Gdi::{
        CombineRgn, CreateEllipticRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, HRGN,
        RGN_AND, RGN_DIFF, RGN_OR,
    };

    pub(super) struct Region(pub HRGN);
    impl Region {
        fn owned(handle: HRGN) -> Result<Self, String> {
            if handle.is_null() {
                Err(std::io::Error::last_os_error().to_string())
            } else {
                Ok(Self(handle))
            }
        }
        fn combine(&self, other: &Self, mode: i32) -> Result<(), String> {
            if unsafe { CombineRgn(self.0, self.0, other.0, mode) } == 0 {
                Err(std::io::Error::last_os_error().to_string())
            } else {
                Ok(())
            }
        }
        pub fn transfer(self) {
            std::mem::forget(self);
        }
    }
    impl Drop for Region {
        fn drop(&mut self) {
            unsafe {
                DeleteObject(self.0);
            }
        }
    }
    pub(super) fn create(g: RegionGeometry) -> Result<Region, String> {
        let RegionGeometry {
            x,
            width: w,
            height: h,
            radius: r,
            shoulder: s,
            side,
        } = g;
        unsafe {
            // The region's corners are a little tighter than the painted ones, so the curve's soft
            // edge is drawn whole instead of cut into steps; it costs a sliver of corner pixels.
            let soft = (r - 4).max(1);
            let body = Region::owned(CreateRoundRectRgn(
                x,
                -soft,
                x + w + 1,
                h + 1,
                soft * 2,
                soft * 2,
            ))?;
            // GDI's rounded primitive needs the extra endpoint pixel. Clip to the exact
            // painted extent so neither the first transparent bottom row nor the area
            // above the screen becomes part of the window's hit region.
            let bounds = Region::owned(CreateRectRgn(x, 0, x + w, h))?;
            body.combine(&bounds, RGN_AND)?;
            let top = Region::owned(CreateRectRgn(x, 0, x + w, r.min(h)))?;
            body.combine(&top, RGN_OR)?;
            let left = Region::owned(CreateRectRgn(x - s, 0, x, s))?;
            let left_cut = Region::owned(CreateEllipticRgn(x - 2 * s, 0, x, 2 * s))?;
            left.combine(&left_cut, RGN_DIFF)?;
            body.combine(&left, RGN_OR)?;
            let right = Region::owned(CreateRectRgn(x + w, 0, x + w + s, s))?;
            let right_cut = Region::owned(CreateEllipticRgn(x + w, 0, x + w + 2 * s, 2 * s))?;
            right.combine(&right_cut, RGN_DIFF)?;
            body.combine(&right, RGN_OR)?;
            if let Some([x, y, w, h, r]) = side {
                let panel = Region::owned(CreateRoundRectRgn(
                    x,
                    y,
                    x + w + 1,
                    y + h + 1,
                    r * 2 - 8,
                    r * 2 - 8,
                ))?;
                body.combine(&panel, RGN_OR)?;
            }
            Ok(body)
        }
    }
}

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
    // Room beside the open island for a side panel. The window's region keeps the rest of it
    // transparent to the pointer.
    let available_width = (width as f64 / monitor.scale_factor()).clamp(320., 1200.);
    let size = tauri::PhysicalSize::new(
        (available_width * monitor.scale_factor()).round() as u32,
        (available_height * monitor.scale_factor()).round() as u32,
    );
    if window.inner_size().map_err(|e| e.to_string())? != size {
        window.set_size(size).map_err(|e| e.to_string())?;
    }
    let window_width = size.width as i32;
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

pub fn shape(
    app: &AppHandle,
    width: u32,
    height: u32,
    side: Option<Side>,
    focus: Option<bool>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("island")
        .ok_or("Island window not found")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let host_width = window.inner_size().map_err(|e| e.to_string())?.width;
    let geometry = RegionGeometry::new(width, height, scale, host_width, side);
    let state = app.state::<IslandShape>();
    let changed = {
        let mut state = state.0.lock().map_err(|e| e.to_string())?;
        state.width = width;
        state.height = height;
        state.side = side;
        let changed = state.applied != Some(geometry);
        // SetWindowRgn sends window-position events. Cache before applying so
        // a resulting resize callback cannot recursively apply the same region.
        state.applied = Some(geometry);
        changed
    };
    // On Windows the shape is the window's region. macOS has no regions: follow_pointer lets
    // the pointer through wherever the shape is not.
    #[cfg(windows)]
    if changed {
        use windows_sys::Win32::Graphics::Gdi::SetWindowRgn;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
        let apply = || -> Result<(), String> {
            let region = region::create(geometry)?;
            if unsafe { SetWindowRgn(hwnd as _, region.0, 1) } == 0 {
                return Err(std::io::Error::last_os_error().to_string());
            }
            region.transfer(); // Windows now owns it.
            Ok(())
        };
        if let Err(error) = apply() {
            state.0.lock().map_err(|e| e.to_string())?.applied = None;
            return Err(error);
        }
    }
    #[cfg(not(windows))]
    let _ = changed;
    if let Some(expanded) = focus {
        window.set_focusable(expanded).map_err(|e| e.to_string())?;
        if expanded {
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Whether the pointer last passed through the island's window: 0 not yet known, 1 through,
/// 2 caught by the island. Read by the macOS native smoke test.
#[cfg(target_os = "macos")]
pub static POINTER: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(0);

/// macOS: lets the pointer through the island's window everywhere but the island and its side
/// panel, checking 30 times a second where the pointer is.
#[cfg(target_os = "macos")]
pub fn follow_pointer(app: AppHandle) {
    std::thread::spawn(move || {
        let mut passing = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(33));
            let Some(window) = app.get_webview_window("island") else {
                continue;
            };
            let (Ok(pointer), Ok(origin)) = (app.cursor_position(), window.outer_position()) else {
                continue;
            };
            let shape = app
                .state::<IslandShape>()
                .0
                .lock()
                .ok()
                .and_then(|state| state.applied);
            let over = shape.is_some_and(|g| {
                g.contains(pointer.x - origin.x as f64, pointer.y - origin.y as f64)
            });
            if passing != Some(!over) && window.set_ignore_cursor_events(!over).is_ok() {
                passing = Some(!over);
                POINTER.store(
                    if over { 2 } else { 1 },
                    std::sync::atomic::Ordering::Relaxed,
                );
            }
        }
    });
}
pub fn refresh_shape(app: &AppHandle) -> Result<(), String> {
    let (width, height, side) = {
        let state = app.state::<IslandShape>();
        let state = state.0.lock().map_err(|e| e.to_string())?;
        (state.width, state.height, state.side)
    };
    shape(app, width, height, side, None)
}
pub fn fullscreen_over_island(app: &AppHandle) -> bool {
    // macOS keeps the island off full-screen Spaces through its collection behaviour instead.
    #[cfg(not(windows))]
    let _ = app;
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
/// Opens Glim at login: a LaunchAgent on macOS.
#[cfg(target_os = "macos")]
pub fn autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launch = app.autolaunch();
    if enabled {
        launch.enable()
    } else {
        launch.disable()
    }
    .map_err(|e| e.to_string())
}
/// Opens Glim at login: the Run key on Windows.
#[cfg(not(target_os = "macos"))]
pub fn autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let _ = app;
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

/// The screen the island hangs from: its camera notch, if it has one, and its menu bar's height,
/// in points (the island's CSS pixels).
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct ScreenShape {
    pub notch: Option<Notch>,
    pub bar: f64,
}
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct Notch {
    pub width: f64,
    pub height: f64,
}

/// The notch from the two strips of menu bar either side of it, as NSScreen reports them
/// (left edge and width of each), and the screen's top safe-area inset. A screen without a notch
/// reports no inset.
#[cfg(any(target_os = "macos", test))]
pub fn notch_of(left: (f64, f64), right: (f64, f64), top_inset: f64) -> Option<Notch> {
    let width = right.0 - (left.0 + left.1);
    (top_inset > 0. && width > 0.).then_some(Notch {
        width,
        height: top_inset,
    })
}

/// A notch for screens that have none, in debug builds: `GLIM_TEST_NOTCH=200x32`. CI's virtual
/// displays draw the notched island this way.
#[cfg(all(debug_assertions, target_os = "macos"))]
fn test_notch() -> Option<Notch> {
    let value = std::env::var("GLIM_TEST_NOTCH").ok()?;
    let (width, height) = value.split_once('x')?;
    Some(Notch {
        width: width.parse().ok()?,
        height: height.parse().ok()?,
    })
}

#[cfg(target_os = "macos")]
pub fn screen_shape(app: &AppHandle) -> ScreenShape {
    use objc2_app_kit::NSWindow;
    #[cfg(debug_assertions)]
    if let Some(notch) = test_notch() {
        return ScreenShape {
            notch: Some(notch),
            bar: notch.height,
        };
    }
    let none = ScreenShape {
        notch: None,
        bar: 24.,
    };
    let Some(pointer) = app
        .get_webview_window("island")
        .and_then(|w| w.ns_window().ok())
    else {
        return none;
    };
    // Tauri hands out the island's own NSWindow; this runs on the main thread (a sync command).
    let window: &NSWindow = unsafe { &*pointer.cast() };
    let Some(screen) = window.screen() else {
        return none;
    };
    let (frame, visible) = (screen.frame(), screen.visibleFrame());
    let (left, right) = (
        screen.auxiliaryTopLeftArea(),
        screen.auxiliaryTopRightArea(),
    );
    let bar = (frame.origin.y + frame.size.height) - (visible.origin.y + visible.size.height);
    ScreenShape {
        notch: notch_of(
            (left.origin.x - frame.origin.x, left.size.width),
            (right.origin.x - frame.origin.x, right.size.width),
            screen.safeAreaInsets().top,
        ),
        // A hidden menu bar leaves no strip; the island still keeps a menu bar's height.
        bar: if bar > 0. { bar } else { 24. },
    }
}
#[cfg(not(target_os = "macos"))]
pub fn screen_shape(_: &AppHandle) -> ScreenShape {
    ScreenShape {
        notch: None,
        bar: 0.,
    }
}

/// macOS: the island floats over the menu bar, on every Space, and on full-screen apps' Spaces
/// unless the person asked to hide it there. Runs on the main thread.
#[cfg(target_os = "macos")]
pub fn float_over_menu_bar(app: &AppHandle, over_fullscreen: bool) {
    use objc2_app_kit::{NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior};
    let Some(pointer) = app
        .get_webview_window("island")
        .and_then(|w| w.ns_window().ok())
    else {
        return;
    };
    let window: &NSWindow = unsafe { &*pointer.cast() };
    window.setLevel(NSStatusWindowLevel);
    let mut behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle;
    if over_fullscreen {
        behavior |= NSWindowCollectionBehavior::FullScreenAuxiliary;
    }
    window.setCollectionBehavior(behavior);
}

#[cfg(test)]
mod shape_tests {
    use super::*;
    #[test]
    fn a_notch_is_the_gap_between_the_menu_bar_strips() {
        // A 1512-point-wide screen with a 200-point notch, 32 points deep, in the middle.
        let notch = notch_of((0., 656.), (856., 656.), 32.).unwrap();
        assert_eq!(
            notch,
            Notch {
                width: 200.,
                height: 32.
            }
        );
        // No inset or no gap: no notch.
        assert_eq!(notch_of((0., 1512.), (1512., 0.), 0.), None);
        assert_eq!(notch_of((0., 756.), (756., 756.), 24.), None);
    }
    #[test]
    fn the_pointer_is_over_the_island_or_its_side_panel_only() {
        let side = Side {
            x: 834.,
            y: 14.,
            width: 300.,
            height: 200.,
        };
        let g = RegionGeometry::new(440, 400, 2., 2400, Some(side));
        // The island spans x 760..1640 and y 0..800 in physical pixels at scale 2.
        assert!(g.contains(1200., 10.));
        assert!(!g.contains(1200., 801.));
        assert!(!g.contains(700., 10.));
        // The side panel: x 1668..2268, y 28..428.
        assert!(g.contains(1700., 100.));
        assert!(!g.contains(1700., 500.));
        assert!(!g.contains(1650., 100.));
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{GetRgnBox, PtInRegion},
    };

    #[test]
    fn native_region_excludes_the_first_transparent_row_at_each_scale() {
        for scale in [1., 1.25, 1.5, 2.] {
            for width in [144, 211, 300, 360, 400, 440] {
                for height in [34, 101, 348, 616] {
                    let g = RegionGeometry::new(width, height, scale, (680. * scale) as u32, None);
                    let region = region::create(g).unwrap();
                    let mut bounds: RECT = unsafe { std::mem::zeroed() };
                    assert_ne!(unsafe { GetRgnBox(region.0, &mut bounds) }, 0);
                    assert_eq!(bounds.top, 0, "{g:?}");
                    assert_eq!(bounds.bottom, g.height, "{g:?}");
                    assert_ne!(
                        unsafe { PtInRegion(region.0, g.x + g.width / 2, g.height - 1) },
                        0
                    );
                    for x in (g.x - g.shoulder)..=(g.x + g.width + g.shoulder) {
                        assert_eq!(
                            unsafe { PtInRegion(region.0, x, g.height) },
                            0,
                            "below {g:?}"
                        );
                    }
                    assert_eq!(unsafe { PtInRegion(region.0, g.x + 1, g.height - 1) }, 0);
                    assert_eq!(
                        unsafe { PtInRegion(region.0, g.x + g.width - 2, g.height - 1) },
                        0
                    );
                    assert_eq!(unsafe { PtInRegion(region.0, g.x - 1, g.shoulder) }, 0);
                    assert_eq!(
                        unsafe { PtInRegion(region.0, g.x + g.width, g.shoulder) },
                        0
                    );
                }
            }
        }
    }

    #[test]
    fn native_shoulders_are_small_circles_with_click_through_cutouts() {
        for scale in [1., 1.5] {
            let g = RegionGeometry::new(300, 34, scale, (680. * scale) as u32, None);
            let region = region::create(g).unwrap();
            let point = |x: f64, y: f64| unsafe {
                PtInRegion(
                    region.0,
                    (x * scale).round() as i32,
                    (y * scale).round() as i32,
                ) != 0
            };
            assert!(point(188., 1.));
            assert!(point(491., 1.));
            assert!(!point(183., 7.));
            assert!(!point(497., 7.));
            assert!(!point(189., 9.));
            assert!(!point(491., 9.));
            assert!(point(198., 28.), "17px bottom corner at scale {scale}");
        }
    }

    #[test]
    fn a_side_panel_joins_the_region_and_the_gap_beside_it_stays_click_through() {
        for scale in [1., 1.5] {
            let side = Side {
                x: 834.,
                y: 10.,
                width: 300.,
                height: 200.,
            };
            let g = RegionGeometry::new(440, 400, scale, (1200. * scale) as u32, Some(side));
            let region = region::create(g).unwrap();
            let point = |x: f64, y: f64| unsafe {
                PtInRegion(
                    region.0,
                    (x * scale).round() as i32,
                    (y * scale).round() as i32,
                ) != 0
            };
            assert!(point(984., 110.), "inside the panel");
            assert!(!point(827., 110.), "between the island and the panel");
            assert!(!point(984., 230.), "below the panel");
            assert!(point(600., 200.), "the island itself");
        }
    }

    #[test]
    fn native_geometry_tracks_the_surface_radius_and_host_size() {
        for (width, radius) in [(144, 17), (300, 17), (360, 17), (400, 21), (440, 24)] {
            assert_eq!(RegionGeometry::new(width, 34, 1., 680, None).radius, radius);
        }
        assert_eq!(RegionGeometry::new(300, 1, 1.5, 1020, None).height, 51);
        assert_eq!(RegionGeometry::new(440, 900, 1.5, 1020, None).height, 924);
        let narrow = RegionGeometry::new(350, 200, 1., 390, None);
        assert_eq!((narrow.x, narrow.width, narrow.radius), (20, 350, 24));
        let narrow_compact = RegionGeometry::new(290, 34, 1., 390, None);
        assert_eq!(narrow_compact.radius, 17);
    }
}
