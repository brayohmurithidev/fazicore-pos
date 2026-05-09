from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.inventory import Inventory
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import User, UserRole
from app.repositories.inventory import InventoryRepository
from app.repositories.order import OrderRepository

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/")
async def dashboard_summary(
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    today = datetime.now(timezone.utc).date()
    order_repo = OrderRepository(session)
    inv_repo = InventoryRepository(session)

    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    daily_stats = await order_repo.get_daily_stats(current_user.org_id, effective_branch, today)

    low_stock_rows = await inv_repo.get_low_stock(current_user.org_id, effective_branch)
    low_stock_count = len(low_stock_rows)

    day_start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc)
    day_end = datetime(today.year, today.month, today.day, 23, 59, 59, tzinfo=timezone.utc)

    stmt = (
        select(
            Product.id,
            Product.name,
            func.sum(OrderItem.quantity).label("qty_sold"),
            func.sum(OrderItem.total).label("revenue"),
        )
        .join(OrderItem, OrderItem.product_id == Product.id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.org_id == current_user.org_id,
            Order.created_at >= day_start,
            Order.created_at <= day_end,
            Order.status != OrderStatus.VOIDED,
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(5)
    )
    if effective_branch is not None:
        stmt = stmt.where(Order.branch_id == effective_branch)

    top_products_result = await session.execute(stmt)
    top_products = [
        {
            "product_id": row.id,
            "product_name": row.name,
            "qty_sold": row.qty_sold,
            "revenue": float(row.revenue),
        }
        for row in top_products_result.all()
    ]

    return {
        "today_revenue": daily_stats["total"],
        "today_transactions": daily_stats["count"],
        "payment_breakdown": daily_stats["payment_breakdown"],
        "low_stock_count": low_stock_count,
        "top_products": top_products,
    }
