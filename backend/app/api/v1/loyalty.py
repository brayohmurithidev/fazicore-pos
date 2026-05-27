from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.loyalty import LoyaltySettings, PointsTransaction
from app.models.user import User
from app.schemas.loyalty import LoyaltySettingsOut, LoyaltySettingsUpdate, PointsTransactionOut

router = APIRouter(prefix="/loyalty", tags=["loyalty"])


async def _get_or_create_settings(org_id: int, session: AsyncSession) -> LoyaltySettings:
    result = await session.execute(select(LoyaltySettings).where(LoyaltySettings.org_id == org_id))
    ls = result.scalar_one_or_none()
    if ls is None:
        ls = LoyaltySettings(org_id=org_id)
        session.add(ls)
        await session.flush()
    return ls


@router.get("/settings", response_model=LoyaltySettingsOut)
async def get_loyalty_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ls = await _get_or_create_settings(current_user.org_id, db)
    return ls


@router.patch("/settings", response_model=LoyaltySettingsOut)
async def update_loyalty_settings(
    data: LoyaltySettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("admin", "manager"):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin or manager access required")
    ls = await _get_or_create_settings(current_user.org_id, db)
    if data.enabled is not None:
        ls.enabled = data.enabled
    if data.points_per_kes is not None:
        ls.points_per_kes = data.points_per_kes
    if data.kes_per_point is not None:
        ls.kes_per_point = data.kes_per_point
    if data.min_redeem_points is not None:
        ls.min_redeem_points = data.min_redeem_points
    await db.flush()
    return ls


@router.get("/customers/{customer_id}/transactions", response_model=list[PointsTransactionOut])
async def get_customer_transactions(
    customer_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PointsTransaction)
        .where(
            PointsTransaction.org_id == current_user.org_id,
            PointsTransaction.customer_id == customer_id,
        )
        .order_by(PointsTransaction.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()
