from datetime import datetime

from pydantic import BaseModel, EmailStr


class PlatformLoginRequest(BaseModel):
    email: str
    password: str


class PlatformTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin_name: str


class OrgStats(BaseModel):
    id: int
    name: str
    slug: str
    type: str
    status: str
    plan: str
    max_branches: int
    max_users: int
    max_products: int
    is_active: bool
    branch_count: int
    user_count: int
    product_count: int
    created_at: datetime


class PlatformOverview(BaseModel):
    total_orgs: int
    active_orgs: int
    trial_orgs: int
    suspended_orgs: int
    by_plan: dict[str, int]
    by_type: dict[str, int]
