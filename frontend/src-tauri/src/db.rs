use chrono::Utc;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub struct DbState(pub Arc<Mutex<Connection>>);

// ── Shared structs ────────────────────────────────────────────────────────────

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
    pub is_local: bool,
    pub variant_count: i64,
    pub variants_json: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalUser {
    pub id: i64,
    pub name: String,
    pub role: String,
    pub is_active: bool,
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
pub struct LocalOrderItem {
    pub product_id: i64,
    pub name: String,
    pub sku: Option<String>,
    pub qty: i64,
    pub price: f64,
    pub cost: Option<f64>,
    pub vat_rate: f64,
    pub subtotal: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalOrder {
    pub id: String,
    pub total: f64,
    pub subtotal: f64,
    pub tax: f64,
    pub discount: f64,
    pub payment_method: String,
    pub amount_tendered: Option<f64>,
    pub change_due: Option<f64>,
    pub customer_id: Option<i64>,
    pub customer_name: Option<String>,
    pub cashier_id: Option<i64>,
    pub cashier_name: Option<String>,
    pub branch_id: Option<i64>,
    pub notes: Option<String>,
    pub items: Vec<LocalOrderItem>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalCategory {
    pub id: i64,
    pub name: String,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalSalesReport {
    pub total_sales: f64,
    pub total_orders: i64,
    pub total_tax: f64,
    pub total_discount: f64,
    pub top_products: Vec<TopProduct>,
    pub daily_totals: Vec<DailyTotal>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TopProduct {
    pub product_id: i64,
    pub name: String,
    pub qty_sold: i64,
    pub revenue: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyTotal {
    pub date: String,
    pub total: f64,
    pub orders: i64,
}

// ── Schema init ───────────────────────────────────────────────────────────────

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

        -- Standalone mode: local users with PIN auth
        CREATE TABLE IF NOT EXISTS local_users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            pin_hash    TEXT NOT NULL,
            role        TEXT NOT NULL DEFAULT 'cashier',
            is_active   INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL
        );

        -- Standalone mode: committed orders (permanent history)
        CREATE TABLE IF NOT EXISTS local_orders (
            id              TEXT PRIMARY KEY,
            total           REAL NOT NULL,
            subtotal        REAL NOT NULL DEFAULT 0,
            tax             REAL NOT NULL DEFAULT 0,
            discount        REAL NOT NULL DEFAULT 0,
            payment_method  TEXT NOT NULL DEFAULT 'cash',
            amount_tendered REAL,
            change_due      REAL,
            customer_id     INTEGER,
            customer_name   TEXT,
            cashier_id      INTEGER,
            cashier_name    TEXT,
            branch_id       INTEGER,
            notes           TEXT,
            created_at      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS local_order_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id    TEXT NOT NULL REFERENCES local_orders(id) ON DELETE CASCADE,
            product_id  INTEGER NOT NULL,
            name        TEXT NOT NULL,
            sku         TEXT,
            qty         INTEGER NOT NULL,
            price       REAL NOT NULL,
            cost        REAL,
            vat_rate    REAL NOT NULL DEFAULT 0,
            subtotal    REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_local_orders_created ON local_orders(created_at);
        CREATE INDEX IF NOT EXISTS idx_local_order_items_order ON local_order_items(order_id);

        -- Standalone mode: product categories
        CREATE TABLE IF NOT EXISTS local_categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );
        ",
    )?;

    // Additive migrations — silently ignored if column already exists
    let _ = conn.execute_batch("ALTER TABLE products ADD COLUMN local_image_path TEXT");
    let _ = conn.execute_batch("ALTER TABLE products ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0");
    let _ = conn.execute_batch("ALTER TABLE products ADD COLUMN variant_count INTEGER NOT NULL DEFAULT 0");
    let _ = conn.execute_batch("ALTER TABLE products ADD COLUMN variants_json TEXT");
    let _ = conn.execute_batch("ALTER TABLE customers ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0");

    Ok(())
}

// ── PIN helpers ───────────────────────────────────────────────────────────────

pub fn hash_pin(pin: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pin.as_bytes());
    format!("{:x}", hasher.finalize())
}

// ── Local users ───────────────────────────────────────────────────────────────

pub fn count_local_users(conn: &Connection) -> SqlResult<i64> {
    conn.query_row("SELECT COUNT(*) FROM local_users WHERE is_active = 1", [], |r| r.get(0))
}

pub fn create_local_user(
    conn: &Connection,
    name: &str,
    pin: &str,
    role: &str,
) -> SqlResult<LocalUser> {
    let now = Utc::now().to_rfc3339();
    let pin_hash = hash_pin(pin);
    conn.execute(
        "INSERT INTO local_users (name, pin_hash, role, created_at) VALUES (?1,?2,?3,?4)",
        params![name, pin_hash, role, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(LocalUser { id, name: name.to_string(), role: role.to_string(), is_active: true })
}

pub fn get_local_users(conn: &Connection) -> SqlResult<Vec<LocalUser>> {
    let mut stmt =
        conn.prepare("SELECT id, name, role, is_active FROM local_users ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(LocalUser {
            id: row.get(0)?,
            name: row.get(1)?,
            role: row.get(2)?,
            is_active: row.get::<_, i64>(3)? != 0,
        })
    })?;
    rows.collect()
}

pub fn verify_local_pin(conn: &Connection, user_id: i64, pin: &str) -> SqlResult<Option<LocalUser>> {
    let pin_hash = hash_pin(pin);
    let mut stmt = conn.prepare(
        "SELECT id, name, role, is_active FROM local_users
         WHERE id = ?1 AND pin_hash = ?2 AND is_active = 1",
    )?;
    let mut rows = stmt.query(params![user_id, pin_hash])?;
    Ok(rows.next()?.map(|row| {
        LocalUser {
            id: row.get(0).unwrap(),
            name: row.get(1).unwrap(),
            role: row.get(2).unwrap(),
            is_active: true,
        }
    }))
}

pub fn update_local_user(
    conn: &Connection,
    id: i64,
    name: &str,
    pin: Option<&str>,
    role: &str,
    is_active: bool,
) -> SqlResult<()> {
    if let Some(pin) = pin {
        let pin_hash = hash_pin(pin);
        conn.execute(
            "UPDATE local_users SET name=?1, pin_hash=?2, role=?3, is_active=?4 WHERE id=?5",
            params![name, pin_hash, role, is_active as i64, id],
        )?;
    } else {
        conn.execute(
            "UPDATE local_users SET name=?1, role=?2, is_active=?3 WHERE id=?4",
            params![name, role, is_active as i64, id],
        )?;
    }
    Ok(())
}

// ── Products ──────────────────────────────────────────────────────────────────

fn row_to_product(row: &rusqlite::Row<'_>) -> rusqlite::Result<LocalProduct> {
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
        is_local: row.get::<_, i64>(16)? != 0,
        variant_count: row.get(17)?,
        variants_json: row.get(18)?,
    })
}

