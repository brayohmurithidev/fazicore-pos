from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.inventory import Inventory, TransactionType
from app.models.stock_transfer import StockTransfer, TransferStatus
from app.models.user import User
from app.repositories.inventory import InventoryRepository

router = APIRouter(prefix="/stock-transfers", tags=["stock-transfers"])


def _next_transfer_number(org_id: int) -> str:
    ts = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"TRF-{org_id}-{ts}"


class TransferInitiate(BaseModel):
    product_id: int
    from_branch_id: int
    to_branch_id: int
    quantity: int
    notes: str | None = None


class TransferOut(BaseModel):
    id: int
    org_id: int
    transfer_number: str
    product_id: int
    product_name: str | None = None
    from_branch_id: int
    from_branch_name: str | None = None
    to_branch_id: int
    to_branch_name: str | None = None
    quantity: int
    status: TransferStatus
    notes: str | None
    initiated_by: int | None
    initiator_name: str | None = None
    confirmed_by: int | None
    confirmer_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


def _serialize(t: StockTransfer) -> TransferOut:
    out = TransferOut.model_validate(t)
    out.product_name = t.product.name if t.product else None
    out.from_branch_name = t.from_branch.name if t.from_branch else None
    out.to_branch_name = t.to_branch.name if t.to_branch else None
    out.initiator_name = t.initiator.name if t.initiator else None
    out.confirmer_name = t.confirmer.name if t.confirmer else None
    return out


@router.get("/", response_model=list[TransferOut])
async def list_transfers(
    status_filter: TransferStatus | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[TransferOut]:
    stmt = (
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.product),
            selectinload(StockTransfer.from_branch),
            selectinload(StockTransfer.to_branch),
            selectinload(StockTransfer.initiator),
            selectinload(StockTransfer.confirmer),
        )
        .where(StockTransfer.org_id == current_user.org_id)
        .order_by(StockTransfer.created_at.desc())
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(StockTransfer.status == status_filter)
    result = await session.execute(stmt)
    return [_serialize(t) for t in result.scalars().all()]


@router.post("/", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
async def initiate_transfer(
    data: TransferInitiate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> TransferOut:
    if data.from_branch_id == data.to_branch_id:
        raise HTTPException(status_code=400, detail="Source and destination branch must differ")
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    repo = InventoryRepository(session)
    from_inv = await repo.get_by_product_branch(data.product_id, data.from_branch_id)
    if from_inv is None or from_inv.available_quantity < data.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock in source branch")

    # Deduct from source immediately
    notes = f"Transfer initiated to branch {data.to_branch_id}"
    await repo.adjust(from_inv, -data.quantity, TransactionType.TRANSFER, current_user.id, notes)

    transfer = StockTransfer(
        org_id=current_user.org_id,
        transfer_number=_next_transfer_number(current_user.org_id),
        product_id=data.product_id,
        from_branch_id=data.from_branch_id,
        to_branch_id=data.to_branch_id,
        quantity=data.quantity,
        status=TransferStatus.INITIATED,
        notes=data.notes,
        initiated_by=current_user.id,
    )
    session.add(transfer)
    await session.commit()

    result = await session.execute(
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.product),
            selectinload(StockTransfer.from_branch),
            selectinload(StockTransfer.to_branch),
            selectinload(StockTransfer.initiator),
            selectinload(StockTransfer.confirmer),
        )
        .where(StockTransfer.id == transfer.id)
    )
    return _serialize(result.scalar_one())


@router.post("/{transfer_id}/mark-transit", response_model=TransferOut)
async def mark_in_transit(
    transfer_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> TransferOut:
    transfer = await session.get(StockTransfer, transfer_id)
    if not transfer or transfer.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status != TransferStatus.INITIATED:
        raise HTTPException(status_code=400, detail=f"Cannot mark in-transit from status '{transfer.status}'")

    transfer.status = TransferStatus.IN_TRANSIT
    await session.commit()

    result = await session.execute(
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.product),
            selectinload(StockTransfer.from_branch),
            selectinload(StockTransfer.to_branch),
            selectinload(StockTransfer.initiator),
            selectinload(StockTransfer.confirmer),
        )
        .where(StockTransfer.id == transfer_id)
    )
    return _serialize(result.scalar_one())


@router.post("/{transfer_id}/confirm", response_model=TransferOut)
async def confirm_transfer(
    transfer_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> TransferOut:
    transfer = await session.get(StockTransfer, transfer_id)
    if not transfer or transfer.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status not in (TransferStatus.INITIATED, TransferStatus.IN_TRANSIT):
        raise HTTPException(status_code=400, detail=f"Cannot confirm transfer with status '{transfer.status}'")

    repo = InventoryRepository(session)
    to_inv = await repo.get_by_product_branch(transfer.product_id, transfer.to_branch_id)
    if to_inv is None:
        to_inv = Inventory(
            product_id=transfer.product_id,
            branch_id=transfer.to_branch_id,
            quantity=0,
            reserved_quantity=0,
            low_stock_threshold=10,
        )
        session.add(to_inv)
        await session.flush()
        await session.refresh(to_inv)

    notes = f"Transfer {transfer.transfer_number} received from branch {transfer.from_branch_id}"
    await repo.adjust(to_inv, transfer.quantity, TransactionType.TRANSFER, current_user.id, notes)

    transfer.status = TransferStatus.CONFIRMED
    transfer.confirmed_by = current_user.id
    await session.commit()

    result = await session.execute(
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.product),
            selectinload(StockTransfer.from_branch),
            selectinload(StockTransfer.to_branch),
            selectinload(StockTransfer.initiator),
            selectinload(StockTransfer.confirmer),
        )
        .where(StockTransfer.id == transfer_id)
    )
    return _serialize(result.scalar_one())


@router.post("/{transfer_id}/cancel", response_model=TransferOut)
async def cancel_transfer(
    transfer_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> TransferOut:
    transfer = await session.get(StockTransfer, transfer_id)
    if not transfer or transfer.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status not in (TransferStatus.INITIATED, TransferStatus.IN_TRANSIT):
        raise HTTPException(status_code=400, detail=f"Cannot cancel transfer with status '{transfer.status}'")

    # Refund stock back to source
    repo = InventoryRepository(session)
    from_inv = await repo.get_by_product_branch(transfer.product_id, transfer.from_branch_id)
    if from_inv is None:
        from_inv = Inventory(
            product_id=transfer.product_id,
            branch_id=transfer.from_branch_id,
            quantity=0,
            reserved_quantity=0,
            low_stock_threshold=10,
        )
        session.add(from_inv)
        await session.flush()
        await session.refresh(from_inv)

    notes = f"Transfer {transfer.transfer_number} cancelled — stock returned"
    await repo.adjust(from_inv, transfer.quantity, TransactionType.ADJUSTMENT, current_user.id, notes)

    transfer.status = TransferStatus.CANCELLED
    await session.commit()

    result = await session.execute(
        select(StockTransfer)
        .options(
            selectinload(StockTransfer.product),
            selectinload(StockTransfer.from_branch),
            selectinload(StockTransfer.to_branch),
            selectinload(StockTransfer.initiator),
            selectinload(StockTransfer.confirmer),
        )
        .where(StockTransfer.id == transfer_id)
    )
    return _serialize(result.scalar_one())
