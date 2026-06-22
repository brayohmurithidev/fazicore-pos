import asyncio
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.api.v1 import admin, analytics, attendance, audit, auth, branches, categories, customers, dashboard, download, etims, expenditures, hooks, inventory, loyalty, mpesa, orders, org, paystack, platform, products, purchase_orders, reports, seed, stock_transfers, suppliers, uploads, users
from app.api.v1.analytics import sales_router
from app.core.config import settings
from app.middleware.tenant import TenantMiddleware
from app.services.etims_worker import start_worker
from app.services.mpesa_reconciliation import start_worker as start_mpesa_reconciliation_worker

# Nothing else in this app calls logging.basicConfig() — every logger.info()/
# .warning() call (e.g. app/api/v1/hooks.py's callback-key rejection warnings)
# was silently dropped, since an unconfigured root logger defaults to WARNING
# with no handler beyond Python's bare stderr "last resort" fallback. uvicorn
# configures its OWN loggers (uvicorn/uvicorn.access/uvicorn.error) directly —
# that config has `disable_existing_loggers: False` and never touches root, so
# it doesn't help our app's loggers either.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
    force=True,  # something in our import chain already attaches a root handler;
                 # basicConfig() is a silent no-op against an already-handled root
                 # without this, which is exactly why this was broken in the first place.
)

app = FastAPI(
    title="Fazi POS API",
    version="1.1.0",
    description="Multi-tenant Point of Sale system API",
)

app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    # Tauri desktop webview origins differ per OS:
    #   macOS/iOS → tauri://localhost   Windows/Linux → http(s)://tauri.localhost
    # Match them all so the desktop app works regardless of platform.
    allow_origin_regex=r"^(tauri://localhost|https?://tauri\.localhost)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(TenantMiddleware)

_static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_static_dir), name="static")

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(products.router, prefix=API_PREFIX)
app.include_router(categories.router, prefix=API_PREFIX)
app.include_router(branches.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(orders.router, prefix=API_PREFIX)
app.include_router(inventory.router, prefix=API_PREFIX)
app.include_router(purchase_orders.router, prefix=API_PREFIX)
app.include_router(customers.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(org.router, prefix=API_PREFIX)
app.include_router(platform.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(seed.router, prefix=API_PREFIX)
app.include_router(expenditures.router, prefix=API_PREFIX)
app.include_router(suppliers.router, prefix=API_PREFIX)
app.include_router(stock_transfers.router, prefix=API_PREFIX)
app.include_router(uploads.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)
app.include_router(audit.router, prefix=API_PREFIX)
app.include_router(attendance.router, prefix=API_PREFIX)
app.include_router(sales_router, prefix=API_PREFIX)
app.include_router(download.router, prefix=API_PREFIX)
app.include_router(mpesa.router, prefix=API_PREFIX)
app.include_router(paystack.router, prefix=API_PREFIX)
app.include_router(hooks.router, prefix=API_PREFIX)
app.include_router(loyalty.router, prefix=API_PREFIX)
app.include_router(etims.router, prefix=API_PREFIX)
app.include_router(reports.router, prefix=API_PREFIX)


@app.on_event("startup")
async def startup_event() -> None:
    asyncio.create_task(start_worker())
    asyncio.create_task(start_mpesa_reconciliation_worker())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Ensure CORS headers are present even when an unhandled exception produces a 500."""
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = {}
    if origin and (origin in settings.CORS_ORIGINS or "*" in settings.CORS_ORIGINS):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=headers,
    )


@app.get("/health")
async def health_check() -> dict:
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    db_ok = True
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    status = "ok" if db_ok else "degraded"
    return {"status": status, "service": "Fazi POS API", "db": db_ok}
