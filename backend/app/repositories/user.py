from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import verify_password
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.user import UserCreate, UserUpdate


class UserRepository(BaseRepository[User, UserCreate, UserUpdate]):
    model = User

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get(self, id: int) -> User | None:
        result = await self.session.execute(
            select(User).options(selectinload(User.branch)).where(User.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_org(self, org_id: int) -> list[User]:
        result = await self.session.execute(
            select(User)
            .options(selectinload(User.branch))
            .where(User.org_id == org_id, User.is_active == True)
            .order_by(User.name)
        )
        return list(result.scalars().all())

    async def authenticate(self, user_id: int, pin: str) -> User | None:
        user = await self.get(user_id)
        if not user or not user.is_active:
            return None
        if not verify_password(pin, user.pin_hash):
            return None
        return user
