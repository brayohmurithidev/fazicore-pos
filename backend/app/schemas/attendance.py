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
    opening_float: float | None = None
    closing_cash: float | None = None
    shift_notes: str | None = None

    model_config = {"from_attributes": True}


class ClockInRequest(BaseModel):
    opening_float: float | None = None


class ClockOutRequest(BaseModel):
    attendance_id: int
    closing_cash: float | None = None
    shift_notes: str | None = None
