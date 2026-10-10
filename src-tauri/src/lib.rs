mod collector;
pub mod connectors;
pub mod ipc;
pub mod model;
pub mod normalize;
mod platform;
mod storage;

use collector::Collector;
use model::*;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

type Shared = Arc<Mutex<Collector>>;
fn lock(state: &Shared) -> Result<std::sync::MutexGuard<'_, Collector>, String> {
    state
        .lock()
        .map_err(|_| "The collector could not be accessed. Restart Glim.".into())
}

#[tauri::command]
fn snapshot(state: tauri::State<Shared>) -> Result<Snapshot, String> {
    Ok(lock(&state)?.snapshot())
}
#[tauri::command]
fn history(state: tauri::State<Shared>) -> Result<Vec<DailyUsage>, String> {
    lock(&state)?.store.history()
}
#[tauri::command]
fn clear_history(state: tauri::State<Shared>, app: tauri::AppHandle) -> Result<(), String> {
    let c = lock(&state)?;
    c.store.clear_history()?;
    // Keep live counters as a high-water mark; clear the historical chart immediately.
    app.emit("glim:snapshot", c.snapshot())
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn save_preferences(
    preferences: Preferences,
    state: tauri::State<Shared>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if !["pill", "hidden"].contains(&preferences.idle_behavior.as_str()) {
        return Err("Unknown idle behavior".into());
    }
    let mut c = lock(&state)?;
    if preferences.start_at_login != c.preferences.start_at_login {
        platform::autostart(preferences.start_at_login)?;
    }
    platform::position_island(&app, &preferences)?;
    c.store.save_preferences(&preferences)?;
    c.preferences = preferences;
    app.emit("glim:snapshot", c.snapshot())
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
async fn set_connector(
    provider: Provider,
    enabled: bool,
    state: tauri::State<'_, Shared>,
    app: tauri::AppHandle,
) -> Result<Snapshot, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        connectors::set_connector(provider, enabled)?;
        let connector = connectors::detect(provider);
        let mut c = lock(&shared)?;
        if let Some(existing) = c.connectors.iter_mut().find(|c| c.provider == provider) {
            *existing = connector;
        }
        if !enabled {
            c.files.retain(|_, f| f.provider != provider);
        }
        let snapshot = c.snapshot();
        app.emit("glim:snapshot", &snapshot)
            .map_err(|e| e.to_string())?;
        Ok(snapshot)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn monitors(app: tauri::AppHandle) -> Result<Vec<platform::Display>, String> {
    platform::monitors(&app)
}
#[tauri::command]
fn island_shape(
    expanded: bool,
    width: u32,
    height: u32,
    app: tauri::AppHandle,
    state: tauri::State<Shared>,
) -> Result<(), String> {
    let focus = {
        let mut collector = lock(&state)?;
        let changed = collector.island_expanded != expanded;
        collector.island_expanded = expanded;
        changed.then_some(expanded)
    };
    platform::shape(&app, width, height, focus)
}
#[tauri::command]
async fn open_panel(view: String, app: tauri::AppHandle) -> Result<(), String> {
    if !["settings", "history", "setup"].contains(&view.as_str()) {
        return Err("Unknown view".into());
    }
    if let Some(window) = app.get_webview_window("island") {
        window.show().map_err(|e| e.to_string())?;
    }
    app.emit_to("island", "glim:view", view)
        .map_err(|e| e.to_string())
}
fn queue_panel(view: String, app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let _ = open_panel(view, app).await;
    });
}
#[tauri::command]
fn open_releases() -> Result<(), String> {
    let mut command = std::process::Command::new("rundll32.exe");
    command.args([
        "url.dll,FileProtocolHandler",
        "https://github.com/jacobbalane/Glim/releases",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            queue_panel("settings".into(), app.clone());
        }))
        .invoke_handler(tauri::generate_handler![
            snapshot,
            history,
            clear_history,
            save_preferences,
            set_connector,
            monitors,
            island_shape,
            open_panel,
            open_releases
        ])
        .setup(|app| {
            let root = connectors::data_dir();
            std::fs::create_dir_all(&root)?;
            let store =
                storage::Store::open(&root.join("usage.sqlite3")).map_err(std::io::Error::other)?;
            let connectors = [Provider::Claude, Provider::Codex]
                .into_iter()
                .map(connectors::detect)
                .collect();
            let shared = Arc::new(Mutex::new(Collector::new(store, connectors)));
            app.manage(shared.clone());
            app.manage(platform::IslandShape::default());
            let preferences = lock(&shared)
                .map_err(std::io::Error::other)?
                .preferences
                .clone();
            platform::position_island(app.handle(), &preferences).map_err(std::io::Error::other)?;
            platform::shape(app.handle(), 300, 34, Some(false)).map_err(std::io::Error::other)?;
            if let Some(window) = app.get_webview_window("island") {
                window.show()?;
                window.on_window_event({
                    let window = window.clone();
                    let app = app.handle().clone();
                    move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                        if matches!(
                            event,
                            tauri::WindowEvent::ScaleFactorChanged { .. }
                                | tauri::WindowEvent::Resized(_)
                        ) {
                            let _ = platform::refresh_shape(&app);
                        }
                    }
                });
            }
            create_tray(app.handle())?;
            let (sender, receiver) = std::sync::mpsc::channel::<AgentEvent>();
            #[cfg(windows)]
            {
                let shared = shared.clone();
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = ipc::serve(sender).await {
                        if let Ok(mut c) = shared.lock() {
                            for connector in &mut c.connectors {
                                connector.error =
                                    Some(format!("Live event connection unavailable: {error}"));
                            }
                            let _ = handle.emit("glim:snapshot", c.snapshot());
                        }
                    }
                });
            }
            start_collector(shared, receiver, app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Glim could not start");
}
fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };
    let show = MenuItem::with_id(app, "show", "Show island", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let history = MenuItem::with_id(app, "history", "Usage history…", true, None::<&str>)?;
    let pause = MenuItem::with_id(
        app,
        "pause",
        "Pause / resume monitoring",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit Glim", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &history, &pause, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Glim — a glance at your agents")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => {
                if let Some(w) = app.get_webview_window("island") {
                    let _ = w.show();
                }
                let _ = app.emit("glim:expand", ());
            }
            "settings" | "history" => {
                queue_panel(event.id.as_ref().into(), app.clone());
            }
            "pause" => {
                let state = app.state::<Shared>();
                if let Ok(mut c) = state.lock() {
                    c.preferences.paused = !c.preferences.paused;
                    let _ = c.store.save_preferences(&c.preferences);
                    let _ = app.emit("glim:snapshot", c.snapshot());
                };
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                queue_panel("settings".into(), tray.app_handle().clone());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
fn start_collector(
    shared: Shared,
    receiver: std::sync::mpsc::Receiver<AgentEvent>,
    app: tauri::AppHandle,
) {
    std::thread::spawn(move || {
        let mut tick = 0u64;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            tick += 1;
            let (changed, preferences, active, expanded, payload) = {
                let Ok(mut c) = shared.lock() else {
                    break;
                };
                let mut changed = false;
                while let Ok(event) = receiver.try_recv() {
                    changed |= c.ingest(event);
                }
                if tick % 20 == 1 {
                    c.discover();
                    changed = true;
                }
                changed |= c.poll();
                if tick.is_multiple_of(7200) {
                    let _ = c.store.prune();
                }
                let active = c.sessions.values().any(|s| {
                    (s.activity == "working" || s.activity == "waiting")
                        && c.connectors
                            .iter()
                            .any(|connector| connector.enabled && connector.provider == s.provider)
                });
                (
                    changed,
                    c.preferences.clone(),
                    active,
                    c.island_expanded,
                    c.snapshot(),
                )
            };
            if changed {
                let _ = app.emit("glim:snapshot", payload);
            }
            if tick.is_multiple_of(2) {
                let _ = platform::position_island(&app, &preferences);
                let hidden = (preferences.idle_behavior == "hidden" && !active && !expanded)
                    || (preferences.hide_fullscreen && platform::fullscreen_over_island(&app));
                if let Some(w) = app.get_webview_window("island") {
                    if hidden {
                        let _ = w.hide();
                    } else if !w.is_visible().unwrap_or(false) {
                        let _ = w.show();
                    }
                }
            }
        }
    });
}
