from datetime import date, datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.attendance import Attendance


class AttendanceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def clock_in(self, user_id: int, org_id: int, branch_id: int | None) -> Attendance:
        record = Attendance(user_id=user_id, org_id=org_id, branch_id=branch_id, date=date.today())
        self.session.add(record)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def clock_out(self, attendance_id: int) -> Attendance | None:
        result = await self.session.execute(select(Attendance).where(Attendance.id == attendance_id))
        record = result.scalar_one_or_none()
        if not record:
            return None
        record.clock_out = datetime.now(timezone.utc)
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def get_active(self, user_id: int) -> Attendance | None:
        result = await self.session.execute(
            select(Attendance)
            .where(and_(Attendance.user_id == user_id, Attendance.date == date.today(), Attendance.clock_out.is_(None)))
            .order_by(Attendance.clock_in.desc())
        )
        return result.scalars().first()

    async def get_by_org(self, org_id: int, for_date: date | None = None) -> list[Attendance]:
        q = (
            select(Attendance)
            .options(selectinload(Attendance.user))
            .where(Attendance.org_id == org_id)
        )
        if for_date:
            q = q.where(Attendance.date == for_date)
        result = await self.session.execute(q.order_by(Attendance.clock_in.desc()))
        return list(result.scalars().all())
