from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.core.security import verify_password
from app.models.user import User, UserRole
from app.repositories.order import OrderRepository
from app.repositories.organization import OrganizationRepository
from app.schemas.order import OrderCreate, OrderEdit, OrderOut, OrderVoid
from app.services.order import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])


def _check_pin(pin: str | None, current_user: User) -> None:
    """If caller is cashier, verify a manager/admin PIN was provided and matches their hash."""
    if current_user.role in (UserRole.ADMIN, UserRole.MANAGER):
        return  # admins/managers don't need to supply a PIN
    if not pin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A manager or admin PIN is required to perform this action",
        )
    # Verify PIN against the current user's own hash (they must use their own PIN,
    # but the role guard above already ensures only cashiers reach here).
    # In practice the cashier enters their manager's PIN — we verify it by looking
    # up any manager/admin in the same org whose pin_hash matches.
    # We pass the verification responsibility to the endpoint (see void/edit below).


async def _verify_elevated_pin(pin: str, org_id: int, session: AsyncSession) -> User:
    """Return the manager/admin whose PIN matches, or raise 403.

    pin_hash is bcrypt (see core/security.hash_password) — salted, so it can't
    be looked up by equality. Fetch the candidates and verify each with
    passlib, same as the regular login path (repositories/user.py:authenticate).
    """
    result = await session.execute(
        select(User).where(
            User.org_id == org_id,
            User.role.in_([UserRole.ADMIN, UserRole.MANAGER]),
            User.is_active == True,  # noqa: E712
        )
    )
    for candidate in result.scalars().all():
        if verify_password(pin, candidate.pin_hash):
            return candidate
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid PIN")


@router.post("/", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    data: OrderCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrderOut:
    from app.models.order import Order as OrderModel
    # Idempotency: return existing order if same key already processed
    if data.idempotency_key:
        existing = await session.scalar(
            select(OrderModel).where(OrderModel.idempotency_key == data.idempotency_key)
        )
        if existing:
            repo = OrderRepository(session)
            loaded = await repo.get_with_items(existing.id)
            return OrderOut.model_validate(loaded)

    org_repo = OrganizationRepository(session)
    org = await org_repo.get(current_user.org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization not found")
    service = OrderService(session)
    branch_id = data.branch_id or current_user.branch_id
    order = await service.create_order(
        org_id=current_user.org_id,
        cashier_id=current_user.id,
        cashier_name=current_user.name,
        branch_id=branch_id,
        org_slug=org.slug,
        data=data,
    )
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
    cashier_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[OrderOut]:
    repo = OrderRepository(session)
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    effective_cashier_id = current_user.id if current_user.role == UserRole.CASHIER else cashier_id
    orders = await repo.get_by_org(
        current_user.org_id, effective_branch, skip, limit,
        date_from=date_from, date_to=date_to, search=search, payment_method=payment_method,
        cashier_id=effective_cashier_id,
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


@router.post("/{order_id}/void", response_model=OrderOut)
async def void_order(
    order_id: int,
    body: OrderVoid,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrderOut:
    repo = OrderRepository(session)
    order = await repo.get_with_items(order_id)
    if not order or order.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Determine acting user — cashiers must supply a manager PIN
    if current_user.role == UserRole.CASHIER:
        if not body.pin:
            raise HTTPException(status_code=403, detail="A manager or admin PIN is required")
        actor = await _verify_elevated_pin(body.pin, current_user.org_id, session)
    else:
        actor = current_user

    service = OrderService(session)
    order = await service.void_order(order, actor.id, actor.name, body)
    await session.commit()

    loaded = await repo.get_with_items(order.id)
    return OrderOut.model_validate(loaded)


@router.patch("/{order_id}", response_model=OrderOut)
async def edit_order(
    order_id: int,
    body: OrderEdit,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrderOut:
    repo = OrderRepository(session)
    order = await repo.get_with_items(order_id)
    if not order or order.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if current_user.role == UserRole.CASHIER:
        if not body.pin:
            raise HTTPException(status_code=403, detail="A manager or admin PIN is required")
        actor = await _verify_elevated_pin(body.pin, current_user.org_id, session)
    else:
        actor = current_user

    service = OrderService(session)
    order = await service.edit_order(order, actor.id, actor.name, body)
    await session.commit()

    loaded = await repo.get_with_items(order.id)
    return OrderOut.model_validate(loaded)


# Keep old DELETE for backwards compatibility — redirects to void with no reason
@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_order_legacy(
    order_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Only admins/managers can delete orders")
    repo = OrderRepository(session)
    order = await repo.get_with_items(order_id)
    if not order or order.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Order not found")
    service = OrderService(session)
    await service.void_order(order, current_user.id, current_user.name, OrderVoid())
    await session.commit()
