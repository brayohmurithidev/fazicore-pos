from datetime import datetime

from pydantic import BaseModel

from app.models.user import UserRole


class UserCreate(BaseModel):
    name: str
    email: str | None = None
    pin: str
    role: UserRole = UserRole.CASHIER
    branch_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    pin: str | None = None
    role: UserRole | None = None
    branch_id: int | None = None
    is_active: bool | None = None


class UserSelfUpdate(BaseModel):
    name: str | None = None
    pin: str | None = None


class UserOut(BaseModel):
    id: int
    org_id: int
    name: str
    email: str | None
    role: UserRole
    branch_id: int | None
    branch_name: str | None = None
    avatar: str | None
    photo_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
