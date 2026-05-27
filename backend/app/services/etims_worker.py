"""
Background retry worker for eTIMS submissions.
Picks up pending/failed records and attempts to re-submit every 2 minutes.
Max 10 attempts with exponential backoff (last retry ~17 hours after creation).
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.etims import EtimsSubmission
from app.services.etims import EtimsService

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 10
POLL_INTERVAL = 120  # seconds


async def run_cycle(session: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(EtimsSubmission)
        .where(
            EtimsSubmission.status.in_(["pending", "failed"]),
            EtimsSubmission.attempt_count < MAX_ATTEMPTS,
            or_(
                EtimsSubmission.next_retry_at.is_(None),
                EtimsSubmission.next_retry_at <= now,
            ),
        )
        .limit(20)
        .with_for_update(skip_locked=True)
    )
    submissions = result.scalars().all()

    if not submissions:
        return 0

    service = EtimsService(session)
    for sub in submissions:
        await service.submit(sub)

    await session.commit()
    return len(submissions)


async def start_worker():
    """Called once from app startup — polls for pending eTIMS submissions."""
    log.info("[etims-worker] Started — polling every %ds", POLL_INTERVAL)
    while True:
        try:
            async with AsyncSessionLocal() as session:
                processed = await run_cycle(session)
                if processed:
                    log.info("[etims-worker] Processed %d submission(s)", processed)
        except Exception as e:
            log.error("[etims-worker] Error: %s", e)
        await asyncio.sleep(POLL_INTERVAL)
