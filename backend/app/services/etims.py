"""
eTIMS service: build KRA-compliant VSCU invoice payloads,
queue them as etims_submissions records, and submit to KRA.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.etims import EtimsConfig, EtimsSubmission
from app.models.order import Order, PaymentMethod
from app.services.etims_client import EtimsApiError, EtimsClient

log = logging.getLogger(__name__)

# KRA payment type codes
_PMT = {
    PaymentMethod.CASH:   "01",
    PaymentMethod.CREDIT: "02",
    PaymentMethod.MPESA:  "06",
    PaymentMethod.SPLIT:  "01",
    PaymentMethod.OTHER:  "05",
}

# VAT rate → KRA tax category
_TAX_CAT = {0.0: "A", 8.0: "C", 16.0: "B"}


def _tax_cat(vat_rate: float) -> str:
    return _TAX_CAT.get(round(vat_rate, 1), "B")


def _build_payload(order: Order, config: EtimsConfig, seq: int, org_name: str) -> dict:
    now = datetime.now(timezone.utc)

    item_list = []
    band_taxbl: dict[str, float] = {k: 0.0 for k in "ABCDE"}
    band_tax:   dict[str, float] = {k: 0.0 for k in "ABCDE"}
    band_rate   = {"A": 0, "B": 16, "C": 8, "D": 0, "E": 0}

    for idx, item in enumerate(order.items, 1):
        vat = float(getattr(item, "vat_rate", 16.0) or 16.0)
        cat = _tax_cat(vat)
        sply = round(float(item.total), 2)

        if cat == "B":
            taxbl = round(sply / 1.16, 2)
        elif cat == "C":
            taxbl = round(sply / 1.08, 2)
        else:
            taxbl = sply
        tax = round(sply - taxbl, 2)

        band_taxbl[cat] = round(band_taxbl[cat] + taxbl, 2)
        band_tax[cat]   = round(band_tax[cat]   + tax,   2)

        item_list.append({
            "itemSeq": idx,
            "itemCd": item.product_sku or f"P{item.product_id or idx:05d}",
            "itemClsCd": "10101506",  # Generic merchandise; configure per product in Phase 2
            "itemNm": item.product_name,
            "bcd": None,
            "pkgUnitCd": "EA",
            "pkg": 1,
            "qtyUnitCd": getattr(item, "unit_name", None) or "EA",
            "qty": int(item.quantity),
            "prc": float(item.unit_price),
            "splyAmt": sply,
            "dcRt": 0,
            "dcAmt": float(item.discount_amount or 0),
            "isrccCd": None, "isrccNm": None,
            "isrcRt": None,  "isrcAmt": None,
            "vatCatCd": cat,
            "exciseTxCatCd": None,
            "taxblAmt": taxbl,
            "taxAmt": tax,
            "totAmt": sply,
        })

    return {
        "tin": config.kra_pin,
        "bhfId": config.bhf_id,
        "invcNo": seq,
        "orgInvcNo": 0,
        "cisInvcNo": order.order_number,
        "salesTyCd": "N",
        "rcptTyCd": "S",
        "pmtTyCd": _PMT.get(order.payment_method, "01"),
        "salesSttsCd": "02",
        "cfmDt": now.strftime("%Y%m%d%H%M%S"),
        "salesDt": now.strftime("%Y%m%d"),
        "stockRlsDt": None, "cnclReqDt": None, "cnclDt": None,
        "rfdDt": None,      "rfdRsnCd": None,
        "totItemCnt": len(item_list),
        **{f"taxblAmt{k}": band_taxbl[k] for k in "ABCDE"},
        **{f"taxRt{k}": band_rate[k]     for k in "ABCDE"},
        **{f"taxAmt{k}": band_tax[k]     for k in "ABCDE"},
        "totTaxblAmt": round(sum(band_taxbl.values()), 2),
        "totTaxAmt":   round(sum(band_tax.values()),   2),
        "totAmt": float(order.total),
        "prchrAcptcYn": "N",
        "remark": order.notes,
        "regrId":  str(order.cashier_id),
        "regrNm":  order.cashier_name or "Cashier",
        "modrId":  str(order.cashier_id),
        "modrNm":  order.cashier_name or "Cashier",
        "receipt": {
            "custTin": None, "custMblNo": None,
            "rptNo": seq,
            "trdeNm": org_name,
            "adrs": "Nairobi, Kenya",
            "topMsg": "Thank you for your purchase",
            "btmMsg": "Goods once sold are not returnable",
            "prchrAcptcYn": "N",
        },
        "itemList": item_list,
    }


class EtimsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_config(self, org_id: int) -> EtimsConfig | None:
        result = await self.session.execute(
            select(EtimsConfig).where(EtimsConfig.org_id == org_id)
        )
        return result.scalar_one_or_none()

    async def upsert_config(self, org_id: int, **kwargs) -> EtimsConfig:
        cfg = await self.get_config(org_id)
        if cfg is None:
            cfg = EtimsConfig(org_id=org_id, **kwargs)
            self.session.add(cfg)
        else:
            for k, v in kwargs.items():
                setattr(cfg, k, v)
        await self.session.flush()
        return cfg

    async def queue_submission(
        self,
        order: Order,
        org_name: str,
    ) -> EtimsSubmission | None:
        """
        Create a pending submission record for an order.
        Called inside the order-creation transaction; no network IO here.
        Returns None if eTIMS is not configured / not active for this org.
        """
        config = await self.get_config(order.org_id)
        if not config or not config.is_active:
            return None

        seq_result = await self.session.execute(
            select(func.count(EtimsSubmission.id)).where(
                EtimsSubmission.org_id == order.org_id
            )
        )
        seq = (seq_result.scalar() or 0) + 1

        payload = _build_payload(order, config, seq, org_name)
        sub = EtimsSubmission(
            org_id=order.org_id,
            order_id=order.id,
            status="pending",
            payload=payload,
        )
        self.session.add(sub)
        await self.session.flush()
        return sub

    async def submit(self, submission: EtimsSubmission) -> bool:
        """
        Attempt to submit one record to KRA.
        Updates submission in-place; caller must commit.
        Returns True on success.
        """
        config = await self.get_config(submission.org_id)
        if not config:
            submission.status = "failed"
            submission.error_message = "eTIMS config not found"
            return False

        client = EtimsClient(
            kra_pin=config.kra_pin,
            bhf_id=config.bhf_id,
            device_serial=config.device_serial or "VSCU000001",
            sandbox=config.sandbox_mode,
        )

        submission.attempt_count += 1
        try:
            response = await client.submit_invoice(submission.payload)
            submission.response = response
            submission.status = "submitted"
            submission.cu_invoice_no = (
                response.get("data", {}).get("cisInvcNo")
                or response.get("data", {}).get("rcptNo")
            )
            submission.submitted_at = datetime.now(timezone.utc)
            submission.next_retry_at = None
            log.info("[etims] Submitted order %s → CU %s", submission.order_id, submission.cu_invoice_no)
            return True

        except EtimsApiError as e:
            submission.response = {"resultCd": e.code, "resultMsg": str(e)}
            submission.status = "failed"
            submission.error_message = str(e)
        except Exception as e:
            submission.status = "failed"
            submission.error_message = str(e)
            log.warning("[etims] Submission %s failed: %s", submission.id, e)

        # Exponential backoff: 1m, 2m, 4m, 8m … max 1 hour
        delay = min(2 ** submission.attempt_count * 60, 3600)
        submission.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
        return False

    async def test_connection(self, org_id: int) -> str:
        """Returns 'ok' or an error string."""
        config = await self.get_config(org_id)
        if not config:
            return "No eTIMS config found"
        client = EtimsClient(
            kra_pin=config.kra_pin,
            bhf_id=config.bhf_id,
            device_serial=config.device_serial or "VSCU000001",
            sandbox=config.sandbox_mode,
        )
        try:
            await client.initialize()
            return "ok"
        except Exception as e:
            return str(e)
