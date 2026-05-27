import enum
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class TransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    SALE = "sale"
    ADJUSTMENT = "adjustment"
    RETURN = "return"
    TRANSFER = "transfer"


class Inventory(Base, TimestampMixin):
    __tablename__ = "inventory"
    __table_args__ = (UniqueConstraint("product_id", "branch_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reserved_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)

    product: Mapped["Product"] = relationship("Product", back_populates="inventory")
    branch: Mapped["Branch | None"] = relationship("Branch")
    transactions: Mapped[list["InventoryTransaction"]] = relationship("InventoryTransaction", back_populates="inventory")

    @property
    def available_quantity(self) -> int:
        return self.quantity - self.reserved_quantity

    @property
    def is_low_stock(self) -> bool:
        return self.quantity <= self.low_stock_threshold


class InventoryTransaction(Base, TimestampMixin):
    __tablename__ = "inventory_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    inventory_id: Mapped[int] = mapped_column(ForeignKey("inventory.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    quantity_change: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_before: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reference_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    performed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    inventory: Mapped["Inventory"] = relationship("Inventory", back_populates="transactions")
    user: Mapped["User | None"] = relationship("User")


class InventoryBatch(Base, TimestampMixin):
    """One row per stock receipt batch — tracks per-batch expiry and remaining quantity."""
    __tablename__ = "inventory_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), nullable=True, index=True)
    purchase_order_item_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_items.id", ondelete="SET NULL"), nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    quantity_received: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_remaining: Mapped[int] = mapped_column(Integer, nullable=False)
    cost_per_unit: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)

    product: Mapped["Product"] = relationship("Product")
    branch: Mapped["Branch | None"] = relationship("Branch")
