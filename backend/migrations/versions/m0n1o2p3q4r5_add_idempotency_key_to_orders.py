"""add idempotency_key to orders

Revision ID: m0n1o2p3q4r5
Revises: l9m0n1o2p3q4
Create Date: 2026-05-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'm0n1o2p3q4r5'
down_revision = 'l9m0n1o2p3q4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('idempotency_key', sa.String(64), nullable=True))
    op.create_index('ix_orders_idempotency_key', 'orders', ['idempotency_key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_orders_idempotency_key', table_name='orders')
    op.drop_column('orders', 'idempotency_key')
