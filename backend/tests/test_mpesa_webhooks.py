"""
Tests for the M-Pesa callback security fix: per-org callback key validation
and idempotent C2B storage.

Daraja calls these endpoints with no JWT and no payload signature, so the
only thing standing between a forged HTTP POST and a "payment confirmed"
order is the `?ck=` key check, and the only thing standing between a
Safaricom retry and a double-credited sale is the dedup-by-receipt-number
logic. Both need real persistence to verify (not mocks of our own code),
so this file uses an in-memory SQLite DB rather than Postgres — none of the
three models touched here (Organization, MpesaCredentials, MpesaTransaction)
use Postgres-only column types, and the real `get_session` dependency can't
run without a live Postgres (it sets a Postgres GUC for RLS).
"""
import json

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.api.v1.hooks import _store_c2b_transaction, _verify_callback_key, c2b_confirm, c2b_validate, stk_hook
from app.api.v1.mpesa import _with_callback_key
from app.core.database import Base
from app.models.mpesa import (
    MpesaCredentials,
    MpesaEnvironment,
    MpesaTransaction,
    MpesaTransactionStatus,
    MpesaTransactionType,
)
from app.models.organization import Organization


def _make_request(body: bytes) -> Request:
    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return Request({"type": "http", "headers": []}, receive)


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
        consumer_key_enc="x",
        consumer_secret_enc="x",
        passkey_enc="x",
        is_live=True,
        callback_key="correct-key",
    )
    session.add(creds)
    await session.commit()
    return org, creds


C2B_PAYLOAD = {
    "TransID": "QGR7XXXX01",
    "TransAmount": "500",
    "MSISDN": "254712345678",
    "FirstName": "Jane",
    "LastName": "Doe",
    "BillRefNumber": "TestPayment",
}


# ── _verify_callback_key ─────────────────────────────────────────────────

async def test_verify_callback_key_accepts_correct_key(session, org_and_creds):
    org, _ = org_and_creds
    assert await _verify_callback_key("acme", "correct-key", session) == org.id


async def test_verify_callback_key_rejects_wrong_key(session, org_and_creds):
    assert await _verify_callback_key("acme", "wrong-key", session) is None


async def test_verify_callback_key_rejects_missing_key(session, org_and_creds):
    assert await _verify_callback_key("acme", None, session) is None
    assert await _verify_callback_key("acme", "", session) is None


async def test_verify_callback_key_rejects_unknown_org(session):
    assert await _verify_callback_key("does-not-exist", "anything", session) is None


# ── _store_c2b_transaction: duplicate detection ─────────────────────────────

async def test_store_c2b_transaction_creates_new(session, org_and_creds):
    org, _ = org_and_creds
    tx, created = await _store_c2b_transaction(org.id, C2B_PAYLOAD, session)
    await session.commit()
    assert created is True
    assert tx.mpesa_receipt_number == "QGR7XXXX01"
    assert float(tx.amount) == 500.0


async def test_store_c2b_transaction_dedupes_same_receipt(session, org_and_creds):
    """A retried Safaricom delivery of the same receipt must not double-credit."""
    org, _ = org_and_creds
    tx1, created1 = await _store_c2b_transaction(org.id, C2B_PAYLOAD, session)
    await session.commit()
    tx2, created2 = await _store_c2b_transaction(org.id, C2B_PAYLOAD, session)
    await session.commit()

    assert created1 is True
    assert created2 is False
    assert tx1.id == tx2.id

    count = await session.scalar(
        select(func.count()).select_from(MpesaTransaction).where(
            MpesaTransaction.org_id == org.id,
            MpesaTransaction.mpesa_receipt_number == "QGR7XXXX01",
        )
    )
    assert count == 1


async def test_duplicate_receipt_violates_db_constraint(session, org_and_creds):
    """Race-condition backstop: even if two concurrent callbacks both pass the
    pre-check (neither has committed yet when the other reads), the DB-level
    unique constraint — not just the application check — refuses the second row."""
    org, _ = org_and_creds
    session.add(MpesaTransaction(
        org_id=org.id, transaction_type=MpesaTransactionType.C2B,
        status=MpesaTransactionStatus.COMPLETED, amount=10, mpesa_receipt_number="DUPE1",
    ))
    await session.commit()

    session.add(MpesaTransaction(
        org_id=org.id, transaction_type=MpesaTransactionType.C2B,
        status=MpesaTransactionStatus.COMPLETED, amount=10, mpesa_receipt_number="DUPE1",
    ))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_store_c2b_transaction_different_receipt_creates_separate_row(session, org_and_creds):
    org, _ = org_and_creds
    await _store_c2b_transaction(org.id, C2B_PAYLOAD, session)
    await session.commit()

    other_payload = {**C2B_PAYLOAD, "TransID": "QGR7XXXX02"}
    tx2, created2 = await _store_c2b_transaction(org.id, other_payload, session)
    await session.commit()

    assert created2 is True
    assert tx2.mpesa_receipt_number == "QGR7XXXX02"


