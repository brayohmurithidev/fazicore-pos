from datetime import datetime

from pydantic import BaseModel

from app.models.purchase_order import POStatus


class POItemCreate(BaseModel):
    product_id: int | None = None
    product_name: str | None = None
    quantity: int
    unit_cost: float


class PurchaseOrderCreate(BaseModel):
    supplier: str
    branch_id: int | None = None
    items: list[POItemCreate]


class POItemOut(BaseModel):
    id: int
    product_id: int | None
    product_name: str
    quantity: int
    unit_cost: float

    model_config = {"from_attributes": True}


class PurchaseOrderOut(BaseModel):
    id: int
    po_number: str
    supplier: str
    branch_id: int | None
    branch_name: str | None = None
    status: POStatus
    total: float
    items: list[POItemOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}
