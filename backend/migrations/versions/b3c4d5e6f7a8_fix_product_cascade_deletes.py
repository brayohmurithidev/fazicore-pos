"""fix product cascade deletes for stock_transfers

Revision ID: b3c4d5e6f7a8
Revises: c4d5e6f7a8b9
Create Date: 2026-05-04

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('stock_transfers_product_id_fkey', 'stock_transfers', type_='foreignkey')
    op.create_foreign_key(
        'stock_transfers_product_id_fkey',
        'stock_transfers', 'products',
        ['product_id'], ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('stock_transfers_product_id_fkey', 'stock_transfers', type_='foreignkey')
    op.create_foreign_key(
        'stock_transfers_product_id_fkey',
        'stock_transfers', 'products',
        ['product_id'], ['id'],
    )
