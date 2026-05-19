use chrono::Utc;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use uuid::Uuid;

pub struct DbState(pub Mutex<Connection>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalProduct {
    pub id: i64,
    pub name: String,
    pub price: f64,
    pub cost: Option<f64>,
    pub sku: Option<String>,
    pub barcode: Option<String>,
    pub unit: String,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub stock_quantity: i64,
    pub min_stock: i64,
    pub image_url: Option<String>,
    pub local_image_path: Option<String>,
    pub vat_rate: f64,
    pub is_active: bool,
    pub track_inventory: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalCustomer {
    pub id: i64,
    pub name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub credit_balance: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OfflineOrder {
    pub id: String,
    pub payload: String,
    pub branch_id: Option<i64>,
    pub status: String,
    pub error: Option<String>,
    pub created_at: String,
    pub synced_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncStatus {
    pub pending_count: i64,
    pub failed_count: i64,
    pub products_last_sync: Option<String>,
    pub customers_last_sync: Option<String>,
}

pub fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS products (
            id                INTEGER PRIMARY KEY,
            name              TEXT NOT NULL,
            price             REAL NOT NULL,
            cost              REAL,
            sku               TEXT,
            barcode           TEXT,
            unit              TEXT NOT NULL DEFAULT 'piece',
            category_id       INTEGER,
            category_name     TEXT,
            stock_quantity    INTEGER NOT NULL DEFAULT 0,
            min_stock         INTEGER NOT NULL DEFAULT 0,
            image_url         TEXT,
            vat_rate          REAL NOT NULL DEFAULT 0,
            is_active         INTEGER NOT NULL DEFAULT 1,
            track_inventory   INTEGER NOT NULL DEFAULT 1,
            last_updated      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS customers (
            id              INTEGER PRIMARY KEY,
            name            TEXT NOT NULL,
            phone           TEXT,
            email           TEXT,
            credit_balance  REAL NOT NULL DEFAULT 0,
            last_updated    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS offline_orders (
            id          TEXT PRIMARY KEY,
            payload     TEXT NOT NULL,
            branch_id   INTEGER,
            status      TEXT NOT NULL DEFAULT 'pending',
            error       TEXT,
            created_at  TEXT NOT NULL,
            synced_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_meta (
            key     TEXT PRIMARY KEY,
            value   TEXT NOT NULL
        );
        ",
    )?;
    // Additive migration — ignored if column already exists
    let _ = conn.execute_batch("ALTER TABLE products ADD COLUMN local_image_path TEXT");
    Ok(())
}

// ── Products ──────────────────────────────────────────────────────────────────

pub fn upsert_products(conn: &Connection, products: &[LocalProduct]) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "INSERT INTO products
            (id, name, price, cost, sku, barcode, unit, category_id, category_name,
             stock_quantity, min_stock, image_url, vat_rate, is_active, track_inventory, last_updated)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
         ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, price=excluded.price, cost=excluded.cost,
             sku=excluded.sku, barcode=excluded.barcode, unit=excluded.unit,
             category_id=excluded.category_id, category_name=excluded.category_name,
             stock_quantity=excluded.stock_quantity, min_stock=excluded.min_stock,
             image_url=excluded.image_url,
             local_image_path = CASE WHEN excluded.image_url IS products.image_url
                                     THEN products.local_image_path ELSE NULL END,
             vat_rate=excluded.vat_rate,
             is_active=excluded.is_active, track_inventory=excluded.track_inventory,
             last_updated=excluded.last_updated",
    )?;
    for p in products {
        stmt.execute(params![
            p.id,
            p.name,
            p.price,
            p.cost,
            p.sku,
            p.barcode,
            p.unit,
            p.category_id,
            p.category_name,
            p.stock_quantity,
            p.min_stock,
            p.image_url,
            p.vat_rate,
            p.is_active as i64,
            p.track_inventory as i64,
            now
        ])?;
    }
    Ok(())
}

pub fn get_products(conn: &Connection) -> SqlResult<Vec<LocalProduct>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, price, cost, sku, barcode, unit, category_id, category_name,
                stock_quantity, min_stock, image_url, local_image_path,
                vat_rate, is_active, track_inventory
         FROM products WHERE is_active = 1 ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LocalProduct {
            id: row.get(0)?,
            name: row.get(1)?,
            price: row.get(2)?,
            cost: row.get(3)?,
            sku: row.get(4)?,
            barcode: row.get(5)?,
            unit: row.get(6)?,
            category_id: row.get(7)?,
            category_name: row.get(8)?,
            stock_quantity: row.get(9)?,
            min_stock: row.get(10)?,
            image_url: row.get(11)?,
            local_image_path: row.get(12)?,
            vat_rate: row.get(13)?,
            is_active: row.get::<_, i64>(14)? != 0,
            track_inventory: row.get::<_, i64>(15)? != 0,
        })
    })?;
    rows.collect()
}

