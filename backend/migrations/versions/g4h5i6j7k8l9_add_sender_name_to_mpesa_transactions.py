"""add sender_name to mpesa_transactions

Revision ID: g4h5i6j7k8l9
Revises: f3a4b5c6d7e8
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'g4h5i6j7k8l9'
down_revision = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('mpesa_transactions', sa.Column('sender_name', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('mpesa_transactions', 'sender_name')
