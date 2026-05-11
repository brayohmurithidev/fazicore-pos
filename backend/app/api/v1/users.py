from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user, require_roles
from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.repositories.user import UserRepository
from app.schemas.user import UserCreate, UserOut, UserSelfUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/", response_model=list[UserOut])
async def list_users(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[UserOut]:
    repo = UserRepository(session)
    users = await repo.get_by_org(current_user.org_id)
    return [UserOut.model_validate(u) for u in users]


@router.post("/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserOut:
    repo = UserRepository(session)
    org = await session.get(Organization, current_user.org_id)
    if org:
        user_count = await session.scalar(
            select(func.count(User.id)).where(
                User.org_id == current_user.org_id, User.is_active == True  # noqa: E712
            )
        ) or 0
        if user_count >= org.max_users:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "limit_exceeded", "resource": "users",
                        "current": user_count, "max": org.max_users},
            )
    user_data = data.model_dump(exclude={"pin"})
    user_data["org_id"] = current_user.org_id
    user_data["pin_hash"] = hash_password(data.pin)
    obj = User(**user_data)
    session.add(obj)
    await session.flush()
    loaded = await repo.get(obj.id)
    return UserOut.model_validate(loaded)


@router.get("/me", response_model=UserOut)
async def get_me(
    current_user: User = Depends(get_current_active_user),
) -> UserOut:
    return UserOut.model_validate(current_user)


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserOut:
    repo = UserRepository(session)
    user = await repo.get(user_id)
    if not user or user.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    data: UserSelfUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserOut:
    repo = UserRepository(session)
    update_dict = data.model_dump(exclude_unset=True)
    if "pin" in update_dict:
        update_dict["pin_hash"] = hash_password(update_dict.pop("pin"))
    for field, value in update_dict.items():
        setattr(current_user, field, value)
    session.add(current_user)
    await session.flush()
    loaded = await repo.get(current_user.id)
    return UserOut.model_validate(loaded)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    data: UserUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserOut:
    repo = UserRepository(session)
    user = await repo.get(user_id)
    if not user or user.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    update_dict = data.model_dump(exclude_unset=True)
    if "pin" in update_dict:
        update_dict["pin_hash"] = hash_password(update_dict.pop("pin"))
    for field, value in update_dict.items():
        setattr(user, field, value)
    session.add(user)
    await session.flush()
    loaded = await repo.get(user.id)
    return UserOut.model_validate(loaded)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> None:
    repo = UserRepository(session)
    user = await repo.get(user_id)
    if not user or user.org_id != current_user.org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    await repo.delete(user)
