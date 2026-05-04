"""phase2: suppliers, product variants, stock transfers, org settings

Revision ID: c3f1d8e2a914
Revises: afb35e613aa3
Create Date: 2026-04-29 20:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c3f1d8e2a914'
down_revision: Union[str, None] = 'afb35e613aa3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Suppliers ─────────────────────────────────────────────────────────────
    op.create_table(
        'suppliers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('org_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('contact_name', sa.String(length=200), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_suppliers_id', 'suppliers', ['id'])
    op.create_index('ix_suppliers_org_id', 'suppliers', ['org_id'])

    # ── purchase_orders: add supplier_id FK ───────────────────────────────────
    op.add_column('purchase_orders', sa.Column('supplier_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_purchase_orders_supplier_id', 'purchase_orders', 'suppliers', ['supplier_id'], ['id'], ondelete='SET NULL')
    op.add_column('purchase_orders', sa.Column('cancelled', sa.Boolean(), nullable=False, server_default='false'))

    # ── products: variants support ────────────────────────────────────────────
    op.add_column('products', sa.Column('parent_product_id', sa.Integer(), nullable=True))
    op.add_column('products', sa.Column('attributes', sa.JSON(), nullable=True))
    op.create_foreign_key('fk_products_parent_product_id', 'products', 'products', ['parent_product_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_products_parent_product_id', 'products', ['parent_product_id'])

    # ── stock_transfers ────────────────────────────────────────────────────────
    op.create_table(
        'stock_transfers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('org_id', sa.Integer(), nullable=False),
        sa.Column('transfer_number', sa.String(length=50), nullable=False),
        sa.Column('product_id', sa.Integer(), nullable=False),
        sa.Column('from_branch_id', sa.Integer(), nullable=False),
        sa.Column('to_branch_id', sa.Integer(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='initiated'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('initiated_by', sa.Integer(), nullable=True),
        sa.Column('confirmed_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['product_id'], ['products.id']),
        sa.ForeignKeyConstraint(['from_branch_id'], ['branches.id']),
        sa.ForeignKeyConstraint(['to_branch_id'], ['branches.id']),
        sa.ForeignKeyConstraint(['initiated_by'], ['users.id']),
        sa.ForeignKeyConstraint(['confirmed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('transfer_number'),
    )
    op.create_index('ix_stock_transfers_id', 'stock_transfers', ['id'])
    op.create_index('ix_stock_transfers_org_id', 'stock_transfers', ['org_id'])
    op.create_index('ix_stock_transfers_transfer_number', 'stock_transfers', ['transfer_number'], unique=True)

    # ── organizations: currency + custom_units ────────────────────────────────
    op.add_column('organizations', sa.Column('currency', sa.String(length=10), nullable=False, server_default='KES'))
    op.add_column('organizations', sa.Column('custom_units', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('organizations', 'custom_units')
    op.drop_column('organizations', 'currency')

    op.drop_index('ix_stock_transfers_transfer_number', 'stock_transfers')
    op.drop_index('ix_stock_transfers_org_id', 'stock_transfers')
    op.drop_index('ix_stock_transfers_id', 'stock_transfers')
    op.drop_table('stock_transfers')

    op.drop_index('ix_products_parent_product_id', 'products')
    op.drop_constraint('fk_products_parent_product_id', 'products', type_='foreignkey')
    op.drop_column('products', 'attributes')
    op.drop_column('products', 'parent_product_id')

    op.drop_constraint('fk_purchase_orders_supplier_id', 'purchase_orders', type_='foreignkey')
    op.drop_column('purchase_orders', 'cancelled')
    op.drop_column('purchase_orders', 'supplier_id')

    op.drop_index('ix_suppliers_org_id', 'suppliers')
    op.drop_index('ix_suppliers_id', 'suppliers')
    op.drop_table('suppliers')
