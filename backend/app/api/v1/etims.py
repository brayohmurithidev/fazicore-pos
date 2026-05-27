from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.etims import EtimsSubmission
from app.models.user import User
from app.schemas.etims import EtimsConfigOut, EtimsConfigUpdate, EtimsSubmissionOut
from app.services.etims import EtimsService

router = APIRouter(prefix="/etims", tags=["etims"])


def _require_admin(user: User) -> None:
    if user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin or manager required")


@router.get("/config", response_model=EtimsConfigOut | None)
async def get_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    svc = EtimsService(db)
    return await svc.get_config(current_user.org_id)


@router.put("/config", response_model=EtimsConfigOut)
async def upsert_config(
    data: EtimsConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(current_user)
    svc = EtimsService(db)
    cfg = await svc.upsert_config(
        org_id=current_user.org_id,
        kra_pin=data.kra_pin,
        bhf_id=data.bhf_id,
        device_serial=data.device_serial,
        sandbox_mode=data.sandbox_mode,
        is_active=data.is_active,
    )
    await db.commit()
    await db.refresh(cfg)
    return cfg


@router.post("/test-connection")
async def test_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(current_user)
    svc = EtimsService(db)
    result = await svc.test_connection(current_user.org_id)
    if result == "ok":
        return {"ok": True}
    return {"ok": False, "error": result}


@router.get("/submissions", response_model=list[EtimsSubmissionOut])
async def list_submissions(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    q = select(EtimsSubmission).where(EtimsSubmission.org_id == current_user.org_id)
    if status:
        q = q.where(EtimsSubmission.status == status)
    q = q.order_by(EtimsSubmission.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/submissions/{submission_id}/retry", response_model=EtimsSubmissionOut)
async def retry_submission(
    submission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_session),
):
    _require_admin(current_user)
    result = await db.execute(
        select(EtimsSubmission).where(
            EtimsSubmission.id == submission_id,
            EtimsSubmission.org_id == current_user.org_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    if sub.status == "submitted":
        raise HTTPException(status_code=400, detail="Already submitted")

    # Reset for immediate retry
    sub.next_retry_at = None
    svc = EtimsService(db)
    await svc.submit(sub)
    await db.commit()
    await db.refresh(sub)
    return sub
