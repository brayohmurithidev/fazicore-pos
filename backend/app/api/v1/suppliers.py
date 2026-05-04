from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.supplier import Supplier
from app.models.user import User

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


class SupplierCreate(BaseModel):
    name: str
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    notes: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class SupplierOut(BaseModel):
    id: int
    org_id: int
    name: str
    contact_name: str | None
    phone: str | None
    email: str | None
    address: str | None
    notes: str | None
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[SupplierOut])
async def list_suppliers(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[SupplierOut]:
    result = await session.execute(
        select(Supplier)
        .where(Supplier.org_id == current_user.org_id, Supplier.is_active == True)
        .order_by(Supplier.name)
    )
    return [SupplierOut.model_validate(s) for s in result.scalars().all()]


@router.post("/", response_model=SupplierOut, status_code=status.HTTP_201_CREATED)
async def create_supplier(
    data: SupplierCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> SupplierOut:
    supplier = Supplier(org_id=current_user.org_id, **data.model_dump())
    session.add(supplier)
    await session.commit()
    await session.refresh(supplier)
    return SupplierOut.model_validate(supplier)


@router.patch("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> SupplierOut:
    supplier = await session.get(Supplier, supplier_id)
    if not supplier or supplier.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(supplier, k, v)
    await session.commit()
    await session.refresh(supplier)
    return SupplierOut.model_validate(supplier)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier(
    supplier_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    supplier = await session.get(Supplier, supplier_id)
    if not supplier or supplier.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Supplier not found")
    supplier.is_active = False
    await session.commit()
