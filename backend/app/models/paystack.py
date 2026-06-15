from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class PaystackCredentials(Base, TimestampMixin):
    __tablename__ = "paystack_credentials"
    __table_args__ = (UniqueConstraint("org_id", name="uq_paystack_creds_org"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Paystack public key (pk_live_... / pk_test_...) — stored plain, it's public
    public_key: Mapped[str] = mapped_column(String(100), nullable=False)
    # Secret key encrypted at rest
    secret_key_enc: Mapped[str] = mapped_column(Text, nullable=False)
    is_live: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
