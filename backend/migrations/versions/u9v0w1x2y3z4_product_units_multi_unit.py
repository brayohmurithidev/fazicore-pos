"""product_units: multi-unit selling and purchasing

Revision ID: u9v0w1x2y3z4
Revises: t8u9v0w1x2y3
Create Date: 2026-05-27

Adds:
  - product_units table — child of products; each row is an alternate selling/purchasing
    unit (e.g. Crate=24, Pack=6) with its own barcode, price override, and conversion factor
  - order_items.unit_id / unit_name / conversion_factor — records which unit was sold
  - purchase_order_items.unit_id / unit_name / conversion_factor — records which unit was received
"""

import sqlalchemy as sa
from alembic import op

revision = "u9v0w1x2y3z4"
down_revision = "t8u9v0w1x2y3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_units",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("abbreviation", sa.String(10), nullable=True),
        sa.Column("conversion_factor", sa.Numeric(10, 4), nullable=False, server_default="1"),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
        sa.Column("barcode", sa.String(100), nullable=True, index=True),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("product_id", "name", name="uq_product_units_product_name"),
    )

    op.add_column("order_items", sa.Column("unit_id", sa.Integer(), sa.ForeignKey("product_units.id", ondelete="SET NULL"), nullable=True))
    op.add_column("order_items", sa.Column("unit_name", sa.String(50), nullable=True))
    op.add_column("order_items", sa.Column("conversion_factor", sa.Numeric(10, 4), nullable=False, server_default="1"))

    op.add_column("purchase_order_items", sa.Column("unit_id", sa.Integer(), sa.ForeignKey("product_units.id", ondelete="SET NULL"), nullable=True))
    op.add_column("purchase_order_items", sa.Column("unit_name", sa.String(50), nullable=True))
    op.add_column("purchase_order_items", sa.Column("conversion_factor", sa.Numeric(10, 4), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("purchase_order_items", "conversion_factor")
    op.drop_column("purchase_order_items", "unit_name")
    op.drop_column("purchase_order_items", "unit_id")

    op.drop_column("order_items", "conversion_factor")
    op.drop_column("order_items", "unit_name")
    op.drop_column("order_items", "unit_id")

    op.drop_table("product_units")
