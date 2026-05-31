from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.inventory import Inventory, TransactionType
from app.models.organization import Organization
from app.models.product import Product, ProductUnit
from app.models.user import User, UserRole
from app.repositories.product import ProductRepository
from app.schemas.product import ProductBulkCreate, ProductCreate, ProductOut, ProductUpdate, ProductUnitCreate, ProductUnitOut, ProductUnitUpdate
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
    if org and org.max_products is not None:
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

    # initial_stock is not a Product column — it seeds the inventory record below
    product_data = data.model_dump(exclude={"initial_stock"})
    product_data["org_id"] = current_user.org_id
    obj = Product(**product_data)
    session.add(obj)
    await session.flush()
    await session.refresh(obj)

    if data.initial_stock > 0 and data.track_inventory:
        inv_service = InventoryService(session)
        await inv_service.adjust(
            product_id=obj.id,
            branch_id=current_user.branch_id,
            qty_change=data.initial_stock,
            type=TransactionType.PURCHASE,
            performed_by=current_user.id,
            notes="Initial stock",
        )

    # Reload with relationships eager-loaded so ProductOut can serialize
    # (units/category/inventory would otherwise lazy-load and raise MissingGreenlet)
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product)
        .options(
            selectinload(Product.units),
            selectinload(Product.category),
            selectinload(Product.inventory),
        )
        .where(Product.id == obj.id)
    )
    product = result.scalar_one()
    out = ProductOut.model_validate(product)
    if product.inventory:
        out.stock_quantity = sum(
            inv.quantity for inv in product.inventory
            if current_user.branch_id is None or inv.branch_id == current_user.branch_id
        )
    if product.category:
        out.category_name = product.category.name
    return out


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
        if org.max_products is not None and active_count + len(data) > org.max_products:
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
    await repo.update(product, data)

    # Keep the per-row threshold (internal duplicate) in sync with the reorder
    # level so the per-location stock display matches the alert logic.
    # synchronize_session=False: we re-fetch below, so no need to sync ORM state.
    if data.min_stock is not None:
        await session.execute(
            update(Inventory)
            .where(Inventory.product_id == product_id)
            .values(low_stock_threshold=data.min_stock)
            .execution_options(synchronize_session=False)
        )
        await session.flush()

    # Reload with relationships eager-loaded so ProductOut can serialize without
    # tripping MissingGreenlet (units/category/inventory lazy-load otherwise).
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product)
        .options(
            selectinload(Product.units),
            selectinload(Product.category),
            selectinload(Product.inventory),
        )
        .where(Product.id == product_id)
    )
    fresh = result.scalar_one()
    out = ProductOut.model_validate(fresh)
    if fresh.inventory:
        out.stock_quantity = sum(
            inv.quantity for inv in fresh.inventory
            if current_user.branch_id is None or inv.branch_id == current_user.branch_id
        )
    if fresh.category:
        out.category_name = fresh.category.name
    return out


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


# ── Price adjustment ──────────────────────────────────────────────────────────

class PriceAdjustIn(BaseModel):
    new_price: float
    reason: str | None = None


class PriceHistoryOut(BaseModel):
    id: int
    old_price: float
    new_price: float
    reason: str | None
    changed_by_name: str | None
    created_at: str

    model_config = {"from_attributes": True}


@router.post("/{product_id}/price", response_model=ProductOut)
async def adjust_price(
    product_id: int,
    data: PriceAdjustIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductOut:
    from app.models.price_history import PriceHistory
    repo = ProductRepository(session)
    product = await repo.get(product_id)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if data.new_price <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Price must be greater than zero")

    history = PriceHistory(
        product_id=product_id,
        old_price=float(product.price),
        new_price=data.new_price,
        changed_by=current_user.id,
        reason=data.reason or None,
    )
    session.add(history)
    product.price = data.new_price
    session.add(product)
    await session.flush()

    # Reload with relationships eager-loaded so ProductOut can serialize without
    # tripping MissingGreenlet (refresh() above would expire units/category and
    # they'd then lazy-load in async context).
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product)
        .options(
            selectinload(Product.units),
            selectinload(Product.category),
            selectinload(Product.inventory),
        )
        .where(Product.id == product_id)
    )
    fresh = result.scalar_one()
    out = ProductOut.model_validate(fresh)
    if fresh.inventory:
        out.stock_quantity = sum(
            inv.quantity for inv in fresh.inventory
            if current_user.branch_id is None or inv.branch_id == current_user.branch_id
        )
    if fresh.category:
        out.category_name = fresh.category.name
    return out


# ── Product units ─────────────────────────────────────────────────────────────

async def _get_product_or_404(product_id: int, org_id: int, session: AsyncSession) -> Product:
    product = await session.get(Product, product_id)
    if not product or product.org_id != org_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.get("/{product_id}/units", response_model=list[ProductUnitOut])
