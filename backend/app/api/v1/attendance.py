from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.user import User
from app.repositories.attendance import AttendanceRepository
from app.schemas.attendance import AttendanceOut, ClockOutRequest

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _out(r, user_name: str | None = None) -> AttendanceOut:
    return AttendanceOut(
        id=r.id,
        user_id=r.user_id,
        org_id=r.org_id,
        branch_id=r.branch_id,
        clock_in=r.clock_in,
        clock_out=r.clock_out,
        date=r.date,
        user_name=user_name or (r.user.name if hasattr(r, "user") and r.user else None),
    )


@router.post("/clock-in", response_model=AttendanceOut)
async def clock_in(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> AttendanceOut:
    repo = AttendanceRepository(session)
    existing = await repo.get_active(current_user.id)
    if existing:
        return _out(existing)
    record = await repo.clock_in(current_user.id, current_user.org_id, current_user.branch_id)
    return _out(record)


@router.post("/clock-out", response_model=AttendanceOut)
async def clock_out(
    body: ClockOutRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> AttendanceOut:
    repo = AttendanceRepository(session)
    record = await repo.clock_out(body.attendance_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")
    return _out(record)


@router.get("/status", response_model=AttendanceOut | None)
async def get_status(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> AttendanceOut | None:
    repo = AttendanceRepository(session)
    record = await repo.get_active(current_user.id)
    return _out(record) if record else None


@router.get("/", response_model=list[AttendanceOut])
async def list_attendance(
    for_date: date | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[AttendanceOut]:
    repo = AttendanceRepository(session)
    records = await repo.get_by_org(current_user.org_id, for_date)
    return [_out(r) for r in records]
