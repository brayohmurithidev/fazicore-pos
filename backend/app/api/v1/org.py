from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.core.features import FEATURE_CATALOG, resolve_flags
from app.models.branch import Branch
from app.models.invoice import SubscriptionInvoice
from app.models.mpesa import MpesaTransaction, MpesaTransactionStatus, MpesaTransactionType
from app.models.organization import Organization, OrgStatus, SubscriptionPlan
from app.models.product import Product
from app.models.subscription import BillingInterval, Plan, Subscription, SubscriptionStatus
from app.models.user import User
from app.schemas.admin import InvoiceOut
from app.services.mpesa import DarajaClient

router = APIRouter(prefix="/org", tags=["org"])

_PLAN_CATALOG: dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "price_monthly": 0,
        "price_annual": 0,
        "max_branches": 1,
        "max_users": 5,
        "max_products": 500,
        "features": ["1 Branch", "5 Users", "500 Products", "Basic Reports", "POS & Inventory"],
    },
    "growth": {
        "name": "Growth",
        "price_monthly": 2500,
        "price_annual": 25000,
        "max_branches": 3,
        "max_users": 15,
        "max_products": 2000,
        "features": ["3 Branches", "15 Users", "2,000 Products", "Advanced Reports", "Customer Management", "SMS Receipts"],
    },
    "business": {
        "name": "Business",
        "price_monthly": 5000,
        "price_annual": 50000,
        "max_branches": 10,
        "max_users": 50,
        "max_products": 10000,
        "features": ["10 Branches", "50 Users", "10,000 Products", "All Reports", "API Access", "Priority Support"],
    },
    "enterprise": {
        "name": "Enterprise",
        "price_monthly": 0,
        "price_annual": 0,
        "max_branches": -1,
        "max_users": -1,
        "max_products": -1,
        "features": ["Unlimited Branches", "Unlimited Users", "Unlimited Products", "Custom Integrations", "Dedicated Support", "SLA"],
    },
}


class OrgInfo(BaseModel):
    name: str
    slug: str
    status: str
    email: str | None = None
    phone: str | None = None
    country: str | None = None
    max_branches: int | None
    max_users: int | None
    max_products: int | None
    branch_count: int
    user_count: int
    active_product_count: int
    currency: str = "KES"
    custom_units: list[str] | None = None


