from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.features import FEATURE_CATALOG, resolve_flags
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.models.branch import Branch
from app.models.organization import Organization, OrgStatus, SubscriptionPlan
from app.models.platform_admin import PlatformAdmin
from app.models.product import Product
from app.models.subscription import BillingInterval, Plan, Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminLoginRequest,
    AdminLoginResponse,
    AdminOrgCreate,
    AdminOrgOut,
    AdminOrgUpdate,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    PlatformStats,
    SubscriptionOut,
    SubscriptionUpdate,
)

router = APIRouter(prefix="/admin", tags=["admin"])

_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/auth/login", auto_error=False)


async def require_admin(
    token: str = Depends(_scheme),
    session: AsyncSession = Depends(get_session),
) -> PlatformAdmin:
    err = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")
    if not token:
        raise err
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or not payload.get("platform"):
            raise err
        admin_id = payload.get("sub")
        if not admin_id:
            raise err
    except JWTError:
        raise err
    result = await session.execute(
        select(PlatformAdmin).where(
            PlatformAdmin.id == int(admin_id),
            PlatformAdmin.is_active == True,  # noqa: E712
        )
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise err
    return admin


# ── Auth ───────────────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(
    body: AdminLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> AdminLoginResponse:
    result = await session.execute(
        select(PlatformAdmin).where(
            PlatformAdmin.email == body.email,
            PlatformAdmin.is_active == True,  # noqa: E712
        )
    )
    admin = result.scalar_one_or_none()
    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(subject=admin.id, extra={"platform": True})
    return AdminLoginResponse(access_token=token, full_name=admin.name)


# ── Seed ───────────────────────────────────────────────────────────────────────

@router.post("/auth/seed", status_code=status.HTTP_201_CREATED)
async def seed_admin(session: AsyncSession = Depends(get_session)) -> dict:
    count = await session.scalar(select(func.count(PlatformAdmin.id))) or 0
    if count > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Admin already exists")
    admin_obj = PlatformAdmin(
        email="admin@fazilabs.com",
        name="Platform Admin",
        password_hash=hash_password("admin1234"),
    )
    session.add(admin_obj)
    await session.flush()
    return {"email": "admin@fazilabs.com", "password": "admin1234"}


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=PlatformStats)
async def get_stats(
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> PlatformStats:
    total_orgs = await session.scalar(select(func.count(Organization.id))) or 0
    active = await session.scalar(
        select(func.count(Organization.id)).where(Organization.status == OrgStatus.ACTIVE)
    ) or 0
    trial = await session.scalar(
        select(func.count(Organization.id)).where(Organization.status == OrgStatus.TRIAL)
    ) or 0
    suspended = await session.scalar(
        select(func.count(Organization.id)).where(Organization.status == OrgStatus.SUSPENDED)
    ) or 0
    total_users = await session.scalar(select(func.count(User.id))) or 0
    return PlatformStats(
        total_organizations=total_orgs,
        active_organizations=active,
        trial_organizations=trial,
        suspended_organizations=suspended,
        total_users=total_users,
    )


# ── Organizations ──────────────────────────────────────────────────────────────

async def _org_out(org: Organization, session: AsyncSession) -> AdminOrgOut:
    user_count = await session.scalar(
        select(func.count(User.id)).where(User.org_id == org.id)
    ) or 0
    branch_count = await session.scalar(
        select(func.count(Branch.id)).where(Branch.org_id == org.id, Branch.is_active == True)  # noqa: E712
    ) or 0
    active_product_count = await session.scalar(
        select(func.count(Product.id)).where(Product.org_id == org.id, Product.is_active == True)  # noqa: E712
    ) or 0
    return AdminOrgOut(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        email=org.email or "",
        phone=org.phone,
        country=org.country or "",
        status=org.status.value,
        trial_ends_at=org.trial_ends_at,
        is_active=org.is_active,
        created_at=org.created_at,
        user_count=user_count,
        branch_count=branch_count,
        active_product_count=active_product_count,
        max_branches=org.max_branches,
        max_users=org.max_users,
        max_products=org.max_products,
    )


@router.get("/organizations", response_model=list[AdminOrgOut])
async def list_organizations(
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> list[AdminOrgOut]:
    result = await session.execute(
        select(Organization).order_by(Organization.created_at.desc())
    )
    orgs = list(result.scalars().all())
    return [await _org_out(o, session) for o in orgs]


@router.post("/organizations", response_model=AdminOrgOut, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: AdminOrgCreate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminOrgOut:
    existing = await session.scalar(select(Organization.id).where(Organization.slug == data.slug))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already taken")
    org = Organization(
        name=data.name,
        slug=data.slug,
        email=data.email,
        phone=data.phone,
        country=data.country,
    )
    session.add(org)
    await session.flush()
    await session.refresh(org)
    return await _org_out(org, session)


@router.get("/organizations/{org_id}", response_model=AdminOrgOut)
async def get_organization(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminOrgOut:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return await _org_out(org, session)


@router.patch("/organizations/{org_id}", response_model=AdminOrgOut)
async def update_organization(
    org_id: int,
    data: AdminOrgUpdate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminOrgOut:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"]:
        update_data["status"] = OrgStatus(update_data["status"])
    for field, value in update_data.items():
        setattr(org, field, value)
    session.add(org)
    await session.flush()
    await session.refresh(org)
    return await _org_out(org, session)


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> None:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    await session.delete(org)
    await session.flush()


@router.post("/organizations/{org_id}/suspend", response_model=AdminOrgOut)
async def suspend_organization(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminOrgOut:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org.status = OrgStatus.SUSPENDED
    session.add(org)
    await session.flush()
    await session.refresh(org)
    return await _org_out(org, session)


@router.post("/organizations/{org_id}/activate", response_model=AdminOrgOut)
async def activate_organization(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminOrgOut:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    org.status = OrgStatus.ACTIVE
    org.is_active = True
    session.add(org)
    await session.flush()
    await session.refresh(org)
    return await _org_out(org, session)


# ── Org Users ──────────────────────────────────────────────────────────────────

def _user_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.name,
        role=user.role.value,
        is_active=user.is_active,
        organization_id=str(user.org_id),
        created_at=user.created_at,
    )


@router.get("/organizations/{org_id}/users", response_model=list[AdminUserOut])
async def list_org_users(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> list[AdminUserOut]:
    result = await session.execute(
        select(User).where(User.org_id == org_id).order_by(User.created_at.desc())
    )
    return [_user_out(u) for u in result.scalars().all()]


@router.post(
    "/organizations/{org_id}/users",
    response_model=AdminUserOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_org_user(
    org_id: int,
    data: AdminUserCreate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminUserOut:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    if data.email:
        existing = await session.scalar(select(User.id).where(User.email == data.email))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
    role_map: dict[str, UserRole] = {
        "admin": UserRole.ADMIN,
        "manager": UserRole.MANAGER,
        "staff": UserRole.CASHIER,
        "cashier": UserRole.CASHIER,
    }
    user = User(
        org_id=org_id,
        name=data.full_name,
        email=data.email,
        pin_hash=hash_password(data.password),
        role=role_map.get(data.role, UserRole.CASHIER),
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return _user_out(user)


@router.patch("/organizations/{org_id}/users/{user_id}", response_model=AdminUserOut)
async def update_org_user(
    org_id: int,
    user_id: int,
    data: AdminUserUpdate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> AdminUserOut:
    user = await session.get(User, user_id)
    if not user or user.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    role_map: dict[str, UserRole] = {
        "admin": UserRole.ADMIN,
        "manager": UserRole.MANAGER,
        "staff": UserRole.CASHIER,
        "cashier": UserRole.CASHIER,
    }
    if data.full_name is not None:
        user.name = data.full_name
    if data.email is not None:
        existing = await session.scalar(
            select(User.id).where(User.email == data.email, User.id != user_id)
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already in use")
        user.email = data.email or None
    if data.password is not None:
        user.pin_hash = hash_password(data.password)
    if data.role is not None:
        user.role = role_map.get(data.role, user.role)
    if data.is_active is not None:
        user.is_active = data.is_active
    session.add(user)
    await session.flush()
    await session.refresh(user)
    return _user_out(user)


@router.delete("/organizations/{org_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_org_user(
    org_id: int,
    user_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> None:
    user = await session.get(User, user_id)
    if not user or user.org_id != org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await session.delete(user)
    await session.flush()


# ── Subscription ───────────────────────────────────────────────────────────────

def _plan_out(plan: Plan) -> PlanOut:
    return PlanOut(
        id=str(plan.id),
        name=plan.name,
        slug=plan.slug,
        description=plan.description,
        price_monthly=str(plan.price_monthly),
        price_annual=str(plan.price_annual),
        max_users=plan.max_users,
        max_products=plan.max_products,
        max_branches=plan.max_branches,
        trial_days=plan.trial_days,
        features=resolve_flags(plan.features),
        sort_order=plan.sort_order,
        is_active=plan.is_active,
        is_recommended=plan.is_recommended,
    )


def _sub_out(sub: Subscription, plan: Plan) -> SubscriptionOut:
    return SubscriptionOut(
        id=str(sub.id),
        organization_id=str(sub.organization_id),
        plan_id=str(sub.plan_id),
        plan=_plan_out(plan),
        status=sub.status.value,
        billing_interval=sub.billing_interval.value,
        current_period_start=sub.current_period_start,
        current_period_end=sub.current_period_end,
        billing_phone=sub.billing_phone,
        last_payment_at=sub.last_payment_at,
        last_payment_amount=str(sub.last_payment_amount) if sub.last_payment_amount else None,
        created_at=sub.created_at,
    )


@router.get("/organizations/{org_id}/subscription", response_model=SubscriptionOut)
async def get_org_subscription(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> SubscriptionOut:
    result = await session.execute(
        select(Subscription)
        .where(Subscription.organization_id == org_id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No subscription found")
    plan = await session.get(Plan, sub.plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return _sub_out(sub, plan)


@router.post("/organizations/{org_id}/subscription", response_model=SubscriptionOut)
async def set_org_subscription(
    org_id: int,
    data: SubscriptionUpdate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> SubscriptionOut:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    plan = await session.scalar(select(Plan).where(Plan.slug == data.plan_slug))
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    now = datetime.now(timezone.utc)
    is_trial = plan.trial_days > 0
    if is_trial:
        sub_status = SubscriptionStatus.TRIALING
        period_end = now + timedelta(days=plan.trial_days)
        org.trial_ends_at = period_end
    else:
        sub_status = SubscriptionStatus.ACTIVE
        period_end = now + timedelta(days=365 if data.billing_interval == "annual" else 30)
        org.trial_ends_at = None

    # Always sync org resource limits from the plan (null = unlimited)
    org.max_users = plan.max_users
    org.max_products = plan.max_products
    org.max_branches = plan.max_branches

    # Keep org.plan enum in sync when the slug matches an enum value
    try:
        org.plan = SubscriptionPlan(plan.slug)
    except ValueError:
        pass  # custom plan slug — org.plan stays as-is

    result = await session.execute(
        select(Subscription).where(Subscription.organization_id == org_id).limit(1)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.plan_id = plan.id
        sub.status = sub_status
        sub.billing_interval = BillingInterval(data.billing_interval)
        sub.current_period_start = now
        sub.current_period_end = period_end
    else:
        sub = Subscription(
            organization_id=org_id,
            plan_id=plan.id,
            status=sub_status,
            billing_interval=BillingInterval(data.billing_interval),
            current_period_start=now,
            current_period_end=period_end,
        )
        session.add(sub)
    session.add(org)
    await session.flush()
    await session.refresh(sub)
    return _sub_out(sub, plan)


# ── Plans ──────────────────────────────────────────────────────────────────────

@router.get("/features/catalog")
async def get_feature_catalog(_: PlatformAdmin = Depends(require_admin)) -> list[dict]:
    return FEATURE_CATALOG


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> list[PlanOut]:
    result = await session.execute(
        select(Plan).order_by(Plan.sort_order)
    )
    return [_plan_out(p) for p in result.scalars().all()]


@router.post("/plans", response_model=PlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan(
    data: PlanCreate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> PlanOut:
    existing = await session.scalar(select(Plan.id).where(Plan.slug == data.slug))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already taken")
    plan = Plan(
        name=data.name,
        slug=data.slug,
        description=data.description,
        price_monthly=Decimal(str(data.price_monthly)),
        price_annual=Decimal(str(data.price_annual)),
        max_users=data.max_users,
        max_products=data.max_products,
        max_branches=data.max_branches,
        trial_days=data.trial_days,
        features=data.features,
        sort_order=data.sort_order,
    )
    session.add(plan)
    await session.flush()
    await session.refresh(plan)
    return _plan_out(plan)


@router.patch("/plans/{plan_id}", response_model=PlanOut)
async def update_plan(
    plan_id: int,
    data: PlanUpdate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> PlanOut:
    plan = await session.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field in ("price_monthly", "price_annual") and value is not None:
            value = Decimal(str(value))
        setattr(plan, field, value)
    session.add(plan)
    await session.flush()
    await session.refresh(plan)
    return _plan_out(plan)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(require_admin),
) -> None:
    plan = await session.get(Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    # Check if any active subscriptions are using this plan
    from app.models.subscription import Subscription  # noqa: PLC0415
    active_sub = await session.scalar(
        select(Subscription).where(Subscription.plan_id == plan_id).limit(1)
    )
    if active_sub:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a plan that has active subscriptions. Deactivate it instead.",
        )
    await session.delete(plan)
    await session.flush()
