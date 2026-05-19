use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;

use crate::db::{
    self, DbState, LocalCustomer, LocalProduct,
};

// ── Sync config (stored in app state, set by frontend on login) ───────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncConfig {
    pub base_url: String,
    pub token: String,
    pub org_slug: String,
    pub branch_id: Option<i64>,
}

pub struct SyncConfigState(pub Mutex<Option<SyncConfig>>);

// ── Raw API shapes (only fields we need) ──────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiProductRaw {
    id: i64,
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
    image_url: Option<String>,
    #[serde(default)]
    vat_rate: f64,
    #[serde(default = "default_true")]
    is_active: bool,
    #[serde(default = "default_true")]
    track_inventory: bool,
}

#[derive(Debug, Deserialize)]
struct ApiCustomerRaw {
    id: i64,
    name: String,
    phone: Option<String>,
    email: Option<String>,
    #[serde(default)]
    credit_balance: f64,
}

fn default_true() -> bool { true }

impl From<ApiProductRaw> for LocalProduct {
    fn from(r: ApiProductRaw) -> Self {
        LocalProduct {
            id: r.id,
            name: r.name,
            price: r.price,
            cost: r.cost,
            sku: r.sku,
            barcode: r.barcode,
            unit: r.unit,
            category_id: r.category_id,
            category_name: r.category_name,
            stock_quantity: r.stock_quantity,
            min_stock: r.min_stock,
            image_url: r.image_url,
            vat_rate: r.vat_rate,
            is_active: r.is_active,
            track_inventory: r.track_inventory,
        }
    }
}

impl From<ApiCustomerRaw> for LocalCustomer {
    fn from(r: ApiCustomerRaw) -> Self {
        LocalCustomer {
            id: r.id,
            name: r.name,
            phone: r.phone,
            email: r.email,
            credit_balance: r.credit_balance,
        }
    }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

fn make_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn check_online(base_url: &str) -> bool {
    let Ok(client) = Client::builder().timeout(Duration::from_secs(3)).build() else {
        return false;
    };
    client
        .get(format!("{base_url}/api/v1/auth/me"))
        .send()
        .await
        .map(|r| r.status().as_u16() < 500)
        .unwrap_or(false)
}

// ── Pull: products ────────────────────────────────────────────────────────────

pub async fn pull_products(
    client: &Client,
    config: &SyncConfig,
) -> Result<Vec<LocalProduct>, String> {
    let mut all: Vec<LocalProduct> = Vec::new();
    let mut skip = 0usize;
    let limit = 200usize;

    loop {
        let resp = client
            .get(format!("{}/api/v1/products/", config.base_url))
            .bearer_auth(&config.token)
            .header("X-Org-Slug", &config.org_slug)
            .query(&[
                ("skip", skip.to_string()),
                ("limit", limit.to_string()),
                ("branch_id", config.branch_id.map(|b| b.to_string()).unwrap_or_default()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("products API {}", resp.status()));
        }

        let page: Vec<ApiProductRaw> = resp.json().await.map_err(|e| e.to_string())?;
        let done = page.len() < limit;
        all.extend(page.into_iter().map(Into::into));
        if done { break; }
        skip += limit;
    }

    Ok(all)
}

// ── Pull: customers ───────────────────────────────────────────────────────────

pub async fn pull_customers(
    client: &Client,
    config: &SyncConfig,
) -> Result<Vec<LocalCustomer>, String> {
    let mut all: Vec<LocalCustomer> = Vec::new();
    let mut skip = 0usize;
    let limit = 200usize;

    loop {
        let resp = client
            .get(format!("{}/api/v1/customers/", config.base_url))
            .bearer_auth(&config.token)
            .header("X-Org-Slug", &config.org_slug)
            .query(&[
                ("skip", skip.to_string()),
                ("limit", limit.to_string()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("customers API {}", resp.status()));
        }

        let page: Vec<ApiCustomerRaw> = resp.json().await.map_err(|e| e.to_string())?;
        let done = page.len() < limit;
        all.extend(page.into_iter().map(Into::into));
        if done { break; }
        skip += limit;
    }

    Ok(all)
}

// ── Push: offline orders ──────────────────────────────────────────────────────

pub async fn push_order(
    client: &Client,
    config: &SyncConfig,
    order_id: &str,
    payload: &str,
) -> Result<(), String> {
    let mut body: serde_json::Value =
        serde_json::from_str(payload).map_err(|e| e.to_string())?;

    // Attach idempotency key so server deduplicates on retry
    body["idempotency_key"] = serde_json::Value::String(order_id.to_string());

    let resp = client
        .post(format!("{}/api/v1/orders/", config.base_url))
        .bearer_auth(&config.token)
        .header("X-Org-Slug", &config.org_slug)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let code = resp.status().as_u16();
    if code == 201 || code == 200 {
        return Ok(());
    }
    // 409 means server already has this idempotency_key — treat as success
    if code == 409 {
        return Ok(());
    }
    let text = resp.text().await.unwrap_or_default();
    Err(format!("HTTP {code}: {text}"))
}

// ── Orchestration ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub pushed: usize,
    pub push_failed: usize,
    pub products_pulled: usize,
    pub customers_pulled: usize,
    pub errors: Vec<String>,
}

pub async fn run_sync(db: &DbState, config: &SyncConfig) -> SyncResult {
    let client = match make_client() {
        Ok(c) => c,
        Err(e) => return SyncResult { pushed: 0, push_failed: 0, products_pulled: 0, customers_pulled: 0, errors: vec![e] },
    };

    let mut result = SyncResult {
        pushed: 0,
        push_failed: 0,
        products_pulled: 0,
        customers_pulled: 0,
        errors: Vec::new(),
    };

    // 1. Push pending offline orders
    let pending = {
        let conn = db.0.lock().unwrap();
        db::get_pending_orders(&conn).unwrap_or_default()
    };

    for order in &pending {
        {
            let conn = db.0.lock().unwrap();
            let _ = db::mark_order_syncing(&conn, &order.id);
        }
        match push_order(&client, config, &order.id, &order.payload).await {
            Ok(_) => {
                let conn = db.0.lock().unwrap();
                let _ = db::mark_order_synced(&conn, &order.id);
                result.pushed += 1;
            }
            Err(e) => {
                let conn = db.0.lock().unwrap();
                let _ = db::mark_order_failed(&conn, &order.id, &e);
                result.push_failed += 1;
                result.errors.push(format!("order {}: {e}", &order.id[..8]));
            }
        }
    }

    // 2. Pull products
    match pull_products(&client, config).await {
        Ok(products) => {
            result.products_pulled = products.len();
            let conn = db.0.lock().unwrap();
            if let Err(e) = db::upsert_products(&conn, &products) {
                result.errors.push(format!("upsert products: {e}"));
            } else {
                let _ = db::set_meta(&conn, "products_last_sync", &Utc::now().to_rfc3339());
            }
        }
        Err(e) => result.errors.push(format!("pull products: {e}")),
    }

    // 3. Pull customers
    match pull_customers(&client, config).await {
        Ok(customers) => {
            result.customers_pulled = customers.len();
            let conn = db.0.lock().unwrap();
            if let Err(e) = db::upsert_customers(&conn, &customers) {
                result.errors.push(format!("upsert customers: {e}"));
            } else {
                let _ = db::set_meta(&conn, "customers_last_sync", &Utc::now().to_rfc3339());
            }
        }
        Err(e) => result.errors.push(format!("pull customers: {e}")),
    }

    result
}
