from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user, require_roles
from app.models.branch import Branch
from app.models.inventory import Inventory
from app.models.organization import Organization
from app.models.product import Product
from app.models.user import User, UserRole
from app.repositories.branch import BranchRepository
from app.schemas.branch import BranchCreate, BranchOut, BranchUpdate

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("/", response_model=list[BranchOut])
async def list_branches(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[BranchOut]:
    repo = BranchRepository(session)
    branches = await repo.get_by_org(current_user.org_id)
    return [BranchOut.model_validate(b) for b in branches]


@router.post("/", response_model=BranchOut, status_code=status.HTTP_201_CREATED)
async def create_branch(
    data: BranchCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
) -> BranchOut:
    org = await session.get(Organization, current_user.org_id)
    if org:
        branch_count = await session.scalar(
            select(func.count(Branch.id)).where(
                Branch.org_id == current_user.org_id, Branch.is_active == True
            )
        ) or 0
        if branch_count >= org.max_branches:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "limit_exceeded", "resource": "branches",
                        "current": branch_count, "max": org.max_branches},
            )
    branch_data = data.model_dump()
    branch_data["org_id"] = current_user.org_id
    obj = Branch(**branch_data)
    session.add(obj)
    await session.flush()
    await session.refresh(obj)

    # Migrate any unassigned (NULL branch_id) inventory to the oldest branch.
    # This handles the single-shop → multi-branch transition: stock that was
    # recorded before branches existed gets anchored to the original location
    # so new branches correctly start at zero.
    oldest_branch_id = await session.scalar(
        select(Branch.id)
        .where(Branch.org_id == current_user.org_id, Branch.is_active == True)
        .order_by(Branch.id.asc())
        .limit(1)
    )
    if oldest_branch_id:
        org_product_ids = select(Product.id).where(Product.org_id == current_user.org_id)
        await session.execute(
            update(Inventory)
            .where(Inventory.branch_id == None, Inventory.product_id.in_(org_product_ids))
            .values(branch_id=oldest_branch_id)
        )
    await session.commit()

    return BranchOut.model_validate(obj)


@router.get("/{branch_id}", response_model=BranchOut)
async def get_branch(
    branch_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> BranchOut:
    repo = BranchRepository(session)
    branch = await repo.get(branch_id)
    if not branch or branch.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    return BranchOut.model_validate(branch)


@router.patch("/{branch_id}", response_model=BranchOut)
async def update_branch(
    branch_id: int,
    data: BranchUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.MANAGER)),
) -> BranchOut:
    repo = BranchRepository(session)
    branch = await repo.get(branch_id)
    if not branch or branch.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    updated = await repo.update(branch, data)
    return BranchOut.model_validate(updated)


@router.delete("/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    branch_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> None:
    repo = BranchRepository(session)
    branch = await repo.get(branch_id)
    if not branch or branch.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    await repo.delete(branch)