@router.get("/info", response_model=OrgInfo)
async def get_org_info(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrgInfo:
    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    user_count = await session.scalar(
        select(func.count(User.id)).where(User.org_id == org.id, User.is_active == True)
    ) or 0
    branch_count = await session.scalar(
        select(func.count(Branch.id)).where(Branch.org_id == org.id, Branch.is_active == True)
    ) or 0
    active_product_count = await session.scalar(
        select(func.count(Product.id)).where(Product.org_id == org.id, Product.is_active == True)
    ) or 0

    return OrgInfo(
        name=org.name,
        slug=org.slug,
        status=org.status.value,
        email=org.email,
        phone=org.phone,
        country=org.country,
        max_branches=org.max_branches,
        max_users=org.max_users,
        max_products=org.max_products,
        branch_count=branch_count,
        user_count=user_count,
        active_product_count=active_product_count,
        currency=org.currency,
        custom_units=org.custom_units,
    )


class OrgSettingsUpdate(BaseModel):
    currency: str | None = None
    custom_units: list[str] | None = None


@router.patch("/settings", response_model=OrgInfo)
async def update_org_settings(
    data: OrgSettingsUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> OrgInfo:
    if current_user.role.value not in ("admin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if data.currency is not None:
        org.currency = data.currency.upper()
    if data.custom_units is not None:
        org.custom_units = [u.strip() for u in data.custom_units if u.strip()]

    await session.commit()
    await session.refresh(org)

    user_count = await session.scalar(
        select(func.count(User.id)).where(User.org_id == org.id, User.is_active == True)
    ) or 0
    branch_count = await session.scalar(
        select(func.count(Branch.id)).where(Branch.org_id == org.id, Branch.is_active == True)
    ) or 0
    active_product_count = await session.scalar(
        select(func.count(Product.id)).where(Product.org_id == org.id, Product.is_active == True)
    ) or 0

    return OrgInfo(
        name=org.name,
        slug=org.slug,
        status=org.status.value,
        email=org.email,
        phone=org.phone,
        country=org.country,
        max_branches=org.max_branches,
        max_users=org.max_users,
        max_products=org.max_products,
        branch_count=branch_count,
        user_count=user_count,
        active_product_count=active_product_count,
        currency=org.currency,
        custom_units=org.custom_units,
    )


class PlanInfo(BaseModel):
    slug: str
    name: str
    price_monthly: int
    price_annual: int
    max_branches: int | None
    max_users: int | None
    max_products: int | None
    features: list[str]
    is_current: bool
    is_recommended: bool = False


class SubscriptionInfo(BaseModel):
    current_plan: str
    plan_name: str
    status: str
    trial_ends_at: str | None
    max_branches: int | None
    max_users: int | None
    max_products: int | None
    branch_count: int
    user_count: int
    active_product_count: int
    feature_flags: dict[str, bool]
    available_plans: list[PlanInfo]


@router.get("/subscription", response_model=SubscriptionInfo)
async def get_subscription(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> SubscriptionInfo:
    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    user_count = await session.scalar(
        select(func.count(User.id)).where(User.org_id == org.id, User.is_active == True)
    ) or 0
    branch_count = await session.scalar(
        select(func.count(Branch.id)).where(Branch.org_id == org.id, Branch.is_active == True)
    ) or 0
    active_product_count = await session.scalar(
        select(func.count(Product.id)).where(Product.org_id == org.id, Product.is_active == True)
    ) or 0

    # Use the Subscription table as the authoritative source for the current plan slug
    sub_plan_id = await session.scalar(
        select(Subscription.plan_id)
        .where(Subscription.organization_id == org.id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    if sub_plan_id:
        sub_plan = await session.get(Plan, sub_plan_id)
        current_slug = sub_plan.slug if sub_plan else org.plan.value
    else:
        current_slug = org.plan.value

    # Pull plans from DB; fall back to hardcoded catalog if table is empty
    db_plans_result = await session.execute(
        select(Plan).where(Plan.is_active == True).order_by(Plan.sort_order)  # noqa: E712
    )
    db_plans = db_plans_result.scalars().all()

    current_db_plan = next((p for p in db_plans if p.slug == current_slug), None)
    feature_flags = resolve_flags(current_db_plan.features if current_db_plan else None)

    if db_plans:
        # Hide free plans (price_monthly == 0) from upgrade options when org is already on a paid plan
        current_price = float(current_db_plan.price_monthly) if current_db_plan else 0
        on_paid_plan = current_price > 0
        plans = [
            PlanInfo(
                slug=p.slug,
                name=p.name,
                price_monthly=int(p.price_monthly),
                price_annual=int(p.price_annual),
                max_branches=p.max_branches,
                max_users=p.max_users,
                max_products=p.max_products,
                features=[f["label"] for f in FEATURE_CATALOG if (p.features or {}).get(f["key"])],
                is_current=p.slug == current_slug,
                is_recommended=p.is_recommended,
            )
            for p in db_plans
            if not (on_paid_plan and float(p.price_monthly) == 0 and p.slug != current_slug)
        ]
        current_plan_name = next((p.name for p in db_plans if p.slug == current_slug), current_slug.title())
    else:
        plans = [
            PlanInfo(
                slug=slug,
                name=info["name"],
                price_monthly=info["price_monthly"],
                price_annual=info["price_annual"],
                max_branches=info["max_branches"],
                max_users=info["max_users"],
                max_products=info["max_products"],
                features=info["features"],
                is_current=slug == current_slug,
            )
            for slug, info in _PLAN_CATALOG.items()
        ]
        current_plan_name = _PLAN_CATALOG.get(current_slug, {}).get("name", current_slug.title())

    trial_ends = org.trial_ends_at.isoformat() if org.trial_ends_at else None

    return SubscriptionInfo(
        current_plan=current_slug,
        plan_name=current_plan_name,
        status=org.status.value,
        trial_ends_at=trial_ends,
        max_branches=org.max_branches,
        max_users=org.max_users,
        max_products=org.max_products,
        branch_count=branch_count,
        user_count=user_count,
        active_product_count=active_product_count,
        feature_flags=feature_flags,
        available_plans=plans,
    )


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_my_invoices(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[InvoiceOut]:
    """The calling org's own subscription invoices (read-only billing history)."""
    rows = (await session.scalars(
        select(SubscriptionInvoice)
        .where(SubscriptionInvoice.organization_id == current_user.org_id)
        .order_by(SubscriptionInvoice.created_at.desc())
        .limit(50)
    )).all()
    return [
        InvoiceOut(
            id=inv.id,
            invoice_number=inv.invoice_number,
            organization_id=inv.organization_id,
            subscription_id=inv.subscription_id,
            plan_name=inv.plan_name,
            amount=str(inv.amount),
            currency=inv.currency,
            billing_interval=inv.billing_interval,
            period_start=inv.period_start,
            period_end=inv.period_end,
            due_date=inv.due_date,
            status=inv.status.value,
            paid_at=inv.paid_at,
            payment_method=inv.payment_method,
            mpesa_receipt=inv.mpesa_receipt,
            mpesa_phone=inv.mpesa_phone,
            notes=inv.notes,
            created_at=inv.created_at,
        )
        for inv in rows
    ]


@router.get("/features")
async def get_org_features(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, bool]:
    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    sub_plan_id = await session.scalar(
        select(Subscription.plan_id)
        .where(Subscription.organization_id == org.id)
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    if sub_plan_id:
        db_plan = await session.get(Plan, sub_plan_id)
    else:
        current_slug = org.plan.value
        db_plan = await session.scalar(select(Plan).where(Plan.slug == current_slug, Plan.is_active == True))  # noqa: E712
    return resolve_flags(db_plan.features if db_plan else None)


# ── Permissions ───────────────────────────────────────────────────────────────

DEFAULT_PERMISSIONS: dict[str, dict[str, bool]] = {
    "cashier": {
        "edit_prices": False,
        "view_reports": False,
        "delete_sales": False,
        "manage_users": False,
        "apply_discounts": True,
        "manage_inventory": False,
        "process_sales": True,
    },
    "manager": {
        "edit_prices": True,
        "view_reports": True,
        "delete_sales": True,
        "manage_users": False,
        "apply_discounts": True,
        "manage_inventory": True,
        "process_sales": True,
    },
    "stock": {
        "edit_prices": False,
        "view_reports": False,
        "delete_sales": False,
        "manage_users": False,
        "apply_discounts": False,
        "manage_inventory": True,
        "process_sales": False,
    },
}


class PermissionsOut(BaseModel):
    permissions: dict[str, dict[str, bool]]


class PermissionsUpdate(BaseModel):
    permissions: dict[str, dict[str, bool]]


@router.get("/permissions", response_model=PermissionsOut)
async def get_permissions(
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> PermissionsOut:
    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    perms = org.permissions or DEFAULT_PERMISSIONS
    # Merge with defaults so new permission keys are always present
    merged: dict[str, dict[str, bool]] = {}
    for role, defaults in DEFAULT_PERMISSIONS.items():
        merged[role] = {**defaults, **(perms.get(role) or {})}
    return PermissionsOut(permissions=merged)


@router.put("/permissions", response_model=PermissionsOut)
async def update_permissions(
    data: PermissionsUpdate,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> PermissionsOut:
    if current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only admins can change permissions")
    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    org.permissions = data.permissions
    await session.commit()
    return PermissionsOut(permissions=data.permissions)


# ── Subscription upgrade via M-Pesa STK Push ──────────────────────────────────

def _platform_client() -> DarajaClient | None:
    s = settings
    if not all([s.MPESA_PLATFORM_SHORTCODE, s.MPESA_PLATFORM_CONSUMER_KEY,
                s.MPESA_PLATFORM_CONSUMER_SECRET, s.MPESA_PLATFORM_PASSKEY]):
        return None
    return DarajaClient(
        consumer_key=s.MPESA_PLATFORM_CONSUMER_KEY,   # type: ignore[arg-type]
        consumer_secret=s.MPESA_PLATFORM_CONSUMER_SECRET,  # type: ignore[arg-type]
        passkey=s.MPESA_PLATFORM_PASSKEY,              # type: ignore[arg-type]
        shortcode=s.MPESA_PLATFORM_SHORTCODE,          # type: ignore[arg-type]
        environment=s.MPESA_PLATFORM_ENV,
    )


class UpgradeRequest(BaseModel):
    plan_slug: str
    billing_interval: str = "monthly"  # "monthly" | "annual"
    phone: str


class UpgradeInitiated(BaseModel):
    checkout_request_id: str
    amount: int
    plan_name: str
    billing_interval: str
    customer_message: str


@router.post("/subscription/upgrade", response_model=UpgradeInitiated)
async def initiate_subscription_upgrade(
    body: UpgradeRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UpgradeInitiated:
    if current_user.role.value not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admins or managers can upgrade the plan")

    client = _platform_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail="Self-serve upgrade is not configured. Contact sales@fazilabs.com.",
        )

    if body.billing_interval not in ("monthly", "annual"):
        raise HTTPException(status_code=422, detail="billing_interval must be 'monthly' or 'annual'")

    plan = await session.scalar(
        select(Plan).where(Plan.slug == body.plan_slug, Plan.is_active == True)  # noqa: E712
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    if float(plan.price_monthly) == 0:
        raise HTTPException(status_code=400, detail="Cannot upgrade to a free plan via M-Pesa")

    amount = int(plan.price_annual if body.billing_interval == "annual" else plan.price_monthly)

    org = await session.get(Organization, current_user.org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    base = (settings.MPESA_CALLBACK_BASE_URL or str(request.base_url).rstrip("/"))
    callback_url = f"{base}/api/v1/hooks/{org.slug}/stk"

    try:
        result = await client.stk_push(
            phone=body.phone,
            amount=amount,
            account_ref=f"SUBSUP:{body.plan_slug}:{body.billing_interval}",
            description=f"Fazi POS {plan.name} subscription",
            callback_url=callback_url,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"M-Pesa error: {e}")

    if result.get("ResponseCode") != "0":
        raise HTTPException(
            status_code=400,
            detail=result.get("ResponseDescription", "STK push failed"),
        )

    tx = MpesaTransaction(
        org_id=current_user.org_id,
        transaction_type=MpesaTransactionType.STK_PUSH,
        status=MpesaTransactionStatus.PENDING,
        merchant_request_id=result.get("MerchantRequestID"),
        checkout_request_id=result.get("CheckoutRequestID"),
        phone=body.phone,
        amount=amount,
        account_reference=f"SUBSUP:{body.plan_slug}:{body.billing_interval}",
    )
    session.add(tx)
    await session.commit()

    return UpgradeInitiated(
        checkout_request_id=result["CheckoutRequestID"],
        amount=amount,
        plan_name=plan.name,
        billing_interval=body.billing_interval,
        customer_message=result.get("CustomerMessage", "Check your phone to complete payment"),
    )


@router.post("/subscription/upgrade/query/{checkout_request_id}")
async def query_upgrade_status(
    checkout_request_id: str,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Query Daraja directly for the STK push result.
    Used when the callback hasn't arrived (e.g. dev/localhost, or Safaricom delay).
    Resolves the transaction in DB if the query confirms payment or cancellation.
    """
    tx = await session.scalar(
        select(MpesaTransaction).where(
            MpesaTransaction.org_id == current_user.org_id,
            MpesaTransaction.checkout_request_id == checkout_request_id,
        )
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Already resolved — return current status
    if tx.status != MpesaTransactionStatus.PENDING:
        return {
            "status": tx.status.value,
            "result_desc": tx.result_desc,
            "mpesa_receipt_number": tx.mpesa_receipt_number,
        }

    client = _platform_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Platform M-Pesa not configured")

    try:
        resp = await client.stk_query(checkout_request_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Daraja query error: {e}")

    result_code = resp.get("ResultCode")
    result_desc = resp.get("ResultDesc", "")

    if result_code == "0":
        # Payment confirmed — activate subscription
        tx.status = MpesaTransactionStatus.COMPLETED
        tx.result_code = 0
        tx.result_desc = result_desc
        if tx.account_reference and tx.account_reference.startswith("SUBSUP:"):
            from app.api.v1.hooks import _activate_subscription  # noqa: PLC0415
            await _activate_subscription(tx, session)
        await session.commit()
        return {"status": "completed", "result_desc": result_desc, "mpesa_receipt_number": tx.mpesa_receipt_number}

    if result_code is not None and str(result_code) != "0":
        # Definitive failure (e.g. 1032 = cancelled, 1037 = timeout)
        tx.status = MpesaTransactionStatus.FAILED
        tx.result_code = int(result_code) if str(result_code).isdigit() else None
        tx.result_desc = result_desc
        await session.commit()
        return {"status": "failed", "result_desc": result_desc, "mpesa_receipt_number": None}

    # Safaricom returned an error (e.g. still processing)
    error_msg = resp.get("errorMessage", "Still processing")
    return {"status": "pending", "result_desc": error_msg, "mpesa_receipt_number": None}


# ── Notifications ─────────────────────────────────────────────────────────────

from sqlalchemy.orm import selectinload  # noqa: E402
from app.models.inventory import Inventory  # noqa: E402
from app.models.product import Product  # noqa: E402


class NotificationItem(BaseModel):
    type: str          # "low_stock" | "out_of_stock"
    product_id: int
    product_name: str
    current_stock: int
    min_stock: int
    branch_id: int | None = None
    branch_name: str | None = None


class NotificationsOut(BaseModel):
    low_stock: list[NotificationItem]
    out_of_stock: list[NotificationItem]
    low_stock_count: int
    out_of_stock_count: int


@router.get("/notifications", response_model=NotificationsOut)
async def get_notifications(
    branch_id: int | None = None,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> NotificationsOut:
    stmt = (
        select(Inventory, Product)
        .join(Product, Inventory.product_id == Product.id)
        .options(selectinload(Inventory.branch))
        .where(
            Product.org_id == current_user.org_id,
            Product.is_active == True,
            Product.track_inventory == True,
        )
    )
    effective_branch = branch_id or (current_user.branch_id if current_user.role.value != "admin" else None)
    if effective_branch:
        stmt = stmt.where(Inventory.branch_id == effective_branch)

    result = await session.execute(stmt)
    rows = result.all()

    low_stock: list[NotificationItem] = []
    out_of_stock: list[NotificationItem] = []

    for inv, prod in rows:
        qty = inv.quantity or 0
        # Product.min_stock is the user-facing "minimum reorder" field and is the
        # single source of truth. (Inventory.low_stock_threshold is an internal
        # duplicate that isn't editable in the UI and can lag behind.)
        threshold = prod.min_stock if prod.min_stock is not None else 0
        branch_name = inv.branch.name if inv.branch else None
        if qty <= 0:
            out_of_stock.append(NotificationItem(
                type="out_of_stock",
                product_id=prod.id,
                product_name=prod.name,
                current_stock=qty,
                min_stock=threshold,
                branch_id=inv.branch_id,
                branch_name=branch_name,
            ))
        elif qty <= threshold:
            low_stock.append(NotificationItem(
                type="low_stock",
                product_id=prod.id,
                product_name=prod.name,
                current_stock=qty,
                min_stock=threshold,
                branch_id=inv.branch_id,
                branch_name=branch_name,
            ))

    return NotificationsOut(
        low_stock=low_stock,
        out_of_stock=out_of_stock,
        low_stock_count=len(low_stock),
        out_of_stock_count=len(out_of_stock),
    )
