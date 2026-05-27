from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.models.inventory import Inventory
from app.models.product import Product
from app.repositories.base import BaseRepository
from app.schemas.product import ProductCreate, ProductUpdate


class ProductRepository(BaseRepository[Product, ProductCreate, ProductUpdate]):
    model = Product

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_sku(self, sku: str) -> Product | None:
        result = await self.session.execute(select(Product).where(Product.sku == sku))
        return result.scalar_one_or_none()

    async def get_by_barcode(self, barcode: str) -> Product | None:
        result = await self.session.execute(select(Product).where(Product.barcode == barcode))
        return result.scalar_one_or_none()

    async def search(
        self,
        org_id: int,
        q: str | None = None,
        category_id: int | None = None,
        skip: int = 0,
        limit: int = 50,
        active_only: bool = True,
    ) -> list[Product]:
        stmt = (
            select(Product)
            .options(selectinload(Product.inventory), joinedload(Product.category), selectinload(Product.units))
            .where(Product.org_id == org_id)
        )
        if active_only:
            stmt = stmt.where(Product.is_active == True)
        if category_id is not None:
            stmt = stmt.where(Product.category_id == category_id)
        if q:
            search_term = f"%{q}%"
            stmt = stmt.where(
                or_(
                    Product.name.ilike(search_term),
                    Product.sku.ilike(search_term),
                    Product.barcode.ilike(search_term),
                )
            )
        stmt = stmt.offset(skip).limit(limit).order_by(Product.name)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_with_stock(self, id: int) -> Product | None:
        result = await self.session.execute(
            select(Product)
            .options(selectinload(Product.inventory), joinedload(Product.category), selectinload(Product.units))
            .where(Product.id == id)
        )
        return result.scalar_one_or_none()
