"""widen mpesa_transactions.phone and subscription_invoices.mpesa_phone

Safaricom's documented C2B confirmation payload masks MSISDN to something
like "2547 ***** 126" (~14 chars), well within the old VARCHAR(20). In
production, at least one shortcode is instead sending a 64-character
hashed MSISDN — observed live, crashing the insert with
StringDataRightTruncationError and silently dropping the C2B confirmation
(the transaction is never recorded; Safaricom doesn't retry forever).
Widening defensively rather than special-casing the hash, since we can't
control what Safaricom's account-level config sends.

Revision ID: f37ab18afe76
Revises: c2d3e4f5a6b7
Create Date: 2026-06-21 22:20:57.498614

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f37ab18afe76"
down_revision: str | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("mpesa_transactions", "phone", type_=sa.String(100))
    op.alter_column("subscription_invoices", "mpesa_phone", type_=sa.String(100))


def downgrade() -> None:
    op.alter_column("subscription_invoices", "mpesa_phone", type_=sa.String(20))
    op.alter_column("mpesa_transactions", "phone", type_=sa.String(20))
