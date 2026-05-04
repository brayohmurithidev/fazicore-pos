from datetime import datetime

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    image_url: str | None = None
    color: str | None = None
    parent_id: int | None = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    image_url: str | None = None
    color: str | None = None
    parent_id: int | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    description: str | None
    image_url: str | None
    color: str | None
    parent_id: int | None
    sort_order: int
    is_active: bool
    product_count: int = 0

    model_config = {"from_attributes": True}
