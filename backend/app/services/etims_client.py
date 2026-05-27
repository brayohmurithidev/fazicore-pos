"""
KRA eTIMS VSCU HTTP client.

Sandbox:    https://etims-api-sandbox.kra.go.ke/etims-api
Production: https://etims.kra.go.ke/etims-api

Each call is authenticated by the tenant's KRA PIN and branch code
sent as headers. No shared OAuth — isolation is per-tenant by design.
"""

import httpx

SANDBOX_URL = "https://etims-api-sandbox.kra.go.ke/etims-api"
PRODUCTION_URL = "https://etims.kra.go.ke/etims-api"


class EtimsApiError(Exception):
    def __init__(self, code: str, msg: str):
        self.code = code
        super().__init__(f"KRA eTIMS [{code}]: {msg}")


class EtimsClient:
    def __init__(
        self,
        kra_pin: str,
        bhf_id: str,
        device_serial: str,
        sandbox: bool = True,
    ) -> None:
        self.kra_pin = kra_pin
        self.bhf_id = bhf_id
        self.device_serial = device_serial or "VSCU000001"
        self.base_url = SANDBOX_URL if sandbox else PRODUCTION_URL

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "tin": self.kra_pin,
            "bhfId": self.bhf_id,
            "cmcKey": "",
        }

    def _check(self, data: dict) -> dict:
        code = str(data.get("resultCd", ""))
        if code != "000":
            raise EtimsApiError(code, data.get("resultMsg", "Unknown error"))
        return data

    async def initialize(self) -> dict:
        """Ping the VSCU initialization endpoint to verify credentials."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/initializer/selectInitInfo",
                json={
                    "tin": self.kra_pin,
                    "bhfId": self.bhf_id,
                    "dvcSrlNo": self.device_serial,
                },
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            return self._check(resp.json())

    async def submit_invoice(self, payload: dict) -> dict:
        """
        Submit a sales invoice.
        Returns the full KRA response; resultCd == '000' means success.
        On success, data.cisInvcNo contains the CU invoice number.
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.base_url}/trnsSales/saveTrnsSalesOsdc",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return self._check(resp.json())
