"""platform audit log

Revision ID: y3z4a5b6c7d8
Revises: x2y3z4a5b6c7
Create Date: 2026-06-15 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "y3z4a5b6c7d8"
down_revision: str | None = "x2y3z4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "platform_audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("admin_id", sa.Integer, sa.ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("admin_name", sa.String(100), nullable=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("action", sa.String(80), nullable=False, index=True),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("platform_audit_logs")
