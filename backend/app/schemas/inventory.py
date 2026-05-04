from datetime import datetime

from pydantic import BaseModel

from app.models.inventory import TransactionType


class InventoryUpdate(BaseModel):
    quantity: int
    notes: str | None = None


class StockTransferRequest(BaseModel):
    from_branch_id: int
    to_branch_id: int
    product_id: int
    quantity: int
    notes: str | None = None


class InventoryOut(BaseModel):
    id: int
    product_id: int
    product_name: str | None = None
    branch_id: int | None = None
    branch_name: str | None = None
    quantity: int
    reserved_quantity: int
    low_stock_threshold: int
    location: str | None

    model_config = {"from_attributes": True}
