"""org: make max_branches/max_users/max_products nullable for unlimited plans

Revision ID: q4r5s6t7u8v9
Revises: p3q4r5s6t7u8
Create Date: 2026-05-22

NULL means unlimited — used by Business (max_products) and Enterprise
(all three). Previously these columns were NOT NULL which caused an
IntegrityError when assigning an unlimited plan to an organisation.
"""

import sqlalchemy as sa
from alembic import op

revision = "q4r5s6t7u8v9"
down_revision = "p3q4r5s6t7u8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("organizations", "max_branches", existing_type=sa.Integer(), nullable=True)
    op.alter_column("organizations", "max_users",    existing_type=sa.Integer(), nullable=True)
    op.alter_column("organizations", "max_products", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Fill NULLs with a sensible default before re-adding the constraint.
    op.execute("UPDATE organizations SET max_branches = 1   WHERE max_branches IS NULL")
    op.execute("UPDATE organizations SET max_users    = 5   WHERE max_users    IS NULL")
    op.execute("UPDATE organizations SET max_products = 500 WHERE max_products IS NULL")
    op.alter_column("organizations", "max_branches", existing_type=sa.Integer(), nullable=False)
    op.alter_column("organizations", "max_users",    existing_type=sa.Integer(), nullable=False)
    op.alter_column("organizations", "max_products", existing_type=sa.Integer(), nullable=False)
