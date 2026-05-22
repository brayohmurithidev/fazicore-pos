import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class InvoiceStatus(str, enum.Enum):
    OPEN = "open"
    PAID = "paid"
    OVERDUE = "overdue"
    VOID = "void"


class SubscriptionInvoice(Base, TimestampMixin):
    __tablename__ = "subscription_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_number: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    subscription_id: Mapped[int | None] = mapped_column(ForeignKey("subscriptions.id"), nullable=True)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="KES")
    billing_interval: Mapped[str] = mapped_column(String(20), nullable=False)  # monthly | annual
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=InvoiceStatus.OPEN,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # mpesa_stk | mpesa_c2b | manual
    payment_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mpesa_receipt: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    mpesa_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
