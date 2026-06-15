"""
Paystack payment gateway integration.

Authenticated endpoints (JWT required):
  GET    /paystack/credentials          — fetch credentials (admin)
  PUT    /paystack/credentials          — save / update credentials (admin)
  DELETE /paystack/credentials          — remove credentials (admin)

  POST   /paystack/initialize           — initialize card transaction → returns access_code
  GET    /paystack/verify/{reference}   — verify completed card transaction
  POST   /paystack/mobile-money         — initiate M-Pesa STK via Paystack
  GET    /paystack/status/{reference}   — poll mobile-money charge status
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user, require_roles
from app.models.paystack import PaystackCredentials
from app.models.user import User, UserRole
from app.services.mpesa import decrypt_credential, encrypt_credential
from app.services.paystack import PaystackClient

router = APIRouter(prefix="/paystack", tags=["paystack"])


def _mask(value: str) -> str:
    return ("*" * max(0, len(value) - 4)) + value[-4:] if len(value) > 4 else "****"


async def _get_creds(org_id: int, session: AsyncSession) -> PaystackCredentials | None:
    return await session.scalar(
        select(PaystackCredentials).where(PaystackCredentials.org_id == org_id)
    )


async def _client(org_id: int, session: AsyncSession) -> PaystackClient:
    creds = await _get_creds(org_id, session)
    if not creds or not creds.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Paystack not configured for this account")
    return PaystackClient(decrypt_credential(creds.secret_key_enc))


# ── Schema models ─────────────────────────────────────────────────────────────

class CredentialsIn(BaseModel):
    public_key: str
    secret_key: str
    is_live: bool = False


class CredentialsOut(BaseModel):
    public_key: str
    secret_key_masked: str
    is_live: bool
    is_active: bool


class InitializeIn(BaseModel):
    amount: int       # KES
    email: str
    reference: str | None = None


class MobileMoneyIn(BaseModel):
    phone: str
    amount: int       # KES
    email: str
    reference: str | None = None


# ── Credentials CRUD ──────────────────────────────────────────────────────────

@router.get("/credentials", response_model=CredentialsOut | None)
async def get_credentials(
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    creds = await _get_creds(current_user.org_id, session)
    if not creds:
        return None
    return CredentialsOut(
        public_key=creds.public_key,
        secret_key_masked=_mask(decrypt_credential(creds.secret_key_enc)),
        is_live=creds.is_live,
        is_active=creds.is_active,
    )


@router.put("/credentials", response_model=CredentialsOut)
async def upsert_credentials(
    body: CredentialsIn,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    creds = await _get_creds(current_user.org_id, session)
    if creds is None:
        creds = PaystackCredentials(org_id=current_user.org_id)
        session.add(creds)
    creds.public_key = body.public_key.strip()
    creds.secret_key_enc = encrypt_credential(body.secret_key.strip())
    creds.is_live = body.is_live
    creds.is_active = True
    await session.commit()
    await session.refresh(creds)
    return CredentialsOut(
        public_key=creds.public_key,
        secret_key_masked=_mask(body.secret_key),
        is_live=creds.is_live,
        is_active=creds.is_active,
    )


@router.delete("/credentials", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credentials(
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    creds = await _get_creds(current_user.org_id, session)
    if creds:
        await session.delete(creds)
        await session.commit()


# ── Public key endpoint (for frontend Popup) ──────────────────────────────────

class PublicKeyOut(BaseModel):
    public_key: str
    is_live: bool


@router.get("/public-key", response_model=PublicKeyOut | None)
async def get_public_key(
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Return the org's Paystack public key so the frontend can initialize the Popup."""
    creds = await _get_creds(current_user.org_id, session)
    if not creds or not creds.is_active:
        return None
    return PublicKeyOut(public_key=creds.public_key, is_live=creds.is_live)


# ── Card transactions ─────────────────────────────────────────────────────────

@router.post("/initialize")
async def initialize_transaction(
    body: InitializeIn,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Initialize a card transaction and return the Paystack access_code for the Popup."""
    client = await _client(current_user.org_id, session)
    try:
        data = await client.initialize_transaction(body.email, body.amount, body.reference)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Paystack error: {exc}") from exc
    return data


@router.get("/verify/{reference}")
async def verify_transaction(
    reference: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Verify a completed card transaction by reference."""
    client = await _client(current_user.org_id, session)
    try:
        data = await client.verify_transaction(reference)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Paystack error: {exc}") from exc
    # data.status is 'success' | 'failed' | 'abandoned' | 'ongoing'
    return data


# ── Mobile money (M-Pesa via Paystack) ───────────────────────────────────────

@router.post("/mobile-money")
async def charge_mobile_money(
    body: MobileMoneyIn,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Initiate an M-Pesa STK push via Paystack mobile money channel."""
    client = await _client(current_user.org_id, session)
    try:
        data = await client.charge_mobile_money(body.phone, body.amount, body.email, body.reference)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Paystack error: {exc}") from exc
    return data


@router.get("/status/{reference}")
async def charge_status(
    reference: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Poll mobile money charge status (success | pending | failed)."""
    client = await _client(current_user.org_id, session)
    try:
        data = await client.check_charge(reference)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Paystack error: {exc}") from exc
    return {"status": data.get("status", "pending"), "reference": reference, "data": data}
