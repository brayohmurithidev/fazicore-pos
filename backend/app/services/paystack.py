"""
Paystack payment gateway client.

Supports:
- Card payments  (initialize + verify)
- M-Pesa via Paystack mobile money channel (charge + verify)
"""

import logging
import uuid

import httpx

logger = logging.getLogger(__name__)

PAYSTACK_BASE = "https://api.paystack.co"


def _ref() -> str:
    return f"FAZI-{uuid.uuid4().hex[:12].upper()}"


class PaystackClient:
    def __init__(self, secret_key: str):
        self._secret = secret_key

    def _hdrs(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._secret}"}

    async def initialize_transaction(
        self,
        email: str,
        amount_kes: int,
        reference: str | None = None,
    ) -> dict:
        """Initialize a card transaction; returns access_code, authorization_url, reference."""
        ref = reference or _ref()
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{PAYSTACK_BASE}/transaction/initialize",
                json={"email": email, "amount": amount_kes * 100, "currency": "KES", "reference": ref},
                headers=self._hdrs(),
            )
            r.raise_for_status()
            return r.json()["data"]

    async def verify_transaction(self, reference: str) -> dict:
        """Verify a card transaction by reference; returns status, amount, customer, etc."""
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{PAYSTACK_BASE}/transaction/verify/{reference}",
                headers=self._hdrs(),
            )
            r.raise_for_status()
            return r.json()["data"]

    async def charge_mobile_money(
        self,
        phone: str,
        amount_kes: int,
        email: str,
        reference: str | None = None,
    ) -> dict:
        """Send an M-Pesa STK push via Paystack mobile money channel."""
        ref = reference or _ref()
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{PAYSTACK_BASE}/charge",
                json={
                    "email": email,
                    "amount": amount_kes * 100,
                    "currency": "KES",
                    "reference": ref,
                    "mobile_money": {"phone": phone, "provider": "mpesa"},
                },
                headers=self._hdrs(),
            )
            r.raise_for_status()
            return r.json().get("data", {})

    async def check_charge(self, reference: str) -> dict:
        """Poll a charge (mobile money) status by reference."""
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                f"{PAYSTACK_BASE}/transaction/verify/{reference}",
                headers=self._hdrs(),
            )
            r.raise_for_status()
            return r.json()["data"]
