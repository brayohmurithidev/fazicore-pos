"""
Inventory analytics: reorder suggestions and aging analysis.
Both endpoints are read-only and derive everything from existing data.
"""
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.branch import Branch
from app.models.inventory import Inventory
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import User, UserRole

router = APIRouter(prefix="/inventory/analytics", tags=["analytics"])


def _effective_branch(current_user: User, branch_id: int | None) -> int | None | str:
    """
    Returns the branch scope for queries:
    - Non-admins are always scoped to their own branch_id (may be None = org-level).
    - Admins can pass a specific branch_id, or None to see all branches.
    Returns the sentinel "ALL" when no filter should be applied (admin, no param).
    """
    if current_user.role != UserRole.ADMIN:
        return current_user.branch_id  # None means no-branch / org-level stock
    return branch_id if branch_id is not None else "ALL"


def _apply_branch_filter(stmt, effective: int | None | str):
    """Apply branch filter to an inventory query statement."""
    if effective == "ALL":
        return stmt  # no filter — all branches
    if effective is None:
        return stmt.where(Inventory.branch_id.is_(None))
    return stmt.where(Inventory.branch_id == effective)


def _apply_order_branch_filter(stmt, effective: int | None | str):
    """Apply branch filter to an order query statement."""
    if effective == "ALL":
        return stmt
    if effective is None:
        return stmt.where(Order.branch_id.is_(None))
    return stmt.where(Order.branch_id == effective)


# ── Reorder Suggestions ────────────────────────────────────────────────────

class ReorderSuggestion(BaseModel):
    product_id: int
    product_name: str
    sku: str | None
    unit: str
    branch_id: int | None
    branch_name: str | None
    current_stock: int
    min_stock: int
    avg_daily_sales: float
    days_remaining: float | None  # None = no sales data
    suggested_reorder_qty: int
    urgency: str  # "critical" | "warning" | "watch" | "ok" | "no_sales"


