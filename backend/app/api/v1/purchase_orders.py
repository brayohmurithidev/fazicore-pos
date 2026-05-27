from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.purchase_order import POStatus, PurchaseOrder, PurchaseOrderItem
from app.models.user import User
from app.schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderOut

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


async def _get_po_with_items(session: AsyncSession, po_id: int) -> PurchaseOrder | None:
    result = await session.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.id == po_id)
    )
    return result.scalar_one_or_none()


async def _generate_po_number(session: AsyncSession) -> str:
    from datetime import datetime, timezone
    from sqlalchemy import func
    result = await session.execute(select(func.count(PurchaseOrder.id)))
    count = result.scalar_one()
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"PO-{today}-{count + 1:04d}"


@router.get("/", response_model=list[PurchaseOrderOut])
async def list_purchase_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[PurchaseOrderOut]:
    result = await session.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.items))
        .where(PurchaseOrder.org_id == current_user.org_id)
        .order_by(PurchaseOrder.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    pos = list(result.scalars().all())
    return [PurchaseOrderOut.model_validate(po) for po in pos]


@router.post("/", response_model=PurchaseOrderOut, status_code=status.HTTP_201_CREATED)
async def create_purchase_order(
    data: PurchaseOrderCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> PurchaseOrderOut:
    po_number = await _generate_po_number(session)
    items = [
        PurchaseOrderItem(
            product_id=item.product_id,
            product_name=item.product_name or "",
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            expiry_date=item.expiry_date,
        )
        for item in data.items
    ]
    total = sum(i.quantity * i.unit_cost for i in data.items)
    po = PurchaseOrder(
        org_id=current_user.org_id,
        po_number=po_number,
        supplier=data.supplier,
        branch_id=data.branch_id,
        total=total,
        created_by=current_user.id,
        items=items,
    )
    session.add(po)
    await session.flush()
    await session.refresh(po)
    full = await _get_po_with_items(session, po.id)
    return PurchaseOrderOut.model_validate(full)


@router.get("/{po_id}", response_model=PurchaseOrderOut)
async def get_purchase_order(
    po_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> PurchaseOrderOut:
    po = await _get_po_with_items(session, po_id)
    if not po or po.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return PurchaseOrderOut.model_validate(po)


@router.patch("/{po_id}", response_model=PurchaseOrderOut)
async def update_purchase_order(
    po_id: int,
    data: dict,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> PurchaseOrderOut:
    po = await _get_po_with_items(session, po_id)
    if not po or po.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    for field, value in data.items():
        if hasattr(po, field):
            setattr(po, field, value)
    session.add(po)
    await session.flush()
    await session.refresh(po)
    return PurchaseOrderOut.model_validate(po)


@router.post("/{po_id}/status", response_model=PurchaseOrderOut)
async def update_po_status(
    po_id: int,
    new_status: POStatus,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> PurchaseOrderOut:
    po = await _get_po_with_items(session, po_id)
    if not po or po.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    po.status = new_status
    session.add(po)
    await session.flush()

    if new_status == POStatus.RECEIVED:
        from datetime import datetime, timezone
        from sqlalchemy import func
        from app.repositories.inventory import InventoryRepository
        from app.models.inventory import InventoryBatch, TransactionType, Inventory
        from app.models.product import Product
        inv_repo = InventoryRepository(session)
        today = datetime.now(timezone.utc).date()
        for item in po.items:
            if item.product_id:
                # Snapshot total stock across all branches BEFORE this receipt
                total_qty_result = await session.execute(
                    select(func.sum(Inventory.quantity)).where(
                        Inventory.product_id == item.product_id
                    )
                )
                total_qty_before = total_qty_result.scalar_one() or 0

                inv = await inv_repo.get_by_product_branch(item.product_id, po.branch_id)
                if inv is None:
                    inv = Inventory(
                        product_id=item.product_id,
                        branch_id=po.branch_id,
                        quantity=0,
                        reserved_quantity=0,
                        low_stock_threshold=10,
                    )
                    session.add(inv)
                    await session.flush()
                    await session.refresh(inv)
                await inv_repo.adjust(
                    inv, item.quantity, TransactionType.PURCHASE, current_user.id,
                    f"PO {po.po_number} received"
                )

                # Create a batch record for FIFO expiry tracking
                batch = InventoryBatch(
                    product_id=item.product_id,
                    branch_id=po.branch_id,
                    purchase_order_item_id=item.id,
                    quantity_received=item.quantity,
                    quantity_remaining=item.quantity,
                    cost_per_unit=float(item.unit_cost),
                    expiry_date=item.expiry_date,
                    received_date=today,
                )
                session.add(batch)

                # Update product cost using Weighted Average Cost
                product = await session.get(Product, item.product_id)
                if product is not None:
                    old_cost = float(product.cost) if product.cost is not None else float(item.unit_cost)
                    if total_qty_before > 0:
                        wac = (total_qty_before * old_cost + item.quantity * float(item.unit_cost)) / (total_qty_before + item.quantity)
                    else:
                        wac = float(item.unit_cost)
                    product.cost = round(wac, 2)
                    session.add(product)

    await session.refresh(po)
    return PurchaseOrderOut.model_validate(po)


@router.delete("/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_purchase_order(
    po_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    po = await _get_po_with_items(session, po_id)
    if not po or po.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    await session.delete(po)
    await session.flush()
