"""inventory_batches: batch-level expiry and FIFO tracking

Revision ID: t8u9v0w1x2y3
Revises: s7t8u9v0w1x2
Create Date: 2026-05-27

Adds:
  - inventory_batches table — one row per stock receipt, tracks quantity_remaining
    and expiry_date per batch for FIFO-aware expiry enforcement at POS
  - purchase_order_items.expiry_date — captures expiry per line item at receive time
"""

import sqlalchemy as sa
from alembic import op

revision = "t8u9v0w1x2y3"
down_revision = "s7t8u9v0w1x2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use IF NOT EXISTS — column may already exist from an earlier migration on older deployments
    op.execute("ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS expiry_date DATE")

    op.create_table(
        "inventory_batches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id"), nullable=True, index=True),
        sa.Column("purchase_order_item_id", sa.Integer(), sa.ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("batch_number", sa.String(100), nullable=True),
        sa.Column("quantity_received", sa.Integer(), nullable=False),
        sa.Column("quantity_remaining", sa.Integer(), nullable=False),
        sa.Column("cost_per_unit", sa.Numeric(10, 2), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=True, index=True),
        sa.Column("received_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("inventory_batches")
    op.drop_column("purchase_order_items", "expiry_date")
