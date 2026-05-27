import enum
from datetime import date

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class POStatus(str, enum.Enum):
    PENDING = "pending"
    TRANSIT = "transit"
    RECEIVED = "received"
    CANCELLED = "cancelled"


class PurchaseOrder(Base, TimestampMixin):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    po_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    supplier: Mapped[str] = mapped_column(String(200), nullable=False)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), nullable=True)
    status: Mapped[POStatus] = mapped_column(Enum(POStatus), default=POStatus.PENDING)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    branch: Mapped["Branch | None"] = relationship("Branch")
    creator: Mapped["User | None"] = relationship("User")
    supplier_rel: Mapped["Supplier | None"] = relationship("Supplier", back_populates="purchase_orders")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        "PurchaseOrderItem", back_populates="order", cascade="all, delete-orphan"
    )


class PurchaseOrderItem(Base, TimestampMixin):
    __tablename__ = "purchase_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id", ondelete="CASCADE"))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    unit_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Multi-unit fields — null means base unit
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("product_units.id", ondelete="SET NULL"), nullable=True)
    unit_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    conversion_factor: Mapped[float] = mapped_column(Numeric(10, 4), default=1.0, nullable=False)

    order: Mapped["PurchaseOrder"] = relationship("PurchaseOrder", back_populates="items")
