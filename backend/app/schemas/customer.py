from datetime import datetime

from pydantic import BaseModel, EmailStr


class CustomerCreate(BaseModel):
    name: str
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class CustomerOut(BaseModel):
    id: int
    name: str
    email: str | None
    phone: str | None
    address: str | None
    notes: str | None
    loyalty_points: int
    total_spent: float
    total_orders: int
    credit_balance: float = 0
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
