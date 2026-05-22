"""mpesa_transactions: add account_reference column for subscription payments

Revision ID: r6s7t8u9v0w1
Revises: q4r5s6t7u8v9
Create Date: 2026-05-22

Encodes the payment intent as a short string, e.g. "SUBSUP:growth:monthly",
so the STK callback can activate the correct subscription without a join table.
"""

import sqlalchemy as sa
from alembic import op

revision = "r6s7t8u9v0w1"
down_revision = "q4r5s6t7u8v9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mpesa_transactions",
        sa.Column("account_reference", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mpesa_transactions", "account_reference")
