use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewWindow,
};

#[derive(Default)]
pub struct Visibility {
    hidden: AtomicBool,
}

pub fn show_if_visible(window: &WebviewWindow) -> Result<(), String> {
    // Polling and alert-driven resizes must not undo an explicit hide-to-tray.
    if window.state::<Visibility>().hidden.load(Ordering::Relaxed) {
        return Ok(());
    }
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
        ShowWindow(
            window.hwnd().map_err(|e| e.to_string())?.0 as _,
            SW_SHOWNOACTIVATE,
        );
        Ok(())
    }
    #[cfg(not(windows))]
    window.show().map_err(|e| e.to_string())
}

pub fn show(window: &WebviewWindow) -> Result<(), String> {
    window
        .state::<Visibility>()
        .hidden
        .store(false, Ordering::Relaxed);
    show_if_visible(window)
}

fn hide(window: &WebviewWindow) -> tauri::Result<()> {
    window
        .state::<Visibility>()
        .hidden
        .store(true, Ordering::Relaxed);
    window.hide()
}

fn center(window: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = window.primary_monitor()? {
        let area = monitor.work_area();
        let width = window.outer_size()?.width as i32;
        window.set_position(tauri::PhysicalPosition::new(
            area.position.x + ((area.size.width as i32 - width) / 2).max(0),
            area.position.y,
        ))?;
    }
    Ok(())
}

pub fn setup(app: &tauri::App, window: &WebviewWindow) -> tauri::Result<()> {
    center(window)?;
    let show_item = MenuItem::with_id(app, "show", "Show island", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide island", true, None::<&str>)?;
    let center_item = MenuItem::with_id(app, "center", "Move to top center", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Glim", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &hide_item, &center_item, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id("glim")
        .tooltip("Glim — Your agents, at a glance.")
        .menu(&menu)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" {
                app.exit(0);
                return;
            }
            if let Some(window) = app.get_webview_window("island") {
                match event.id.as_ref() {
                    "show" => {
                        let _ = show(&window);
                    }
                    "hide" => {
                        let _ = hide(&window);
                    }
                    "center" => {
                        let _ = center(&window);
                        let _ = show(&window);
                    }
                    _ => {}
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    let island = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hide(&island);
        }
    });
    Ok(())
}
