from datetime import datetime

from pydantic import BaseModel

from app.models.organization import OrgStatus, OrgType, SubscriptionPlan


class OrganizationCreate(BaseModel):
    name: str
    slug: str
    type: OrgType = OrgType.OTHER
    plan: SubscriptionPlan = SubscriptionPlan.STARTER
    max_branches: int | None = 1
    max_users: int | None = 5
    max_products: int | None = 500
    admin_email: str | None = None  # not stored; only used for welcome email


class OrganizationUpdate(BaseModel):
    name: str | None = None
    type: OrgType | None = None
    status: OrgStatus | None = None
    plan: SubscriptionPlan | None = None
    max_branches: int | None = None
    max_users: int | None = None
    max_products: int | None = None
    is_active: bool | None = None


class OrganizationOut(BaseModel):
    id: int
    name: str
    slug: str
    type: OrgType
    status: OrgStatus
    plan: SubscriptionPlan
    max_branches: int | None
    max_users: int | None
    max_products: int | None
    is_active: bool
    branch_count: int = 0
    user_count: int = 0
    product_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
