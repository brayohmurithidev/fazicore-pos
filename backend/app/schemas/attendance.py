from datetime import date, datetime

from pydantic import BaseModel


class AttendanceOut(BaseModel):
    id: int
    user_id: int
    org_id: int
    branch_id: int | None
    clock_in: datetime
    clock_out: datetime | None
    date: date
    user_name: str | None = None

    model_config = {"from_attributes": True}


class ClockOutRequest(BaseModel):
    attendance_id: int
