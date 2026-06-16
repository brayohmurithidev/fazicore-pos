from datetime import date, datetime
from typing import Any

from pydantic import BaseModel


class ProductUnitCreate(BaseModel):
    name: str
    abbreviation: str | None = None
    conversion_factor: float
    price: float | None = None
    barcode: str | None = None
    sku: str | None = None
    is_default: bool = False


class ProductUnitUpdate(BaseModel):
    name: str | None = None
    abbreviation: str | None = None
    conversion_factor: float | None = None
    price: float | None = None
    barcode: str | None = None
    sku: str | None = None
    is_default: bool | None = None


class ProductUnitOut(BaseModel):
    id: int
    name: str
    abbreviation: str | None
    conversion_factor: float
    price: float | None
    barcode: str | None
    sku: str | None
    is_default: bool

    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    sku: str | None = None
    barcode: str | None = None
    price: float
    cost: float | None = None
    category_id: int | None = None
    image_url: str | None = None
    unit: str = "piece"
    vat_rate: float = 0.16
    expiry_date: date | None = None
    min_stock: int = 10
    track_inventory: bool = True
    initial_stock: int = 0
    # When creating a variant-parent, pass the attribute options here.
    # e.g. {"Size": ["S","M","L","XL"], "Color": ["Red","Blue"]}
    variant_options: dict[str, list[str]] | None = None


class ProductBulkCreate(ProductCreate):
    pass


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sku: str | None = None
    barcode: str | None = None
    price: float | None = None
    cost: float | None = None
    category_id: int | None = None
    image_url: str | None = None
    unit: str | None = None
    vat_rate: float | None = None
    expiry_date: date | None = None
    min_stock: int | None = None
    is_active: bool | None = None
    track_inventory: bool | None = None
    variant_options: dict[str, list[str]] | None = None


# ── Variant schemas ───────────────────────────────────────────────────────────

class VariantCreate(BaseModel):
    """Create a single variant manually."""
    attributes: dict[str, str]   # e.g. {"Size": "M", "Color": "Red"}
    sku: str | None = None
    barcode: str | None = None
    price: float | None = None   # defaults to parent price
    cost: float | None = None
    initial_stock: int = 0


class VariantAttributeIn(BaseModel):
    name: str             # e.g. "Size"
    values: list[str]     # e.g. ["S", "M", "L", "XL"]


class VariantGenerateIn(BaseModel):
    """Generate all attribute combinations as variants at once."""
    attributes: list[VariantAttributeIn]


class ProductVariantOut(BaseModel):
    id: int
    name: str
    sku: str | None
    barcode: str | None
    price: float
    cost: float | None
    attributes: dict[str, Any] | None
    stock_quantity: int = 0
    is_active: bool

    model_config = {"from_attributes": True}


# ── Main product out ──────────────────────────────────────────────────────────

class ProductOut(BaseModel):
    id: int
    name: str
    description: str | None
    sku: str | None
    barcode: str | None
    price: float
    cost: float | None
    category_id: int | None
    category_name: str | None = None
    image_url: str | None
    unit: str
    vat_rate: float
    expiry_date: date | None
    min_stock: int
    is_active: bool
    track_inventory: bool
    stock_quantity: int = 0
    units: list[ProductUnitOut] = []
    created_at: datetime
    parent_product_id: int | None = None
    attributes: dict[str, Any] | None = None
    is_variant: bool = False
    variant_count: int = 0
    variants: list[ProductVariantOut] = []

    model_config = {"from_attributes": True}
