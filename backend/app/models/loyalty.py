import enum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class PointsTransactionType(str, enum.Enum):
    EARN = "earn"
    REDEEM = "redeem"
    ADJUST = "adjust"


class LoyaltySettings(Base, TimestampMixin):
    __tablename__ = "loyalty_settings"
    __table_args__ = (UniqueConstraint("org_id", name="uq_loyalty_settings_org"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    points_per_kes: Mapped[float] = mapped_column(Numeric(8, 4), default=1.0, nullable=False)
    kes_per_point: Mapped[float] = mapped_column(Numeric(8, 4), default=0.5, nullable=False)
    min_redeem_points: Mapped[int] = mapped_column(Integer, default=50, nullable=False)


class PointsTransaction(Base):
    __tablename__ = "points_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    type: Mapped[PointsTransactionType] = mapped_column(
        Enum(PointsTransactionType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_before: Mapped[int] = mapped_column(Integer, nullable=False)
    balance_after: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    customer: Mapped["Customer"] = relationship("Customer")  # type: ignore[name-defined]
