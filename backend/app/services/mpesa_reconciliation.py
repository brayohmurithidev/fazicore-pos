"""
Background worker that resolves STK Push transactions stuck in PENDING
because Safaricom's async callback never arrived (lost in transit on a
flaky network — common on the connections this app actually runs on).

Before this worker existed, nothing ever revisited a PENDING STK row: if the
callback never showed up, the till just showed "waiting for payment"
forever even though the customer had paid and had the M-Pesa SMS to prove
it. This actively queries Daraja's stkQuery endpoint for a real answer
instead of waiting on a callback that may never arrive.

Mirrors app/services/etims_worker.py's poll-loop shape — same pattern
already used in this codebase for "retry/resolve in the background".
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.mpesa import (
    MpesaCredentials,
    MpesaTransaction,
    MpesaTransactionStatus,
    MpesaTransactionType,
)
from app.services.mpesa import DarajaClient, decrypt_credential

log = logging.getLogger(__name__)

POLL_INTERVAL = 30  # seconds between sweep cycles

# Give Safaricom's own callback a fair chance to arrive before bothering Daraja.
QUERY_AFTER = timedelta(seconds=45)
# If we still can't get a definitive answer after this long, stop waiting and
# surface it as a failure rather than leaving it "pending" forever.
GIVE_UP_AFTER = timedelta(minutes=20)

# Daraja's stkQuery ResultCode list isn't fully/stably documented, so we only
# hardcode meaning for the two codes that are safe to special-case: 0 (paid)
# and 1032 (cancelled by the customer on their phone). Everything else
# non-zero is treated as a generic failure rather than guessed at.
CANCELLED_RESULT_CODE = 1032


def _build_client(creds: MpesaCredentials) -> DarajaClient:
    return DarajaClient(
        consumer_key=decrypt_credential(creds.consumer_key_enc),
        consumer_secret=decrypt_credential(creds.consumer_secret_enc),
        passkey=decrypt_credential(creds.passkey_enc),
        shortcode=creds.shortcode,
        environment=creds.environment.value,
    )


async def resolve_stk_transaction(
    tx: MpesaTransaction,
    creds: MpesaCredentials | None,
    now: datetime | None = None,
) -> str:
    """Query Daraja for `tx`'s real status and update it in place.

    Returns "resolved", "still_pending", "timed_out", or "errored".
    Does not commit — the caller owns the session/transaction.
    """
    now = now or datetime.now(timezone.utc)
    age = now - tx.created_at

    if not creds or not tx.checkout_request_id:
        if age >= GIVE_UP_AFTER:
            tx.status = MpesaTransactionStatus.TIMEOUT
            tx.result_desc = "No callback received and no M-Pesa credentials available to query Daraja"
            return "timed_out"
        return "still_pending"

    try:
        result = await _build_client(creds).stk_query(tx.checkout_request_id)
    except Exception as e:
        log.warning("STK reconcile: query failed for tx %s: %s", tx.id, e)
        if age >= GIVE_UP_AFTER:
            tx.status = MpesaTransactionStatus.TIMEOUT
            tx.result_desc = f"Gave up after {GIVE_UP_AFTER} — last reconciliation query error: {e}"
            return "timed_out"
        return "errored"

    raw_code = result.get("ResultCode")
    if raw_code is None:
        # Daraja itself has no definitive answer yet — try again next sweep.
        if age >= GIVE_UP_AFTER:
            tx.status = MpesaTransactionStatus.TIMEOUT
            tx.result_desc = f"Gave up after {GIVE_UP_AFTER} — Daraja never returned a definitive result"
            return "timed_out"
        return "still_pending"

    try:
        result_code = int(raw_code)
    except (TypeError, ValueError):
        return "still_pending"

    tx.result_code = result_code

    if result_code == 0:
        tx.status = MpesaTransactionStatus.COMPLETED
        tx.result_desc = (
            (result.get("ResultDesc") or "Paid")
            + " — resolved via reconciliation query, no callback was received "
            "(receipt number unavailable here; verify against the Daraja statement)"
        )
    elif result_code == CANCELLED_RESULT_CODE:
        tx.status = MpesaTransactionStatus.CANCELLED
        tx.result_desc = result.get("ResultDesc", "Cancelled by customer")
    else:
        tx.status = MpesaTransactionStatus.FAILED
        tx.result_desc = result.get("ResultDesc", "Failed")

    return "resolved"


async def run_cycle(session: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(MpesaTransaction)
        .where(
            MpesaTransaction.transaction_type == MpesaTransactionType.STK_PUSH,
            MpesaTransaction.status == MpesaTransactionStatus.PENDING,
            MpesaTransaction.created_at <= now - QUERY_AFTER,
        )
        .limit(50)
        .with_for_update(skip_locked=True)
    )
    rows = result.scalars().all()

    counts = {"resolved": 0, "still_pending": 0, "timed_out": 0, "errored": 0}
    for tx in rows:
        creds = await session.scalar(
            select(MpesaCredentials).where(
                MpesaCredentials.org_id == tx.org_id,
                MpesaCredentials.is_live == True,  # noqa: E712
            )
        )
        outcome = await resolve_stk_transaction(tx, creds, now)
        counts[outcome] += 1
        await session.commit()

    return counts


async def start_worker():
    """Called once from app startup — sweeps for orphaned STK pushes."""
    log.info("[mpesa-reconcile] Started — sweeping every %ds", POLL_INTERVAL)
    while True:
        try:
            async with AsyncSessionLocal() as session:
                counts = await run_cycle(session)
                if counts["resolved"] or counts["timed_out"]:
                    log.info("[mpesa-reconcile] %s", counts)
        except Exception as e:
            log.error("[mpesa-reconcile] Error: %s", e)
        await asyncio.sleep(POLL_INTERVAL)
