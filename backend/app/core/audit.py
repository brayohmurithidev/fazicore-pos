from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


async def log_action(
    session: AsyncSession,
    current_user: User,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    entity_name: str | None = None,
    details: dict | None = None,
) -> None:
    entry = AuditLog(
        org_id=current_user.org_id,
        user_id=current_user.id,
        user_name=current_user.name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=details,
    )
    session.add(entry)
    # Deliberately not committing here — caller's transaction covers it.
    # If the caller doesn't commit (fire-and-forget), flush to get it written.
    await session.flush()