# ── c2b_confirm / c2b_validate endpoints: key check + dedup wired together ──

async def test_c2b_confirm_rejects_missing_key(session, org_and_creds):
    request = _make_request(json.dumps(C2B_PAYLOAD).encode())
    with pytest.raises(HTTPException) as exc_info:
        await c2b_confirm("acme", request, session, None)
    assert exc_info.value.status_code == 403


async def test_c2b_confirm_rejects_wrong_key(session, org_and_creds):
    request = _make_request(json.dumps(C2B_PAYLOAD).encode())
    with pytest.raises(HTTPException) as exc_info:
        await c2b_confirm("acme", request, session, "not-the-key")
    assert exc_info.value.status_code == 403


async def test_c2b_confirm_accepts_correct_key_and_dedupes_on_retry(session, org_and_creds):
    org, _ = org_and_creds

    result1 = await c2b_confirm("acme", _make_request(json.dumps(C2B_PAYLOAD).encode()), session, "correct-key")
    assert result1["ResultCode"] == "0"

    # Simulate Safaricom retrying the exact same confirmation.
    result2 = await c2b_confirm("acme", _make_request(json.dumps(C2B_PAYLOAD).encode()), session, "correct-key")
    assert result2["ResultCode"] == "0"

    count = await session.scalar(
        select(func.count()).select_from(MpesaTransaction).where(MpesaTransaction.org_id == org.id)
    )
    assert count == 1


async def test_c2b_validate_rejects_bad_key(session, org_and_creds):
    result = await c2b_validate("acme", _make_request(b"{}"), session, "wrong")
    assert result["ResultCode"] == "1"


async def test_c2b_validate_accepts_correct_key(session, org_and_creds):
    result = await c2b_validate("acme", _make_request(b"{}"), session, "correct-key")
    assert result["ResultCode"] == "0"


# ── stk_hook endpoint: same key check, applied to STK callbacks ────────────

async def test_stk_hook_rejects_missing_key(session, org_and_creds):
    body = {"Body": {"stkCallback": {"CheckoutRequestID": "ws_1", "ResultCode": 0, "ResultDesc": "ok"}}}
    with pytest.raises(HTTPException) as exc_info:
        await stk_hook("acme", _make_request(json.dumps(body).encode()), session, None)
    assert exc_info.value.status_code == 403


async def test_stk_hook_accepts_correct_key_and_updates_pending_tx(session, org_and_creds):
    org, _ = org_and_creds
    tx = MpesaTransaction(
        org_id=org.id,
        transaction_type=MpesaTransactionType.STK_PUSH,
        status=MpesaTransactionStatus.PENDING,
        checkout_request_id="ws_1",
        amount=500,
    )
    session.add(tx)
    await session.commit()

    body = {
        "Body": {
            "stkCallback": {
                "CheckoutRequestID": "ws_1",
                "ResultCode": 0,
                "ResultDesc": "ok",
                "CallbackMetadata": {"Item": [{"Name": "MpesaReceiptNumber", "Value": "QAR123"}]},
            }
        }
    }
    result = await stk_hook("acme", _make_request(json.dumps(body).encode()), session, "correct-key")
    assert result["ResultCode"] == "0"

    await session.refresh(tx)
    assert tx.status == MpesaTransactionStatus.COMPLETED
    assert tx.mpesa_receipt_number == "QAR123"


# ── _with_callback_key: pure helper, no DB needed ───────────────────────────

def test_with_callback_key_appends_query_param():
    assert _with_callback_key("https://x/y", "abc") == "https://x/y?ck=abc"


def test_with_callback_key_appends_with_ampersand_if_query_exists():
    assert _with_callback_key("https://x/y?a=1", "abc") == "https://x/y?a=1&ck=abc"


def test_with_callback_key_noop_when_no_key():
    assert _with_callback_key("https://x/y", None) == "https://x/y"
    assert _with_callback_key("https://x/y", "") == "https://x/y"
