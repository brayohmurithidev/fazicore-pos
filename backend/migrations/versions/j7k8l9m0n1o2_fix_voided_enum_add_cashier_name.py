"""fix voided enum casing and add cashier_name to orders

Revision ID: j7k8l9m0n1o2
Revises: i6j7k8l9m0n1
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'j7k8l9m0n1o2'
down_revision = 'i6j7k8l9m0n1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Previous migration added 'voided' (lowercase) but the DB enum uses
    # uppercase names to match SQLAlchemy's name-based serialisation.
    op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'VOIDED'")

    op.add_column('orders', sa.Column('cashier_name', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'cashier_name')
    # PostgreSQL does not support removing enum values; VOIDED stays.
