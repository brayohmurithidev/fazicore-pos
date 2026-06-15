"""loyalty: settings + points transactions

Revision ID: v0w1x2y3z4a5
Revises: u9v0w1x2y3z4
Create Date: 2026-05-27
"""

import sqlalchemy as sa
from alembic import op

revision = "v0w1x2y3z4a5"
down_revision = "u9v0w1x2y3z4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS loyalty_settings (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            enabled BOOLEAN NOT NULL DEFAULT false,
            points_per_kes NUMERIC(8,4) NOT NULL DEFAULT 1.0,
            kes_per_point NUMERIC(8,4) NOT NULL DEFAULT 0.5,
            min_redeem_points INTEGER NOT NULL DEFAULT 50,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_loyalty_settings_org UNIQUE (org_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_settings_org_id ON loyalty_settings (org_id)")

    op.execute("""
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pointstransactiontype') THEN
                CREATE TYPE pointstransactiontype AS ENUM ('earn', 'redeem', 'adjust');
            END IF;
        END $$
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS points_transactions (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
            type pointstransactiontype NOT NULL,
            points INTEGER NOT NULL,
            balance_before INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            notes VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_points_transactions_org_id ON points_transactions (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_points_transactions_customer_id ON points_transactions (customer_id)")


def downgrade() -> None:
    op.drop_table("points_transactions")
    op.drop_table("loyalty_settings")
    op.execute("DROP TYPE IF EXISTS pointstransactiontype")