pub fn upsert_products(conn: &Connection, products: &[LocalProduct]) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "INSERT INTO products
            (id, name, price, cost, sku, barcode, unit, category_id, category_name,
             stock_quantity, min_stock, image_url, vat_rate, is_active, track_inventory,
             variant_count, variants_json, last_updated)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)
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
             variant_count=excluded.variant_count, variants_json=excluded.variants_json,
             last_updated=excluded.last_updated",
    )?;
    for p in products {
        stmt.execute(params![
            p.id, p.name, p.price, p.cost, p.sku, p.barcode, p.unit,
            p.category_id, p.category_name, p.stock_quantity, p.min_stock,
            p.image_url, p.vat_rate, p.is_active as i64, p.track_inventory as i64,
            p.variant_count, p.variants_json, now
        ])?;
    }
    Ok(())
}

pub fn get_products(conn: &Connection) -> SqlResult<Vec<LocalProduct>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, price, cost, sku, barcode, unit, category_id, category_name,
                stock_quantity, min_stock, image_url, local_image_path,
                vat_rate, is_active, track_inventory, is_local,
                COALESCE(variant_count, 0), variants_json
         FROM products WHERE is_active = 1 ORDER BY name",
    )?;
    let rows = stmt.query_map([], row_to_product)?;
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
    conn.execute("UPDATE products SET local_image_path = ?1 WHERE id = ?2", params![path, id])?;
    Ok(())
}

