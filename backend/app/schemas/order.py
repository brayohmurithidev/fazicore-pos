from datetime import datetime

from pydantic import BaseModel

from app.models.order import OrderStatus, PaymentMethod, PaymentStatus


class OrderItemCreate(BaseModel):
    product_id: int | None = None
    product_name: str
    product_sku: str | None = None
    quantity: int
    unit_price: float
    discount_amount: float = 0


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


class OrderItemOut(BaseModel):
    id: int
    product_id: int | None
    product_name: str
    product_sku: str | None
    quantity: int
    unit_price: float
    discount_amount: float
    total: float

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
    items: list[OrderItemOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}
