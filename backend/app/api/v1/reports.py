"""
Comprehensive reports: daily summary, shift reconciliation,
stock levels, and void/refund log.
"""
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.attendance import Attendance
from app.models.branch import Branch
from app.models.inventory import Inventory
from app.models.order import Order, OrderItem, OrderStatus, PaymentMethod
from app.models.product import Product
from app.models.user import User, UserRole

router = APIRouter(prefix="/reports", tags=["reports"])


def _require_manager(current_user: User) -> None:
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager or admin access required")


def _require_stock_report_access(current_user: User) -> None:
    """Stock levels carry no financial/cashier data, so STOCK can see this one
    report — the frontend already only shows Stock + Reorder tabs for that
    role, but the backend was blanket-denying every /reports/* endpoint to
    STOCK, leaving the page stuck on an infinite loading spinner."""
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER, UserRole.STOCK):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Manager, admin, or stock access required")


def _effective_branch(current_user: User, branch_id: int | None) -> int | None | str:
    if current_user.role != UserRole.ADMIN:
        return current_user.branch_id
    return branch_id if branch_id is not None else "ALL"


def _apply_order_branch_filter(stmt, effective):
    if effective == "ALL":
        return stmt
    if effective is None:
        return stmt.where(Order.branch_id.is_(None))
    return stmt.where(Order.branch_id == effective)


# ── Daily Summary ──────────────────────────────────────────────────────────────

class PaymentLine(BaseModel):
    method: str
    count: int
    total: float


class CashierLine(BaseModel):
    cashier_id: int | None
    cashier_name: str
    count: int
    total: float


class DailySummary(BaseModel):
    report_date: str
    total_revenue: float
    total_orders: int
    avg_order_value: float
    total_discount: float
    total_voids: int
    void_amount: float
    cash_total: float
    mpesa_total: float
    credit_total: float
    mpesa_cash_total: float
    by_payment: list[PaymentLine]
    by_cashier: list[CashierLine]
    top_products: list[dict]


@router.get("/daily", response_model=DailySummary)
async def daily_summary(
    report_date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> DailySummary:
    _require_manager(current_user)
    effective = _effective_branch(current_user, branch_id)

    if report_date:
        day = datetime.fromisoformat(report_date).replace(tzinfo=UTC)
    else:
        day = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)

    day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.org_id == current_user.org_id,
            Order.created_at >= day_start,
            Order.created_at < day_end,
        )
    )
    stmt = _apply_order_branch_filter(stmt, effective)
    result = await session.execute(stmt)
    orders = result.scalars().all()

    completed = [o for o in orders if o.status == OrderStatus.COMPLETED]
    voided = [o for o in orders if o.status == OrderStatus.VOIDED]

    total_revenue = sum(float(o.total or 0) for o in completed)
    total_discount = sum(float(o.discount_amount or 0) for o in completed)
    void_amount = sum(float(o.total or 0) for o in voided)

    # Payment method breakdown
    by_method: dict[str, dict] = {}
    for o in completed:
        m = o.payment_method.value if hasattr(o.payment_method, "value") else str(o.payment_method)
        if m not in by_method:
            by_method[m] = {"count": 0, "total": 0.0}
        by_method[m]["count"] += 1
        by_method[m]["total"] += float(o.total or 0)

    # Cashier breakdown
    cashier_ids = {o.cashier_id for o in completed if o.cashier_id}
    user_names: dict[int, str] = {}
    if cashier_ids:
        ur = await session.execute(select(User.id, User.name).where(User.id.in_(cashier_ids)))
        user_names = {row.id: row.name for row in ur}

    by_cashier: dict[int | None, dict] = {}
    for o in completed:
        k = o.cashier_id
        if k not in by_cashier:
            by_cashier[k] = {"name": user_names.get(k) or f"User {k}", "count": 0, "total": 0.0}
        by_cashier[k]["count"] += 1
        by_cashier[k]["total"] += float(o.total or 0)

    # Top products
    prod_map: dict[int, dict] = {}
    for o in completed:
        for item in o.items:
            pid = item.product_id or 0
            if pid not in prod_map:
                prod_map[pid] = {"name": item.product_name, "qty": 0, "revenue": 0.0}
            prod_map[pid]["qty"] += item.quantity
            prod_map[pid]["revenue"] += float(item.total or 0)

    top_products = sorted(prod_map.values(), key=lambda x: -x["revenue"])[:10]

    def _pmt(method_str: str) -> float:
        v = by_method.get(method_str, {})
        return round(v.get("total", 0.0), 2)

    return DailySummary(
        report_date=day_start.strftime("%Y-%m-%d"),
        total_revenue=round(total_revenue, 2),
        total_orders=len(completed),
        avg_order_value=round(total_revenue / len(completed), 2) if completed else 0.0,
        total_discount=round(total_discount, 2),
        total_voids=len(voided),
        void_amount=round(void_amount, 2),
        cash_total=_pmt("cash"),
        mpesa_total=_pmt("mpesa"),
        credit_total=_pmt("credit"),
        mpesa_cash_total=_pmt("mpesa_cash"),
        by_payment=[
            PaymentLine(method=m, count=v["count"], total=round(v["total"], 2))
            for m, v in sorted(by_method.items(), key=lambda x: -x[1]["total"])
        ],
        by_cashier=[
            CashierLine(cashier_id=k, cashier_name=v["name"], count=v["count"], total=round(v["total"], 2))
            for k, v in sorted(by_cashier.items(), key=lambda x: -x[1]["total"])
        ],
        top_products=[{"name": p["name"], "qty": p["qty"], "revenue": round(p["revenue"], 2)} for p in top_products],
    )


