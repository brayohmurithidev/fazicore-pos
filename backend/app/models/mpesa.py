import enum

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin


class MpesaEnvironment(str, enum.Enum):
    SANDBOX = "sandbox"
    PRODUCTION = "production"


class MpesaTransactionStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class MpesaTransactionType(str, enum.Enum):
    STK_PUSH = "stk_push"
    C2B = "c2b"


class MpesaCredentials(Base, TimestampMixin):
    __tablename__ = "mpesa_credentials"
    __table_args__ = (
        UniqueConstraint("org_id", "environment", name="uq_mpesa_creds_org_env"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False, index=True
    )
    environment: Mapped[MpesaEnvironment] = mapped_column(
        Enum(MpesaEnvironment, values_callable=lambda x: [e.value for e in x]),
        default=MpesaEnvironment.SANDBOX,
        nullable=False,
    )
    # True = this environment is the one used for live transactions
    is_live: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    shortcode: Mapped[str] = mapped_column(String(20), nullable=False)
    consumer_key_enc: Mapped[str] = mapped_column(Text, nullable=False)
    consumer_secret_enc: Mapped[str] = mapped_column(Text, nullable=False)
    passkey_enc: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    callback_url_override: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Random per-credentials secret appended to callback URLs as `?ck=...` and
    # checked on every inbound callback — Daraja has no payload signing, so this
    # is the only thing standing between a forged HTTP POST and a "paid" order.
    callback_key: Mapped[str | None] = mapped_column(String(64), nullable=True)


class MpesaTransaction(Base, TimestampMixin):
    __tablename__ = "mpesa_transactions"
    __table_args__ = (
        # Safaricom retries callback delivery on its own timeouts; without this,
        # a retried C2B confirmation creates a second row and double-credits the
        # sale. NULL receipt numbers (pending STK) are exempt — Postgres treats
        # each NULL as distinct, so multiple pending rows are still allowed.
        UniqueConstraint("org_id", "mpesa_receipt_number", name="uq_mpesa_tx_org_receipt"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True, index=True)

    transaction_type: Mapped[MpesaTransactionType] = mapped_column(
        Enum(MpesaTransactionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    status: Mapped[MpesaTransactionStatus] = mapped_column(
        Enum(MpesaTransactionStatus, values_callable=lambda x: [e.value for e in x]),
        default=MpesaTransactionStatus.PENDING,
        nullable=False,
    )

    # STK Push request identifiers
    merchant_request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    checkout_request_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    account_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Widened from 20: Safaricom's documented masked MSISDN ("2547 ***** 126")
    # fits in 20, but at least one shortcode sends a 64-char hashed MSISDN instead.
    phone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    mpesa_receipt_number: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    result_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_desc: Mapped[str | None] = mapped_column(String(500), nullable=True)
    raw_callback: Mapped[str | None] = mapped_column(Text, nullable=True)
