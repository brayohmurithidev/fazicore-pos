from datetime import datetime

from pydantic import BaseModel


class AdminLoginRequest(BaseModel):
    email: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    role: str = "super_admin"
    full_name: str


class PlatformStats(BaseModel):
    total_organizations: int
    active_organizations: int
    trial_organizations: int
    suspended_organizations: int
    total_users: int


class AdminOrgOut(BaseModel):
    id: str
    name: str
    slug: str
    email: str
    phone: str | None
    country: str
    status: str
    trial_ends_at: datetime | None
    is_active: bool
    created_at: datetime
    user_count: int = 0
    branch_count: int = 0
    active_product_count: int = 0
    max_branches: int | None = 1
    max_users: int | None = 5
    max_products: int | None = 500


class AdminOrgCreate(BaseModel):
    name: str
    slug: str
    email: str = ""
    phone: str | None = None
    country: str = "Kenya"
    max_branches: int | None = 1
    max_users: int | None = 5
    max_products: int | None = 500


class AdminOrgUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    country: str | None = None
    status: str | None = None
    is_active: bool | None = None
    max_branches: int | None = None
    max_users: int | None = None
    max_products: int | None = None


class AdminUserCreate(BaseModel):
    full_name: str
    email: str | None = None
    password: str
    role: str = "staff"


class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None


class AdminUserOut(BaseModel):
    id: str
    email: str | None
    full_name: str
    role: str
    is_active: bool
    organization_id: str | None
    created_at: datetime


class PlanOut(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    price_monthly: str
    price_annual: str
    max_users: int | None
    max_products: int | None
    max_branches: int | None
    trial_days: int
    features: dict[str, bool]
    sort_order: int
    is_active: bool = True
    is_recommended: bool = False


class PlanCreate(BaseModel):
    name: str
    slug: str
    description: str | None = None
    price_monthly: float
    price_annual: float
    max_users: int | None = None
    max_products: int | None = None
    max_branches: int | None = None
    trial_days: int = 0
    features: dict[str, bool] = {}
    sort_order: int = 0
    is_recommended: bool = False


class PlanUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    price_monthly: float | None = None
    price_annual: float | None = None
    max_users: int | None = None
    max_products: int | None = None
    max_branches: int | None = None
    trial_days: int | None = None
    features: dict[str, bool] | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    is_recommended: bool | None = None


class SubscriptionOut(BaseModel):
    id: str
    organization_id: str
    plan_id: str
    plan: PlanOut
    status: str
    billing_interval: str
    current_period_start: datetime
    current_period_end: datetime
    billing_phone: str | None
    last_payment_at: datetime | None
    last_payment_amount: str | None
    created_at: datetime


class SubscriptionUpdate(BaseModel):
    plan_slug: str
    billing_interval: str = "monthly"
