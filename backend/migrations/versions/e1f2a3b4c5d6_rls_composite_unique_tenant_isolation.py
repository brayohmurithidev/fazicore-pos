"""rls: composite unique constraints + row-level security tenant isolation

Revision ID: e1f2a3b4c5d6
Revises: c3f1d8e2a914
Create Date: 2026-04-30

Changes:
  1. Products: replace global unique on sku/barcode with per-org composite uniques
  2. Create helper function app_current_org_id() used by all RLS policies
  3. Enable FORCE ROW LEVEL SECURITY + tenant_isolation policy on every org-scoped table

Policy logic:
  - When app.current_org_id is not set (migrations, admin connections): all rows visible
  - When app.current_org_id = N: only rows belonging to org N are visible
"""

from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "c3f1d8e2a914"
branch_labels = None
depends_on = None

# Tables with a direct org_id column — uniform policy
_DIRECT_ORG_TABLES = [
    "products",
    "categories",
    "branches",
    "orders",
    "users",
    "customers",
    "purchase_orders",
    "suppliers",
    "stock_transfers",
]

# Child tables: (table, fk_col, parent_table, parent_org_col)
# inventory_transactions is two levels deep, handled separately below.
_SIMPLE_CHILD_TABLES = [
    ("inventory",            "product_id", "products",        "id"),
    ("order_items",          "order_id",   "orders",          "id"),
    ("purchase_order_items", "order_id",   "purchase_orders", "id"),
]


def upgrade() -> None:
    # ── 1. Fix SKU / barcode uniqueness ─────────────────────────────────────
    op.execute("DROP INDEX IF EXISTS ix_products_sku")
    op.execute("DROP INDEX IF EXISTS ix_products_barcode")
    op.execute(
        "ALTER TABLE products "
        "ADD CONSTRAINT uq_products_org_sku UNIQUE (org_id, sku)"
    )
    op.execute(
        "ALTER TABLE products "
        "ADD CONSTRAINT uq_products_org_barcode UNIQUE (org_id, barcode)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_sku ON products (sku)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_barcode ON products (barcode)")

    # ── 2. Helper function ───────────────────────────────────────────────────
    # Returns the current org_id as int, or NULL when the GUC is absent.
    # NULL → bypass (migration / admin connection), int → enforce isolation.
    op.execute("""
        CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS int
            LANGUAGE sql STABLE SECURITY INVOKER AS
        $$
            SELECT NULLIF(current_setting('app.current_org_id', true), '')::int
        $$
    """)

    # ── 3. RLS on direct-org_id tables ──────────────────────────────────────
    for table in _DIRECT_ORG_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"""
            CREATE POLICY tenant_isolation ON {table}
                AS PERMISSIVE FOR ALL TO PUBLIC
                USING (
                    app_current_org_id() IS NULL
                    OR org_id = app_current_org_id()
                )
        """)

    # ── 4. organizations — tenant can only see their own row ─────────────────
    op.execute("ALTER TABLE organizations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE organizations FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON organizations")
    op.execute("""
        CREATE POLICY tenant_isolation ON organizations
            AS PERMISSIVE FOR ALL TO PUBLIC
            USING (
                app_current_org_id() IS NULL
                OR id = app_current_org_id()
            )
    """)

    # ── 5. Simple child tables (one-level FK to an org-scoped parent) ────────
    for table, fk_col, parent_table, parent_pk in _SIMPLE_CHILD_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"""
            CREATE POLICY tenant_isolation ON {table}
                AS PERMISSIVE FOR ALL TO PUBLIC
                USING (
                    app_current_org_id() IS NULL
                    OR {fk_col} IN (
                        SELECT {parent_pk} FROM {parent_table}
                        WHERE org_id = app_current_org_id()
                    )
                )
        """)

    # ── 6. inventory_transactions — two levels deep ──────────────────────────
    # inventory_transactions → inventory_id → inventory.product_id → products.org_id
    op.execute("ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE inventory_transactions FORCE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON inventory_transactions")
    op.execute("""
        CREATE POLICY tenant_isolation ON inventory_transactions
            AS PERMISSIVE FOR ALL TO PUBLIC
            USING (
                app_current_org_id() IS NULL
                OR inventory_id IN (
                    SELECT i.id FROM inventory i
                    JOIN products p ON p.id = i.product_id
                    WHERE p.org_id = app_current_org_id()
                )
            )
    """)


def downgrade() -> None:
    all_tables = (
        _DIRECT_ORG_TABLES
        + ["organizations"]
        + [t for t, _, _, _ in _SIMPLE_CHILD_TABLES]
        + ["inventory_transactions"]
    )
    for table in all_tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.execute("DROP FUNCTION IF EXISTS app_current_org_id()")

    # Restore global unique indexes
    op.execute("DROP INDEX IF EXISTS ix_products_sku")
    op.execute("DROP INDEX IF EXISTS ix_products_barcode")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_org_sku")
    op.execute("ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_org_barcode")
    op.execute("CREATE UNIQUE INDEX ix_products_sku ON products (sku) WHERE sku IS NOT NULL")
    op.execute("CREATE UNIQUE INDEX ix_products_barcode ON products (barcode) WHERE barcode IS NOT NULL")
