"""attendance float fields for shift reconciliation

Revision ID: x2y3z4a5b6c7
Revises: w1x2y3z4a5b6
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'x2y3z4a5b6c7'
down_revision = 'w1x2y3z4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('attendance', sa.Column('opening_float', sa.Numeric(12, 2), nullable=True))
    op.add_column('attendance', sa.Column('closing_cash', sa.Numeric(12, 2), nullable=True))
    op.add_column('attendance', sa.Column('shift_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('attendance', 'shift_notes')
    op.drop_column('attendance', 'closing_cash')
    op.drop_column('attendance', 'opening_float')
