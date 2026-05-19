"""add price_history table

Revision ID: l9m0n1o2p3q4
Revises: k8l9m0n1o2p3
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa

revision = 'l9m0n1o2p3q4'
down_revision = 'k8l9m0n1o2p3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'price_history',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('product_id', sa.Integer(), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('old_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('new_price', sa.Numeric(10, 2), nullable=False),
        sa.Column('changed_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('price_history')
