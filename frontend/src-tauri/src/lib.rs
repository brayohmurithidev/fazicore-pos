mod db;
mod sync;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

use std::path::PathBuf;

use db::{DbState, SyncStatus};
use sync::{SyncConfig, SyncConfigState, SyncResult};

pub struct ImageDirState(pub PathBuf);

// ── Printing commands ─────────────────────────────────────────────────────────

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
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path.to_string_lossy().to_string()])
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;

    Ok(())
}

// ── Offline DB commands ───────────────────────────────────────────────────────

#[tauri::command]
fn db_get_products(db: tauri::State<DbState>) -> Result<Vec<db::LocalProduct>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_products(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_customers(db: tauri::State<DbState>) -> Result<Vec<db::LocalCustomer>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_customers(&conn).map_err(|e| e.to_string())
}

/// Queue a sale for later sync. Also decrements local stock immediately.
#[tauri::command]
fn db_create_offline_order(
    db: tauri::State<DbState>,
    payload: String,
    branch_id: Option<i64>,
    items: Vec<(i64, i64)>,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let order_id = db::create_offline_order(&conn, &payload, branch_id)
        .map_err(|e| e.to_string())?;
    for (product_id, qty) in items {
        db::decrement_stock(&conn, product_id, qty).map_err(|e| e.to_string())?;
    }
    Ok(order_id)
}

#[tauri::command]
fn db_get_sync_status(db: tauri::State<DbState>) -> Result<SyncStatus, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_sync_status(&conn).map_err(|e| e.to_string())
}

// ── Standalone / local-mode commands ─────────────────────────────────────────

// Auth

