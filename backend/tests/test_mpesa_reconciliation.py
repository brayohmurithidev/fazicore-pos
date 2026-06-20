"""
Tests for the STK reconciliation worker: resolving PENDING STK pushes whose
Safaricom callback never arrived by actively querying Daraja instead of
waiting forever. Uses the same in-memory SQLite approach as
test_mpesa_webhooks.py — see that file's module docstring for why.
"""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.mpesa import (
    MpesaCredentials,
    MpesaEnvironment,
    MpesaTransaction,
    MpesaTransactionStatus,
    MpesaTransactionType,
)
from app.models.organization import Organization
from app.services import mpesa_reconciliation as recon
from app.services.mpesa import DarajaClient, encrypt_credential


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine(
        "sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(
            Base.metadata.create_all,
            tables=[Organization.__table__, MpesaCredentials.__table__, MpesaTransaction.__table__],
        )
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


@pytest_asyncio.fixture
async def org_and_creds(session):
    org = Organization(name="Acme", slug="acme")
    session.add(org)
    await session.flush()
    creds = MpesaCredentials(
        org_id=org.id,
        environment=MpesaEnvironment.SANDBOX,
        shortcode="174379",
        consumer_key_enc=encrypt_credential("ck"),
        consumer_secret_enc=encrypt_credential("cs"),
        passkey_enc=encrypt_credential("pk"),
        is_live=True,
        callback_key="key",
    )
    session.add(creds)
    await session.commit()
    return org, creds


def _old_pending_tx(org_id: int, *, age: timedelta, checkout_request_id: str = "ws_1") -> MpesaTransaction:
    return MpesaTransaction(
        org_id=org_id,
        transaction_type=MpesaTransactionType.STK_PUSH,
        status=MpesaTransactionStatus.PENDING,
        checkout_request_id=checkout_request_id,
        amount=500,
        created_at=datetime.now(timezone.utc) - age,
    )


def _mock_stk_query(monkeypatch, result=None, exc: Exception | None = None):
    async def fake(self, checkout_request_id):
        if exc:
            raise exc
        return result

    monkeypatch.setattr(DarajaClient, "stk_query", fake)


# ── resolve_stk_transaction ──────────────────────────────────────────────

async def test_resolves_completed_on_result_code_zero(session, org_and_creds, monkeypatch):
    org, creds = org_and_creds
    tx = _old_pending_tx(org.id, age=timedelta(seconds=60))
    _mock_stk_query(monkeypatch, result={"ResultCode": 0, "ResultDesc": "Success"})

    outcome = await recon.resolve_stk_transaction(tx, creds)

    assert outcome == "resolved"
    assert tx.status == MpesaTransactionStatus.COMPLETED
    assert "reconciliation" in tx.result_desc.lower()


async def test_resolves_cancelled_on_result_code_1032(session, org_and_creds, monkeypatch):
    org, creds = org_and_creds
    tx = _old_pending_tx(org.id, age=timedelta(seconds=60))
    _mock_stk_query(monkeypatch, result={"ResultCode": 1032, "ResultDesc": "Cancelled by user"})

    outcome = await recon.resolve_stk_transaction(tx, creds)

    assert outcome == "resolved"
    assert tx.status == MpesaTransactionStatus.CANCELLED


async def test_resolves_failed_on_other_nonzero_codes(session, org_and_creds, monkeypatch):
    org, creds = org_and_creds
    tx = _old_pending_tx(org.id, age=timedelta(seconds=60))
    _mock_stk_query(monkeypatch, result={"ResultCode": 1037, "ResultDesc": "Timeout"})

    outcome = await recon.resolve_stk_transaction(tx, creds)

    assert outcome == "resolved"
    assert tx.status == MpesaTransactionStatus.FAILED


async def test_still_pending_when_daraja_has_no_definitive_answer_yet(session, org_and_creds, monkeypatch):
    org, creds = org_and_creds
    tx = _old_pending_tx(org.id, age=timedelta(seconds=60))
    _mock_stk_query(monkeypatch, result={"errorCode": "500.001.1001", "errorMessage": "being processed"})

    outcome = await recon.resolve_stk_transaction(tx, creds)

    assert outcome == "still_pending"
    assert tx.status == MpesaTransactionStatus.PENDING


