mod collector;
pub mod connectors;
pub mod ipc;
pub mod model;
pub mod normalize;
mod platform;
pub mod process;
mod storage;
mod test_control;

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
        platform::autostart(&app, preferences.start_at_login)?;
    }
    #[cfg(target_os = "macos")]
    if preferences.hide_fullscreen != c.preferences.hide_fullscreen {
        platform::float_over_menu_bar(&app, !preferences.hide_fullscreen);
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
    side: Option<platform::Side>,
    app: tauri::AppHandle,
    state: tauri::State<Shared>,
) -> Result<(), String> {
    let focus = {
        let mut collector = lock(&state)?;
        let changed = collector.island_expanded != expanded;
        collector.island_expanded = expanded;
        changed.then_some(expanded)
    };
    platform::shape(&app, width, height, side, focus)
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
/// Brings the window an agent runs in to the front. False when it can't be found.
#[tauri::command]
fn show_agent(id: String, state: tauri::State<Shared>) -> Result<bool, String> {
    let target = lock(&state)?
        .sessions
        .values()
        .find(|s| s.id == id)
        .and_then(|s| Some((s.process?, s.project.clone())));
    Ok(target.is_some_and(|(agent, project)| {
        process::is_open(agent) && process::show(agent.0, &project)
    }))
}
/// Opens the version an update just installed. On Windows, Setup has already closed Glim and
/// opened the new one; on macOS the update replaces Glim.app, and Glim starts it here.
#[tauri::command]
fn relaunch(app: tauri::AppHandle) {
    app.restart();
}
/// The screen the island hangs from: its notch on a Mac, if any, and the menu bar's height.
#[tauri::command]
fn screen_shape(app: tauri::AppHandle) -> platform::ScreenShape {
    platform::screen_shape(&app)
}
#[tauri::command]
fn open_releases() -> Result<(), String> {
    const RELEASES: &str = "https://github.com/jacobbalane/Glim/releases";
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut command = std::process::Command::new("rundll32.exe");
        command.args(["url.dll,FileProtocolHandler", RELEASES]);
        command.creation_flags(0x08000000);
        command
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut command = std::process::Command::new("open");
        command.arg(RELEASES);
        command
    };
    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            queue_panel("settings".into(), app.clone());
        }))
        // Checks GitHub for a signed newer release, only when asked from Settings.
        .plugin(tauri_plugin_updater::Builder::new().build());
    // Open at login on macOS is a LaunchAgent; Windows uses its Run key (platform::autostart).
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));
    builder
        .invoke_handler(tauri::generate_handler![
            snapshot,
            history,
            clear_history,
            save_preferences,
            set_connector,
            monitors,
            island_shape,
            open_panel,
            show_agent,
            screen_shape,
            relaunch,
            open_releases,
            test_control::test_report,
            test_control::test_pointer
        ])
        .setup(|app| {
            // A menu-bar app on macOS: no Dock icon, and the menu bar stays the agent's.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let root = connectors::data_dir();
            std::fs::create_dir_all(&root)?;
            // Hooks call a copy of the helper that stays put when Glim.app moves or updates.
            #[cfg(target_os = "macos")]
            connectors::refresh_bridge();
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
            platform::shape(app.handle(), 300, 34, None, Some(false))
                .map_err(std::io::Error::other)?;
            #[cfg(target_os = "macos")]
            {
                platform::float_over_menu_bar(app.handle(), !preferences.hide_fullscreen);
                platform::follow_pointer(app.handle().clone());
            }
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
            #[cfg(all(debug_assertions, unix))]
            test_control::start(app.handle().clone());
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
    #[cfg(target_os = "macos")]
    {
        tray = tray
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-template.png"
            ))?)
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
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
