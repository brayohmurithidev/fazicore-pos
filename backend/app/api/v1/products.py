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
from app.schemas.product import (
    ProductBulkCreate, ProductCreate, ProductOut, ProductUpdate,
    ProductUnitCreate, ProductUnitOut, ProductUnitUpdate,
    ProductVariantOut, VariantCreate, VariantGenerateIn,
)
from app.services.inventory import InventoryService

router = APIRouter(prefix="/products", tags=["products"])

# Roles that can manage inventory (variants, stock adjustments).
# STOCK users receive shipments and set up variant matrices.
_INVENTORY_ROLES = (UserRole.ADMIN, UserRole.MANAGER, UserRole.STOCK)


def _enrich(product: Product, out: ProductOut, effective_branch: int | None) -> ProductOut:
    """Fill computed fields on ProductOut that can't be derived by model_validate alone."""
    if product.inventory:
        if effective_branch is not None:
            out.stock_quantity = sum(inv.quantity for inv in product.inventory if inv.branch_id == effective_branch)
        else:
            out.stock_quantity = sum(inv.quantity for inv in product.inventory)
    if product.category:
        out.category_name = product.category.name
    out.is_variant = product.parent_product_id is not None
    out.variant_count = len(product.variants) if product.variants else 0
    for v in (product.variants or []):
        vout = ProductVariantOut.model_validate(v)
        vout.stock_quantity = sum(
            inv.quantity for inv in (v.inventory or [])
            if effective_branch is None or inv.branch_id == effective_branch
        )
        out.variants.append(vout)
    return out


@router.get("/", response_model=list[ProductOut])
async def list_products(
    q: str | None = Query(None),
    category_id: int | None = Query(None),
    branch_id: int | None = Query(None),
    parents_only: bool = Query(False, description="Exclude child variants from results"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ProductOut]:
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id

    repo = ProductRepository(session)
    products = await repo.search(
        org_id=current_user.org_id,
        q=q,
        category_id=category_id,
        skip=skip,
        limit=limit,
        parents_only=parents_only,
    )
    return [_enrich(p, ProductOut.model_validate(p), effective_branch) for p in products]


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

    # initial_stock and variant_options are not Product columns
    product_data = data.model_dump(exclude={"initial_stock", "variant_options"})
    product_data["org_id"] = current_user.org_id
    if data.variant_options:
        product_data["attributes"] = {"options": data.variant_options}
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

    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product)
        .options(
            selectinload(Product.units),
            selectinload(Product.category),
            selectinload(Product.inventory),
            selectinload(Product.variants).selectinload(Product.inventory),
        )
        .where(Product.id == obj.id)
    )
    product = result.scalar_one()
    return _enrich(product, ProductOut.model_validate(product), current_user.branch_id)


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


async def _load_product(product_id: int, session: AsyncSession) -> Product | None:
    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product)
        .options(
            selectinload(Product.units),
            selectinload(Product.category),
            selectinload(Product.inventory),
            selectinload(Product.variants).selectinload(Product.inventory),
        )
        .where(Product.id == product_id)
    )
    return result.scalar_one_or_none()


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductOut:
    product = await _load_product(product_id, session)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    effective_branch = None if current_user.role == UserRole.ADMIN else current_user.branch_id
    return _enrich(product, ProductOut.model_validate(product), effective_branch)


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
    update_data = data.model_dump(exclude_unset=True, exclude={"variant_options"})
    if data.variant_options is not None:
        existing = product.attributes or {}
        update_data["attributes"] = {**existing, "options": data.variant_options}
    await repo.update(product, update_data)

    if data.min_stock is not None:
        await session.execute(
            update(Inventory)
            .where(Inventory.product_id == product_id)
            .values(low_stock_threshold=data.min_stock)
            .execution_options(synchronize_session=False)
        )
        await session.flush()

    effective_branch = None if current_user.role == UserRole.ADMIN else current_user.branch_id
    fresh = await _load_product(product_id, session)
    return _enrich(fresh, ProductOut.model_validate(fresh), effective_branch)


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

    effective_branch = None if current_user.role == UserRole.ADMIN else current_user.branch_id
    fresh = await _load_product(product_id, session)
    return _enrich(fresh, ProductOut.model_validate(fresh), effective_branch)


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


# ── Variants ──────────────────────────────────────────────────────────────────

def _variant_name(parent_name: str, attrs: dict[str, str]) -> str:
    suffix = " / ".join(attrs[k] for k in sorted(attrs))
    return f"{parent_name} - {suffix}"


def _variant_sku(parent_sku: str | None, attrs: dict[str, str]) -> str | None:
    if not parent_sku:
        return None
    suffix = "-".join(attrs[k].upper().replace(" ", "") for k in sorted(attrs))
    return f"{parent_sku}-{suffix}"


async def _get_parent_or_404(product_id: int, org_id: int, session: AsyncSession) -> Product:
    product = await session.get(Product, product_id)
    if not product or product.org_id != org_id:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.parent_product_id is not None:
        raise HTTPException(status_code=400, detail="Product is itself a variant; cannot nest variants")
    return product


@router.get("/{product_id}/variants", response_model=list[ProductVariantOut])
async def list_variants(
    product_id: int,
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ProductVariantOut]:
    from sqlalchemy.orm import selectinload
    await _get_parent_or_404(product_id, current_user.org_id, session)
    result = await session.execute(
        select(Product)
        .options(selectinload(Product.inventory))
        .where(Product.parent_product_id == product_id, Product.is_active == True)
        .order_by(Product.id)
    )
    variants = result.scalars().all()
    effective_branch = branch_id if current_user.role == UserRole.ADMIN else current_user.branch_id
    out = []
    for v in variants:
        vout = ProductVariantOut.model_validate(v)
        vout.stock_quantity = sum(
            inv.quantity for inv in v.inventory
            if effective_branch is None or inv.branch_id == effective_branch
        )
        out.append(vout)
    return out


