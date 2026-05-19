from sqlalchemy import ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class PriceHistory(Base, TimestampMixin):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    old_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    new_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    changed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    product: Mapped["Product"] = relationship("Product")  # type: ignore[name-defined]
    user: Mapped["User | None"] = relationship("User")  # type: ignore[name-defined]
