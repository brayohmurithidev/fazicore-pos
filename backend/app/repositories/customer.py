from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.repositories.base import BaseRepository
from app.schemas.customer import CustomerCreate, CustomerUpdate


class CustomerRepository(BaseRepository[Customer, CustomerCreate, CustomerUpdate]):
    model = Customer

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_phone(self, phone: str, org_id: int) -> Customer | None:
        result = await self.session.execute(
            select(Customer).where(Customer.phone == phone, Customer.org_id == org_id)
        )
        return result.scalar_one_or_none()

    async def search(
        self, org_id: int, q: str, skip: int = 0, limit: int = 50
    ) -> list[Customer]:
        search_term = f"%{q}%"
        result = await self.session.execute(
            select(Customer)
            .where(
                Customer.org_id == org_id,
                Customer.is_active == True,
                or_(
                    Customer.name.ilike(search_term),
                    Customer.phone.ilike(search_term),
                    Customer.email.ilike(search_term),
                ),
            )
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_by_org(
        self, org_id: int, skip: int = 0, limit: int = 100
    ) -> list[Customer]:
        result = await self.session.execute(
            select(Customer)
            .where(Customer.org_id == org_id)
            .order_by(Customer.name)
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all())
