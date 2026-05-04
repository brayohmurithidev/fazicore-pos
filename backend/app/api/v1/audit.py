from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.models.audit_log import AuditLog
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditLogOut(BaseModel):
    id: int
    user_id: int | None
    user_name: str | None
    action: str
    entity_type: str | None
    entity_id: int | None
    entity_name: str | None
    details: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/", response_model=list[AuditLogOut])
async def list_audit_logs(
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    user_id: int | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[AuditLogOut]:
    stmt = (
        select(AuditLog)
        .where(AuditLog.org_id == current_user.org_id)
        .order_by(AuditLog.created_at.desc())
    )
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    stmt = stmt.offset(skip).limit(limit)
    result = await session.execute(stmt)
    return [AuditLogOut.model_validate(r) for r in result.scalars().all()]
