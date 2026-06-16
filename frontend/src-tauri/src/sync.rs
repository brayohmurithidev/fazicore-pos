use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::Duration;

use std::path::Path;

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
    pub minio_public_url: String,
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
    #[serde(default)]
    parent_product_id: Option<i64>,
    #[serde(default)]
    variant_count: i64,
    #[serde(default)]
    variants: Vec<serde_json::Value>,
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
        let variants_json = if r.variants.is_empty() {
            None
        } else {
            serde_json::to_string(&r.variants).ok()
        };
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
            local_image_path: None,
            vat_rate: r.vat_rate,
            is_active: r.is_active,
            track_inventory: r.track_inventory,
            is_local: false,
            variant_count: r.variant_count,
            variants_json,
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
        .get(format!("{base_url}/health"))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

// ── Sync errors ───────────────────────────────────────────────────────────────

pub enum SyncApiError {
    Unauthorized,
    Other(String),
}

impl From<SyncApiError> for String {
    fn from(e: SyncApiError) -> Self {
        match e {
            SyncApiError::Unauthorized => "401 Unauthorized".to_string(),
            SyncApiError::Other(s) => s,
        }
    }
}

// ── Pull: products ────────────────────────────────────────────────────────────

pub async fn pull_products(
    client: &Client,
    config: &SyncConfig,
) -> Result<Vec<LocalProduct>, SyncApiError> {
    let mut all: Vec<LocalProduct> = Vec::new();
    let mut skip = 0usize;
    let limit = 200usize;

    loop {
        let mut req = client
            .get(format!("{}/api/v1/products/", config.base_url))
            .bearer_auth(&config.token)
            .header("X-Org-Slug", &config.org_slug)
            .query(&[("skip", skip.to_string()), ("limit", limit.to_string())]);
        if let Some(branch_id) = config.branch_id {
            req = req.query(&[("branch_id", branch_id.to_string())]);
        }
        let resp = req.send().await.map_err(|e| SyncApiError::Other(e.to_string()))?;

        if resp.status().as_u16() == 401 {
            return Err(SyncApiError::Unauthorized);
        }
        if !resp.status().is_success() {
            return Err(SyncApiError::Other(format!("products API {}", resp.status())));
        }

        let page: Vec<ApiProductRaw> = resp.json().await.map_err(|e| SyncApiError::Other(e.to_string()))?;
        let done = page.len() < limit;
        // Skip child variants — they are reachable only through the parent's picker
        all.extend(page.into_iter().filter(|p| p.parent_product_id.is_none()).map(Into::into));
        if done { break; }
        skip += limit;
    }

    Ok(all)
}

// ── Pull: customers ───────────────────────────────────────────────────────────

pub async fn pull_customers(
    client: &Client,
    config: &SyncConfig,
) -> Result<Vec<LocalCustomer>, SyncApiError> {
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
            .map_err(|e| SyncApiError::Other(e.to_string()))?;

        if resp.status().as_u16() == 401 {
            return Err(SyncApiError::Unauthorized);
        }
        if !resp.status().is_success() {
            return Err(SyncApiError::Other(format!("customers API {}", resp.status())));
        }

        let page: Vec<ApiCustomerRaw> = resp.json().await.map_err(|e| SyncApiError::Other(e.to_string()))?;
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
) -> Result<(), SyncApiError> {
    let mut body: serde_json::Value =
        serde_json::from_str(payload).map_err(|e| SyncApiError::Other(e.to_string()))?;

    // Attach idempotency key so server deduplicates on retry
    body["idempotency_key"] = serde_json::Value::String(order_id.to_string());

    let resp = client
        .post(format!("{}/api/v1/orders/", config.base_url))
        .bearer_auth(&config.token)
        .header("X-Org-Slug", &config.org_slug)
        .json(&body)
        .send()
        .await
        .map_err(|e| SyncApiError::Other(e.to_string()))?;

    let code = resp.status().as_u16();
    if code == 201 || code == 200 {
        return Ok(());
    }
    // 409 means server already has this idempotency_key — treat as success
    if code == 409 {
        return Ok(());
    }
    if code == 401 {
        return Err(SyncApiError::Unauthorized);
    }
    let text = resp.text().await.unwrap_or_default();
    Err(SyncApiError::Other(format!("HTTP {code}: {text}")))
}