pub fn decrement_stock(conn: &Connection, product_id: i64, qty: i64) -> SqlResult<()> {
    conn.execute(
        "UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?1) WHERE id = ?2",
        params![qty, product_id],
    )?;
    Ok(())
}

pub fn local_create_product(
    conn: &Connection,
    name: &str,
    price: f64,
    cost: Option<f64>,
    sku: Option<&str>,
    barcode: Option<&str>,
    unit: &str,
    category_id: Option<i64>,
    category_name: Option<&str>,
    stock_quantity: i64,
    min_stock: i64,
    vat_rate: f64,
    track_inventory: bool,
) -> SqlResult<LocalProduct> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO products
            (name, price, cost, sku, barcode, unit, category_id, category_name,
             stock_quantity, min_stock, vat_rate, is_active, track_inventory, is_local, last_updated)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1,?12,1,?13)",
        params![
            name, price, cost, sku, barcode, unit, category_id, category_name,
            stock_quantity, min_stock, vat_rate, track_inventory as i64, now
        ],
    )?;
    let id = conn.last_insert_rowid();
    Ok(LocalProduct {
        id, name: name.to_string(), price, cost, sku: sku.map(str::to_string),
        barcode: barcode.map(str::to_string), unit: unit.to_string(),
        category_id, category_name: category_name.map(str::to_string),
        stock_quantity, min_stock, image_url: None, local_image_path: None,
        vat_rate, is_active: true, track_inventory, is_local: true,
        variant_count: 0, variants_json: None,
    })
}

pub fn local_update_product(
    conn: &Connection,
    id: i64,
    name: &str,
    price: f64,
    cost: Option<f64>,
    sku: Option<&str>,
    barcode: Option<&str>,
    unit: &str,
    category_id: Option<i64>,
    category_name: Option<&str>,
    min_stock: i64,
    vat_rate: f64,
    is_active: bool,
    track_inventory: bool,
) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE products SET
            name=?1, price=?2, cost=?3, sku=?4, barcode=?5, unit=?6,
            category_id=?7, category_name=?8, min_stock=?9, vat_rate=?10,
            is_active=?11, track_inventory=?12, last_updated=?13
         WHERE id=?14",
        params![
            name, price, cost, sku, barcode, unit, category_id, category_name,
            min_stock, vat_rate, is_active as i64, track_inventory as i64, now, id
        ],
    )?;
    Ok(())
}

pub fn local_delete_product(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("UPDATE products SET is_active = 0 WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn local_adjust_inventory(conn: &Connection, product_id: i64, qty_change: i64) -> SqlResult<()> {
    conn.execute(
        "UPDATE products SET stock_quantity = MAX(0, stock_quantity + ?1) WHERE id = ?2",
        params![qty_change, product_id],
    )?;
    Ok(())
}

// ── Categories ────────────────────────────────────────────────────────────────

pub fn get_local_categories(conn: &Connection) -> SqlResult<Vec<LocalCategory>> {
    let mut stmt = conn.prepare("SELECT id, name FROM local_categories ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(LocalCategory { id: row.get(0)?, name: row.get(1)? })
    })?;
    rows.collect()
}

