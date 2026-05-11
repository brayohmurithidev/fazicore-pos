from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.inventory import TransactionType
from app.models.organization import Organization
from app.models.product import Product
from app.models.user import User, UserRole
from app.repositories.product import ProductRepository
from app.schemas.product import ProductBulkCreate, ProductCreate, ProductOut, ProductUpdate
from app.services.inventory import InventoryService

router = APIRouter(prefix="/products", tags=["products"])


@router.get("/", response_model=list[ProductOut])
async def list_products(
    q: str | None = Query(None),
    category_id: int | None = Query(None),
    branch_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ProductOut]:
    # Admins can view any branch or all; others are scoped to their branch
    if current_user.role != UserRole.ADMIN:
        effective_branch = current_user.branch_id
    else:
        effective_branch = branch_id

    repo = ProductRepository(session)
    products = await repo.search(
        org_id=current_user.org_id,
        q=q,
        category_id=category_id,
        skip=skip,
        limit=limit,
    )
    result = []
    for p in products:
        out = ProductOut.model_validate(p)
        if p.inventory:
            if effective_branch is not None:
                out.stock_quantity = sum(inv.quantity for inv in p.inventory if inv.branch_id == effective_branch)
            else:
                out.stock_quantity = sum(inv.quantity for inv in p.inventory)
        if p.category:
            out.category_name = p.category.name
        result.append(out)
    return result


@router.post("/", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(
    data: ProductCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductOut:
    org = await session.get(Organization, current_user.org_id)
    if org:
        active_count = await session.scalar(
            select(func.count(Product.id)).where(
                Product.org_id == current_user.org_id, Product.is_active == True
            )
        ) or 0
        if active_count >= org.max_products:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "limit_exceeded", "resource": "products",
                        "current": active_count, "max": org.max_products},
            )
    repo = ProductRepository(session)
    product_data = data.model_dump()
    product_data["org_id"] = current_user.org_id
    obj = Product(**product_data)
    session.add(obj)
    await session.flush()
    await session.refresh(obj)
    return ProductOut.model_validate(obj)


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_products(
    data: list[ProductBulkCreate],
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    org = await session.get(Organization, current_user.org_id)
    if org:
        active_count = await session.scalar(
            select(func.count(Product.id)).where(
                Product.org_id == current_user.org_id, Product.is_active == True
            )
        ) or 0
        if active_count + len(data) > org.max_products:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "limit_exceeded", "resource": "products",
                        "current": active_count, "max": org.max_products},
            )
    inv_service = InventoryService(session)
    created = 0
    for item in data:
        product_data = item.model_dump(exclude={"initial_stock"})
        product_data["org_id"] = current_user.org_id
        product = Product(**product_data)
        session.add(product)
        await session.flush()
        await session.refresh(product)
        if item.initial_stock > 0 and item.track_inventory:
            await inv_service.adjust(
                product_id=product.id,
                branch_id=current_user.branch_id,
                qty_change=item.initial_stock,
                type=TransactionType.PURCHASE,
                performed_by=current_user.id,
                notes="Initial stock from CSV import",
            )
        created += 1
    return {"created": created}


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductOut:
    repo = ProductRepository(session)
    product = await repo.get_with_stock(product_id)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    out = ProductOut.model_validate(product)
    if product.inventory:
        out.stock_quantity = sum(inv.quantity for inv in product.inventory)
    if product.category:
        out.category_name = product.category.name
    return out


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    data: ProductUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductOut:
    repo = ProductRepository(session)
    product = await repo.get(product_id)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    updated = await repo.update(product, data)
    return ProductOut.model_validate(updated)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    repo = ProductRepository(session)
    product = await repo.get(product_id)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    await repo.delete(product)
