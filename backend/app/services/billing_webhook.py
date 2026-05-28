"""
Notifies the Fazilabs central billing system when a POS subscription is set or changed.

Requires env vars:
  BILLING_ONBOARD_URL    — e.g. https://billing.fazilabs.com/api/v1/webhooks/{product_id}/onboard
  BILLING_WEBHOOK_SECRET — shared secret matching the product record in the billing system
"""
import json
import logging
from datetime import datetime, timezone

import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)


def _headers(body: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    secret = getattr(settings, "BILLING_WEBHOOK_SECRET", "")
    if secret:
        headers["X-Webhook-Secret"] = secret
    return headers


async def notify_org_onboarded(
    *,
    org_id: int,
    org_slug: str,
    org_name: str,
    org_email: str,
    org_phone: str | None,
    plan_slug: str,
    billing_interval: str,
) -> None:
    url = getattr(settings, "BILLING_ONBOARD_URL", "")
    if not url:
        return

    payload = {
        "event": "client.onboarded",
        "client": {
            "company_name": org_name,
            "contact_name": org_name,
            "email": org_email,
            "phone": org_phone,
        },
        "subscription": {
            "plan_slug": plan_slug,
            "billing_interval": billing_interval,
            "external_ref": f"pos:{org_slug}",
        },
    }
    body = json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), **payload})

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, content=body, headers=_headers(body))
            resp.raise_for_status()
        logger.info("Billing webhook sent for org %s (id=%d)", org_slug, org_id)
    except Exception as exc:
        logger.error("Billing webhook failed for org %s: %s", org_slug, exc)