pub fn get_products_needing_images(conn: &Connection) -> SqlResult<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, image_url FROM products
         WHERE image_url IS NOT NULL AND local_image_path IS NULL AND is_active = 1",
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?;
    rows.collect()
}

pub fn update_product_local_image(conn: &Connection, id: i64, path: &str) -> SqlResult<()> {
    conn.execute(
        "UPDATE products SET local_image_path = ?1 WHERE id = ?2",
        params![path, id],
    )?;
    Ok(())
}

pub fn decrement_stock(conn: &Connection, product_id: i64, qty: i64) -> SqlResult<()> {
    conn.execute(
        "UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?1) WHERE id = ?2",
        params![qty, product_id],
    )?;
    Ok(())
}

// ── Customers ─────────────────────────────────────────────────────────────────

pub fn upsert_customers(conn: &Connection, customers: &[LocalCustomer]) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "INSERT INTO customers (id, name, phone, email, credit_balance, last_updated)
         VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, phone=excluded.phone, email=excluded.email,
             credit_balance=excluded.credit_balance, last_updated=excluded.last_updated",
    )?;
    for c in customers {
        stmt.execute(params![c.id, c.name, c.phone, c.email, c.credit_balance, now])?;
    }
    Ok(())
}

pub fn get_customers(conn: &Connection) -> SqlResult<Vec<LocalCustomer>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, phone, email, credit_balance FROM customers ORDER BY name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LocalCustomer {
            id: row.get(0)?,
            name: row.get(1)?,
            phone: row.get(2)?,
            email: row.get(3)?,
            credit_balance: row.get(4)?,
        })
    })?;
    rows.collect()
}

// ── Offline orders ────────────────────────────────────────────────────────────

pub fn create_offline_order(
    conn: &Connection,
    payload: &str,
    branch_id: Option<i64>,
) -> SqlResult<String> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO offline_orders (id, payload, branch_id, status, created_at)
         VALUES (?1, ?2, ?3, 'pending', ?4)",
        params![id, payload, branch_id, now],
    )?;
    Ok(id)
}

pub fn get_pending_orders(conn: &Connection) -> SqlResult<Vec<OfflineOrder>> {
    let mut stmt = conn.prepare(
        "SELECT id, payload, branch_id, status, error, created_at, synced_at
         FROM offline_orders WHERE status IN ('pending','failed') ORDER BY created_at",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(OfflineOrder {
            id: row.get(0)?,
            payload: row.get(1)?,
            branch_id: row.get(2)?,
            status: row.get(3)?,
            error: row.get(4)?,
            created_at: row.get(5)?,
            synced_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn mark_order_synced(conn: &Connection, id: &str) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE offline_orders SET status='synced', synced_at=?1, error=NULL WHERE id=?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn mark_order_failed(conn: &Connection, id: &str, error: &str) -> SqlResult<()> {
    conn.execute(
        "UPDATE offline_orders SET status='failed', error=?1 WHERE id=?2",
        params![error, id],
    )?;
    Ok(())
}

pub fn mark_order_syncing(conn: &Connection, id: &str) -> SqlResult<()> {
    conn.execute(
        "UPDATE offline_orders SET status='syncing' WHERE id=?1",
        params![id],
    )?;
    Ok(())
}

// ── Sync metadata ─────────────────────────────────────────────────────────────

pub fn get_meta(conn: &Connection, key: &str) -> SqlResult<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM sync_meta WHERE key=?1")?;
    let mut rows = stmt.query(params![key])?;
    Ok(rows.next()?.map(|r| r.get(0)).transpose()?)
}

pub fn set_meta(conn: &Connection, key: &str, value: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO sync_meta (key, value) VALUES (?1,?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn get_sync_status(conn: &Connection) -> SqlResult<SyncStatus> {
    let pending_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM offline_orders WHERE status IN ('pending','syncing')",
        [],
        |r| r.get(0),
    )?;
    let failed_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM offline_orders WHERE status='failed'",
        [],
        |r| r.get(0),
    )?;
    Ok(SyncStatus {
        pending_count,
        failed_count,
        products_last_sync: get_meta(conn, "products_last_sync")?,
        customers_last_sync: get_meta(conn, "customers_last_sync")?,
    })
}
