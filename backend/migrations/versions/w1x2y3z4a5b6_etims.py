"""etims: config + submissions tables

Revision ID: w1x2y3z4a5b6
Revises: v0w1x2y3z4a5
Create Date: 2026-05-27
"""

from alembic import op

revision = "w1x2y3z4a5b6"
down_revision = "v0w1x2y3z4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS etims_config (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
            kra_pin VARCHAR(20) NOT NULL,
            bhf_id VARCHAR(10) NOT NULL DEFAULT '00',
            device_serial VARCHAR(50),
            sandbox_mode BOOLEAN NOT NULL DEFAULT TRUE,
            is_active BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_etims_config_org_id ON etims_config (org_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS etims_submissions (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
            cu_invoice_no VARCHAR(50),
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            payload JSONB NOT NULL DEFAULT '{}',
            response JSONB,
            error_message TEXT,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            next_retry_at TIMESTAMPTZ,
            submitted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_etims_submissions_org_id ON etims_submissions (org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_etims_submissions_order_id ON etims_submissions (order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_etims_submissions_status ON etims_submissions (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_etims_submissions_next_retry ON etims_submissions (next_retry_at) WHERE status IN ('pending','failed')")


def downgrade() -> None:
    op.drop_table("etims_submissions")
    op.drop_table("etims_config")
