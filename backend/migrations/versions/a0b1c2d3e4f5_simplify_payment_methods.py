"""simplify payment methods: cash, mpesa, credit, mpesa_cash only

Removes card, airtel, bank_transfer, cheque, other from the paymentmethod
enum and normalises the case (initial migration used uppercase; expand
migration added lowercase values — this recreates the type cleanly in
lowercase so the Python enum and DB agree).

Revision ID: a0b1c2d3e4f5
Revises: z4a5b6c7d8e9
Create Date: 2026-06-16 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: str | None = "z4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Normalise any uppercase legacy values inserted by the initial migration
    op.execute("UPDATE orders SET payment_method = LOWER(payment_method::text) WHERE payment_method::text != LOWER(payment_method::text)")

    # 2. Map any removed methods to their nearest equivalent
    op.execute("UPDATE orders SET payment_method = 'mpesa'      WHERE payment_method::text IN ('card','airtel','bank_transfer','cheque','other','CARD','AIRTEL','BANK_TRANSFER','CHEQUE','OTHER')")
    op.execute("UPDATE orders SET payment_method = 'cash'       WHERE payment_method::text IN ('CASH')")
    op.execute("UPDATE orders SET payment_method = 'mpesa'      WHERE payment_method::text IN ('MPESA')")
    op.execute("UPDATE orders SET payment_method = 'credit'     WHERE payment_method::text IN ('CREDIT')")
    op.execute("UPDATE orders SET payment_method = 'mpesa_cash' WHERE payment_method::text IN ('split', 'SPLIT')")

    # 3. Swap column to text so we can drop + recreate the type
    op.execute("ALTER TABLE orders ALTER COLUMN payment_method TYPE text USING payment_method::text")

    # 4. Drop old enum
    op.execute("DROP TYPE IF EXISTS paymentmethod")

    # 5. Create clean enum
    op.execute("CREATE TYPE paymentmethod AS ENUM ('cash', 'mpesa', 'credit', 'mpesa_cash')")

    # 6. Re-apply the typed column
    op.execute("ALTER TABLE orders ALTER COLUMN payment_method TYPE paymentmethod USING payment_method::paymentmethod")


def downgrade() -> None:
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'card'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'airtel'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'bank_transfer'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'cheque'")
    op.execute("ALTER TYPE paymentmethod ADD VALUE IF NOT EXISTS 'other'")
