import base64
import hashlib
import logging
from datetime import datetime

import httpx
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

from app.core.config import settings


# ── Credential encryption ─────────────────────────────────────────────────────

def _fernet() -> Fernet:
    key_bytes = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_credential(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_credential(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


# ── Daraja API client ─────────────────────────────────────────────────────────

SANDBOX_BASE = "https://sandbox.safaricom.co.ke"
PROD_BASE    = "https://api.safaricom.co.ke"


class DarajaClient:
    def __init__(
        self,
        consumer_key: str,
        consumer_secret: str,
        passkey: str,
        shortcode: str,
        environment: str,
    ):
        self.consumer_key    = consumer_key
        self.consumer_secret = consumer_secret
        self.passkey         = passkey
        self.shortcode       = shortcode
        self.base_url        = SANDBOX_BASE if environment == "sandbox" else PROD_BASE

    async def get_access_token(self) -> str:
        creds = base64.b64encode(
            f"{self.consumer_key}:{self.consumer_secret}".encode()
        ).decode()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
                headers={"Authorization": f"Basic {creds}"},
            )
            resp.raise_for_status()
            return resp.json()["access_token"]

    def _password_and_timestamp(self) -> tuple[str, str]:
        ts  = datetime.now().strftime("%Y%m%d%H%M%S")
        raw = f"{self.shortcode}{self.passkey}{ts}"
        pwd = base64.b64encode(raw.encode()).decode()
        return pwd, ts

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        phone = phone.replace(" ", "").replace("+", "").replace("-", "")
        if phone.startswith("0"):
            phone = "254" + phone[1:]
        elif len(phone) == 9 and (phone.startswith("7") or phone.startswith("1")):
            # User typed bare 9-digit number (no leading 0), e.g. 712345678
            phone = "254" + phone
        return phone

    async def stk_push(
        self,
        phone: str,
        amount: int,
        account_ref: str,
        description: str,
        callback_url: str,
    ) -> dict:
        token = await self.get_access_token()
        password, timestamp = self._password_and_timestamp()
        phone = self._normalize_phone(phone)

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": int(amount),
            "PartyA": phone,
            "PartyB": self.shortcode,
            "PhoneNumber": phone,
            "CallBackURL": callback_url,
            "AccountReference": account_ref[:12],
            "TransactionDesc": description[:13],
        }
        logger.info("STK push payload (masked): shortcode=%s phone=%s amount=%s callback=%s",
                    self.shortcode, phone, amount, callback_url)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/mpesa/stkpush/v1/processrequest",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            if not resp.is_success:
                body = resp.text
                logger.error("Daraja STK push failed: status=%s body=%s", resp.status_code, body)
                raise httpx.HTTPStatusError(
                    f"Daraja {resp.status_code}: {body}",
                    request=resp.request,
                    response=resp,
                )
            return resp.json()

    async def register_c2b_urls(self, confirmation_url: str, validation_url: str) -> dict:
        """Register C2B confirmation + validation URLs with Safaricom."""
        token = await self.get_access_token()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/mpesa/c2b/v1/registerurl",
                json={
                    "ShortCode": self.shortcode,
                    "ResponseType": "Completed",
                    "ConfirmationURL": confirmation_url,
                    "ValidationURL": validation_url,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            if not resp.is_success:
                body = resp.text
                logger.error("C2B register URL failed: status=%s body=%s", resp.status_code, body)
                raise httpx.HTTPStatusError(
                    f"Daraja {resp.status_code}: {body}",
                    request=resp.request,
                    response=resp,
                )
            return resp.json()

    async def stk_query(self, checkout_request_id: str) -> dict:
        """Poll the status of an STK push request."""
        token = await self.get_access_token()
        password, timestamp = self._password_and_timestamp()

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/mpesa/stkpushquery/v1/query",
                json={
                    "BusinessShortCode": self.shortcode,
                    "Password": password,
                    "Timestamp": timestamp,
                    "CheckoutRequestID": checkout_request_id,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            return resp.json()