// ── Orchestration ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub pushed: usize,
    pub push_failed: usize,
    pub products_pulled: usize,
    pub customers_pulled: usize,
    pub images_downloaded: usize,
    pub errors: Vec<String>,
    #[serde(default)]
    pub token_expired: bool,
}

const MINIO_INTERNAL: &str = "http://minio:9000/";

fn resolve_image_url(url: &str, minio_public_url: &str) -> String {
    if url.starts_with(MINIO_INTERNAL) {
        let public_base = minio_public_url.trim_end_matches('/');
        let path = &url[MINIO_INTERNAL.len()..];
        format!("{public_base}/{path}")
    } else {
        url.to_string()
    }
}

async fn download_images(
    client: &Client,
    products_needing_images: Vec<(i64, String)>,
    image_dir: &Path,
    minio_public_url: &str,
    db: &DbState,
) -> (usize, Vec<String>) {
    let mut downloaded = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut updates: Vec<(i64, String)> = Vec::new();

    for (id, raw_url) in products_needing_images {
        let url = resolve_image_url(&raw_url, minio_public_url);

        // Derive file extension from URL path (strip query params)
        let url_path = url.split('?').next().unwrap_or(&url);
        let ext = url_path
            .rsplit('.')
            .next()
            .filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_alphanumeric()))
            .unwrap_or("jpg");
        let local_path = image_dir.join(format!("prod_{id}.{ext}"));

        if local_path.exists() {
            updates.push((id, local_path.to_string_lossy().into_owned()));
            continue;
        }

        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.bytes().await {
                    Ok(bytes) => {
                        if let Err(e) = std::fs::write(&local_path, &bytes) {
                            errors.push(format!("write prod_{id}: {e}"));
                        } else {
                            updates.push((id, local_path.to_string_lossy().into_owned()));
                            downloaded += 1;
                        }
                    }
                    Err(e) => errors.push(format!("bytes prod_{id}: {e}")),
                }
            }
            Ok(resp) => errors.push(format!("HTTP {} for prod_{id}", resp.status())),
            Err(e) => errors.push(format!("fetch prod_{id}: {e}")),
        }
    }

    if !updates.is_empty() {
        let conn = db.0.lock().unwrap();
        for (id, path) in updates {
            let _ = db::update_product_local_image(&conn, id, &path);
        }
    }

    (downloaded, errors)
}

pub async fn run_sync(db: &DbState, config: &SyncConfig, image_dir: &Path) -> SyncResult {
    let client = match make_client() {
        Ok(c) => c,
        Err(e) => return SyncResult { pushed: 0, push_failed: 0, products_pulled: 0, customers_pulled: 0, images_downloaded: 0, errors: vec![e], token_expired: false },
    };

    let mut result = SyncResult {
        pushed: 0,
        push_failed: 0,
        products_pulled: 0,
        customers_pulled: 0,
        images_downloaded: 0,
        errors: Vec::new(),
        token_expired: false,
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
            Err(SyncApiError::Unauthorized) => {
                result.token_expired = true;
                return result; // stop immediately — no point retrying other requests
            }
            Err(SyncApiError::Other(e)) => {
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
            let to_download = {
                let conn = db.0.lock().unwrap();
                if let Err(e) = db::upsert_products(&conn, &products) {
                    result.errors.push(format!("upsert products: {e}"));
                    Vec::new()
                } else {
                    let _ = db::set_meta(&conn, "products_last_sync", &Utc::now().to_rfc3339());
                    db::get_products_needing_images(&conn).unwrap_or_default()
                }
            };
            // Download images outside the DB lock
            let (n, errs) = download_images(&client, to_download, image_dir, &config.minio_public_url, db).await;
            result.images_downloaded = n;
            result.errors.extend(errs);
        }
        Err(SyncApiError::Unauthorized) => {
            result.token_expired = true;
            return result;
        }
        Err(SyncApiError::Other(e)) => result.errors.push(format!("pull products: {e}")),
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
        Err(SyncApiError::Unauthorized) => {
            result.token_expired = true;
        }
        Err(SyncApiError::Other(e)) => result.errors.push(format!("pull customers: {e}")),
    }

    result
}
