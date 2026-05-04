from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.category import Category
from app.models.user import User
from app.repositories.category import CategoryRepository
from app.schemas.category import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryOut])
async def list_categories(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[CategoryOut]:
    repo = CategoryRepository(session)
    rows = await repo.get_with_product_count(current_user.org_id)
    return [CategoryOut(**row) for row in rows]


@router.post("/", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CategoryOut:
    cat_data = data.model_dump()
    cat_data["org_id"] = current_user.org_id
    obj = Category(**cat_data)
    session.add(obj)
    await session.flush()
    await session.refresh(obj)
    out = CategoryOut.model_validate(obj)
    out.product_count = 0
    return out


@router.get("/{category_id}", response_model=CategoryOut)
async def get_category(
    category_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CategoryOut:
    repo = CategoryRepository(session)
    cat = await repo.get(category_id)
    if not cat or cat.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return CategoryOut.model_validate(cat)


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> CategoryOut:
    repo = CategoryRepository(session)
    cat = await repo.get(category_id)
    if not cat or cat.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    updated = await repo.update(cat, data)
    return CategoryOut.model_validate(updated)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    repo = CategoryRepository(session)
    cat = await repo.get(category_id)
    if not cat or cat.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    await repo.delete(cat)
