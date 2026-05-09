"""add voided order status and void metadata

Revision ID: i6j7k8l9m0n1
Revises: h5i6j7k8l9m0
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'i6j7k8l9m0n1'
down_revision = 'h5i6j7k8l9m0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'voided' to orderstatus enum
    op.execute("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'voided'")

    # Add void metadata columns to orders
    op.add_column('orders', sa.Column('voided_by', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('voided_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('orders', sa.Column('void_reason', sa.String(300), nullable=True))
    op.add_column('orders', sa.Column('edited_by', sa.Integer(), nullable=True))
    op.add_column('orders', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'edited_at')
    op.drop_column('orders', 'edited_by')
    op.drop_column('orders', 'void_reason')
    op.drop_column('orders', 'voided_at')
    op.drop_column('orders', 'voided_by')
