from datetime import datetime

from pydantic import BaseModel


class BranchCreate(BaseModel):
    name: str
    location: str | None = None
    phone: str | None = None
    manager_name: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    phone: str | None = None
    manager_name: str | None = None
    status: str | None = None
    is_active: bool | None = None


class BranchOut(BaseModel):
    id: int
    org_id: int
    name: str
    location: str | None
    phone: str | None
    manager_name: str | None
    status: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