@router.get("/reorder-suggestions", response_model=list[ReorderSuggestion])
async def reorder_suggestions(
    days: int = Query(30, ge=7, le=90, description="Lookback window for sales velocity"),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ReorderSuggestion]:
    since = datetime.now(UTC) - timedelta(days=days)
    effective = _effective_branch(current_user, branch_id)

    # Sum qty sold per product (scoped to branch) in the window
    sales_stmt = (
        select(OrderItem.product_id, func.sum(OrderItem.quantity).label("qty_sold"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.org_id == current_user.org_id,
            Order.status == OrderStatus.COMPLETED,
            Order.created_at >= since,
            OrderItem.product_id.isnot(None),
        )
        .group_by(OrderItem.product_id)
    )
    sales_stmt = _apply_order_branch_filter(sales_stmt, effective)
    sales_result = await session.execute(sales_stmt)
    sales_map: dict[int, int] = {row.product_id: int(row.qty_sold) for row in sales_result}

    # Fetch branch names for display
    branch_names: dict[int, str] = {}
    if effective == "ALL":
        branch_result = await session.execute(
            select(Branch.id, Branch.name).where(Branch.org_id == current_user.org_id)
        )
        branch_names = {row.id: row.name for row in branch_result}

    # Fetch active, tracked inventory
    inv_stmt = (
        select(Product, Inventory)
        .join(Inventory, Inventory.product_id == Product.id)
        .where(
            Product.org_id == current_user.org_id,
            Product.is_active == True,
            Product.track_inventory == True,
        )
    )
    inv_stmt = _apply_branch_filter(inv_stmt, effective)
    inv_result = await session.execute(inv_stmt)
    rows = inv_result.all()

    suggestions: list[ReorderSuggestion] = []
    for product, inv in rows:
        qty_sold = sales_map.get(product.id, 0)
        avg_daily = qty_sold / days if qty_sold > 0 else 0.0

        days_remaining = inv.quantity / avg_daily if avg_daily > 0 else None

        lead_time = 7
        if avg_daily > 0:
            suggested = max(0, int(avg_daily * (lead_time + 14)) - inv.quantity)
        else:
            suggested = max(0, product.min_stock - inv.quantity)

        if days_remaining is None:
            urgency = "no_sales"
        elif days_remaining <= 3:
            urgency = "critical"
        elif days_remaining <= 7:
            urgency = "warning"
        elif days_remaining <= 14:
            urgency = "watch"
        else:
            urgency = "ok"

        if urgency == "ok" and inv.quantity > product.min_stock:
            continue

        suggestions.append(ReorderSuggestion(
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            unit=product.unit,
            branch_id=inv.branch_id,
            branch_name=branch_names.get(inv.branch_id) if inv.branch_id else None,
            current_stock=inv.quantity,
            min_stock=product.min_stock,
            avg_daily_sales=round(avg_daily, 2),
            days_remaining=round(days_remaining, 1) if days_remaining is not None else None,
            suggested_reorder_qty=suggested,
            urgency=urgency,
        ))

    order = {"critical": 0, "warning": 1, "watch": 2, "no_sales": 3, "ok": 4}
    suggestions.sort(key=lambda s: (order.get(s.urgency, 9), s.days_remaining or 9999))
    return suggestions


# ── Inventory Aging ────────────────────────────────────────────────────────

class AgingItem(BaseModel):
    product_id: int
    product_name: str
    sku: str | None
    unit: str
    category_name: str | None
    branch_id: int | None
    branch_name: str | None
    current_stock: int
    cost_value: float
    last_sale_days_ago: int | None  # None = never sold
    aging_bucket: str  # "fresh" | "slow" | "stale" | "dead" | "never_sold"


@router.get("/aging", response_model=list[AgingItem])
async def inventory_aging(
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[AgingItem]:
    now = datetime.now(UTC)
    effective = _effective_branch(current_user, branch_id)

    # Last sale date per product (org-wide — selling at any branch counts)
    last_sale_stmt = (
        select(OrderItem.product_id, func.max(Order.created_at).label("last_sale"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.org_id == current_user.org_id,
            Order.status == OrderStatus.COMPLETED,
            OrderItem.product_id.isnot(None),
        )
        .group_by(OrderItem.product_id)
    )
    last_sale_result = await session.execute(last_sale_stmt)
    last_sale_map: dict[int, datetime] = {row.product_id: row.last_sale for row in last_sale_result}

    # Fetch branch names for display
    branch_names: dict[int, str] = {}
    if effective == "ALL":
        branch_result = await session.execute(
            select(Branch.id, Branch.name).where(Branch.org_id == current_user.org_id)
        )
        branch_names = {row.id: row.name for row in branch_result}

    inv_stmt = (
        select(Product, Inventory)
        .join(Inventory, Inventory.product_id == Product.id)
        .options(selectinload(Product.category))
        .where(
            Product.org_id == current_user.org_id,
            Product.is_active == True,
            Product.track_inventory == True,
            Inventory.quantity > 0,
        )
    )
    inv_stmt = _apply_branch_filter(inv_stmt, effective)
    inv_result = await session.execute(inv_stmt)
    items: list[AgingItem] = []

    for product, inv in inv_result.all():
        last_sale = last_sale_map.get(product.id)
        if last_sale:
            if last_sale.tzinfo is None:
                last_sale = last_sale.replace(tzinfo=UTC)
            days_ago = (now - last_sale).days
        else:
            days_ago = None

        if days_ago is None:
            bucket = "never_sold"
        elif days_ago <= 30:
            bucket = "fresh"
        elif days_ago <= 90:
            bucket = "slow"
        elif days_ago <= 180:
            bucket = "stale"
        else:
            bucket = "dead"

        cost_value = float((product.cost or product.price) * inv.quantity)

        items.append(AgingItem(
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            unit=product.unit,
            category_name=product.category.name if product.category else None,
            branch_id=inv.branch_id,
            branch_name=branch_names.get(inv.branch_id) if inv.branch_id else None,
            current_stock=inv.quantity,
            cost_value=round(cost_value, 2),
            last_sale_days_ago=days_ago,
            aging_bucket=bucket,
        ))

    bucket_order = {"dead": 0, "stale": 1, "never_sold": 2, "slow": 3, "fresh": 4}
    items.sort(key=lambda x: (bucket_order.get(x.aging_bucket, 9), -(x.last_sale_days_ago or 9999)))
    return items


# ── Sales Report Router ─────────────────────────────────────────────────────

sales_router = APIRouter(prefix="/analytics", tags=["reports"])


class SalesSummary(BaseModel):
    date: str
    revenue: float
    transactions: int
    avg_transaction: float
    discount_total: float


class PaymentBreakdown(BaseModel):
    payment_method: str
    count: int
    total: float


class CashierBreakdown(BaseModel):
    cashier_id: int | None
    cashier_name: str
    count: int
    total: float


class ProductPerformance(BaseModel):
    product_id: int
    product_name: str
    sku: str | None
    qty_sold: int
    revenue: float
    cost: float
    profit: float
    profit_margin: float


def _date_range(period: str | None, date_from: str | None, date_to: str | None):
    now = datetime.now(UTC)
    if date_from and date_to:
        d_from = datetime.fromisoformat(date_from).replace(tzinfo=UTC)
        d_to = datetime.fromisoformat(date_to).replace(tzinfo=UTC)
    elif period == "day":
        d_from = now.replace(hour=0, minute=0, second=0, microsecond=0)
        d_to = now
    elif period == "week":
        d_from = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_to = now
    elif period == "month":
        d_from = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_to = now
    else:
        d_from = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        d_to = now
    return d_from, d_to


@sales_router.get("/summary", response_model=list[SalesSummary])
async def sales_summary(
    period: str | None = Query(None, description="day|week|month"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[SalesSummary]:
    d_from, d_to = _date_range(period, date_from, date_to)
    effective = _effective_branch(current_user, branch_id)

    stmt = select(Order).where(
        Order.org_id == current_user.org_id,
        Order.created_at >= d_from,
        Order.created_at <= d_to,
        Order.status == OrderStatus.COMPLETED,
    )
    stmt = _apply_order_branch_filter(stmt, effective)
    result = await session.execute(stmt)
    orders = result.scalars().all()

    # Group by date
    by_date: dict[str, dict] = {}
    for o in orders:
        key = o.created_at.strftime("%Y-%m-%d")
        if key not in by_date:
            by_date[key] = {"revenue": 0.0, "transactions": 0, "discount_total": 0.0}
        by_date[key]["revenue"] += float(o.total or 0)
        by_date[key]["transactions"] += 1
        by_date[key]["discount_total"] += float(o.discount_amount or 0)

    return [
        SalesSummary(
            date=date,
            revenue=round(v["revenue"], 2),
            transactions=v["transactions"],
            avg_transaction=round(v["revenue"] / v["transactions"], 2) if v["transactions"] else 0,
            discount_total=round(v["discount_total"], 2),
        )
        for date, v in sorted(by_date.items())
    ]


@sales_router.get("/by-payment", response_model=list[PaymentBreakdown])
async def sales_by_payment(
    period: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[PaymentBreakdown]:
    d_from, d_to = _date_range(period, date_from, date_to)
    effective = _effective_branch(current_user, branch_id)

    stmt = select(Order).where(
        Order.org_id == current_user.org_id,
        Order.created_at >= d_from,
        Order.created_at <= d_to,
        Order.status == OrderStatus.COMPLETED,
    )
    stmt = _apply_order_branch_filter(stmt, effective)
    result = await session.execute(stmt)
    orders = result.scalars().all()

    by_method: dict[str, dict] = {}
    for o in orders:
        m = o.payment_method.value if hasattr(o.payment_method, 'value') else str(o.payment_method)
        if m not in by_method:
            by_method[m] = {"count": 0, "total": 0.0}
        by_method[m]["count"] += 1
        by_method[m]["total"] += float(o.total or 0)

    return [
        PaymentBreakdown(payment_method=m, count=v["count"], total=round(v["total"], 2))
        for m, v in sorted(by_method.items(), key=lambda x: -x[1]["total"])
    ]


@sales_router.get("/by-cashier", response_model=list[CashierBreakdown])
async def sales_by_cashier(
    period: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[CashierBreakdown]:
    d_from, d_to = _date_range(period, date_from, date_to)
    effective = _effective_branch(current_user, branch_id)

    stmt = select(Order).where(
        Order.org_id == current_user.org_id,
        Order.created_at >= d_from,
        Order.created_at <= d_to,
        Order.status == OrderStatus.COMPLETED,
    )
    stmt = _apply_order_branch_filter(stmt, effective)
    result = await session.execute(stmt)
    orders = result.scalars().all()

    cashier_ids = {o.cashier_id for o in orders if o.cashier_id is not None}
    user_names: dict[int, str] = {}
    if cashier_ids:
        users_result = await session.execute(
            select(User.id, User.name).where(User.id.in_(cashier_ids))
        )
        user_names = {row.id: row.name for row in users_result}

    by_cashier: dict[int | None, dict] = {}
    for o in orders:
        key = o.cashier_id
        if key not in by_cashier:
            name = user_names.get(key) if key is not None else None
            by_cashier[key] = {"name": name or f"User {key}", "count": 0, "total": 0.0}
        by_cashier[key]["count"] += 1
        by_cashier[key]["total"] += float(o.total or 0)

    return [
        CashierBreakdown(cashier_id=cid, cashier_name=v["name"], count=v["count"], total=round(v["total"], 2))
        for cid, v in sorted(by_cashier.items(), key=lambda x: -x[1]["total"])
    ]


@sales_router.get("/products", response_model=list[ProductPerformance])
async def product_performance(
    period: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    branch_id: int | None = Query(None),
    sort_by: str = Query("revenue", description="revenue|profit|qty"),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ProductPerformance]:
    d_from, d_to = _date_range(period, date_from, date_to)
    effective = _effective_branch(current_user, branch_id)

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.org_id == current_user.org_id,
            Order.created_at >= d_from,
            Order.created_at <= d_to,
            Order.status == OrderStatus.COMPLETED,
        )
    )
    stmt = _apply_order_branch_filter(stmt, effective)
    result = await session.execute(stmt)
    orders = result.scalars().all()

    prod_map: dict[int, dict] = {}
    for o in orders:
        for item in o.items:
            pid = item.product_id or 0
            if pid not in prod_map:
                prod_map[pid] = {
                    "name": item.product_name,
                    "sku": item.product_sku,
                    "qty": 0, "revenue": 0.0, "cost": 0.0,
                }
            prod_map[pid]["qty"] += item.quantity
            prod_map[pid]["revenue"] += float(item.total or 0)

    # Fetch cost from products
    if prod_map:
        prod_result = await session.execute(
            select(Product).where(Product.id.in_(list(prod_map.keys())))
        )
        for prod in prod_result.scalars().all():
            if prod.id in prod_map:
                cost_per = float(prod.cost or 0)
                prod_map[prod.id]["cost"] = cost_per * prod_map[prod.id]["qty"]

    items = []
    for pid, v in prod_map.items():
        profit = v["revenue"] - v["cost"]
        margin = (profit / v["revenue"] * 100) if v["revenue"] else 0
        items.append(ProductPerformance(
            product_id=pid,
            product_name=v["name"],
            sku=v.get("sku"),
            qty_sold=v["qty"],
            revenue=round(v["revenue"], 2),
            cost=round(v["cost"], 2),
            profit=round(profit, 2),
            profit_margin=round(margin, 1),
        ))

    sort_key = {"revenue": lambda x: -x.revenue, "profit": lambda x: -x.profit, "qty": lambda x: -x.qty_sold}
    items.sort(key=sort_key.get(sort_by, lambda x: -x.revenue))
    return items
