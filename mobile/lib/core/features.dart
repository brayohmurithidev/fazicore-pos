/// Mirror of the backend feature catalog (app/core/features.py). Used to render
/// the subscription feature list and gate functionality in the app.
class FeatureDef {
  final String key;
  final String label;
  final String group;
  const FeatureDef(this.key, this.label, this.group);
}

const kFeatureCatalog = <FeatureDef>[
  FeatureDef('mpesa_manual', 'M-Pesa Manual Entry', 'Payments'),
  FeatureDef('mpesa_stk', 'M-Pesa STK Push', 'Payments'),
  FeatureDef('sms_receipts', 'SMS Receipts', 'Receipts'),
  FeatureDef('credit_system', 'Credit System', 'Sales'),
  FeatureDef('advanced_reports', 'Advanced Reports', 'Analytics'),
  FeatureDef('inventory_analytics', 'Inventory Analytics', 'Analytics'),
  FeatureDef('audit_logs', 'Audit Logs', 'Security'),
  FeatureDef('permissions_mgmt', 'Custom Permissions', 'Security'),
  FeatureDef('expenditure_tracking', 'Expenditure Tracking', 'Finance'),
  FeatureDef('multi_branch', 'Multi-Branch', 'Operations'),
  FeatureDef('supplier_management', 'Supplier Management', 'Operations'),
  FeatureDef('barcode_mode', 'Barcode Scanner', 'Operations'),
  FeatureDef('custom_units', 'Custom Product Units', 'Operations'),
  FeatureDef('thermal_printing', 'Thermal Printing', 'Operations'),
  FeatureDef('product_images', 'Product Images', 'Operations'),
  FeatureDef('api_access', 'API Access', 'Developer'),
  FeatureDef('attendance_tracking', 'Attendance Tracking', 'HR'),
];

// Feature keys used for gating in the app.
class Feat {
  static const mpesaManual = 'mpesa_manual';
  static const mpesaStk = 'mpesa_stk';
  static const creditSystem = 'credit_system';
  static const advancedReports = 'advanced_reports';
  static const multiBranch = 'multi_branch';
  static const barcodeMode = 'barcode_mode';
}
