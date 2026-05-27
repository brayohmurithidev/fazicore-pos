from datetime import datetime

from pydantic import BaseModel, Field


class EtimsConfigUpdate(BaseModel):
    kra_pin: str = Field(..., min_length=10, max_length=20)
    bhf_id: str = Field("00", max_length=10)
    device_serial: str | None = None
    sandbox_mode: bool = True
    is_active: bool = False


class EtimsConfigOut(BaseModel):
    id: int
    org_id: int
    kra_pin: str
    bhf_id: str
    device_serial: str | None
    sandbox_mode: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EtimsSubmissionOut(BaseModel):
    id: int
    org_id: int
    order_id: int | None
    cu_invoice_no: str | None
    status: str
    error_message: str | None
    attempt_count: int
    next_retry_at: datetime | None
    submitted_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