# ── Shift Report ───────────────────────────────────────────────────────────────

class ShiftReportItem(BaseModel):
    attendance_id: int
    user_id: int
    user_name: str
    clock_in: datetime
    clock_out: datetime | None
    opening_float: float | None
    closing_cash: float | None
    shift_notes: str | None
    sales_count: int
    sales_total: float
    cash_sales: float
    mpesa_sales: float
    expected_cash: float
    variance: float | None


@router.get("/shift", response_model=list[ShiftReportItem])
async def shift_report(
    report_date: str | None = Query(None, description="YYYY-MM-DD, defaults to today"),
    user_id: int | None = Query(None),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ShiftReportItem]:
    _require_manager(current_user)

    if report_date:
        target_date = datetime.fromisoformat(report_date).date()
    else:
        target_date = date.today()

    att_stmt = (
        select(Attendance)
        .options(selectinload(Attendance.user))
        .where(
            Attendance.org_id == current_user.org_id,
            Attendance.date == target_date,
        )
    )
    if user_id:
        att_stmt = att_stmt.where(Attendance.user_id == user_id)
    if branch_id:
        att_stmt = att_stmt.where(Attendance.branch_id == branch_id)
    att_result = await session.execute(att_stmt)
    records = att_result.scalars().all()

    if not records:
        return []

    # For each attendance record, pull orders in that shift window
    items: list[ShiftReportItem] = []
    for rec in records:
        shift_end = rec.clock_out or datetime.now(UTC)
        clock_in_utc = rec.clock_in if rec.clock_in.tzinfo else rec.clock_in.replace(tzinfo=UTC)
        shift_end_utc = shift_end if shift_end.tzinfo else shift_end.replace(tzinfo=UTC)

        ord_stmt = select(Order).where(
            Order.org_id == current_user.org_id,
            Order.cashier_id == rec.user_id,
            Order.status == OrderStatus.COMPLETED,
            Order.created_at >= clock_in_utc,
            Order.created_at <= shift_end_utc,
        )
        if branch_id or rec.branch_id:
            ord_stmt = ord_stmt.where(Order.branch_id == (branch_id or rec.branch_id))
        ord_result = await session.execute(ord_stmt)
        shift_orders = ord_result.scalars().all()

        sales_total = sum(float(o.total or 0) for o in shift_orders)
        cash_sales = sum(float(o.cash_amount or 0) for o in shift_orders)
        mpesa_sales = sum(
            float(o.mpesa_amount or 0) for o in shift_orders
        )

        opening = float(rec.opening_float or 0)
        expected_cash = opening + cash_sales
        closing = float(rec.closing_cash) if rec.closing_cash is not None else None
        variance = round(closing - expected_cash, 2) if closing is not None else None

        items.append(ShiftReportItem(
            attendance_id=rec.id,
            user_id=rec.user_id,
            user_name=rec.user.name if rec.user else f"User {rec.user_id}",
            clock_in=clock_in_utc,
            clock_out=rec.clock_out,
            opening_float=float(rec.opening_float) if rec.opening_float is not None else None,
            closing_cash=closing,
            shift_notes=rec.shift_notes,
            sales_count=len(shift_orders),
            sales_total=round(sales_total, 2),
            cash_sales=round(cash_sales, 2),
            mpesa_sales=round(mpesa_sales, 2),
            expected_cash=round(expected_cash, 2),
            variance=variance,
        ))

    return items


# ── Stock Levels ───────────────────────────────────────────────────────────────

class StockLevelItem(BaseModel):
    product_id: int
    product_name: str
    sku: str | None
    category_name: str | None
    branch_id: int | None
    branch_name: str | None
    quantity: int
    min_stock: int
    cost: float
    price: float
    stock_value: float
    status: str


