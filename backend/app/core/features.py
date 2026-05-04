FEATURE_CATALOG: list[dict] = [
    {"key": "mpesa_manual",        "label": "M-Pesa Manual Entry",      "group": "Payments",   "description": "Accept M-Pesa with manual reference entry"},
    {"key": "mpesa_stk",           "label": "M-Pesa STK Push",          "group": "Payments",   "description": "Automatically trigger M-Pesa payment prompts"},
    {"key": "sms_receipts",        "label": "SMS Receipts",             "group": "Receipts",   "description": "Send receipts via SMS to customers"},
    {"key": "credit_system",       "label": "Credit System",            "group": "Sales",      "description": "Issue invoices and track customer credit balances"},
    {"key": "advanced_reports",    "label": "Advanced Reports",         "group": "Analytics",  "description": "Full analytics: sales, inventory, products, credit"},
    {"key": "inventory_analytics", "label": "Inventory Analytics",      "group": "Analytics",  "description": "Reorder suggestions and aging stock reports"},
    {"key": "audit_logs",          "label": "Audit Logs",               "group": "Security",   "description": "Track all user actions for compliance"},
    {"key": "permissions_mgmt",    "label": "Custom Permissions",       "group": "Security",   "description": "Configure role-based access control per role"},
    {"key": "multi_branch",        "label": "Multi-Branch",             "group": "Operations", "description": "Manage multiple store locations"},
    {"key": "barcode_mode",        "label": "Barcode Scanner",          "group": "Operations", "description": "Scan barcodes to add products at POS"},
    {"key": "custom_units",        "label": "Custom Product Units",     "group": "Operations", "description": "Define custom units of measure for products"},
    {"key": "api_access",          "label": "API Access",               "group": "Developer",  "description": "REST API access for third-party integrations"},
]

ALL_FEATURE_KEYS: set[str] = {f["key"] for f in FEATURE_CATALOG}

DEFAULT_FLAGS: dict[str, bool] = {f["key"]: False for f in FEATURE_CATALOG}


def resolve_flags(plan_features: dict | None) -> dict[str, bool]:
    """Merge plan features with defaults, ensuring all known keys are present."""
    base = dict(DEFAULT_FLAGS)
    if plan_features:
        for k, v in plan_features.items():
            if k in ALL_FEATURE_KEYS and isinstance(v, bool):
                base[k] = v
    return base
