from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import Inventory, TransactionType
from app.repositories.inventory import InventoryRepository


class InventoryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.inventory_repo = InventoryRepository(session)

    async def adjust(
        self,
        product_id: int,
        branch_id: int | None,
        qty_change: int,
        type: TransactionType,
        performed_by: int,
        notes: str | None,
    ) -> Inventory:
        inv = await self.inventory_repo.get_by_product_branch(product_id, branch_id)
        if inv is None:
            inv = Inventory(
                product_id=product_id,
                branch_id=branch_id,
                quantity=0,
                reserved_quantity=0,
                low_stock_threshold=10,
            )
            self.session.add(inv)
            await self.session.flush()
            await self.session.refresh(inv)

        if qty_change < 0 and inv.available_quantity < abs(qty_change):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient stock for this adjustment",
            )

        return await self.inventory_repo.adjust(inv, qty_change, type, performed_by, notes)

    async def transfer(
        self,
        org_id: int,
        from_branch_id: int,
        to_branch_id: int,
        product_id: int,
        qty: int,
        performed_by: int,
    ) -> None:
        from_inv = await self.inventory_repo.get_by_product_branch(product_id, from_branch_id)
        if from_inv is None or from_inv.available_quantity < qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient stock in source branch",
            )

        to_inv = await self.inventory_repo.get_by_product_branch(product_id, to_branch_id)
        if to_inv is None:
            to_inv = Inventory(
                product_id=product_id,
                branch_id=to_branch_id,
                quantity=0,
                reserved_quantity=0,
                low_stock_threshold=10,
            )
            self.session.add(to_inv)
            await self.session.flush()
            await self.session.refresh(to_inv)

        notes = f"Transfer from branch {from_branch_id} to branch {to_branch_id}"
        await self.inventory_repo.adjust(
            from_inv, -qty, TransactionType.TRANSFER, performed_by, notes
        )
        await self.inventory_repo.adjust(
            to_inv, qty, TransactionType.TRANSFER, performed_by, notes
        )