pub fn create_local_category(conn: &Connection, name: &str) -> SqlResult<LocalCategory> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO local_categories (name, created_at) VALUES (?1, ?2)",
        params![name, now],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM local_categories WHERE name = ?1",
        params![name],
        |r| r.get(0),
    )?;
    Ok(LocalCategory { id, name: name.to_string() })
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
    let mut stmt =
        conn.prepare("SELECT id, name, phone, email, credit_balance FROM customers ORDER BY name")?;
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

pub fn local_create_customer(
    conn: &Connection,
    name: &str,
    phone: Option<&str>,
    email: Option<&str>,
) -> SqlResult<LocalCustomer> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO customers (name, phone, email, credit_balance, is_local, last_updated)
         VALUES (?1,?2,?3,0,1,?4)",
        params![name, phone, email, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(LocalCustomer {
        id,
        name: name.to_string(),
        phone: phone.map(str::to_string),
        email: email.map(str::to_string),
        credit_balance: 0.0,
    })
}

pub fn local_update_customer(
    conn: &Connection,
    id: i64,
    name: &str,
    phone: Option<&str>,
    email: Option<&str>,
) -> SqlResult<()> {
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE customers SET name=?1, phone=?2, email=?3, last_updated=?4 WHERE id=?5",
        params![name, phone, email, now, id],
    )?;
    Ok(())
}

// ── Local committed orders ────────────────────────────────────────────────────

pub fn commit_local_order(conn: &Connection, order: &LocalOrder) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO local_orders
            (id, total, subtotal, tax, discount, payment_method,
             amount_tendered, change_due, customer_id, customer_name,
             cashier_id, cashier_name, branch_id, notes, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![
            order.id, order.total, order.subtotal, order.tax, order.discount,
            order.payment_method, order.amount_tendered, order.change_due,
            order.customer_id, order.customer_name,
            order.cashier_id, order.cashier_name,
            order.branch_id, order.notes, order.created_at
        ],
    )?;
    for item in &order.items {
        conn.execute(
            "INSERT INTO local_order_items
                (order_id, product_id, name, sku, qty, price, cost, vat_rate, subtotal)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                order.id, item.product_id, item.name, item.sku,
                item.qty, item.price, item.cost, item.vat_rate, item.subtotal
            ],
        )?;
    }
    Ok(())
}

