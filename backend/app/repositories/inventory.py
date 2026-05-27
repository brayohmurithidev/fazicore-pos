from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import Inventory, InventoryBatch, InventoryTransaction, TransactionType
from app.models.product import Product
from app.repositories.base import BaseRepository
from app.schemas.inventory import InventoryUpdate


class InventoryRepository(BaseRepository[Inventory, InventoryUpdate, InventoryUpdate]):
    model = Inventory

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_product_branch(
        self, product_id: int, branch_id: int | None
    ) -> Inventory | None:
        stmt = select(Inventory).where(Inventory.product_id == product_id)
        if branch_id is None:
            stmt = stmt.where(Inventory.branch_id.is_(None))
        else:
            stmt = stmt.where(Inventory.branch_id == branch_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_low_stock(
        self, org_id: int, branch_id: int | None
    ) -> list[tuple[Product, Inventory]]:
        stmt = (
            select(Product, Inventory)
            .join(Inventory, Inventory.product_id == Product.id)
            .where(
                Product.org_id == org_id,
                Product.is_active == True,
                Product.track_inventory == True,
                Inventory.quantity <= Inventory.low_stock_threshold,
            )
        )
        if branch_id is not None:
            stmt = stmt.where(Inventory.branch_id == branch_id)
        else:
            stmt = stmt.where(Inventory.branch_id.is_(None))
        result = await self.session.execute(stmt)
        return list(result.all())

    async def adjust(
        self,
        inventory: Inventory,
        qty_change: int,
        type: TransactionType,
        performed_by: int,
        notes: str | None,
    ) -> Inventory:
        qty_before = inventory.quantity
        inventory.quantity = inventory.quantity + qty_change
        self.session.add(inventory)
        await self.session.flush()

        tx = InventoryTransaction(
            inventory_id=inventory.id,
            type=type,
            quantity_change=qty_change,
            quantity_before=qty_before,
            quantity_after=inventory.quantity,
            performed_by=performed_by,
            notes=notes,
        )
        self.session.add(tx)
        await self.session.flush()
        await self.session.refresh(inventory)
        return inventory

    async def has_any_batch(self, product_id: int, branch_id: int | None) -> bool:
        stmt = select(InventoryBatch.id).where(InventoryBatch.product_id == product_id)
        if branch_id is not None:
            stmt = stmt.where(InventoryBatch.branch_id == branch_id)
        else:
            stmt = stmt.where(InventoryBatch.branch_id.is_(None))
        result = await self.session.execute(stmt.limit(1))
        return result.scalar_one_or_none() is not None

    async def get_fifo_batches(
        self, product_id: int, branch_id: int | None, exclude_expired: bool = True
    ) -> list[InventoryBatch]:
        """Non-exhausted batches ordered FIFO (oldest received_date first)."""
        stmt = (
            select(InventoryBatch)
            .where(
                InventoryBatch.product_id == product_id,
                InventoryBatch.quantity_remaining > 0,
            )
            .order_by(InventoryBatch.received_date.asc(), InventoryBatch.id.asc())
        )
        if branch_id is not None:
            stmt = stmt.where(InventoryBatch.branch_id == branch_id)
        else:
            stmt = stmt.where(InventoryBatch.branch_id.is_(None))
        if exclude_expired:
            today = datetime.now(timezone.utc).date()
            stmt = stmt.where(
                (InventoryBatch.expiry_date.is_(None)) | (InventoryBatch.expiry_date >= today)
            )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_available_batch_quantity(
        self, product_id: int, branch_id: int | None
    ) -> int:
        batches = await self.get_fifo_batches(product_id, branch_id, exclude_expired=True)
        return sum(b.quantity_remaining for b in batches)

    async def deduct_from_batches(
        self, product_id: int, branch_id: int | None, quantity: int
    ) -> bool:
        """FIFO deduction skipping expired batches. Returns False if insufficient stock."""
        batches = await self.get_fifo_batches(product_id, branch_id, exclude_expired=True)
        if sum(b.quantity_remaining for b in batches) < quantity:
            return False
        remaining = quantity
        for batch in batches:
            if remaining <= 0:
                break
            take = min(remaining, batch.quantity_remaining)
            batch.quantity_remaining -= take
            self.session.add(batch)
            remaining -= take
        await self.session.flush()
        return True

    async def get_by_org(
        self,
        org_id: int,
        branch_id: int | None,
        skip: int = 0,
        limit: int = 100,
        product_id: int | None = None,
    ) -> list[Inventory]:
        stmt = (
            select(Inventory)
            .join(Product, Product.id == Inventory.product_id)
            .options(selectinload(Inventory.product), selectinload(Inventory.branch))
            .where(Product.org_id == org_id, Product.is_active == True)
        )
        if branch_id is not None:
            stmt = stmt.where(Inventory.branch_id == branch_id)
        if product_id is not None:
            stmt = stmt.where(Inventory.product_id == product_id)
        stmt = stmt.offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
