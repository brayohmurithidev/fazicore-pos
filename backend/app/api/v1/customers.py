from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.credit_payment import CreditPayment
from app.models.customer import Customer
from app.models.order import Order, PaymentMethod
from app.models.user import User
from app.repositories.customer import CustomerRepository
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])


# ── schemas ───────────────────────────────────────────────────────────────────

class CreditInvoiceOut(BaseModel):
    id: int
    order_number: str
    total: float
    amount_paid: float
    outstanding: float
    created_at: datetime

    model_config = {"from_attributes": True}


class CreditPaymentCreate(BaseModel):
    amount: float
    payment_method: str = "cash"
    mpesa_ref: str | None = None
    order_id: int | None = None
    notes: str | None = None


class CreditPaymentOut(BaseModel):
    id: int
    customer_id: int
    order_id: int | None
    amount: float
    payment_method: str
    mpesa_ref: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerCreditSummary(BaseModel):
    customer_id: int
    customer_name: str
    credit_balance: float
    total_invoices: int
    total_paid: float


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_customer_or_404(session: AsyncSession, customer_id: int, org_id: int) -> Customer:
    repo = CustomerRepository(session)
    c = await repo.get(customer_id)
    if not c or c.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return c


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CustomerOut])
async def list_customers(
    q: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[CustomerOut]:
    repo = CustomerRepository(session)
    customers = await repo.search(current_user.org_id, q, skip, limit) if q else await repo.get_by_org(current_user.org_id, skip, limit)
    return [CustomerOut.model_validate(c) for c in customers]


@router.post("/", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    data: CustomerCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CustomerOut:
    cust_data = data.model_dump()
    cust_data["org_id"] = current_user.org_id
    obj = Customer(**cust_data)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return CustomerOut.model_validate(obj)


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(
    customer_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CustomerOut:
    return CustomerOut.model_validate(await _get_customer_or_404(session, customer_id, current_user.org_id))


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CustomerOut:
    repo = CustomerRepository(session)
    customer = await _get_customer_or_404(session, customer_id, current_user.org_id)
    updated = await repo.update(customer, data)
    return CustomerOut.model_validate(updated)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_customer(
    customer_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    repo = CustomerRepository(session)
    customer = await _get_customer_or_404(session, customer_id, current_user.org_id)
    await repo.delete(customer)


# ── Credit endpoints ──────────────────────────────────────────────────────────

@router.get("/{customer_id}/invoices", response_model=list[CreditInvoiceOut])
async def get_credit_invoices(
    customer_id: int,
    unpaid_only: bool = Query(False),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[CreditInvoiceOut]:
    """Credit sales (orders with payment_method=credit) linked to this customer."""
    await _get_customer_or_404(session, customer_id, current_user.org_id)
    stmt = select(Order).where(
        Order.customer_id == customer_id,
        Order.org_id == current_user.org_id,
        Order.payment_method == PaymentMethod.CREDIT,
    ).order_by(Order.created_at.desc())
    result = await session.execute(stmt)
    orders = result.scalars().all()
    out = []
    for o in orders:
        paid = float(o.amount_paid or 0)
        total = float(o.total or 0)
        outstanding = max(total - paid, 0)
        if unpaid_only and outstanding <= 0:
            continue
        out.append(CreditInvoiceOut(
            id=o.id,
            order_number=o.order_number,
            total=total,
            amount_paid=paid,
            outstanding=outstanding,
            created_at=o.created_at,
        ))
    return out


@router.get("/{customer_id}/payments", response_model=list[CreditPaymentOut])
async def get_credit_payments(
    customer_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[CreditPaymentOut]:
    await _get_customer_or_404(session, customer_id, current_user.org_id)
    result = await session.execute(
        select(CreditPayment)
        .where(CreditPayment.customer_id == customer_id, CreditPayment.org_id == current_user.org_id)
        .order_by(CreditPayment.created_at.desc())
        .offset(skip).limit(limit)
    )
    return [CreditPaymentOut.model_validate(p) for p in result.scalars().all()]


@router.post("/{customer_id}/payments", response_model=CreditPaymentOut, status_code=status.HTTP_201_CREATED)
async def record_credit_payment(
    customer_id: int,
    data: CreditPaymentCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CreditPaymentOut:
    customer = await _get_customer_or_404(session, customer_id, current_user.org_id)
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")

    payment = CreditPayment(
        org_id=current_user.org_id,
        customer_id=customer_id,
        order_id=data.order_id,
        amount=Decimal(str(data.amount)),
        payment_method=data.payment_method,
        mpesa_ref=data.mpesa_ref,
        notes=data.notes,
        recorded_by=current_user.id,
    )
    session.add(payment)

    # If linked to a specific order, update its amount_paid
    if data.order_id:
        order = await session.get(Order, data.order_id)
        if order and order.org_id == current_user.org_id:
            order.amount_paid = (order.amount_paid or Decimal(0)) + Decimal(str(data.amount))

    # Reduce customer credit balance
    customer.credit_balance = max(Decimal(0), (customer.credit_balance or Decimal(0)) - Decimal(str(data.amount)))

    await session.commit()
    await session.refresh(payment)
    return CreditPaymentOut.model_validate(payment)


@router.get("/credit/summary", response_model=list[CustomerCreditSummary])
async def credit_summary(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[CustomerCreditSummary]:
    """All customers with outstanding credit balance."""
    result = await session.execute(
        select(Customer).where(
            Customer.org_id == current_user.org_id,
            Customer.credit_balance > 0,
            Customer.is_active == True,
        ).order_by(Customer.credit_balance.desc())
    )
    customers = result.scalars().all()
    out = []
    for c in customers:
        # Total invoiced = sum of credit orders
        inv_result = await session.execute(
            select(Order).where(
                Order.customer_id == c.id,
                Order.payment_method == PaymentMethod.CREDIT,
            )
        )
        invoices = inv_result.scalars().all()
        total_invoiced = sum(float(o.total or 0) for o in invoices)
        total_paid = sum(float(o.amount_paid or 0) for o in invoices)
        out.append(CustomerCreditSummary(
            customer_id=c.id,
            customer_name=c.name,
            credit_balance=float(c.credit_balance),
            total_invoices=len(invoices),
            total_paid=total_paid,
        ))
    return out