fn load_order_items(conn: &Connection, order_id: &str) -> SqlResult<Vec<LocalOrderItem>> {
    let mut stmt = conn.prepare(
        "SELECT product_id, name, sku, qty, price, cost, vat_rate, subtotal
         FROM local_order_items WHERE order_id = ?1",
    )?;
    let rows = stmt.query_map(params![order_id], |row| {
        Ok(LocalOrderItem {
            product_id: row.get(0)?,
            name: row.get(1)?,
            sku: row.get(2)?,
            qty: row.get(3)?,
            price: row.get(4)?,
            cost: row.get(5)?,
            vat_rate: row.get(6)?,
            subtotal: row.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn get_local_orders(
    conn: &Connection,
    limit: i64,
    offset: i64,
    from_date: Option<&str>,
    to_date: Option<&str>,
) -> SqlResult<Vec<LocalOrder>> {
    let mut sql = "SELECT id, total, subtotal, tax, discount, payment_method,
                          amount_tendered, change_due, customer_id, customer_name,
                          cashier_id, cashier_name, branch_id, notes, created_at
                   FROM local_orders WHERE 1=1".to_string();
    if from_date.is_some() { sql.push_str(" AND created_at >= ?3"); }
    if to_date.is_some()   { sql.push_str(" AND created_at <= ?4"); }
    sql.push_str(" ORDER BY created_at DESC LIMIT ?1 OFFSET ?2");

    let mut stmt = conn.prepare(&sql)?;
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<f64>>(6)?,
            row.get::<_, Option<f64>>(7)?,
            row.get::<_, Option<i64>>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, Option<i64>>(10)?,
            row.get::<_, Option<String>>(11)?,
            row.get::<_, Option<i64>>(12)?,
            row.get::<_, Option<String>>(13)?,
            row.get::<_, String>(14)?,
        ))
    };

    let rows: Vec<_> = match (from_date, to_date) {
        (Some(f), Some(t)) => stmt.query_map(params![limit, offset, f, t], map_row)?.collect(),
        (Some(f), None)    => stmt.query_map(params![limit, offset, f],    map_row)?.collect(),
        (None,    Some(t)) => stmt.query_map(params![limit, offset, t],    map_row)?.collect(),
        (None,    None)    => stmt.query_map(params![limit, offset],        map_row)?.collect(),
    };

    let mut orders = Vec::new();
    for row in rows {
        let (id, total, subtotal, tax, discount, payment_method,
             amount_tendered, change_due, customer_id, customer_name,
             cashier_id, cashier_name, branch_id, notes, created_at) = row?;
        let items = load_order_items(conn, &id)?;
        orders.push(LocalOrder {
            id, total, subtotal, tax, discount, payment_method,
            amount_tendered, change_due, customer_id, customer_name,
            cashier_id, cashier_name, branch_id, notes, items, created_at,
        });
    }
    Ok(orders)
}

pub fn get_local_sales_report(
    conn: &Connection,
    from_date: &str,
    to_date: &str,
) -> SqlResult<LocalSalesReport> {
    let (total_sales, total_orders, total_tax, total_discount): (f64, i64, f64, f64) =
        conn.query_row(
            "SELECT COALESCE(SUM(total),0), COUNT(*), COALESCE(SUM(tax),0), COALESCE(SUM(discount),0)
             FROM local_orders WHERE created_at >= ?1 AND created_at <= ?2",
            params![from_date, to_date],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;

    let mut top_stmt = conn.prepare(
        "SELECT i.product_id, i.name, SUM(i.qty) as qty, SUM(i.subtotal) as rev
         FROM local_order_items i
         JOIN local_orders o ON o.id = i.order_id
         WHERE o.created_at >= ?1 AND o.created_at <= ?2
         GROUP BY i.product_id, i.name ORDER BY rev DESC LIMIT 10",
    )?;
    let top_products = top_stmt
        .query_map(params![from_date, to_date], |row| {
            Ok(TopProduct {
                product_id: row.get(0)?,
                name: row.get(1)?,
                qty_sold: row.get(2)?,
                revenue: row.get(3)?,
            })
        })?
        .collect::<SqlResult<_>>()?;

    let mut daily_stmt = conn.prepare(
        "SELECT substr(created_at,1,10) as day, SUM(total), COUNT(*)
         FROM local_orders WHERE created_at >= ?1 AND created_at <= ?2
         GROUP BY day ORDER BY day",
    )?;
    let daily_totals = daily_stmt
        .query_map(params![from_date, to_date], |row| {
            Ok(DailyTotal { date: row.get(0)?, total: row.get(1)?, orders: row.get(2)? })
        })?
        .collect::<SqlResult<_>>()?;

    Ok(LocalSalesReport { total_sales, total_orders, total_tax, total_discount, top_products, daily_totals })
}

// ── Offline order queue (sync-based orders) ────────────────────────────────────

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
    conn.execute("UPDATE offline_orders SET status='syncing' WHERE id=?1", params![id])?;
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

/// Wipe the server-synced tenant mirror so a different org never sees the
/// previous shop's catalogue. Called when the logged-in org changes.
/// Sync watermarks are reset so the next sync pulls a fresh full snapshot.
/// Pending offline orders are intentionally left untouched.
pub fn clear_synced_data(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "DELETE FROM products;
         DELETE FROM customers;
         DELETE FROM local_categories;
         DELETE FROM sync_meta WHERE key LIKE '%last_sync%';",
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
