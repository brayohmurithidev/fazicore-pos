from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.user import User, UserRole
from app.repositories.order import OrderRepository
from app.repositories.organization import OrganizationRepository
from app.schemas.order import OrderCreate, OrderOut
from app.services.order import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    data: OrderCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrderOut:
    org_repo = OrganizationRepository(session)
    org = await org_repo.get(current_user.org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization not found")
    service = OrderService(session)
    branch_id = data.branch_id or current_user.branch_id
    order = await service.create_order(
        org_id=current_user.org_id,
        cashier_id=current_user.id,
        branch_id=branch_id,
        org_slug=org.slug,
        data=data,
    )
    # Reload with items eagerly to avoid lazy-load in async context
    repo = OrderRepository(session)
    loaded = await repo.get_with_items(order.id)
    return OrderOut.model_validate(loaded)


@router.get("/stats/today", response_model=dict)
async def today_stats(
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    repo = OrderRepository(session)
    today = datetime.now(timezone.utc).date()
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    return await repo.get_daily_stats(current_user.org_id, effective_branch, today)


@router.get("/", response_model=list[OrderOut])
async def list_orders(
    branch_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    search: str | None = Query(None),
    payment_method: str | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[OrderOut]:
    repo = OrderRepository(session)
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    orders = await repo.get_by_org(
        current_user.org_id, effective_branch, skip, limit,
        date_from=date_from, date_to=date_to, search=search, payment_method=payment_method,
    )
    return [OrderOut.model_validate(o) for o in orders]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrderOut:
    repo = OrderRepository(session)
    order = await repo.get_with_items(order_id)
    if not order or order.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return OrderOut.model_validate(order)
