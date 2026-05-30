"""
Payment webhook endpoints — neutral path to satisfy Daraja's URL keyword filter.
Safaricom rejects callback URLs containing "mpesa", "safaricom", "sql", etc.

Registered paths (use these in Daraja portal):
  POST /api/v1/hooks/{org_slug}/stk          — STK Push result
  POST /api/v1/hooks/{org_slug}/c2b/validate — C2B validation (accept/reject)
  POST /api/v1/hooks/{org_slug}/c2b/confirm  — C2B confirmation (store tx)
"""

import json
import hashlib
import hmac
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing import renew_subscription
from app.core.config import settings
from app.core.database import get_session
from app.models.mpesa import MpesaTransaction, MpesaTransactionStatus, MpesaTransactionType
from app.models.organization import Organization, OrgStatus, SubscriptionPlan
from app.models.subscription import BillingInterval, Plan, Subscription, SubscriptionStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hooks", tags=["hooks"])


# ── Inbound from central billing system (Fazilabs Invoicing) ───────────────────
# The billing system POSTs here when a subscription invoice is paid or goes
# overdue. We flip org + subscription status accordingly. Body is HMAC-signed
# with BILLING_WEBHOOK_SECRET (header: X-Webhook-Signature: sha256=<hex>).

@router.post("/billing", include_in_schema=False)
async def billing_status_hook(
    request: Request,
    session: AsyncSession = Depends(get_session),
    x_webhook_signature: str | None = Header(None),
):
    raw = await request.body()

    secret = getattr(settings, "BILLING_WEBHOOK_SECRET", "")
    if secret:
        expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
        if not x_webhook_signature or not hmac.compare_digest(expected, x_webhook_signature):
            logger.warning("Billing webhook: bad signature")
            return {"status": "rejected", "reason": "invalid signature"}

    import json
    try:
        payload = json.loads(raw)
    except Exception:
        return {"status": "ignored", "reason": "bad json"}

    event = payload.get("event")
    external_ref = (payload.get("external_ref") or "")
    # external_ref is "pos:<org_slug>"
    org_slug = external_ref.split(":", 1)[1] if ":" in external_ref else external_ref
    if not org_slug:
        return {"status": "ignored", "reason": "no external_ref"}

    org = await session.scalar(select(Organization).where(Organization.slug == org_slug))
    if not org:
        logger.warning("Billing webhook: no org for slug %s", org_slug)
        return {"status": "ignored", "reason": "unknown org"}

    sub = await session.scalar(
        select(Subscription).where(Subscription.organization_id == org.id).limit(1)
    )

    if event == "subscription.activated":
        org.status = OrgStatus.ACTIVE
        if sub:
            sub.status = SubscriptionStatus.ACTIVE
        logger.info("Billing webhook: activated org %s", org_slug)
    elif event == "subscription.past_due":
        org.status = OrgStatus.SUSPENDED
        if sub:
            sub.status = SubscriptionStatus.PAST_DUE
        logger.info("Billing webhook: suspended org %s (past due)", org_slug)
    else:
        return {"status": "ignored", "reason": f"unhandled event {event}"}

    session.add(org)
    if sub:
        session.add(sub)
    await session.commit()
    return {"status": "ok"}


