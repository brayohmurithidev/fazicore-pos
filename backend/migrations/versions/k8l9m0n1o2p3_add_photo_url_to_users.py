"""add photo_url to users

Revision ID: k8l9m0n1o2p3
Revises: j7k8l9m0n1o2
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa

revision = 'k8l9m0n1o2p3'
down_revision = 'j7k8l9m0n1o2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('photo_url', sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'photo_url')
