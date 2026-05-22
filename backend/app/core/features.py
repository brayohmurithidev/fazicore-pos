FEATURE_CATALOG: list[dict] = [
    {"key": "mpesa_manual",        "label": "M-Pesa Manual Entry",      "group": "Payments",   "description": "Accept M-Pesa with manual reference entry"},
    {"key": "mpesa_stk",           "label": "M-Pesa STK Push",          "group": "Payments",   "description": "Automatically trigger M-Pesa payment prompts"},
    {"key": "sms_receipts",        "label": "SMS Receipts",             "group": "Receipts",   "description": "Send receipts via SMS to customers"},
    {"key": "credit_system",       "label": "Credit System",            "group": "Sales",      "description": "Issue invoices and track customer credit balances"},
    {"key": "advanced_reports",    "label": "Advanced Reports",         "group": "Analytics",  "description": "Full analytics: sales, inventory, products, credit"},
    {"key": "inventory_analytics", "label": "Inventory Analytics",      "group": "Analytics",  "description": "Reorder suggestions and aging stock reports"},
    {"key": "audit_logs",          "label": "Audit Logs",               "group": "Security",   "description": "Track all user actions for compliance"},
    {"key": "permissions_mgmt",    "label": "Custom Permissions",       "group": "Security",   "description": "Configure role-based access control per role"},
    {"key": "expenditure_tracking", "label": "Expenditure Tracking",     "group": "Finance",    "description": "Record and report on business expenses"},
    {"key": "multi_branch",        "label": "Multi-Branch",             "group": "Operations", "description": "Manage multiple store locations"},
    {"key": "supplier_management", "label": "Supplier Management",      "group": "Operations", "description": "Manage suppliers and create purchase orders"},
    {"key": "barcode_mode",        "label": "Barcode Scanner",          "group": "Operations", "description": "Scan barcodes to add products at POS"},
    {"key": "custom_units",        "label": "Custom Product Units",     "group": "Operations", "description": "Define custom units of measure for products"},
    {"key": "thermal_printing",    "label": "Thermal Printing",         "group": "Operations", "description": "Direct USB/Serial ESC/POS thermal printer support"},
    {"key": "product_images",      "label": "Product Images",           "group": "Operations", "description": "Upload and display product photos in inventory"},
    {"key": "api_access",          "label": "API Access",               "group": "Developer",  "description": "REST API access for third-party integrations"},
    {"key": "attendance_tracking", "label": "Attendance Tracking",      "group": "HR",         "description": "Staff clock in/out and attendance reporting"},
]

ALL_FEATURE_KEYS: set[str] = {f["key"] for f in FEATURE_CATALOG}

# Most features are plan-gated; a few are on by default for all orgs
_ALWAYS_ON = {"thermal_printing", "barcode_mode"}

DEFAULT_FLAGS: dict[str, bool] = {
    f["key"]: (f["key"] in _ALWAYS_ON) for f in FEATURE_CATALOG
}


def resolve_flags(plan_features: dict | None) -> dict[str, bool]:
    """Merge plan features with defaults, ensuring all known keys are present."""
    base = dict(DEFAULT_FLAGS)
    if plan_features:
        for k, v in plan_features.items():
            if k in ALL_FEATURE_KEYS and isinstance(v, bool):
                base[k] = v
    return base
