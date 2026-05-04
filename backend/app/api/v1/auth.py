from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.schemas.auth import PinLoginRequest, RefreshRequest, TokenResponse, VerifyPinRequest
from app.schemas.user import UserOut
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/users", response_model=list[UserOut])
async def list_org_users(
    org_slug: str = Query(..., description="Organization slug"),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    service = AuthService(session)
    users = await service.get_org_users(org_slug)
    return [UserOut.model_validate(u) for u in users]


@router.post("/login", response_model=TokenResponse)
async def pin_login(
    body: PinLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    service = AuthService(session)
    access_token, refresh_token, user = await service.pin_login(
        body.org_slug, body.user_id, body.pin
    )
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/verify-pin")
async def verify_pin(
    body: VerifyPinRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    service = AuthService(session)
    valid, user = await service.verify_pin(body.org_slug, body.user_id, body.pin)
    return {
        "valid": valid,
        "role": user.role.value if user else None,
        "name": user.name if user else None,
    }


@router.post("/refresh")
async def refresh_token(
    body: RefreshRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    service = AuthService(session)
    access_token = await service.refresh(body.refresh_token)
    return {"access_token": access_token, "token_type": "bearer"}