@router.post("/{org_slug}/stk", include_in_schema=False)
async def stk_hook(
    org_slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    try:
        payload = await request.json()
    except Exception:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    body = payload.get("Body", {})
    stk  = body.get("stkCallback", {})
    checkout_request_id = stk.get("CheckoutRequestID")
    result_code         = stk.get("ResultCode")
    result_desc         = stk.get("ResultDesc", "")

    if not checkout_request_id:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    org_id = await session.scalar(
        select(Organization.id).where(Organization.slug == org_slug)
    )

    tx = await session.scalar(
        select(MpesaTransaction).where(
            MpesaTransaction.checkout_request_id == checkout_request_id,
            *([MpesaTransaction.org_id == org_id] if org_id else []),
        )
    )

    if tx:
        tx.result_code  = result_code
        tx.result_desc  = result_desc
        tx.raw_callback = json.dumps(payload)

        if result_code == 0:
            tx.status = MpesaTransactionStatus.COMPLETED
            items = {
                item["Name"]: item.get("Value")
                for item in stk.get("CallbackMetadata", {}).get("Item", [])
            }
            tx.mpesa_receipt_number = str(items.get("MpesaReceiptNumber", ""))
            tx.phone = str(items.get("PhoneNumber", tx.phone or ""))

            if tx.account_reference and tx.account_reference.startswith("SUBSUP:"):
                await _activate_subscription(tx, session)
        else:
            tx.status = MpesaTransactionStatus.FAILED

        await session.commit()

    return {"ResultCode": "0", "ResultDesc": "Accepted"}


async def _activate_subscription(tx: MpesaTransaction, session: AsyncSession) -> None:
    """Upgrade the org's subscription after a successful SUBSUP STK payment."""
    try:
        _, plan_slug, billing_interval_str = tx.account_reference.split(":", 2)  # type: ignore[union-attr]
    except ValueError:
        return

    plan = await session.scalar(
        select(Plan).where(Plan.slug == plan_slug, Plan.is_active == True)  # noqa: E712
    )
    if not plan:
        return

    org = await session.get(Organization, tx.org_id)
    if not org:
        return

    await renew_subscription(
        session=session,
        org=org,
        plan=plan,
        billing_interval_str=billing_interval_str,
        payment_method="mpesa_stk",
        mpesa_receipt=tx.mpesa_receipt_number,
        mpesa_phone=tx.phone,
        amount_paid=float(tx.amount),
    )


@router.post("/{org_slug}/c2b/validate", include_in_schema=False)
async def c2b_validate(org_slug: str, request: Request):
    """Accept all incoming C2B payments. Add rejection logic here if needed."""
    return {"ResultCode": "0", "ResultDesc": "Accepted"}


@router.post("/{org_slug}/c2b/confirm", include_in_schema=False)
async def c2b_confirm(
    org_slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    try:
        payload = await request.json()
    except Exception:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    org_id = await session.scalar(
        select(Organization.id).where(Organization.slug == org_slug)
    )
    if not org_id:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    receipt     = payload.get("TransID", "")
    amount      = float(payload.get("TransAmount", 0))
    phone       = str(payload.get("MSISDN", ""))
    first       = payload.get("FirstName", "").strip()
    middle      = payload.get("MiddleName", "").strip()
    last        = payload.get("LastName", "").strip()
    sender_name = " ".join(p for p in [first, middle, last] if p) or None

    tx = MpesaTransaction(
        org_id=org_id,
        transaction_type=MpesaTransactionType.C2B,
        status=MpesaTransactionStatus.COMPLETED,
        phone=phone,
        sender_name=sender_name,
        amount=amount,
        mpesa_receipt_number=receipt,
        result_code=0,
        result_desc="C2B payment received",
        raw_callback=json.dumps(payload),
    )
    session.add(tx)
    await session.commit()

    return {"ResultCode": "0", "ResultDesc": "Accepted"}


# ── Platform-level paybill callbacks ─────────────────────────────────────────
# Register these in Daraja for Fazi's own platform paybill shortcode.
# Customers pay with their shop slug as the account number to renew.

@router.post("/platform/c2b/validate", include_in_schema=False)
async def platform_c2b_validate(request: Request):
    return {"ResultCode": "0", "ResultDesc": "Accepted"}


@router.post("/platform/c2b/confirm", include_in_schema=False)
async def platform_c2b_confirm(
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Safaricom posts here when a customer pays the platform paybill.
    BillRefNumber must match an org slug — renews that org's subscription.
    """
    try:
        payload = await request.json()
    except Exception:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    bill_ref = str(payload.get("BillRefNumber", "")).strip().lower()
    receipt  = str(payload.get("TransID", ""))
    amount   = float(payload.get("TransAmount", 0))
    phone    = str(payload.get("MSISDN", ""))

    if not bill_ref:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    # Match org by slug (case-insensitive)
    org = await session.scalar(
        select(Organization).where(Organization.slug == bill_ref)
    )
    if not org:
        return {"ResultCode": "0", "ResultDesc": "Accepted"}

    # Store raw C2B transaction tied to the org
    tx = MpesaTransaction(
        org_id=org.id,
        transaction_type=MpesaTransactionType.C2B,
        status=MpesaTransactionStatus.COMPLETED,
        phone=phone,
        amount=amount,
        mpesa_receipt_number=receipt,
        result_code=0,
        result_desc="Platform C2B subscription payment",
        account_reference=f"PLATFORM_C2B:{bill_ref}",
        raw_callback=json.dumps(payload),
    )
    session.add(tx)

    # Look up current plan from most-recent subscription
    from sqlalchemy.orm import selectinload  # noqa: PLC0415
    sub = await session.scalar(
        select(Subscription)
        .where(Subscription.organization_id == org.id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    plan: Plan | None = None
    billing_interval_str = "monthly"
    if sub:
        plan = await session.get(Plan, sub.plan_id)
        billing_interval_str = sub.billing_interval.value

    # If no plan or free plan, try to infer from amount paid
    if plan is None or float(plan.price_monthly) == 0:
        plan = await _infer_plan_from_amount(amount, billing_interval_str, session)

    if plan:
        await renew_subscription(
            session=session,
            org=org,
            plan=plan,
            billing_interval_str=billing_interval_str,
            payment_method="mpesa_c2b",
            mpesa_receipt=receipt,
            mpesa_phone=phone,
            amount_paid=amount,
        )

    await session.commit()
    return {"ResultCode": "0", "ResultDesc": "Accepted"}


async def _infer_plan_from_amount(
    amount: float,
    billing_interval: str,
    session: AsyncSession,
) -> "Plan | None":
    """Find the plan whose price best matches the amount paid."""
    from sqlalchemy import select as _select  # noqa: PLC0415
    plans = (await session.scalars(
        _select(Plan).where(Plan.is_active == True)  # noqa: E712
    )).all()
    price_field = "price_annual" if billing_interval == "annual" else "price_monthly"
    for plan in sorted(plans, key=lambda p: abs(float(getattr(p, price_field)) - amount)):
        if float(getattr(plan, price_field)) > 0:
            return plan
    return None
