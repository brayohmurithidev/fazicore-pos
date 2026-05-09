from datetime import date as PyDate

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.expenditure import Expenditure
from app.models.user import User

router = APIRouter(prefix="/expenditures", tags=["expenditures"])

CATEGORIES = [
    "rent", "utilities", "salaries", "supplies",
    "transport", "marketing", "maintenance", "other",
]


class ExpenditureCreate(BaseModel):
    category: str
    amount: float
    description: str | None = None
    date: PyDate
    branch_id: int | None = None


class ExpenditureUpdate(BaseModel):
    category: str | None = None
    amount: float | None = None
    description: str | None = None
    date: PyDate | None = None
    branch_id: int | None = None


class ExpenditureOut(BaseModel):
    id: int
    org_id: int
    branch_id: int | None
    category: str
    amount: float
    description: str | None
    date: PyDate
    recorded_by: int | None
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_model(cls, e: Expenditure) -> "ExpenditureOut":
        return cls(
            id=e.id,
            org_id=e.org_id,
            branch_id=e.branch_id,
            category=e.category,
            amount=float(e.amount),
            description=e.description,
            date=e.date,
            recorded_by=e.recorded_by,
            created_at=e.created_at.isoformat(),
        )


@router.get("/categories")
async def list_categories() -> list[str]:
    return CATEGORIES


@router.get("/", response_model=list[ExpenditureOut])
async def list_expenditures(
    date_from: PyDate | None = Query(None),
    date_to: PyDate | None = Query(None),
    category: str | None = Query(None),
    branch_id: int | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ExpenditureOut]:
    q = select(Expenditure).where(Expenditure.org_id == current_user.org_id)
    if date_from:
        q = q.where(Expenditure.date >= date_from)
    if date_to:
        q = q.where(Expenditure.date <= date_to)
    if category:
        q = q.where(Expenditure.category == category)
    if branch_id:
        q = q.where(Expenditure.branch_id == branch_id)
    q = q.order_by(Expenditure.date.desc(), Expenditure.id.desc())
    result = await session.execute(q)
    return [ExpenditureOut.from_model(e) for e in result.scalars().all()]


@router.get("/summary")
async def expenditure_summary(
    date_from: PyDate | None = Query(None),
    date_to: PyDate | None = Query(None),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    q = select(
        Expenditure.category,
        func.sum(Expenditure.amount).label("total"),
    ).where(Expenditure.org_id == current_user.org_id)
    if date_from:
        q = q.where(Expenditure.date >= date_from)
    if date_to:
        q = q.where(Expenditure.date <= date_to)
    q = q.group_by(Expenditure.category)
    result = await session.execute(q)
    by_category = {row.category: float(row.total) for row in result.all()}
    return {"total": sum(by_category.values()), "by_category": by_category}


@router.post("/", response_model=ExpenditureOut, status_code=status.HTTP_201_CREATED)
async def create_expenditure(
    data: ExpenditureCreate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ExpenditureOut:
    expenditure = Expenditure(
        org_id=current_user.org_id,
        recorded_by=current_user.id,
        **data.model_dump(),
    )
    session.add(expenditure)
    await session.commit()
    await session.refresh(expenditure)
    return ExpenditureOut.from_model(expenditure)


@router.patch("/{expenditure_id}", response_model=ExpenditureOut)
async def update_expenditure(
    expenditure_id: int,
    data: ExpenditureUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ExpenditureOut:
    exp = await session.get(Expenditure, expenditure_id)
    if not exp or exp.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Expenditure not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(exp, k, v)
    await session.commit()
    await session.refresh(exp)
    return ExpenditureOut.from_model(exp)


@router.delete("/{expenditure_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expenditure(
    expenditure_id: int,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    exp = await session.get(Expenditure, expenditure_id)
    if not exp or exp.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Expenditure not found")
    await session.delete(exp)
    await session.commit()
