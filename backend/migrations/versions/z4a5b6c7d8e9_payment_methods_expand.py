"""expand payment methods: card, airtel, bank_transfer, cheque

Revision ID: z4a5b6c7d8e9
Revises: y3z4a5b6c7d8
Create Date: 2026-06-15 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

revision: str = "z4a5b6c7d8e9"
down_revision: str | None = "y3z4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostgreSQL ALTER TYPE ADD VALUE cannot run inside a transaction block
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'card'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'airtel'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'bank_transfer'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'cheque'")


def downgrade() -> None:
    # Enum values cannot be removed in PostgreSQL without recreating the type
    pass
