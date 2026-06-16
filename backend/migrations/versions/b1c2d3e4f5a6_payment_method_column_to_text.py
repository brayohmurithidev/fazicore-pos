"""convert payment_method column to plain text

The original paymentmethod PG enum was created with uppercase labels
(CASH, MPESA, CREDIT, SPLIT, OTHER). SQLAlchemy's native enum type
processor builds its lookup from the Python enum *names* (also uppercase),
so it matches uppercase DB labels. When rows started containing lowercase
values (mpesa_cash, card, etc.) the lookup failed with LookupError.

This migration drops the dependency on the PG enum type entirely by
casting the column to plain text and normalising all values to lowercase.
The model now uses a TypeDecorator (String-backed) that handles any case.

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-06-16 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Cast to text — works whether the column is currently a PG enum or already text
    op.execute(
        "ALTER TABLE orders ALTER COLUMN payment_method TYPE text "
        "USING payment_method::text"
    )
    # Normalise to lowercase (handles uppercase labels from old PG enum)
    op.execute(
        "UPDATE orders SET payment_method = LOWER(payment_method) "
        "WHERE payment_method != LOWER(payment_method)"
    )
    # Map any remaining legacy/unknown values to a valid one
    op.execute(
        "UPDATE orders SET payment_method = 'mpesa' "
        "WHERE payment_method NOT IN ('cash', 'mpesa', 'credit', 'mpesa_cash')"
    )
    # Drop the PG enum type — no longer needed
    op.execute("DROP TYPE IF EXISTS paymentmethod")


def downgrade() -> None:
    op.execute("CREATE TYPE paymentmethod AS ENUM ('cash', 'mpesa', 'credit', 'mpesa_cash')")
    op.execute(
        "ALTER TABLE orders ALTER COLUMN payment_method TYPE paymentmethod "
        "USING payment_method::paymentmethod"
    )
