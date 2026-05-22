"""Shared helpers for subscription lifecycle: invoice creation and renewal."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import InvoiceStatus, SubscriptionInvoice
from app.models.organization import Organization, OrgStatus, SubscriptionPlan
from app.models.subscription import BillingInterval, Plan, Subscription, SubscriptionStatus


async def create_invoice(
    *,
    session: AsyncSession,
    org_id: int,
    subscription_id: int | None,
    plan: Plan,
    billing_interval: str,
    period_start: datetime,
    period_end: datetime,
    status: InvoiceStatus = InvoiceStatus.OPEN,
    paid_at: datetime | None = None,
    payment_method: str | None = None,
    mpesa_receipt: str | None = None,
    mpesa_phone: str | None = None,
    notes: str | None = None,
) -> SubscriptionInvoice:
    amount = float(plan.price_annual) if billing_interval == "annual" else float(plan.price_monthly)
    due_date = period_start + timedelta(days=3)

    inv = SubscriptionInvoice(
        organization_id=org_id,
        subscription_id=subscription_id,
        plan_name=plan.name,
        amount=amount,
        currency="KES",
        billing_interval=billing_interval,
        period_start=period_start,
        period_end=period_end,
        due_date=due_date,
        status=status,
        paid_at=paid_at,
        payment_method=payment_method,
        mpesa_receipt=mpesa_receipt,
        mpesa_phone=mpesa_phone,
        notes=notes,
    )
    session.add(inv)
    await session.flush()  # get id

    year = period_start.year
    inv.invoice_number = f"FZ-{year}-{inv.id:06d}"
    return inv


async def renew_subscription(
    *,
    session: AsyncSession,
    org: Organization,
    plan: Plan,
    billing_interval_str: str,
    payment_method: str,
    mpesa_receipt: str | None = None,
    mpesa_phone: str | None = None,
    amount_paid: float | None = None,
) -> tuple[Subscription, SubscriptionInvoice]:
    """Create a new Subscription record, update org limits, and create a paid invoice."""
    now = datetime.now(tz=timezone.utc)
    period_end = now + timedelta(days=365 if billing_interval_str == "annual" else 30)
    billing_interval = BillingInterval.ANNUAL if billing_interval_str == "annual" else BillingInterval.MONTHLY

    sub = Subscription(
        organization_id=org.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        billing_interval=billing_interval,
        current_period_start=now,
        current_period_end=period_end,
        billing_phone=mpesa_phone,
        last_payment_at=now,
        last_payment_amount=amount_paid or (
            float(plan.price_annual) if billing_interval_str == "annual" else float(plan.price_monthly)
        ),
    )
    session.add(sub)

    org.max_branches = plan.max_branches
    org.max_users = plan.max_users
    org.max_products = plan.max_products
    org.status = OrgStatus.ACTIVE
    try:
        org.plan = SubscriptionPlan(plan.slug)
    except ValueError:
        pass

    await session.flush()  # get sub.id

    inv = await create_invoice(
        session=session,
        org_id=org.id,
        subscription_id=sub.id,
        plan=plan,
        billing_interval=billing_interval_str,
        period_start=now,
        period_end=period_end,
        status=InvoiceStatus.PAID,
        paid_at=now,
        payment_method=payment_method,
        mpesa_receipt=mpesa_receipt,
        mpesa_phone=mpesa_phone,
    )
    return sub, inv
