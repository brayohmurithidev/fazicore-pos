"""
M-Pesa Daraja API integration — per-tenant callback URLs.

Authenticated endpoints (JWT required):
  GET    /mpesa/credentials               — fetch masked credentials + callback URLs (admin)
  PUT    /mpesa/credentials               — save / update credentials (admin)
  DELETE /mpesa/credentials               — remove credentials (admin)
  POST   /mpesa/stk-push                  — initiate STK push
  GET    /mpesa/stk-status/{checkout_id}  — poll STK result
  GET    /mpesa/transactions              — list transactions
  POST   /mpesa/transactions/{id}/attach  — attach C2B tx to order

Legacy public webhooks (no JWT) — superseded by app/api/v1/hooks.py, kept only
for any tenant still registered against the old path; both require `?ck=...`:
  POST /mpesa/callback/{org_slug}/stk     — STK result callback
  POST /mpesa/callback/{org_slug}/c2b     — C2B confirmation callback

Each tenant registers their own slug-scoped URLs in Daraja so callbacks are
routed directly to the right organisation with no shortcode lookup ambiguity.
"""

import json
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1 import hooks as _hooks
from app.core.database import get_session
from app.core.deps import get_current_active_user, require_roles
from app.models.mpesa import (
    MpesaCredentials,
    MpesaEnvironment,
    MpesaTransaction,
    MpesaTransactionStatus,
    MpesaTransactionType,
)
from app.models.customer import Customer
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services.mpesa import DarajaClient, decrypt_credential, encrypt_credential
from app.services.mpesa_reconciliation import resolve_stk_transaction

