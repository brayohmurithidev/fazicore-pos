from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order, OrderItem, PaymentMethod
from app.repositories.base import BaseRepository
from app.schemas.order import OrderCreate, OrderOut


class OrderRepository(BaseRepository[Order, OrderCreate, OrderOut]):
    model = Order

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_org(
        self,
        org_id: int,
        branch_id: int | None,
        skip: int = 0,
        limit: int = 50,
        date_from: date | None = None,
        date_to: date | None = None,
        search: str | None = None,
        payment_method: str | None = None,
    ) -> list[Order]:
        stmt = (
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.org_id == org_id)
        )
        if branch_id is not None:
            stmt = stmt.where(Order.branch_id == branch_id)
        if date_from is not None:
            stmt = stmt.where(Order.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
        if date_to is not None:
            stmt = stmt.where(Order.created_at <= datetime(date_to.year, date_to.month, date_to.day, 23, 59, 59, tzinfo=timezone.utc))
        if search:
            stmt = stmt.where(Order.order_number.ilike(f"%{search}%"))
        if payment_method:
            stmt = stmt.where(Order.payment_method == payment_method)
        stmt = stmt.order_by(Order.created_at.desc()).offset(skip).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_number(self, order_number: str, org_id: int) -> Order | None:
        result = await self.session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.order_number == order_number, Order.org_id == org_id)
        )
        return result.scalar_one_or_none()

    async def get_with_items(self, order_id: int) -> Order | None:
        result = await self.session.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(Order.id == order_id)
        )
        return result.scalar_one_or_none()

    async def get_daily_stats(
        self,
        org_id: int,
        branch_id: int | None,
        target_date: date,
    ) -> dict:
        from datetime import datetime, timezone
        day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
        day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc)

        stmt = select(
            func.count(Order.id).label("count"),
            func.coalesce(func.sum(Order.total), 0).label("total"),
        ).where(
            Order.org_id == org_id,
            Order.created_at >= day_start,
            Order.created_at <= day_end,
        )
        if branch_id is not None:
            stmt = stmt.where(Order.branch_id == branch_id)

        result = await self.session.execute(stmt)
        row = result.one()

        breakdown_stmt = select(
            Order.payment_method,
            func.count(Order.id).label("count"),
            func.coalesce(func.sum(Order.total), 0).label("total"),
        ).where(
            Order.org_id == org_id,
            Order.created_at >= day_start,
            Order.created_at <= day_end,
        ).group_by(Order.payment_method)
        if branch_id is not None:
            breakdown_stmt = breakdown_stmt.where(Order.branch_id == branch_id)

        breakdown_result = await self.session.execute(breakdown_stmt)
        payment_breakdown = {
            str(r.payment_method): {"count": r.count, "total": float(r.total)}
            for r in breakdown_result.all()
        }

        return {
            "date": target_date.isoformat(),
            "count": row.count,
            "total": float(row.total),
            "payment_breakdown": payment_breakdown,
        }

    async def count_today_for_org(self, org_id: int, target_date: date) -> int:
        from datetime import datetime, timezone
        day_start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
        day_end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc)
        result = await self.session.execute(
            select(func.count(Order.id)).where(
                Order.org_id == org_id,
                Order.created_at >= day_start,
                Order.created_at <= day_end,
            )
        )
        return result.scalar_one()
