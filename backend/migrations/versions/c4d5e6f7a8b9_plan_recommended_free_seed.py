"""plan is_recommended column and free plan seed

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-05-03

"""
from alembic import op
import sqlalchemy as sa
import json

revision = 'c4d5e6f7a8b9'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None

FREE_PLAN_FEATURES = {
    "mpesa_manual": True,
    "mpesa_stk": False,
    "sms_receipts": True,
    "credit_system": True,
    "advanced_reports": True,
    "inventory_analytics": True,
    "audit_logs": True,
    "permissions_mgmt": True,
    "multi_branch": False,
    "barcode_mode": True,
    "custom_units": True,
    "api_access": False,
}


def upgrade() -> None:
    op.add_column(
        "subscription_plans",
        sa.Column("is_recommended", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Seed the Free plan only if a plan with slug 'free' doesn't already exist
    conn = op.get_bind()
    existing = conn.execute(
        sa.text("SELECT id FROM subscription_plans WHERE slug = 'free' LIMIT 1")
    ).fetchone()
    if not existing:
        conn.execute(
            sa.text("""
                INSERT INTO subscription_plans
                    (name, slug, description, price_monthly, price_annual,
                     max_users, max_products, max_branches,
                     trial_days, features, sort_order, is_active, is_recommended,
                     created_at, updated_at)
                VALUES
                    ('Free', 'free', 'Core POS features at no cost — always free',
                     0, 0, 2, 500, 1,
                     0, :features, 0, true, false,
                     NOW(), NOW())
            """),
            {"features": json.dumps(FREE_PLAN_FEATURES)},
        )


def downgrade() -> None:
    op.drop_column("subscription_plans", "is_recommended")
