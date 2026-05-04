from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.repositories.base import BaseRepository
from app.schemas.branch import BranchCreate, BranchUpdate


class BranchRepository(BaseRepository[Branch, BranchCreate, BranchUpdate]):
    model = Branch

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_org(self, org_id: int) -> list[Branch]:
        result = await self.session.execute(
            select(Branch).where(Branch.org_id == org_id).order_by(Branch.name)
        )
        return list(result.scalars().all())
