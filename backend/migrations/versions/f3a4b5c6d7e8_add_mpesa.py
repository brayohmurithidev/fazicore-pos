"""add mpesa credentials and transactions

Revision ID: f3a4b5c6d7e8
Revises: a8b9c0d1e2f3
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'f3a4b5c6d7e8'
down_revision = 'a8b9c0d1e2f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mpesa_credentials',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False, unique=True, index=True),
        sa.Column('environment', sa.Enum('sandbox', 'production', name='mpesaenvironment'), nullable=False, server_default='sandbox'),
        sa.Column('shortcode', sa.String(20), nullable=False),
        sa.Column('consumer_key_enc', sa.Text(), nullable=False),
        sa.Column('consumer_secret_enc', sa.Text(), nullable=False),
        sa.Column('passkey_enc', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('callback_url_override', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )

    op.create_table(
        'mpesa_transactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False, index=True),
        sa.Column('order_id', sa.Integer(), sa.ForeignKey('orders.id'), nullable=True, index=True),
        sa.Column('transaction_type', sa.Enum('stk_push', 'c2b', name='mpesatransactiontype'), nullable=False),
        sa.Column('status', sa.Enum('pending', 'completed', 'failed', 'cancelled', 'timeout', name='mpesatransactionstatus'), nullable=False, server_default='pending'),
        sa.Column('merchant_request_id', sa.String(100), nullable=True, index=True),
        sa.Column('checkout_request_id', sa.String(100), nullable=True, index=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('mpesa_receipt_number', sa.String(50), nullable=True, index=True),
        sa.Column('result_code', sa.Integer(), nullable=True),
        sa.Column('result_desc', sa.String(500), nullable=True),
        sa.Column('raw_callback', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('mpesa_transactions')
    op.drop_table('mpesa_credentials')
    op.execute("DROP TYPE IF EXISTS mpesatransactionstatus")
    op.execute("DROP TYPE IF EXISTS mpesatransactiontype")
    op.execute("DROP TYPE IF EXISTS mpesaenvironment")
