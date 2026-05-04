from datetime import date
from typing import Any

from sqlalchemy import Boolean, Date, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class Product(Base, TimestampMixin):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("org_id", "sku", name="uq_products_org_sku"),
        UniqueConstraint("org_id", "barcode", name="uq_products_org_barcode"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    barcode: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    cost: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), default="piece")
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0.16)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    min_stock: Mapped[int] = mapped_column(Integer, default=10)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    attributes: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    category: Mapped["Category | None"] = relationship("Category", back_populates="products")
    inventory: Mapped[list["Inventory"]] = relationship("Inventory", back_populates="product", cascade="all, delete-orphan", passive_deletes=True)
    order_items: Mapped[list["OrderItem"]] = relationship("OrderItem", back_populates="product")
    variants: Mapped[list["Product"]] = relationship("Product", foreign_keys=[parent_product_id], back_populates="parent")
    parent: Mapped["Product | None"] = relationship("Product", foreign_keys=[parent_product_id], back_populates="variants", remote_side=[id])
