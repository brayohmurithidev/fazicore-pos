"""
Payment webhook endpoints — neutral path to satisfy Daraja's URL keyword filter.
Safaricom rejects callback URLs containing "mpesa", "safaricom", "sql", etc.

Registered paths (use these in Daraja portal):
  POST /api/v1/hooks/{org_slug}/stk          — STK Push result
  POST /api/v1/hooks/{org_slug}/c2b/validate — C2B validation (accept/reject)
  POST /api/v1/hooks/{org_slug}/c2b/confirm  — C2B confirmation (store tx)
"""

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.mpesa import MpesaTransaction, MpesaTransactionStatus, MpesaTransactionType
from app.models.organization import Organization, OrgStatus, SubscriptionPlan
from app.models.subscription import BillingInterval, Plan, Subscription, SubscriptionStatus

router = APIRouter(prefix="/hooks", tags=["hooks"])


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
    """Upgrade the org's subscription after a successful SUBSUP payment."""
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

    now = datetime.now(tz=timezone.utc)
    if billing_interval_str == "annual":
        period_end = now + timedelta(days=365)
        billing_interval = BillingInterval.ANNUAL
    else:
        period_end = now + timedelta(days=30)
        billing_interval = BillingInterval.MONTHLY

    sub = Subscription(
        organization_id=tx.org_id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        billing_interval=billing_interval,
        current_period_start=now,
        current_period_end=period_end,
        billing_phone=tx.phone,
        last_payment_at=now,
        last_payment_amount=tx.amount,
    )
    session.add(sub)

    # Mirror limits onto org row so feature gates read fast without a join.
    org.max_branches = plan.max_branches
    org.max_users = plan.max_users
    org.max_products = plan.max_products
    org.status = OrgStatus.ACTIVE
    try:
        org.plan = SubscriptionPlan(plan_slug)
    except ValueError:
        pass  # plan slug not in enum (e.g. future plans) — leave as-is


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
