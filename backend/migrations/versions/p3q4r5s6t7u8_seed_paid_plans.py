"""seed: paid subscription plans (Starter / Growth / Business / Enterprise)

Revision ID: p3q4r5s6t7u8
Revises: n1o2p3q4r5s6
Create Date: 2026-05-22

Changes:
  1. Converts the existing 'free' plan into a 30-day full-feature trial.
  2. Seeds four paid tiers: Starter, Growth (recommended), Business, Enterprise.
  3. Adds attendance_tracking to all plan feature sets.

Pricing (KSh):
  Starter   999 / 9,990 annual
  Growth    2,499 / 24,990 annual  ← recommended
  Business  4,999 / 49,990 annual
  Enterprise 9,999 / 99,990 annual

Annual = 10 months price (~17% discount).
"""

import json
import sqlalchemy as sa
from alembic import op

revision = "p3q4r5s6t7u8"
down_revision = "n1o2p3q4r5s6"
branch_labels = None
depends_on = None

# ── Feature sets ──────────────────────────────────────────────────────────────

_TRIAL = {
    "mpesa_manual": True, "mpesa_stk": True, "sms_receipts": True,
    "credit_system": True, "advanced_reports": True, "inventory_analytics": True,
    "audit_logs": True, "permissions_mgmt": True, "expenditure_tracking": True,
    "multi_branch": True, "supplier_management": True, "barcode_mode": True,
    "custom_units": True, "thermal_printing": True, "product_images": True,
    "api_access": False, "attendance_tracking": True,
}

_STARTER = {
    "mpesa_manual": True, "mpesa_stk": False, "sms_receipts": False,
    "credit_system": True, "advanced_reports": False, "inventory_analytics": False,
    "audit_logs": False, "permissions_mgmt": False, "expenditure_tracking": True,
    "multi_branch": False, "supplier_management": True, "barcode_mode": True,
    "custom_units": True, "thermal_printing": True, "product_images": True,
    "api_access": False, "attendance_tracking": True,
}

_GROWTH = {
    "mpesa_manual": True, "mpesa_stk": True, "sms_receipts": True,
    "credit_system": True, "advanced_reports": True, "inventory_analytics": True,
    "audit_logs": False, "permissions_mgmt": False, "expenditure_tracking": True,
    "multi_branch": True, "supplier_management": True, "barcode_mode": True,
    "custom_units": True, "thermal_printing": True, "product_images": True,
    "api_access": False, "attendance_tracking": True,
}

_BUSINESS = {
    "mpesa_manual": True, "mpesa_stk": True, "sms_receipts": True,
    "credit_system": True, "advanced_reports": True, "inventory_analytics": True,
    "audit_logs": True, "permissions_mgmt": True, "expenditure_tracking": True,
    "multi_branch": True, "supplier_management": True, "barcode_mode": True,
    "custom_units": True, "thermal_printing": True, "product_images": True,
    "api_access": False, "attendance_tracking": True,
}

_ENTERPRISE = {
    "mpesa_manual": True, "mpesa_stk": True, "sms_receipts": True,
    "credit_system": True, "advanced_reports": True, "inventory_analytics": True,
    "audit_logs": True, "permissions_mgmt": True, "expenditure_tracking": True,
    "multi_branch": True, "supplier_management": True, "barcode_mode": True,
    "custom_units": True, "thermal_printing": True, "product_images": True,
    "api_access": True, "attendance_tracking": True,
}

# ── Plan definitions ──────────────────────────────────────────────────────────

