"""mpesa per-environment credentials

Revision ID: h5i6j7k8l9m0
Revises: g4h5i6j7k8l9
Create Date: 2026-05-09
"""
from alembic import op
import sqlalchemy as sa

revision = 'h5i6j7k8l9m0'
down_revision = 'g4h5i6j7k8l9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old single-org unique index (created as UNIQUE index, not named constraint)
    op.drop_index('ix_mpesa_credentials_org_id', table_name='mpesa_credentials')
    # Add per-(org, environment) unique constraint
    op.create_unique_constraint('uq_mpesa_creds_org_env', 'mpesa_credentials', ['org_id', 'environment'])
    # Add is_live column — existing row defaults to True (it was the only one)
    op.add_column('mpesa_credentials', sa.Column('is_live', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('mpesa_credentials', 'is_live')
    op.drop_constraint('uq_mpesa_creds_org_env', 'mpesa_credentials', type_='unique')
    op.create_index('ix_mpesa_credentials_org_id', 'mpesa_credentials', ['org_id'], unique=True)