router = APIRouter(prefix="/mpesa", tags=["mpesa"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _mask(value: str) -> str:
    return ("*" * max(0, len(value) - 4)) + value[-4:] if len(value) > 4 else "****"


async def _get_creds(org_id: int, session: AsyncSession, environment: MpesaEnvironment | None = None) -> MpesaCredentials | None:
    q = select(MpesaCredentials).where(MpesaCredentials.org_id == org_id)
    if environment:
        q = q.where(MpesaCredentials.environment == environment.value)
    else:
        # Return the live (active) environment's credentials
        q = q.where(MpesaCredentials.is_live == True)  # noqa: E712
    return await session.scalar(q)


async def _get_all_creds(org_id: int, session: AsyncSession) -> list[MpesaCredentials]:
    rows = await session.scalars(
        select(MpesaCredentials).where(MpesaCredentials.org_id == org_id)
    )
    return list(rows.all())


async def _get_org_slug(org_id: int, session: AsyncSession) -> str:
    return await session.scalar(
        select(Organization.slug).where(Organization.id == org_id)
    ) or str(org_id)


def _hooks_base(request: Request) -> str:
    return str(request.base_url).rstrip("/") + "/api/v1/hooks"


def _stk_callback_url(request: Request, org_slug: str) -> str:
    return f"{_hooks_base(request)}/{org_slug}/stk"


def _with_callback_key(url: str, key: str | None) -> str:
    """Append the `?ck=` param Safaricom must echo back for the callback to be accepted."""
    if not key:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}ck={key}"


def _build_client(creds: MpesaCredentials) -> DarajaClient:
    return DarajaClient(
        consumer_key=decrypt_credential(creds.consumer_key_enc),
        consumer_secret=decrypt_credential(creds.consumer_secret_enc),
        passkey=decrypt_credential(creds.passkey_enc),
        shortcode=creds.shortcode,
        environment=creds.environment.value,
    )


# ── Schemas ───────────────────────────────────────────────────────────────────

class CredentialsIn(BaseModel):
    environment: MpesaEnvironment
    shortcode: str
    # Leave blank to keep existing encrypted value
    consumer_key: str = ""
    consumer_secret: str = ""
    passkey: str = ""
    callback_url_override: str | None = None


class CredentialsOut(BaseModel):
    environment: MpesaEnvironment
    shortcode: str
    consumer_key_masked: str
    consumer_secret_masked: str
    passkey_masked: str
    callback_url_override: str | None
    is_active: bool
    is_live: bool
    # Tenant-scoped URLs to register in Daraja portal
    stk_callback_url: str
    c2b_confirmation_url: str
    c2b_validation_url: str


class StkPushIn(BaseModel):
    phone: str
    amount: int
    order_ref: str


class StkPushOut(BaseModel):
    checkout_request_id: str
    merchant_request_id: str
    response_code: str
    customer_message: str


class StatusOut(BaseModel):
    has_live_credentials: bool


class TransactionOut(BaseModel):
    id: int
    transaction_type: str
    status: str
    phone: str | None
    sender_name: str | None
    amount: float
    mpesa_receipt_number: str | None
    order_id: int | None
    created_at: str


class AttachIn(BaseModel):
    order_id: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _origin(override: str | None, request: Request) -> str:
    """Return scheme+host from the override URL, or fall back to the request base URL."""
    if not override:
        return str(request.base_url).rstrip("/")
    parsed = urlparse(override.strip())
    return f"{parsed.scheme}://{parsed.netloc}"


def _creds_out(creds: MpesaCredentials, request: Request, slug: str) -> CredentialsOut:
    base = _origin(creds.callback_url_override, request)
    key = creds.callback_key
    return CredentialsOut(
        environment=creds.environment,
        shortcode=creds.shortcode,
        consumer_key_masked=_mask(decrypt_credential(creds.consumer_key_enc)),
        consumer_secret_masked=_mask(decrypt_credential(creds.consumer_secret_enc)),
        passkey_masked=_mask(decrypt_credential(creds.passkey_enc)),
        callback_url_override=creds.callback_url_override,
        is_active=creds.is_active,
        is_live=creds.is_live,
        stk_callback_url=_with_callback_key(f"{base}/api/v1/hooks/{slug}/stk", key),
        c2b_confirmation_url=_with_callback_key(f"{base}/api/v1/hooks/{slug}/c2b/confirm", key),
        c2b_validation_url=_with_callback_key(f"{base}/api/v1/hooks/{slug}/c2b/validate", key),
    )


# ── Credentials endpoints ─────────────────────────────────────────────────────

@router.get("/credentials", response_model=list[CredentialsOut])
async def get_credentials(
    request: Request,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: AsyncSession = Depends(get_session),
):
    all_creds = await _get_all_creds(user.org_id, session)
    slug = await _get_org_slug(user.org_id, session)
    return [_creds_out(c, request, slug) for c in all_creds]


@router.put("/credentials", response_model=CredentialsOut)
async def save_credentials(
    body: CredentialsIn,
    request: Request,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: AsyncSession = Depends(get_session),
):
    # Look up existing row for this specific environment
    creds = await _get_creds(user.org_id, session, environment=body.environment)
    slug  = await _get_org_slug(user.org_id, session)

    if creds:
        creds.shortcode             = body.shortcode
        if body.consumer_key:
            creds.consumer_key_enc    = encrypt_credential(body.consumer_key)
        if body.consumer_secret:
            creds.consumer_secret_enc = encrypt_credential(body.consumer_secret)
        if body.passkey:
            creds.passkey_enc         = encrypt_credential(body.passkey)
        creds.callback_url_override = body.callback_url_override
        creds.is_active             = True
        if not creds.callback_key:
            creds.callback_key = secrets.token_urlsafe(24)
    else:
        if not body.consumer_key or not body.consumer_secret or not body.passkey:
            raise HTTPException(status_code=422, detail="consumer_key, consumer_secret and passkey are required for new credentials")
        # First set of credentials defaults to live; subsequent sets don't
        existing_any = await _get_all_creds(user.org_id, session)
        creds = MpesaCredentials(
            org_id=user.org_id,
            environment=body.environment,
            shortcode=body.shortcode,
            consumer_key_enc=encrypt_credential(body.consumer_key),
            consumer_secret_enc=encrypt_credential(body.consumer_secret),
            passkey_enc=encrypt_credential(body.passkey),
            callback_url_override=body.callback_url_override,
            is_live=len(existing_any) == 0,
            callback_key=secrets.token_urlsafe(24),
        )
        session.add(creds)

    await session.commit()
    await session.refresh(creds)

    return _creds_out(creds, request, slug)


@router.post("/credentials/set-live/{environment}", status_code=200)
async def set_live_environment_path(
    environment: MpesaEnvironment,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: AsyncSession = Depends(get_session),
):
    """Switch which environment is used for live transactions."""
    all_creds = await _get_all_creds(user.org_id, session)
    target = next((c for c in all_creds if c.environment == environment), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"No credentials saved for {environment.value}")
    for c in all_creds:
        c.is_live = (c.environment == environment)
    await session.commit()
    return {"ok": True, "live_environment": environment.value}


@router.delete("/credentials/{environment}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credentials(
    environment: MpesaEnvironment,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: AsyncSession = Depends(get_session),
):
    creds = await _get_creds(user.org_id, session, environment=environment)
    if creds:
        await session.delete(creds)
        await session.commit()


@router.get("/status", response_model=StatusOut)
async def get_status(
    user: Annotated[User, Depends(get_current_active_user)],
    session: AsyncSession = Depends(get_session),
):
    """Whether this org has a live, active Daraja integration — any role can
    call this (no secrets in the response), unlike GET /credentials which is
    admin-only. The POS payment flow needs this to decide whether to actually
    contact Safaricom or fall back to the local simulation; previously it
    called GET /credentials directly, which 403'd for non-admin cashiers and
    silently defaulted to "no Daraja configured" — every cashier-initiated
    STK push was running in fake simulation mode instead of charging anyone.
    """
    creds = await _get_creds(user.org_id, session)
    return StatusOut(has_live_credentials=bool(creds and creds.is_active))


# ── C2B URL Registration ──────────────────────────────────────────────────────

@router.post("/register-c2b", status_code=200)
async def register_c2b(
    request: Request,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: AsyncSession = Depends(get_session),
    environment: MpesaEnvironment | None = Query(None),
):
    creds = await _get_creds(user.org_id, session, environment=environment)
    if not creds or not creds.is_active:
        raise HTTPException(status_code=400, detail="M-Pesa not configured for this account")

    slug = await _get_org_slug(user.org_id, session)

    if not creds.callback_key:
        creds.callback_key = secrets.token_urlsafe(24)
        await session.commit()
        await session.refresh(creds)

    base = _origin(creds.callback_url_override, request)
    confirmation_url = _with_callback_key(f"{base}/api/v1/hooks/{slug}/c2b/confirm", creds.callback_key)
    validation_url   = _with_callback_key(f"{base}/api/v1/hooks/{slug}/c2b/validate", creds.callback_key)

    client = _build_client(creds)
    try:
        result = await client.register_c2b_urls(
            confirmation_url=confirmation_url,
            validation_url=validation_url,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Daraja can return HTTP 200 with a non-zero ResponseCode on error
    if str(result.get("ResponseCode", "0")) != "0":
        desc = result.get("ResponseDescription") or result.get("errorMessage") or "C2B registration failed"
        raise HTTPException(status_code=502, detail=f"Daraja: {desc}")

    return {"ok": True, "confirmation_url": confirmation_url, "validation_url": validation_url}


# ── C2B Simulate (sandbox only) ───────────────────────────────────────────────

class SimulateC2bIn(BaseModel):
    phone: str
    amount: int
    bill_ref: str = "TestPayment"


@router.post("/simulate-c2b", status_code=200)
async def simulate_c2b(
    body: SimulateC2bIn,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: AsyncSession = Depends(get_session),
):
    """
    Inject a fake C2B confirmation directly into our own hook — no Daraja call needed.
    Useful for testing the full C2B flow without registered URLs.
    """
    from app.models.customer import Customer

    org_id = user.org_id
    phone  = body.phone.replace(" ", "").replace("+", "").replace("-", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]

    # Try to find a customer name for this phone
    customer = await session.scalar(
        select(Customer).where(Customer.org_id == org_id, Customer.phone == body.phone)
    )
    sender_name = customer.name if customer else "Test Payer"

    import random, string
    receipt = "SIM" + "".join(random.choices(string.ascii_uppercase + string.digits, k=9))

    tx = MpesaTransaction(
        org_id=org_id,
        transaction_type=MpesaTransactionType.C2B,
        status=MpesaTransactionStatus.COMPLETED,
        phone=phone,
        sender_name=sender_name,
        amount=float(body.amount),
        mpesa_receipt_number=receipt,
        result_code=0,
        result_desc="Simulated C2B payment",
        raw_callback=json.dumps({
            "TransID": receipt, "TransAmount": str(body.amount),
            "MSISDN": phone, "BillRefNumber": body.bill_ref,
            "FirstName": "Test", "LastName": "Payer", "_simulated": True,
        }),
    )
    session.add(tx)
    await session.commit()

    return {"ok": True, "receipt": receipt, "amount": body.amount, "phone": phone}


# ── STK Push ──────────────────────────────────────────────────────────────────

@router.post("/stk-push", response_model=StkPushOut)
async def initiate_stk_push(
    body: StkPushIn,
    request: Request,
    user: Annotated[User, Depends(get_current_active_user)],
    session: AsyncSession = Depends(get_session),
):
    creds = await _get_creds(user.org_id, session)
    if not creds or not creds.is_active:
        raise HTTPException(status_code=400, detail="M-Pesa not configured for this account")

    slug = await _get_org_slug(user.org_id, session)
    if not creds.callback_key:
        creds.callback_key = secrets.token_urlsafe(24)
        await session.flush()
    callback_url = _with_callback_key(
        creds.callback_url_override or _stk_callback_url(request, slug),
        creds.callback_key,
    )

    client = _build_client(creds)
    try:
        result = await client.stk_push(
            phone=body.phone,
            amount=body.amount,
            account_ref=body.order_ref,
            description="Fazi POS Payment",
            callback_url=callback_url,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Daraja error: {e}")

    if result.get("ResponseCode") != "0":
        raise HTTPException(
            status_code=400,
            detail=result.get("ResponseDescription", "STK push failed"),
        )

    tx = MpesaTransaction(
        org_id=user.org_id,
        transaction_type=MpesaTransactionType.STK_PUSH,
        status=MpesaTransactionStatus.PENDING,
        merchant_request_id=result.get("MerchantRequestID"),
        checkout_request_id=result.get("CheckoutRequestID"),
        phone=body.phone,
        amount=body.amount,
    )
    session.add(tx)
    await session.commit()

    return StkPushOut(
        checkout_request_id=result["CheckoutRequestID"],
        merchant_request_id=result["MerchantRequestID"],
        response_code=result["ResponseCode"],
        customer_message=result.get("CustomerMessage", "Check your phone to complete payment"),
    )


@router.get("/stk-status/{checkout_request_id}")
async def get_stk_status(
    checkout_request_id: str,
    user: Annotated[User, Depends(get_current_active_user)],
    session: AsyncSession = Depends(get_session),
):
    tx = await session.scalar(
        select(MpesaTransaction).where(
            MpesaTransaction.org_id == user.org_id,
            MpesaTransaction.checkout_request_id == checkout_request_id,
        )
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return {
        "status": tx.status.value,
        "mpesa_receipt_number": tx.mpesa_receipt_number,
        "result_desc": tx.result_desc,
        "amount": float(tx.amount),
        "phone": tx.phone,
    }


# ── Transaction list (for manual C2B selection) ───────────────────────────────

@router.get("/transactions", response_model=list[TransactionOut])
async def list_transactions(
    user: Annotated[User, Depends(get_current_active_user)],
    session: AsyncSession = Depends(get_session),
    unattached_only: bool = Query(False),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(200, le=500),
):
    q = select(MpesaTransaction).where(MpesaTransaction.org_id == user.org_id)
    if unattached_only:
        q = q.where(
            MpesaTransaction.order_id.is_(None),
            MpesaTransaction.status == MpesaTransactionStatus.COMPLETED,
        )
    if date_from:
        q = q.where(MpesaTransaction.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to:
        next_day = date_to + timedelta(days=1)
        q = q.where(MpesaTransaction.created_at < datetime(next_day.year, next_day.month, next_day.day, tzinfo=timezone.utc))
    q = q.order_by(MpesaTransaction.created_at.desc()).limit(limit)
    rows = (await session.scalars(q)).all()

    # Build phone → customer name lookup for rows missing sender_name
    phones_needed = {r.phone for r in rows if r.phone and not r.sender_name}
    phone_to_name: dict[str, str] = {}
    if phones_needed:
        customers = (await session.scalars(
            select(Customer).where(
                Customer.org_id == user.org_id,
                Customer.phone.in_(phones_needed),
            )
        )).all()
        for c in customers:
            if c.phone:
                p = c.phone.replace(" ", "").replace("+", "").replace("-", "")
                if p.startswith("0"):
                    p = "254" + p[1:]
                phone_to_name[p] = c.name
                phone_to_name[c.phone] = c.name  # also store raw in case format matches

    return [
        TransactionOut(
            id=r.id,
            transaction_type=r.transaction_type.value,
            status=r.status.value,
            phone=r.phone,
            sender_name=r.sender_name or phone_to_name.get(r.phone or ""),
            amount=float(r.amount),
            mpesa_receipt_number=r.mpesa_receipt_number,
            order_id=r.order_id,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/transactions/{tx_id}/reconcile")
async def reconcile_transaction(
    tx_id: int,
    user: Annotated[User, Depends(get_current_active_user)],
    session: AsyncSession = Depends(get_session),
):
    """Force an immediate Daraja status check for a stuck PENDING STK push,
    instead of waiting for the next background reconciliation sweep —
    for support staff investigating a "customer says they paid" report."""
    tx = await session.get(MpesaTransaction, tx_id)
    if not tx or tx.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.transaction_type != MpesaTransactionType.STK_PUSH:
        raise HTTPException(status_code=400, detail="Only STK push transactions can be reconciled")

    if tx.status != MpesaTransactionStatus.PENDING:
        return {"status": tx.status.value, "outcome": "already_resolved"}

    creds = await _get_creds(user.org_id, session)
    outcome = await resolve_stk_transaction(tx, creds)
    await session.commit()

    return {
        "status": tx.status.value,
        "outcome": outcome,
        "mpesa_receipt_number": tx.mpesa_receipt_number,
        "result_desc": tx.result_desc,
    }


@router.post("/transactions/{tx_id}/attach")
async def attach_transaction(
    tx_id: int,
    body: AttachIn,
    user: Annotated[User, Depends(get_current_active_user)],
    session: AsyncSession = Depends(get_session),
):
    tx = await session.get(MpesaTransaction, tx_id)
    if not tx or tx.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx.order_id = body.order_id
    await session.commit()
    return {"ok": True}


# ── Tenant-scoped Safaricom callbacks (no auth) ───────────────────────────────
# Superseded by the /api/v1/hooks/{org_slug}/... paths (this router's prefix
# contains "mpesa", which Daraja's URL keyword filter rejects — see hooks.py's
# module docstring). Kept only in case any tenant still has these registered
# from before that move; they delegate to the hooks.py implementations so
# there's exactly one copy of the callback-key check and dedup logic.

@router.post("/callback/{org_slug}/stk", include_in_schema=False)
async def stk_callback(
    org_slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    ck: str | None = Query(None),
):
    return await _hooks.stk_hook(org_slug, request, session, ck)


@router.post("/callback/{org_slug}/c2b/validate", include_in_schema=False)
async def c2b_validation(
    org_slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    ck: str | None = Query(None),
):
    return await _hooks.c2b_validate(org_slug, request, session, ck)


@router.post("/callback/{org_slug}/c2b/confirm", include_in_schema=False)
async def c2b_confirmation(
    org_slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    ck: str | None = Query(None),
):
    return await _hooks.c2b_confirm(org_slug, request, session, ck)


# Keep old /c2b route for backwards compatibility with any already-registered URLs
@router.post("/callback/{org_slug}/c2b", include_in_schema=False)
async def c2b_callback_legacy(
    org_slug: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
    ck: str | None = Query(None),
):
    return await c2b_confirmation(org_slug, request, session, ck)
