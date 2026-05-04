from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.product import Product
from app.repositories.base import BaseRepository
from app.schemas.category import CategoryCreate, CategoryUpdate


class CategoryRepository(BaseRepository[Category, CategoryCreate, CategoryUpdate]):
    model = Category

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_with_product_count(self, org_id: int) -> list[dict]:
        result = await self.session.execute(
            select(Category, func.count(Product.id).label("product_count"))
            .outerjoin(Product, (Product.category_id == Category.id) & (Product.is_active == True))
            .where(Category.org_id == org_id)
            .group_by(Category.id)
            .order_by(Category.sort_order, Category.name)
        )
        rows = result.all()
        categories = []
        for category, count in rows:
            cat_dict = {
                "id": category.id,
                "name": category.name,
                "description": category.description,
                "image_url": category.image_url,
                "color": category.color,
                "parent_id": category.parent_id,
                "sort_order": category.sort_order,
                "is_active": category.is_active,
                "product_count": count,
            }
            categories.append(cat_dict)
        return categories