@router.get("/stock-levels", response_model=list[StockLevelItem])
async def stock_levels(
    branch_id: int | None = Query(None),
    include_zero: bool = Query(False),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[StockLevelItem]:
    _require_stock_report_access(current_user)

    effective_branch: int | None | str
    if current_user.role != UserRole.ADMIN:
        effective_branch = current_user.branch_id
    else:
        effective_branch = branch_id if branch_id is not None else "ALL"

    branch_names: dict[int, str] = {}
    if effective_branch == "ALL":
        br = await session.execute(
            select(Branch.id, Branch.name).where(Branch.org_id == current_user.org_id)
        )
        branch_names = {row.id: row.name for row in br}

    inv_stmt = (
        select(Product, Inventory)
        .join(Inventory, Inventory.product_id == Product.id)
        .options(selectinload(Product.category))
        .where(
            Product.org_id == current_user.org_id,
            Product.is_active == True,
            Product.track_inventory == True,
        )
    )
    if not include_zero:
        inv_stmt = inv_stmt.where(Inventory.quantity > 0)

    if effective_branch == "ALL":
        pass
    elif effective_branch is None:
        inv_stmt = inv_stmt.where(Inventory.branch_id.is_(None))
    else:
        inv_stmt = inv_stmt.where(Inventory.branch_id == effective_branch)

    inv_result = await session.execute(inv_stmt)
    items: list[StockLevelItem] = []

    for product, inv in inv_result.all():
        cost = float(product.cost or 0)
        price = float(product.price or 0)
        stock_value = round(cost * inv.quantity, 2)

        if inv.quantity <= 0:
            status = "out_of_stock"
        elif inv.quantity <= product.min_stock:
            status = "low"
        else:
            status = "ok"

        items.append(StockLevelItem(
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            category_name=product.category.name if product.category else None,
            branch_id=inv.branch_id,
            branch_name=branch_names.get(inv.branch_id) if inv.branch_id else None,
            quantity=inv.quantity,
            min_stock=product.min_stock,
            cost=round(cost, 2),
            price=round(price, 2),
            stock_value=stock_value,
            status=status,
        ))

    items.sort(key=lambda x: ({"out_of_stock": 0, "low": 1, "ok": 2}.get(x.status, 9), x.product_name))
    return items


# ── Void & Refund Log ──────────────────────────────────────────────────────────

class VoidLogItem(BaseModel):
    order_id: int
    order_number: str
    voided_at: datetime | None
    voided_by_name: str | None
    void_reason: str | None
    cashier_name: str | None
    branch_id: int | None
    branch_name: str | None
    total: float
    payment_method: str
    items_count: int


@router.get("/voids", response_model=list[VoidLogItem])
async def void_log(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    branch_id: int | None = Query(None),
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[VoidLogItem]:
    _require_manager(current_user)
    effective = _effective_branch(current_user, branch_id)

    now = datetime.now(UTC)
    if date_from:
        d_from = datetime.fromisoformat(date_from).replace(tzinfo=UTC)
    else:
        d_from = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)

    if date_to:
        d_to = datetime.fromisoformat(date_to).replace(tzinfo=UTC)
    else:
        d_to = now

    stmt = (
        select(Order)
        .options(selectinload(Order.items))
        .where(
            Order.org_id == current_user.org_id,
            Order.status == OrderStatus.VOIDED,
            Order.created_at >= d_from,
            Order.created_at <= d_to,
        )
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    stmt = _apply_order_branch_filter(stmt, effective)
    result = await session.execute(stmt)
    orders = result.scalars().all()

    # Fetch user names for voided_by and cashier_id
    user_ids = set()
    for o in orders:
        if o.voided_by:
            user_ids.add(o.voided_by)
        if o.cashier_id:
            user_ids.add(o.cashier_id)
    user_names: dict[int, str] = {}
    if user_ids:
        ur = await session.execute(select(User.id, User.name).where(User.id.in_(user_ids)))
        user_names = {row.id: row.name for row in ur}

    branch_names: dict[int, str] = {}
    if effective == "ALL":
        br = await session.execute(
            select(Branch.id, Branch.name).where(Branch.org_id == current_user.org_id)
        )
        branch_names = {row.id: row.name for row in br}

    items: list[VoidLogItem] = []
    for o in orders:
        voided_at = o.voided_at if hasattr(o, "voided_at") else None
        items.append(VoidLogItem(
            order_id=o.id,
            order_number=o.order_number,
            voided_at=voided_at,
            voided_by_name=user_names.get(o.voided_by) if o.voided_by else None,
            void_reason=o.void_reason if hasattr(o, "void_reason") else None,
            cashier_name=o.cashier_name or user_names.get(o.cashier_id),
            branch_id=o.branch_id,
            branch_name=branch_names.get(o.branch_id) if o.branch_id else None,
            total=float(o.total or 0),
            payment_method=o.payment_method.value if hasattr(o.payment_method, "value") else str(o.payment_method),
            items_count=len(o.items),
        ))

    return items
