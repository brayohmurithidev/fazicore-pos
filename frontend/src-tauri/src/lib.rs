use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

// ── CUPS / system-printer commands (macOS & Linux) ────────────────────────────

#[tauri::command]
fn list_system_printers() -> Vec<String> {
    let stdout = std::process::Command::new("lpstat")
        .args(["-a"])
        .output()
        .map(|o| o.stdout)
        .unwrap_or_default();
    String::from_utf8_lossy(&stdout)
        .lines()
        .filter_map(|l| l.split_whitespace().next().map(str::to_string))
        .collect()
}

#[tauri::command]
fn print_raw_cups(printer: String, data: Vec<u8>) -> Result<(), String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let tmp = format!("/tmp/fazi_receipt_{millis}.bin");
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    let status = std::process::Command::new("lp")
        .args(["-d", &printer, "-o", "raw", &tmp])
        .status()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    if status.success() { Ok(()) } else { Err(format!("lp failed: {status}")) }
}

#[tauri::command]
fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_html_preview(html: String) -> Result<(), String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("fazi_print_{millis}.html"));
    std::fs::write(&path, html.as_bytes()).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd").args(["/c", "start", "", &path.to_string_lossy().to_string()]).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            list_system_printers,
            print_raw_cups,
            save_text_file,
            save_binary_file,
            open_html_preview,
        ])
        .setup(|app| {
            let quit = MenuItem::with_id(app, "quit", "Quit Fazi POS", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show, &quit])?;

            let tray_builder = TrayIconBuilder::new()
                .tooltip("Fazi POS")
                .menu(&tray_menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder.icon(icon.clone()).build(app)?;
            } else {
                tray_builder.build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
