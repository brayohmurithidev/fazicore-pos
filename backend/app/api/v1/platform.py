from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.organization import Organization, OrgStatus
from app.models.platform_admin import PlatformAdmin
from app.repositories.organization import OrganizationRepository
from app.schemas.organization import OrganizationCreate, OrganizationOut, OrganizationUpdate
from app.services.email import send_welcome_email
from app.schemas.platform import (
    OrgStats,
    PlatformLoginRequest,
    PlatformOverview,
    PlatformTokenResponse,
)

router = APIRouter(prefix="/platform", tags=["platform"])

_platform_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/platform/auth/login")


async def get_platform_admin(
    token: str = Depends(_platform_scheme),
    session: AsyncSession = Depends(get_session),
) -> PlatformAdmin:
    err = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid platform token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or not payload.get("platform"):
            raise err
        admin_id = payload.get("sub")
        if admin_id is None:
            raise err
    except JWTError:
        raise err

    result = await session.execute(
        select(PlatformAdmin).where(PlatformAdmin.id == int(admin_id), PlatformAdmin.is_active == True)
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise err
    return admin


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=PlatformTokenResponse)
async def platform_login(
    body: PlatformLoginRequest,
    session: AsyncSession = Depends(get_session),
) -> PlatformTokenResponse:
    result = await session.execute(
        select(PlatformAdmin).where(PlatformAdmin.email == body.email, PlatformAdmin.is_active == True)
    )
    admin = result.scalar_one_or_none()
    if not admin or not verify_password(body.password, admin.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=admin.id, extra={"platform": True})
    return PlatformTokenResponse(access_token=token, admin_name=admin.name)


@router.post("/auth/seed", status_code=status.HTTP_201_CREATED)
async def seed_platform_admin(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Creates the default platform admin if none exists."""
    result = await session.execute(select(func.count(PlatformAdmin.id)))
    count = result.scalar_one()
    if count > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Platform admin already exists")

    admin = PlatformAdmin(
        email="admin@fazilabs.com",
        name="Platform Admin",
        password_hash=hash_password("admin1234"),
    )
    session.add(admin)
    await session.flush()
    return {"message": "Platform admin created", "email": "admin@fazilabs.com", "password": "admin1234"}


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=PlatformOverview)
async def platform_overview(
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> PlatformOverview:
    result = await session.execute(select(Organization))
    orgs = list(result.scalars().all())

    by_plan: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for o in orgs:
        by_plan[o.plan] = by_plan.get(o.plan, 0) + 1
        by_type[o.type] = by_type.get(o.type, 0) + 1

    return PlatformOverview(
        total_orgs=len(orgs),
        active_orgs=sum(1 for o in orgs if o.status == OrgStatus.ACTIVE),
        trial_orgs=sum(1 for o in orgs if o.status == OrgStatus.TRIAL),
        suspended_orgs=sum(1 for o in orgs if o.status == OrgStatus.SUSPENDED),
        by_plan=by_plan,
        by_type=by_type,
    )


# ── Organizations CRUD ────────────────────────────────────────────────────────

@router.get("/organizations", response_model=list[OrgStats])
async def list_organizations(
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> list[OrgStats]:
    repo = OrganizationRepository(session)
    result = await session.execute(select(Organization).order_by(Organization.created_at.desc()))
    orgs = list(result.scalars().all())
    stats = []
    for org in orgs:
        s = await repo.get_with_stats(org.id)
        if s:
            stats.append(OrgStats(**s))
    return stats


@router.post("/organizations", response_model=OrgStats, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> OrgStats:
    existing = await session.execute(
        select(Organization).where(Organization.slug == data.slug)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug already taken")

    org = Organization(**data.model_dump(exclude={"admin_email"}))
    session.add(org)
    await session.flush()
    await session.refresh(org)

    repo = OrganizationRepository(session)
    s = await repo.get_with_stats(org.id)
    return OrgStats(**s)  # type: ignore[arg-type]


class WelcomeEmailIn(BaseModel):
    admin_email: str | None = None


@router.post("/organizations/{org_id}/send-welcome", status_code=status.HTTP_204_NO_CONTENT)
async def send_welcome(
    org_id: int,
    body: WelcomeEmailIn,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> None:
    org = await session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    recipients = [e for e in [org.email, body.admin_email] if e]
    if recipients:
        await send_welcome_email(recipients=recipients, org_name=org.name, slug=org.slug, plan=org.plan.value)


@router.get("/organizations/{org_id}", response_model=OrgStats)
async def get_organization(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> OrgStats:
    repo = OrganizationRepository(session)
    s = await repo.get_with_stats(org_id)
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return OrgStats(**s)


@router.patch("/organizations/{org_id}", response_model=OrgStats)
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> OrgStats:
    result = await session.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(org, field, value)
    session.add(org)
    await session.flush()

    repo = OrganizationRepository(session)
    s = await repo.get_with_stats(org_id)
    return OrgStats(**s)  # type: ignore[arg-type]


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_organization(
    org_id: int,
    session: AsyncSession = Depends(get_session),
    _: PlatformAdmin = Depends(get_platform_admin),
) -> None:
    result = await session.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    await session.delete(org)
    await session.flush()
