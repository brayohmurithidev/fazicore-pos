"""add mpesa callback_key + unique constraint on transaction receipt

Closes two gaps: (1) Safaricom callbacks have no payload signing, so callback
URLs now carry a random per-credentials key that must be echoed back on every
inbound request; (2) Safaricom retries callback delivery on its own timeouts,
which previously created a second MpesaTransaction row and double-credited
the sale — a unique constraint on (org_id, mpesa_receipt_number) makes that
impossible at the DB level (NULL receipts, e.g. pending STK, are exempt).

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-17 00:00:00.000000
"""
import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "mpesa_credentials",
        sa.Column("callback_key", sa.String(64), nullable=True),
    )

    # Backfill existing rows so already-configured orgs aren't left with an
    # unvalidated callback URL until they happen to touch their credentials again.
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id FROM mpesa_credentials WHERE callback_key IS NULL")).fetchall()
    for (cred_id,) in rows:
        conn.execute(
            sa.text("UPDATE mpesa_credentials SET callback_key = :key WHERE id = :id"),
            {"key": secrets.token_urlsafe(24), "id": cred_id},
        )

    # Collapse any pre-existing duplicate receipts before the constraint lands,
    # keeping the earliest row (the one that should have "won").
    op.execute(
        """
        DELETE FROM mpesa_transactions t
        USING mpesa_transactions earlier
        WHERE t.mpesa_receipt_number IS NOT NULL
          AND t.org_id = earlier.org_id
          AND t.mpesa_receipt_number = earlier.mpesa_receipt_number
          AND earlier.id < t.id
        """
    )

    op.create_unique_constraint(
        "uq_mpesa_tx_org_receipt",
        "mpesa_transactions",
        ["org_id", "mpesa_receipt_number"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_mpesa_tx_org_receipt", "mpesa_transactions", type_="unique")
    op.drop_column("mpesa_credentials", "callback_key")
