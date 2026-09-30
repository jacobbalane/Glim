#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod bridge;
mod shell;
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    id: String,
    provider: String,
    project: String,
    activity: String,
    observed_at: u64,
    health: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminal: Option<bridge::Target>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    sessions: Vec<Session>,
    accounts: Vec<serde_json::Value>,
    bridge_windows: usize,
}

#[tauri::command]
async fn snapshot(state: State<'_, bridge::Shared>) -> Result<Snapshot, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dir = glim_core::data_dir().map_err(|e| e.to_string())?.join("observations");
        let mut latest = BTreeMap::<String, glim_core::Observation>::new();
        for event in glim_core::read_observations(&dir) {
            let key = format!("{}:{}", event.provider, event.session_id);
            if latest.get(&key).is_none_or(|old| (old.observed_at, &old.id) < (event.observed_at, &event.id)) { latest.insert(key, event); }
        }
        let system = glim_core::processes();
        let registry = state.lock().map_err(|_| "Bridge unavailable".to_string())?;
        let sessions = latest.into_iter().filter_map(|(id, event)| {
            if event.activity == "closed" || event.agent.as_ref().is_some_and(|p| !glim_core::alive(&system, p)) { return None; }
            let terminal = bridge::match_terminal(&registry, &event, &system);
            let health = if event.agent.is_none() { "unverified" }
                else if glim_core::now_ms().saturating_sub(event.observed_at) > 90_000 { "stale" } else { "live" };
            Some(Session { id, provider: event.provider, project: event.project, activity: event.activity, observed_at: event.observed_at, health: health.into(), terminal })
        }).collect();
        Ok(Snapshot { sessions, bridge_windows: registry.windows.len(), accounts: ["claude", "codex"].into_iter().map(|provider|
            serde_json::json!({"provider":provider,"availability":"unavailable","windows":[],"reason":"Usage collector is not connected yet."})).collect() })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn reveal_terminal(
    state: State<'_, bridge::Shared>,
    target: bridge::Target,
) -> Result<(), String> {
    bridge::reveal(state.inner().clone(), target).await
}

#[tauri::command]
fn resize_island(window: tauri::WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    let width = width.clamp(280.0, 460.0) + 24.0;
    let height = height.clamp(50.0, 800.0) + 32.0;
    let old = window.outer_size().map_err(|e| e.to_string())?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    let mut x = position.x + ((old.width as f64 - width * scale) / 2.0) as i32;
    let mut y = position.y;
    if let Ok(Some(monitor)) = window.current_monitor() {
        let area = monitor.work_area();
        x = x.clamp(
            area.position.x,
            (area.position.x + area.size.width as i32 - (width * scale) as i32)
                .max(area.position.x),
        );
        y = y.clamp(
            area.position.y,
            (area.position.y + area.size.height as i32 - (height * scale) as i32)
                .max(area.position.y),
        );
    }
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, DeleteObject, SetWindowRgn};
        // Native hit region excludes transparent margins and rounded corners.
        let region = CreateRoundRectRgn(
            (12.0 * scale) as i32,
            (16.0 * scale) as i32,
            ((width - 12.0) * scale) as i32,
            ((height - 16.0) * scale) as i32,
            (52.0 * scale) as i32,
            (52.0 * scale) as i32,
        );
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        if SetWindowRgn(hwnd.0 as _, region, 1) == 0 {
            DeleteObject(region);
            return Err("Unable to set island hit region".into());
        }
    }
    shell::show_if_visible(&window)
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    let registry: bridge::Shared = Arc::new(Mutex::new(bridge::Registry::default()));
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("island") {
                let _ = shell::show(&window);
            }
        }))
        .manage(registry.clone())
        .manage(shell::Visibility::default())
        .setup(move |app| {
            let window = app
                .get_webview_window("island")
                .ok_or("Island window unavailable")?;
            shell::setup(app, &window)?;
            // WebView2 can defer layout in an initially hidden window. Establish the
            // native first frame without waiting for the frontend ResizeObserver.
            resize_island(window, 282.0, 50.0)?;
            #[cfg(windows)]
            tauri::async_runtime::spawn(async move {
                if let Err(error) = bridge::serve(registry).await {
                    eprintln!("Glim bridge unavailable: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            reveal_terminal,
            resize_island,
            quit
        ])
        .run(tauri::generate_context!())
        .expect("Glim could not start");
}