async def test_still_pending_on_query_error_within_grace_period(session, org_and_creds, monkeypatch):
    org, creds = org_and_creds
    tx = _old_pending_tx(org.id, age=timedelta(minutes=2))
    _mock_stk_query(monkeypatch, exc=ConnectionError("network blip"))

    outcome = await recon.resolve_stk_transaction(tx, creds)

    assert outcome == "errored"
    assert tx.status == MpesaTransactionStatus.PENDING


async def test_times_out_after_give_up_period_on_repeated_errors(session, org_and_creds, monkeypatch):
    org, creds = org_and_creds
    tx = _old_pending_tx(org.id, age=recon.GIVE_UP_AFTER + timedelta(minutes=1))
    _mock_stk_query(monkeypatch, exc=ConnectionError("still down"))

    outcome = await recon.resolve_stk_transaction(tx, creds)

    assert outcome == "timed_out"
    assert tx.status == MpesaTransactionStatus.TIMEOUT


async def test_times_out_after_give_up_period_with_no_credentials(session, org_and_creds):
    org, _ = org_and_creds
    tx = _old_pending_tx(org.id, age=recon.GIVE_UP_AFTER + timedelta(minutes=1))

    outcome = await recon.resolve_stk_transaction(tx, None)

    assert outcome == "timed_out"
    assert tx.status == MpesaTransactionStatus.TIMEOUT


async def test_still_pending_with_no_credentials_within_grace_period(session, org_and_creds):
    org, _ = org_and_creds
    tx = _old_pending_tx(org.id, age=timedelta(seconds=60))

    outcome = await recon.resolve_stk_transaction(tx, None)

    assert outcome == "still_pending"
    assert tx.status == MpesaTransactionStatus.PENDING


# ── run_cycle: batch sweep behaviour ─────────────────────────────────────

async def test_run_cycle_skips_transactions_younger_than_query_after(session, org_and_creds, monkeypatch):
    org, _ = org_and_creds
    fresh = _old_pending_tx(org.id, age=timedelta(seconds=5), checkout_request_id="ws_fresh")
    session.add(fresh)
    await session.commit()
    _mock_stk_query(monkeypatch, result={"ResultCode": 0, "ResultDesc": "Success"})

    counts = await recon.run_cycle(session)

    assert counts == {"resolved": 0, "still_pending": 0, "timed_out": 0, "errored": 0}
    await session.refresh(fresh)
    assert fresh.status == MpesaTransactionStatus.PENDING


async def test_run_cycle_resolves_eligible_pending_transactions(session, org_and_creds, monkeypatch):
    org, _ = org_and_creds
    old = _old_pending_tx(org.id, age=timedelta(minutes=2), checkout_request_id="ws_old")
    session.add(old)
    await session.commit()
    _mock_stk_query(monkeypatch, result={"ResultCode": 0, "ResultDesc": "Success"})

    counts = await recon.run_cycle(session)

    assert counts["resolved"] == 1
    await session.refresh(old)
    assert old.status == MpesaTransactionStatus.COMPLETED


async def test_run_cycle_ignores_non_stk_and_non_pending_rows(session, org_and_creds, monkeypatch):
    org, _ = org_and_creds
    completed = _old_pending_tx(org.id, age=timedelta(minutes=2), checkout_request_id="ws_done")
    completed.status = MpesaTransactionStatus.COMPLETED
    c2b = MpesaTransaction(
        org_id=org.id,
        transaction_type=MpesaTransactionType.C2B,
        status=MpesaTransactionStatus.PENDING,
        amount=100,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=2),
    )
    session.add_all([completed, c2b])
    await session.commit()
    _mock_stk_query(monkeypatch, result={"ResultCode": 0, "ResultDesc": "Success"})

    counts = await recon.run_cycle(session)

    assert counts == {"resolved": 0, "still_pending": 0, "timed_out": 0, "errored": 0}
