from datetime import date, datetime

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.inventory import Inventory, InventoryBatch, InventoryTransaction, TransactionType
from app.models.product import Product
from app.models.user import User, UserRole
from app.repositories.inventory import InventoryRepository
from app.schemas.inventory import InventoryOut, StockTransferRequest
from app.services.inventory import InventoryService

router = APIRouter(prefix="/inventory", tags=["inventory"])


class ManualAdjustRequest(BaseModel):
    product_id: int
    branch_id: int | None = None
    qty_change: int
    type: TransactionType = TransactionType.ADJUSTMENT
    notes: str | None = None


class InventoryTransactionOut(BaseModel):
    id: int
    inventory_id: int
    product_id: int = 0
    product_name: str | None = None
    type: TransactionType
    quantity_change: int
    quantity_before: int
    quantity_after: int
    notes: str | None
    performed_by: int | None
    performed_by_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[InventoryOut])
async def list_inventory(
    branch_id: int | None = Query(None),
    product_id: int | None = Query(None),
    low_stock_only: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[InventoryOut]:
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    repo = InventoryRepository(session)
    if low_stock_only:
        rows = await repo.get_low_stock(current_user.org_id, effective_branch)
        result = []
        for product, inv in rows:
            out = InventoryOut.model_validate(inv)
            out.product_name = product.name
            out.branch_id = inv.branch_id
            out.branch_name = inv.branch.name if inv.branch else None
            result.append(out)
        return result
    inventories = await repo.get_by_org(current_user.org_id, effective_branch, skip, limit, product_id)
    result = []
    for inv in inventories:
        out = InventoryOut.model_validate(inv)
        if inv.product:
            out.product_name = inv.product.name
        out.branch_id = inv.branch_id
        out.branch_name = inv.branch.name if inv.branch else None
        result.append(out)
    return result


@router.post("/adjust", response_model=InventoryOut)
async def adjust_inventory(
    data: ManualAdjustRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> InventoryOut:
    # Non-admins are always scoped to their own branch, regardless of what the client sends
    effective_branch = data.branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    service = InventoryService(session)
    inv = await service.adjust(
        product_id=data.product_id,
        branch_id=effective_branch,
        qty_change=data.qty_change,
        type=data.type,
        performed_by=current_user.id,
        notes=data.notes,
    )
    return InventoryOut.model_validate(inv)


@router.get("/transactions", response_model=list[InventoryTransactionOut])
async def list_transactions(
    product_id: int | None = Query(None),
    type: TransactionType | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[InventoryTransactionOut]:
    stmt = (
        select(InventoryTransaction)
        .join(Inventory, InventoryTransaction.inventory_id == Inventory.id)
        .options(
            joinedload(InventoryTransaction.inventory).joinedload(Inventory.product),
            joinedload(InventoryTransaction.user),
        )
        .where(Inventory.product.has(org_id=current_user.org_id))
        .order_by(InventoryTransaction.created_at.desc())
        .limit(limit)
    )
    if product_id is not None:
        stmt = stmt.where(Inventory.product_id == product_id)
    if type is not None:
        stmt = stmt.where(InventoryTransaction.type == type)
    result = await session.execute(stmt)
    rows = list(result.scalars().unique().all())
    out = []
    for tx in rows:
        o = InventoryTransactionOut.model_validate(tx)
        o.product_id = tx.inventory.product_id
        if tx.inventory.product:
            o.product_name = tx.inventory.product.name
        if tx.user:
            o.performed_by_name = tx.user.name
        out.append(o)
    return out


class InventoryBatchOut(BaseModel):
    id: int
    product_id: int
    product_name: str | None = None
    branch_id: int | None
    batch_number: str | None
    quantity_received: int
    quantity_remaining: int
    cost_per_unit: float
    expiry_date: date | None
    received_date: date

    model_config = {"from_attributes": True}


@router.get("/batches", response_model=list[InventoryBatchOut])
async def list_batches(
    product_id: int | None = Query(None),
    branch_id: int | None = Query(None),
    include_exhausted: bool = Query(False),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[InventoryBatchOut]:
    """List inventory batches for the org, optionally filtered by product/branch."""
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    stmt = (
        select(InventoryBatch)
        .join(Product, Product.id == InventoryBatch.product_id)
        .options(selectinload(InventoryBatch.product))
        .where(Product.org_id == current_user.org_id)
        .order_by(InventoryBatch.received_date.asc(), InventoryBatch.id.asc())
    )
    if product_id is not None:
        stmt = stmt.where(InventoryBatch.product_id == product_id)
    if effective_branch is not None:
        stmt = stmt.where(InventoryBatch.branch_id == effective_branch)
    if not include_exhausted:
        stmt = stmt.where(InventoryBatch.quantity_remaining > 0)
    result = await session.execute(stmt)
    batches = list(result.scalars().all())
    out = []
    for b in batches:
        o = InventoryBatchOut.model_validate(b)
        if b.product:
            o.product_name = b.product.name
        out.append(o)
    return out


@router.post("/transfer", status_code=status.HTTP_204_NO_CONTENT)
async def transfer_stock(
    data: StockTransferRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    service = InventoryService(session)
    await service.transfer(
        org_id=current_user.org_id,
        from_branch_id=data.from_branch_id,
        to_branch_id=data.to_branch_id,
        product_id=data.product_id,
        qty=data.quantity,
        performed_by=current_user.id,
    )
