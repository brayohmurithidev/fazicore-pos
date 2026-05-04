import enum

from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class TransferStatus(str, enum.Enum):
    INITIATED = "initiated"
    IN_TRANSIT = "in_transit"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class StockTransfer(Base, TimestampMixin):
    __tablename__ = "stock_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    transfer_number: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    from_branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    to_branch_id: Mapped[int] = mapped_column(ForeignKey("branches.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[TransferStatus] = mapped_column(Enum(TransferStatus), default=TransferStatus.INITIATED, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    initiated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    product: Mapped["Product"] = relationship("Product")
    from_branch: Mapped["Branch"] = relationship("Branch", foreign_keys=[from_branch_id])
    to_branch: Mapped["Branch"] = relationship("Branch", foreign_keys=[to_branch_id])
    initiator: Mapped["User | None"] = relationship("User", foreign_keys=[initiated_by])
    confirmer: Mapped["User | None"] = relationship("User", foreign_keys=[confirmed_by])
