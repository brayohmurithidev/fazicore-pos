import enum

from typing import Any

from sqlalchemy import Boolean, DateTime, Enum, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin


class OrgType(str, enum.Enum):
    MINIMART = "minimart"
    BAR = "bar"
    SUPERMARKET = "supermarket"
    RESTAURANT = "restaurant"
    OTHER = "other"


class OrgStatus(str, enum.Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class SubscriptionPlan(str, enum.Enum):
    STARTER = "starter"
    GROWTH = "growth"
    BUSINESS = "business"
    ENTERPRISE = "enterprise"


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    type: Mapped[OrgType] = mapped_column(Enum(OrgType), default=OrgType.OTHER, nullable=False)
    status: Mapped[OrgStatus] = mapped_column(Enum(OrgStatus), default=OrgStatus.TRIAL, nullable=False)
    plan: Mapped[SubscriptionPlan] = mapped_column(
        Enum(SubscriptionPlan), default=SubscriptionPlan.STARTER, nullable=False
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    max_branches: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    max_products: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    trial_ends_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="KES", nullable=False)
    custom_units: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    permissions: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    branches: Mapped[list["Branch"]] = relationship("Branch", back_populates="org")
    users: Mapped[list["User"]] = relationship("User", back_populates="org")