#[tauri::command]
fn local_count_users(db: tauri::State<DbState>) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::count_local_users(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_get_users(db: tauri::State<DbState>) -> Result<Vec<db::LocalUser>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_local_users(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_create_user(
    db: tauri::State<DbState>,
    name: String,
    pin: String,
    role: String,
) -> Result<db::LocalUser, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::create_local_user(&conn, &name, &pin, &role).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_update_user(
    db: tauri::State<DbState>,
    id: i64,
    name: String,
    pin: Option<String>,
    role: String,
    is_active: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::update_local_user(&conn, id, &name, pin.as_deref(), &role, is_active)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn local_verify_pin(
    db: tauri::State<DbState>,
    user_id: i64,
    pin: String,
) -> Result<Option<db::LocalUser>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::verify_local_pin(&conn, user_id, &pin).map_err(|e| e.to_string())
}

// Products

#[tauri::command]
fn local_create_product(
    db: tauri::State<DbState>,
    name: String,
    price: f64,
    cost: Option<f64>,
    sku: Option<String>,
    barcode: Option<String>,
    unit: String,
    category_id: Option<i64>,
    category_name: Option<String>,
    stock_quantity: i64,
    min_stock: i64,
    vat_rate: f64,
    track_inventory: bool,
) -> Result<db::LocalProduct, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::local_create_product(
        &conn, &name, price, cost, sku.as_deref(), barcode.as_deref(),
        &unit, category_id, category_name.as_deref(),
        stock_quantity, min_stock, vat_rate, track_inventory,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_update_product(
    db: tauri::State<DbState>,
    id: i64,
    name: String,
    price: f64,
    cost: Option<f64>,
    sku: Option<String>,
    barcode: Option<String>,
    unit: String,
    category_id: Option<i64>,
    category_name: Option<String>,
    min_stock: i64,
    vat_rate: f64,
    is_active: bool,
    track_inventory: bool,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::local_update_product(
        &conn, id, &name, price, cost, sku.as_deref(), barcode.as_deref(),
        &unit, category_id, category_name.as_deref(),
        min_stock, vat_rate, is_active, track_inventory,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_delete_product(db: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::local_delete_product(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_adjust_inventory(
    db: tauri::State<DbState>,
    product_id: i64,
    qty_change: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::local_adjust_inventory(&conn, product_id, qty_change).map_err(|e| e.to_string())
}

// Categories

#[tauri::command]
fn local_get_categories(db: tauri::State<DbState>) -> Result<Vec<db::LocalCategory>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_local_categories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_create_category(db: tauri::State<DbState>, name: String) -> Result<db::LocalCategory, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::create_local_category(&conn, &name).map_err(|e| e.to_string())
}

// Customers

#[tauri::command]
fn local_create_customer(
    db: tauri::State<DbState>,
    name: String,
    phone: Option<String>,
    email: Option<String>,
) -> Result<db::LocalCustomer, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::local_create_customer(&conn, &name, phone.as_deref(), email.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn local_update_customer(
    db: tauri::State<DbState>,
    id: i64,
    name: String,
    phone: Option<String>,
    email: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::local_update_customer(&conn, id, &name, phone.as_deref(), email.as_deref())
        .map_err(|e| e.to_string())
}

// Orders

#[tauri::command]
fn local_commit_order(
    db: tauri::State<DbState>,
    order: db::LocalOrder,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // Decrement stock for each item
    for item in &order.items {
        db::decrement_stock(&conn, item.product_id, item.qty).map_err(|e| e.to_string())?;
    }
    db::commit_local_order(&conn, &order).map_err(|e| e.to_string())
}

#[tauri::command]
fn local_get_orders(
    db: tauri::State<DbState>,
    limit: i64,
    offset: i64,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<db::LocalOrder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_local_orders(&conn, limit, offset, from_date.as_deref(), to_date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn local_get_sales_report(
    db: tauri::State<DbState>,
    from_date: String,
    to_date: String,
) -> Result<db::LocalSalesReport, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_local_sales_report(&conn, &from_date, &to_date).map_err(|e| e.to_string())
}

// ── Sync config (call this on login / token refresh) ─────────────────────────

#[tauri::command]
fn set_sync_config(
    cfg: tauri::State<SyncConfigState>,
    base_url: String,
    token: String,
    org_slug: String,
    branch_id: Option<i64>,
    minio_public_url: String,
) {
    let mut guard = cfg.0.lock().unwrap();
    *guard = Some(SyncConfig { base_url, token, org_slug, branch_id, minio_public_url });
}

#[tauri::command]
fn clear_sync_config(cfg: tauri::State<SyncConfigState>) {
    let mut guard = cfg.0.lock().unwrap();
    *guard = None;
}

// ── Manual sync commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn sync_now(
    db: tauri::State<'_, DbState>,
    cfg: tauri::State<'_, SyncConfigState>,
    image_dir: tauri::State<'_, ImageDirState>,
) -> Result<SyncResult, String> {
    let config = cfg.0.lock().unwrap().clone();
    let Some(config) = config else {
        return Err("Not authenticated — call set_sync_config first".into());
    };
    Ok(sync::run_sync(&db, &config, &image_dir.0).await)
}

#[tauri::command]
async fn check_online(cfg: tauri::State<'_, SyncConfigState>) -> Result<bool, String> {
    let config = cfg.0.lock().unwrap().clone();
    let Some(config) = config else { return Ok(false) };
    Ok(sync::check_online(&config.base_url).await)
}

// ── Background sync worker ────────────────────────────────────────────────────

fn start_sync_worker(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        interval.tick().await; // skip immediate first tick

        loop {
            interval.tick().await;

            let config = {
                let state = app.state::<SyncConfigState>();
                let guard = state.0.lock().unwrap();
                guard.clone()
            };

            let Some(config) = config else { continue };

            if !sync::check_online(&config.base_url).await { continue }

            let db = app.state::<DbState>();
            let image_dir = app.state::<ImageDirState>();
            let result = sync::run_sync(&db, &config, &image_dir.0).await;

            log::info!(
                "[sync] pushed={} failed={} products={} customers={} errors={:?}",
                result.pushed,
                result.push_failed,
                result.products_pulled,
                result.customers_pulled,
                result.errors,
            );
            let _ = app.emit("sync-complete", &result);
        }
    });
}

// ── App entry point ───────────────────────────────────────────────────────────

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(SyncConfigState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            // printing
            list_system_printers,
            print_raw_cups,
            save_text_file,
            save_binary_file,
            open_html_preview,
            // offline db (sync mode)
            db_get_products,
            db_get_customers,
            db_create_offline_order,
            db_get_sync_status,
            // sync
            set_sync_config,
            clear_sync_config,
            sync_now,
            check_online,
            // standalone / local-mode
            local_count_users,
            local_get_users,
            local_create_user,
            local_update_user,
            local_verify_pin,
            local_create_product,
            local_update_product,
            local_delete_product,
            local_adjust_inventory,
            local_get_categories,
            local_create_category,
            local_create_customer,
            local_update_customer,
            local_commit_order,
            local_get_orders,
            local_get_sales_report,
        ])
        .setup(|app| {
            // ── Init SQLite ──
            let data_dir = app.path().app_data_dir()
                .expect("failed to get app data dir");
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("fazipos.db");
            let conn = rusqlite::Connection::open(&db_path)
                .expect("failed to open SQLite database");
            db::init_db(&conn).expect("failed to initialize database schema");
            app.manage(DbState(Mutex::new(conn)));

            // ── Image cache dir ──
            let image_dir = data_dir.join("images");
            std::fs::create_dir_all(&image_dir)?;
            app.manage(ImageDirState(image_dir));

            // ── Background sync worker ──
            start_sync_worker(app.handle().clone());

            // ── Tray icon ──
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