@router.post("/{product_id}/variants", response_model=ProductVariantOut, status_code=status.HTTP_201_CREATED)
async def create_variant(
    product_id: int,
    data: VariantCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProductVariantOut:
    if current_user.role not in _INVENTORY_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    parent = await _get_parent_or_404(product_id, current_user.org_id, session)

    variant = Product(
        org_id=current_user.org_id,
        parent_product_id=product_id,
        name=_variant_name(parent.name, data.attributes),
        sku=data.sku or _variant_sku(parent.sku, data.attributes),
        barcode=data.barcode,
        price=data.price if data.price is not None else float(parent.price),
        cost=data.cost if data.cost is not None else (float(parent.cost) if parent.cost else None),
        category_id=parent.category_id,
        vat_rate=float(parent.vat_rate),
        unit=parent.unit,
        track_inventory=parent.track_inventory,
        attributes=data.attributes,
        is_active=True,
    )
    session.add(variant)
    await session.flush()
    await session.refresh(variant)

    if data.initial_stock > 0 and variant.track_inventory:
        inv_service = InventoryService(session)
        await inv_service.adjust(
            product_id=variant.id,
            branch_id=current_user.branch_id,
            qty_change=data.initial_stock,
            type=TransactionType.PURCHASE,
            performed_by=current_user.id,
            notes="Initial stock",
        )

    from sqlalchemy.orm import selectinload
    result = await session.execute(
        select(Product).options(selectinload(Product.inventory)).where(Product.id == variant.id)
    )
    v = result.scalar_one()
    vout = ProductVariantOut.model_validate(v)
    vout.stock_quantity = sum(inv.quantity for inv in v.inventory)
    return vout


@router.post("/{product_id}/variants/generate", response_model=list[ProductVariantOut], status_code=status.HTTP_201_CREATED)
async def generate_variants(
    product_id: int,
    data: VariantGenerateIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ProductVariantOut]:
    """Generate all attribute combinations as variants (e.g. Size×Color matrix)."""
    if current_user.role not in _INVENTORY_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if not data.attributes:
        raise HTTPException(status_code=422, detail="At least one attribute required")
    parent = await _get_parent_or_404(product_id, current_user.org_id, session)

    # Build Cartesian product of all attribute values
    from itertools import product as cartesian
    keys = [a.name for a in data.attributes]
    value_lists = [a.values for a in data.attributes]
    combinations = [dict(zip(keys, combo)) for combo in cartesian(*value_lists)]

    # Store the options template on the parent
    options = {a.name: a.values for a in data.attributes}
    existing_attrs = parent.attributes or {}
    parent.attributes = {**existing_attrs, "options": options}
    session.add(parent)

    # Fetch existing variant attribute sets to skip duplicates
    existing_result = await session.execute(
        select(Product.attributes).where(Product.parent_product_id == product_id)
    )
    existing_attrs_set = {
        tuple(sorted((row[0] or {}).items()))
        for row in existing_result.all()
        if row[0]
    }

    created = []
    for attrs in combinations:
        key = tuple(sorted(attrs.items()))
        if key in existing_attrs_set:
            continue
        variant = Product(
            org_id=current_user.org_id,
            parent_product_id=product_id,
            name=_variant_name(parent.name, attrs),
            sku=_variant_sku(parent.sku, attrs),
            price=float(parent.price),
            cost=float(parent.cost) if parent.cost else None,
            category_id=parent.category_id,
            vat_rate=float(parent.vat_rate),
            unit=parent.unit,
            track_inventory=parent.track_inventory,
            attributes=attrs,
            is_active=True,
        )
        session.add(variant)
        created.append(variant)

    await session.flush()

    result_out = []
    for v in created:
        await session.refresh(v)
        vout = ProductVariantOut.model_validate(v)
        vout.stock_quantity = 0
        result_out.append(vout)
    return result_out


@router.delete("/{product_id}/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variant(
    product_id: int,
    variant_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    if current_user.role not in _INVENTORY_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await _get_parent_or_404(product_id, current_user.org_id, session)
    variant = await session.get(Product, variant_id)
    if not variant or variant.parent_product_id != product_id:
        raise HTTPException(status_code=404, detail="Variant not found")
    await session.delete(variant)
    await session.flush()


# ── Bulk variant stock entry ───────────────────────────────────────────────────

class _VariantStockEntry(BaseModel):
    variant_id: int
    qty: int


class _VariantBulkStockIn(BaseModel):
    entries: list[_VariantStockEntry]
    notes: str | None = None


@router.post("/{product_id}/variants/stock", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_stock_variants(
    product_id: int,
    data: _VariantBulkStockIn,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    """Add stock to multiple variants of a product in one request."""
    if current_user.role not in _INVENTORY_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    await _get_parent_or_404(product_id, current_user.org_id, session)
    inv_service = InventoryService(session)
    for entry in data.entries:
        if entry.qty == 0:
            continue
        variant = await session.get(Product, entry.variant_id)
        if not variant or variant.parent_product_id != product_id:
            raise HTTPException(status_code=404, detail=f"Variant {entry.variant_id} not found")
        await inv_service.adjust(
            product_id=variant.id,
            branch_id=current_user.branch_id,
            qty_change=entry.qty,
            type=TransactionType.PURCHASE,
            performed_by=current_user.id,
            notes=data.notes or "Bulk stock entry",
        )
