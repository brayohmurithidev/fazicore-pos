from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import Inventory, InventoryTransaction, TransactionType
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
