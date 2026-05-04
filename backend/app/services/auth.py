from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.user import User
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository
from jose import JWTError


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)
        self.org_repo = OrganizationRepository(session)

    async def get_org_users(self, org_slug: str) -> list[User]:
        org = await self.org_repo.get_by_slug(org_slug)
        if not org or not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )
        return await self.user_repo.get_by_org(org.id)

    async def pin_login(
        self, org_slug: str, user_id: int, pin: str
    ) -> tuple[str, str, User]:
        org = await self.org_repo.get_by_slug(org_slug)
        if not org or not org.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid organization",
            )

        user = await self.user_repo.authenticate(user_id, pin)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user ID or PIN",
            )

        if user.org_id != org.id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User does not belong to this organization",
            )

        extra = {"org_id": org.id, "role": user.role}
        access_token = create_access_token(subject=user.id, extra=extra)
        refresh_token = create_refresh_token(subject=user.id)
        return access_token, refresh_token, user

    async def verify_pin(self, org_slug: str, user_id: int, pin: str) -> tuple[bool, "User | None"]:
        org = await self.org_repo.get_by_slug(org_slug)
        if not org or not org.is_active:
            return False, None
        user = await self.user_repo.authenticate(user_id, pin)
        if not user or user.org_id != org.id:
            return False, None
        return True, user

    async def refresh(self, refresh_token: str) -> str:
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
        try:
            payload = decode_token(refresh_token)
            if payload.get("type") != "refresh":
                raise credentials_exception
            user_id: str | None = payload.get("sub")
            if user_id is None:
                raise credentials_exception
        except JWTError:
            raise credentials_exception

        user = await self.user_repo.get(int(user_id))
        if not user or not user.is_active:
            raise credentials_exception

        extra = {"org_id": user.org_id, "role": user.role}
        return create_access_token(subject=user.id, extra=extra)
