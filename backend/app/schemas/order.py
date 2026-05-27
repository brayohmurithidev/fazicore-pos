from datetime import datetime

from pydantic import BaseModel

from app.models.order import OrderStatus, PaymentMethod, PaymentStatus


class OrderItemEdit(BaseModel):
    product_id: int | None = None
    product_name: str
    product_sku: str | None = None
    quantity: int
    unit_price: float
    discount_amount: float = 0
    unit_id: int | None = None
    unit_name: str | None = None
    conversion_factor: float = 1.0


class OrderEdit(BaseModel):
    items: list[OrderItemEdit]
    discount_amount: float = 0
    notes: str | None = None
    pin: str | None = None  # required when caller is cashier


class OrderVoid(BaseModel):
    reason: str | None = None
    pin: str | None = None  # required when caller is cashier


class OrderItemCreate(BaseModel):
    product_id: int | None = None
    product_name: str
    product_sku: str | None = None
    quantity: int
    unit_price: float
    discount_amount: float = 0
    unit_id: int | None = None
    unit_name: str | None = None
    conversion_factor: float = 1.0


class OrderCreate(BaseModel):
    customer_id: int | None = None
    branch_id: int | None = None
    payment_method: PaymentMethod
    items: list[OrderItemCreate]
    discount_amount: float = 0
    amount_paid: float
    mpesa_ref: str | None = None
    mpesa_amount: float = 0
    cash_amount: float = 0
    credit_customer_name: str | None = None
    credit_customer_phone: str | None = None
    notes: str | None = None
    idempotency_key: str | None = None
    loyalty_points_redeemed: int = 0


class OrderItemOut(BaseModel):
    id: int
    product_id: int | None
    product_name: str
    product_sku: str | None
    quantity: int
    unit_price: float
    discount_amount: float
    total: float
    unit_id: int | None = None
    unit_name: str | None = None
    conversion_factor: float = 1.0

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    org_id: int
    branch_id: int | None
    order_number: str
    customer_id: int | None
    cashier_id: int
    cashier_name: str | None = None
    status: OrderStatus
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    subtotal: float
    tax_amount: float
    discount_amount: float
    total: float
    amount_paid: float
    change_given: float
    mpesa_ref: str | None
    mpesa_amount: float
    cash_amount: float
    credit_customer_name: str | None
    credit_customer_phone: str | None
    notes: str | None
    voided_by: int | None = None
    voided_at: datetime | None = None
    void_reason: str | None = None
    edited_by: int | None = None
    edited_at: datetime | None = None
    items: list[OrderItemOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}
