use crate::model::Preferences;
use tauri::{AppHandle, Manager, PhysicalPosition};

#[cfg(windows)]
pub mod windows_frame;

#[derive(Default)]
pub struct IslandShape(std::sync::Mutex<ShapeState>);

struct ShapeState {
    width: u32,
    height: u32,
    side: Option<Side>,
    offset: f64,
    expanded: bool,
    dragging: bool,
    applied: Option<RegionGeometry>,
}
impl Default for ShapeState {
    fn default() -> Self {
        Self {
            width: 300,
            height: 34,
            side: None,
            offset: 0.0,
            expanded: false,
            dragging: false,
            applied: None,
        }
    }
}

/// A panel or hover control beside the island, in logical pixels from the window's top left.
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
    fn new(
        width: u32,
        height: u32,
        scale: f64,
        host_width: u32,
        side: Option<Side>,
        offset: f64,
    ) -> Self {
        let px = |v: f64| (v * scale).round() as i32;
        let wide = (host_width as f64 / scale - 40.).clamp(204., 440.);
        let cap = 360_f64.min(wide - 60.);
        let logical_width = (width as f64).clamp(144., wide);
        let travel = ((host_width as f64 / scale - wide) / 2. - 20.).max(0.);
        let offset = if offset.is_finite() {
            px(offset.clamp(-travel, travel))
        } else {
            0
        };
        let radius = 17. + ((logical_width - cap) / (wide - cap)).clamp(0., 1.) * 7.;
        let width = (logical_width * scale).round() as i32;
        Self {
            x: ((host_width as f64 - width as f64) / 2.).round() as i32 + offset,
            width,
            height: (height.clamp(34, 616) as f64 * scale).round() as i32,
            radius: (radius * scale).round() as i32,
            shoulder: (8. * scale).round() as i32,
            side: side.map(|s| [px(s.x), px(s.y), px(s.width), px(s.height), px(14.)]),
        }
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
    // Cover the display's width so the island can move without moving its transparent host.
    // The shaped region keeps every other pixel transparent to the pointer.
    let available_width = width as f64 / monitor.scale_factor();
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
    offset: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("island")
        .ok_or("Island window not found")?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Gdi::SetWindowRgn;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let host_width = window.inner_size().map_err(|e| e.to_string())?.width;
        let geometry = RegionGeometry::new(width, height, scale, host_width, side, offset);
        let state = app.state::<IslandShape>();
        let (changed, focusable) = {
            let mut state = state.0.lock().map_err(|e| e.to_string())?;
            state.width = width;
            state.height = height;
            state.side = side;
            state.offset = offset;
            if let Some(expanded) = focus {
                state.expanded = expanded;
            }
            let changed = state.applied != Some(geometry);
            // SetWindowRgn sends window-position events. Cache before applying so
            // a resulting resize callback cannot recursively apply the same region.
            state.applied = Some(geometry);
            (changed, state.expanded || state.dragging)
        };
        if changed {
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
        if focus.is_some() {
            window.set_focusable(focusable).map_err(|e| e.to_string())?;
            if focusable {
                window.set_focus().map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
pub fn dragging(app: &AppHandle, active: bool) -> Result<(), String> {
    let window = app
        .get_webview_window("island")
        .ok_or("Island window not found")?;
    let focusable = {
        let state = app.state::<IslandShape>();
        let mut state = state.0.lock().map_err(|e| e.to_string())?;
        state.dragging = active;
        state.expanded || active
    };
    // Windows background windows receive captured input only inside their visible region.
    // Activate on a long hold so WebView pointer capture works outside the moving island.
    window.set_focusable(focusable).map_err(|e| e.to_string())?;
    if active {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub fn refresh_shape(app: &AppHandle) -> Result<(), String> {
    let (width, height, side, offset) = {
        let state = app.state::<IslandShape>();
        let state = state.0.lock().map_err(|e| e.to_string())?;
        (state.width, state.height, state.side, state.offset)
    };
    shape(app, width, height, side, None, offset)
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use windows_sys::Win32::{
        Foundation::RECT,
        Graphics::Gdi::{GetRgnBox, PtInRegion},
    };

    #[test]
    fn hover_options_have_a_continuous_hit_bridge_at_each_position_and_scale() {
        for scale in [1., 1.25, 1.5, 2.] {
            for offset in [-480., 0., 480.] {
                let right = (1440. + 300.) / 2. + offset;
                let side = Side {
                    x: right - 8.,
                    y: 0.,
                    width: 48.,
                    height: 34.,
                };
                let g =
                    RegionGeometry::new(300, 34, scale, (1440. * scale) as u32, Some(side), offset);
                let region = region::create(g).unwrap();
                let y = (17. * scale).round() as i32;
                // The pointer can travel from the island to the floating button without
                // crossing a click-through hole and losing hover.
                for x in
                    ((right - 8.) * scale).round() as i32..((right + 36.) * scale).round() as i32
                {
                    assert_ne!(unsafe { PtInRegion(region.0, x, y) }, 0, "bridge {g:?}");
                }
                let x = ((right + 20.) * scale).round() as i32;
                assert_eq!(
                    unsafe { PtInRegion(region.0, x, (35. * scale).round() as i32) },
                    0
                );
                let hidden = region::create(RegionGeometry::new(
                    300,
                    34,
                    scale,
                    (1440. * scale) as u32,
                    None,
                    offset,
                ))
                .unwrap();
                assert_eq!(
                    unsafe { PtInRegion(hidden.0, x, y) },
                    0,
                    "hidden hover control passes through"
                );
            }
        }
    }

    #[test]
    fn icon_options_region_tracks_horizontal_pills_on_either_side() {
        for scale in [1., 1.25, 1.5, 2.] {
            for offset in [-480., 0., 480.] {
                let right = (1440. + 300.) / 2. + offset;
                for left in [false, true] {
                    for count in [1, 2, 6] {
                        let pill_width = 32. + count as f64 * 36.;
                        let body_left = right - 300.;
                        // A 26-pixel-high pill, with its bridge and outer padding.
                        let side = Side {
                            x: if left {
                                body_left - pill_width - 8.
                            } else {
                                right - 8.
                            },
                            y: 0.,
                            width: pill_width + 16.,
                            height: 34.,
                        };
                        let region = region::create(RegionGeometry::new(
                            300,
                            34,
                            scale,
                            (1440. * scale) as u32,
                            Some(side),
                            offset,
                        ))
                        .unwrap();
                        let icon_start = if left {
                            body_left - pill_width + 12.
                        } else {
                            right + 20.
                        };
                        for icon in 0..=count {
                            let x = icon_start + icon as f64 * 36.;
                            let y = 17.;
                            assert_ne!(
                                unsafe {
                                    PtInRegion(
                                        region.0,
                                        (x * scale).round() as i32,
                                        (y * scale).round() as i32,
                                    )
                                },
                                0,
                                "icon pill at {scale}, offset {offset}"
                            );
                        }
                        assert_eq!(
                            unsafe {
                                PtInRegion(
                                    region.0,
                                    (icon_start * scale).round() as i32,
                                    ((side.height + 1.) * scale).round() as i32,
                                )
                            },
                            0
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn native_region_excludes_the_first_transparent_row_at_each_scale() {
        for scale in [1., 1.25, 1.5, 2.] {
            for width in [144, 211, 300, 360, 400, 440] {
                for height in [34, 101, 348, 616] {
                    let g =
                        RegionGeometry::new(width, height, scale, (680. * scale) as u32, None, 0.);
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
            let g = RegionGeometry::new(300, 34, scale, (680. * scale) as u32, None, 0.);
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
            let g = RegionGeometry::new(440, 400, scale, (1200. * scale) as u32, Some(side), 0.);
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
            assert_eq!(
                RegionGeometry::new(width, 34, 1., 680, None, 0.).radius,
                radius
            );
        }
        assert_eq!(RegionGeometry::new(300, 1, 1.5, 1020, None, 0.).height, 51);
        assert_eq!(
            RegionGeometry::new(440, 900, 1.5, 1020, None, 0.).height,
            924
        );
        let narrow = RegionGeometry::new(350, 200, 1., 390, None, 0.);
        assert_eq!((narrow.x, narrow.width, narrow.radius), (20, 350, 24));
        let narrow_compact = RegionGeometry::new(290, 34, 1., 390, None, 0.);
        assert_eq!(narrow_compact.radius, 17);
    }
    #[test]
    fn dragging_moves_the_hit_region_and_keeps_the_open_island_on_screen() {
        for scale in [1., 1.25, 1.5, 2.] {
            let host = (1920. * scale) as u32;
            let centre = RegionGeometry::new(440, 348, scale, host, None, 0.);
            for offset in [-2000., -240., 240., 2000.] {
                let moved = RegionGeometry::new(440, 348, scale, host, None, offset);
                let region = region::create(moved).unwrap();
                assert!(moved.x >= (20. * scale) as i32);
                assert!(moved.x + moved.width <= host as i32 - (20. * scale) as i32);
                assert_eq!(moved.height, centre.height);
                assert_eq!(moved.radius, centre.radius);
                assert_ne!(
                    unsafe { PtInRegion(region.0, moved.x + moved.width / 2, 20) },
                    0
                );
                assert_eq!(
                    unsafe { PtInRegion(region.0, moved.x - moved.shoulder - 1, 20) },
                    0
                );
                if offset.abs() == 240. {
                    assert_eq!(moved.x - centre.x, (offset * scale) as i32);
                }
            }
            assert_eq!(
                RegionGeometry::new(440, 348, scale, host, None, f64::NAN),
                centre
            );
        }
    }
}