_PLANS = [
    {
        "slug": "starter",
        "name": "Starter",
        "description": "Core POS for a single shop — M-Pesa, credit, suppliers, and staff attendance.",
        "price_monthly": "999.00",
        "price_annual": "9990.00",
        "max_users": 3,
        "max_products": 1000,
        "max_branches": 1,
        "trial_days": 0,
        "features": _STARTER,
        "sort_order": 1,
        "is_recommended": False,
    },
    {
        "slug": "growth",
        "name": "Growth",
        "description": "M-Pesa STK Push, SMS receipts, advanced analytics, and multi-branch support.",
        "price_monthly": "2499.00",
        "price_annual": "24990.00",
        "max_users": 8,
        "max_products": 5000,
        "max_branches": 2,
        "trial_days": 0,
        "features": _GROWTH,
        "sort_order": 2,
        "is_recommended": True,
    },
    {
        "slug": "business",
        "name": "Business",
        "description": "Audit logs, custom permissions, up to 5 branches, and unlimited products.",
        "price_monthly": "4999.00",
        "price_annual": "49990.00",
        "max_users": 20,
        "max_products": None,
        "max_branches": 5,
        "trial_days": 0,
        "features": _BUSINESS,
        "sort_order": 3,
        "is_recommended": False,
    },
    {
        "slug": "enterprise",
        "name": "Enterprise",
        "description": "Unlimited everything, API access, and priority support.",
        "price_monthly": "9999.00",
        "price_annual": "99990.00",
        "max_users": None,
        "max_products": None,
        "max_branches": None,
        "trial_days": 0,
        "features": _ENTERPRISE,
        "sort_order": 4,
        "is_recommended": False,
    },
]


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Convert existing 'free' plan to a 30-day full-feature trial.
    conn.execute(
        sa.text("""
            UPDATE subscription_plans SET
                name          = 'Free Trial',
                description   = 'Full access for 30 days — no card required.',
                price_monthly = 0,
                price_annual  = 0,
                max_users     = NULL,
                max_products  = NULL,
                max_branches  = 1,
                trial_days    = 30,
                features      = :features,
                is_recommended = FALSE,
                sort_order    = 0,
                updated_at    = NOW()
            WHERE slug = 'free'
        """),
        {"features": json.dumps(_TRIAL)},
    )

    # 2. Unmark any previously recommended plan.
    conn.execute(sa.text(
        "UPDATE subscription_plans SET is_recommended = FALSE WHERE slug != 'growth'"
    ))

    # 3. Upsert each paid plan (idempotent on re-run).
    for plan in _PLANS:
        existing = conn.execute(
            sa.text("SELECT id FROM subscription_plans WHERE slug = :slug"),
            {"slug": plan["slug"]},
        ).fetchone()

        if existing:
            conn.execute(
                sa.text("""
                    UPDATE subscription_plans SET
                        name           = :name,
                        description    = :description,
                        price_monthly  = :price_monthly,
                        price_annual   = :price_annual,
                        max_users      = :max_users,
                        max_products   = :max_products,
                        max_branches   = :max_branches,
                        trial_days     = :trial_days,
                        features       = :features,
                        sort_order     = :sort_order,
                        is_recommended = :is_recommended,
                        is_active      = TRUE,
                        updated_at     = NOW()
                    WHERE slug = :slug
                """),
                {**plan, "features": json.dumps(plan["features"])},
            )
        else:
            conn.execute(
                sa.text("""
                    INSERT INTO subscription_plans
                        (name, slug, description, price_monthly, price_annual,
                         max_users, max_products, max_branches,
                         trial_days, features, sort_order,
                         is_active, is_recommended, created_at, updated_at)
                    VALUES
                        (:name, :slug, :description, :price_monthly, :price_annual,
                         :max_users, :max_products, :max_branches,
                         :trial_days, :features, :sort_order,
                         TRUE, :is_recommended, NOW(), NOW())
                """),
                {**plan, "features": json.dumps(plan["features"])},
            )


def downgrade() -> None:
    conn = op.get_bind()

    # Remove paid plans.
    conn.execute(sa.text(
        "DELETE FROM subscription_plans WHERE slug IN ('starter','growth','business','enterprise')"
    ))

    # Restore the original free plan.
    conn.execute(
        sa.text("""
            UPDATE subscription_plans SET
                name          = 'Free',
                description   = 'Core POS features at no cost — always free',
                max_users     = 2,
                max_products  = 500,
                max_branches  = 1,
                trial_days    = 0,
                is_recommended = FALSE,
                sort_order    = 0,
                updated_at    = NOW()
            WHERE slug = 'free'
        """),
    )
