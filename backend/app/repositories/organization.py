from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.organization import Organization
from app.models.product import Product
from app.models.user import User
from app.repositories.base import BaseRepository
from app.schemas.organization import OrganizationCreate, OrganizationUpdate


class OrganizationRepository(BaseRepository[Organization, OrganizationCreate, OrganizationUpdate]):
    model = Organization

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_slug(self, slug: str) -> Organization | None:
        result = await self.session.execute(
            select(Organization).where(Organization.slug == slug)
        )
        return result.scalar_one_or_none()

    async def get_with_stats(self, org_id: int) -> dict | None:
        org = await self.get(org_id)
        if not org:
            return None

        branch_count_result = await self.session.execute(
            select(func.count(Branch.id)).where(Branch.org_id == org_id)
        )
        user_count_result = await self.session.execute(
            select(func.count(User.id)).where(User.org_id == org_id)
        )
        product_count_result = await self.session.execute(
            select(func.count(Product.id)).where(Product.org_id == org_id, Product.is_active == True)
        )

        return {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "type": org.type,
            "status": org.status,
            "plan": org.plan,
            "max_branches": org.max_branches,
            "max_users": org.max_users,
            "max_products": org.max_products,
            "is_active": org.is_active,
            "created_at": org.created_at,
            "branch_count": branch_count_result.scalar_one(),
            "user_count": user_count_result.scalar_one(),
            "product_count": product_count_result.scalar_one(),
        }