async def list_product_units(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ProductUnitOut]:
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product).options(selectinload(Product.units)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Product not found")
    return [ProductUnitOut.model_validate(u) for u in product.units]


@router.post("/{product_id}/units", response_model=ProductUnitOut, status_code=status.HTTP_201_CREATED)
async def create_product_unit(
    product_id: int,
    data: ProductUnitCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductUnitOut:
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await _get_product_or_404(product_id, current_user.org_id, session)
    # Unset existing default if this one is being set as default
    if data.is_default:
        await session.execute(
            select(ProductUnit).where(ProductUnit.product_id == product_id, ProductUnit.is_default == True)
        )
        existing_defaults = (await session.execute(
            select(ProductUnit).where(ProductUnit.product_id == product_id, ProductUnit.is_default == True)
        )).scalars().all()
        for d in existing_defaults:
            d.is_default = False
            session.add(d)
    unit = ProductUnit(product_id=product_id, **data.model_dump())
    session.add(unit)
    await session.flush()
    await session.refresh(unit)
    return ProductUnitOut.model_validate(unit)


@router.patch("/{product_id}/units/{unit_id}", response_model=ProductUnitOut)
async def update_product_unit(
    product_id: int,
    unit_id: int,
    data: ProductUnitUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductUnitOut:
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await _get_product_or_404(product_id, current_user.org_id, session)
    unit = await session.get(ProductUnit, unit_id)
    if not unit or unit.product_id != product_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    if data.is_default:
        existing_defaults = (await session.execute(
            select(ProductUnit).where(
                ProductUnit.product_id == product_id,
                ProductUnit.is_default == True,
                ProductUnit.id != unit_id,
            )
        )).scalars().all()
        for d in existing_defaults:
            d.is_default = False
            session.add(d)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(unit, field, value)
    session.add(unit)
    await session.flush()
    await session.refresh(unit)
    return ProductUnitOut.model_validate(unit)


@router.delete("/{product_id}/units/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product_unit(
    product_id: int,
    unit_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    if current_user.role not in (UserRole.ADMIN, UserRole.MANAGER):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await _get_product_or_404(product_id, current_user.org_id, session)
    unit = await session.get(ProductUnit, unit_id)
    if not unit or unit.product_id != product_id:
        raise HTTPException(status_code=404, detail="Unit not found")
    await session.delete(unit)
    await session.flush()


@router.get("/barcode/{barcode}")
async def lookup_barcode(
    barcode: str,
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Resolve a barcode to a product + optional unit. Checks product barcodes then unit barcodes."""
    from sqlalchemy.orm import selectinload
    # Check product barcode first
    result = await session.execute(
        select(Product)
        .options(selectinload(Product.inventory), selectinload(Product.units), selectinload(Product.category))
        .where(Product.org_id == current_user.org_id, Product.barcode == barcode, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    matched_unit: ProductUnit | None = None

    if product is None:
        # Check unit barcodes
        unit_result = await session.execute(
            select(ProductUnit)
            .join(Product, Product.id == ProductUnit.product_id)
            .options(selectinload(ProductUnit.product).selectinload(Product.inventory),
                     selectinload(ProductUnit.product).selectinload(Product.units),
                     selectinload(ProductUnit.product).selectinload(Product.category))
            .where(Product.org_id == current_user.org_id, ProductUnit.barcode == barcode, Product.is_active == True)
        )
        matched_unit = unit_result.scalar_one_or_none()
        if matched_unit:
            product = matched_unit.product

    if product is None:
        raise HTTPException(status_code=404, detail="Barcode not found")

    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    stock = sum(
        inv.quantity for inv in product.inventory
        if effective_branch is None or inv.branch_id == effective_branch
    )
    out = ProductOut.model_validate(product)
    out.stock_quantity = stock
    if product.category:
        out.category_name = product.category.name

    return {
        "product": out.model_dump(),
        "unit": ProductUnitOut.model_validate(matched_unit).model_dump() if matched_unit else None,
    }


@router.get("/{product_id}/price-history", response_model=list[PriceHistoryOut])
async def get_price_history(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[PriceHistoryOut]:
    from app.models.price_history import PriceHistory
    from app.models.user import User as UserModel
    repo = ProductRepository(session)
    product = await repo.get(product_id)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    result = await session.execute(
        select(PriceHistory, UserModel)
        .outerjoin(UserModel, UserModel.id == PriceHistory.changed_by)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.created_at.desc())
        .limit(50)
    )
    rows = result.all()
    return [
        PriceHistoryOut(
            id=h.id,
            old_price=float(h.old_price),
            new_price=float(h.new_price),
            reason=h.reason,
            changed_by_name=u.full_name if u else None,
            created_at=h.created_at.isoformat(),
        )
        for h, u in rows
    ]
