use axum::{
    extract::{Path, State},
    http::Method,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tower_http::cors::{Any, CorsLayer};

pub type SharedDb = Arc<Mutex<rusqlite::Connection>>;

#[derive(Clone)]
pub struct BsState {
    db: SharedDb,
    reservations: Arc<Mutex<HashMap<String, Reservation>>>,
}

struct Reservation {
    items: Vec<(i64, i64)>, // (product_id, base_qty)
    expires: Instant,
}

#[derive(Serialize)]
pub struct StockItem {
    pub product_id: i64,
    pub qty: i64,
}

#[derive(Deserialize)]
struct ReserveReq {
    items: Vec<ReserveItem>,
}
#[derive(Deserialize)]
struct ReserveItem {
    product_id: i64,
    qty: i64,
}

#[derive(Serialize)]
struct ReserveResp {
    ok: bool,
    reservation_id: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
struct CommitReq {
    reservation_id: String,
}

async fn handle_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "version": "1.0" }))
}

async fn handle_stock(State(s): State<BsState>) -> Json<Vec<StockItem>> {
    let items = {
        let conn = s.db.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, stock_quantity FROM products \
                 WHERE is_active = 1 AND track_inventory = 1",
            )
            .unwrap_or_else(|_| conn.prepare("SELECT id, stock_quantity FROM products LIMIT 0").unwrap());
        stmt.query_map([], |row| {
            Ok(StockItem {
                product_id: row.get(0)?,
                qty: row.get(1)?,
            })
        })
        .map(|rows| rows.filter_map(|r| r.ok()).collect::<Vec<_>>())
        .unwrap_or_default()
    };
    Json(items)
}

fn active_reserved(reservations: &HashMap<String, Reservation>) -> HashMap<i64, i64> {
    let now = Instant::now();
    let mut map: HashMap<i64, i64> = HashMap::new();
    for r in reservations.values() {
        if r.expires > now {
            for &(pid, qty) in &r.items {
                *map.entry(pid).or_default() += qty;
            }
        }
    }
    map
}

async fn handle_reserve(State(s): State<BsState>, Json(req): Json<ReserveReq>) -> Json<ReserveResp> {
    // Purge expired reservations
    let now = Instant::now();
    s.reservations.lock().unwrap().retain(|_, r| r.expires > now);

    let reserved = active_reserved(&s.reservations.lock().unwrap());

    {
        let conn = s.db.lock().unwrap();
        for item in &req.items {
            let stock: i64 = conn
                .query_row(
                    "SELECT stock_quantity FROM products WHERE id = ?1 AND is_active = 1",
                    rusqlite::params![item.product_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let in_reserve = reserved.get(&item.product_id).copied().unwrap_or(0);
            if stock - in_reserve < item.qty {
                return Json(ReserveResp {
                    ok: false,
                    reservation_id: None,
                    error: Some(format!(
                        "Insufficient stock for product {}",
                        item.product_id
                    )),
                });
            }
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    s.reservations.lock().unwrap().insert(
        id.clone(),
        Reservation {
            items: req.items.into_iter().map(|i| (i.product_id, i.qty)).collect(),
            expires: Instant::now() + Duration::from_secs(300),
        },
    );

    Json(ReserveResp {
        ok: true,
        reservation_id: Some(id),
        error: None,
    })
}

async fn handle_commit(State(s): State<BsState>, Json(req): Json<CommitReq>) -> Json<serde_json::Value> {
    let reservation = s.reservations.lock().unwrap().remove(&req.reservation_id);
    let Some(reservation) = reservation else {
        return Json(serde_json::json!({ "ok": false, "error": "Reservation not found or expired" }));
    };

    let conn = s.db.lock().unwrap();
    for (product_id, qty) in &reservation.items {
        let _ = conn.execute(
            "UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?1) WHERE id = ?2",
            rusqlite::params![qty, product_id],
        );
    }

    Json(serde_json::json!({ "ok": true }))
}

async fn handle_release(State(s): State<BsState>, Path(id): Path<String>) -> Json<serde_json::Value> {
    s.reservations.lock().unwrap().remove(&id);
    Json(serde_json::json!({ "ok": true }))
}

pub struct RunningServer {
    pub handle: tokio::task::JoinHandle<()>,
    pub port: u16,
}

impl RunningServer {
    pub fn abort(self) {
        self.handle.abort();
    }
}

pub async fn start(db: SharedDb, port: u16) -> Result<RunningServer, String> {
    let state = BsState {
        db,
        reservations: Arc::new(Mutex::new(HashMap::new())),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers(Any);

    let app = Router::new()
        .route("/status", get(handle_status))
        .route("/api/stock", get(handle_stock))
        .route("/api/reserve", post(handle_reserve))
        .route("/api/commit", post(handle_commit))
        .route("/api/reserve/:id", delete(handle_release))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|e| format!("Failed to bind port {port}: {e}"))?;

    let handle = tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });

    Ok(RunningServer { handle, port })
}
