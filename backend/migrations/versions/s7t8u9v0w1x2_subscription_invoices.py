"""subscription_invoices: invoice tracking table

Revision ID: s7t8u9v0w1x2
Revises: r6s7t8u9v0w1
Create Date: 2026-05-22

Tracks each billing cycle invoice — created on subscription activation /
renewal and paid when M-Pesa payment is confirmed (STK or C2B paybill).
"""

import sqlalchemy as sa
from alembic import op

revision = "s7t8u9v0w1x2"
down_revision = "r6s7t8u9v0w1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subscription_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_number", sa.String(50), unique=True, nullable=True, index=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("subscription_id", sa.Integer(), sa.ForeignKey("subscriptions.id"), nullable=True),
        sa.Column("plan_name", sa.String(100), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="KES"),
        sa.Column("billing_interval", sa.String(20), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum("open", "paid", "overdue", "void", name="invoicestatus"),
            nullable=False,
            server_default="open",
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_method", sa.String(50), nullable=True),
        sa.Column("mpesa_receipt", sa.String(50), nullable=True, index=True),
        sa.Column("mpesa_phone", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("subscription_invoices")
    op.execute("DROP TYPE IF EXISTS invoicestatus")
