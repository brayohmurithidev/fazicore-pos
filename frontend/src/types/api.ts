export type ApiRole = 'admin' | 'manager' | 'cashier' | 'stock'

export interface ApiAttendance {
  id: number
  user_id: number
  org_id: number
  branch_id: number | null
  clock_in: string
  clock_out: string | null
  date: string
  user_name: string | null
  opening_float: number | null
  closing_cash: number | null
  shift_notes: string | null
}
export type ApiPaymentMethod = 'cash' | 'mpesa' | 'credit' | 'mpesa_cash' | 'other'

export interface ApiUser {
  id: number
  org_id: number
  name: string
  email: string | null
  role: ApiRole
  branch_id: number | null
  branch_name: string | null
  avatar: string | null
  photo_url: string | null
  is_active: boolean
  created_at: string
}

export interface ApiCategory {
  id: number
  org_id?: number
  name: string
  color: string | null
  is_active: boolean
  created_at?: string
  product_count?: number
}

export interface ApiProductVariant {
  id: number
  name: string
  sku: string | null
  barcode: string | null
  price: number
  cost: number | null
  attributes: Record<string, string> | null
  stock_quantity: number
  is_active: boolean
}

export interface ApiProduct {
  id: number
  name: string
  description: string | null
  sku: string | null
  barcode: string | null
  price: number
  cost: number | null
  category_id: number | null
  category_name: string | null
  image_url: string | null
  unit: string
  vat_rate: number
  expiry_date: string | null
  min_stock: number
  is_active: boolean
  track_inventory: boolean
  stock_quantity: number
  parent_product_id: number | null
  attributes: Record<string, unknown> | null
  is_variant: boolean
  variant_count: number
  variants: ApiProductVariant[]
  units: ApiProductUnit[]
  created_at: string
}

export interface ApiBranch {
  id: number
  org_id: number
  name: string
  location: string | null
  phone: string | null
  manager_name: string | null
  status: string
  is_active: boolean
  created_at: string
}

export interface ApiOrderItem {
  id: number
  product_id: number | null
  product_name: string
  product_sku: string | null
  quantity: number
  unit_price: number
  discount_amount: number
  total: number
  unit_id: number | null
  unit_name: string | null
  conversion_factor: number
}

export interface ApiOrder {
  id: number
  org_id: number
  branch_id: number | null
  order_number: string
  customer_id: number | null
  cashier_id: number
  cashier_name: string | null
  status: string
  payment_method: ApiPaymentMethod
  payment_status: string
  subtotal: number
  tax_amount: number
  discount_amount: number
  total: number
  amount_paid: number
  change_given: number
  mpesa_ref: string | null
  mpesa_amount: number
  cash_amount: number
  credit_customer_name: string | null
  credit_customer_phone: string | null
  notes: string | null
  voided_by: number | null
  voided_at: string | null
  void_reason: string | null
  edited_by: number | null
  edited_at: string | null
  items: ApiOrderItem[]
  created_at: string
}

export interface ApiPOItem {
  id: number
  product_id: number | null
  product_name: string
  quantity: number
  unit_cost: number
  expiry_date: string | null
}

export interface ApiPurchaseOrder {
  id: number
  po_number: string
  supplier: string
  branch_id: number | null
  branch_name: string | null
  status: 'pending' | 'transit' | 'received' | 'cancelled'
  total: number
  items: ApiPOItem[]
  created_at: string
}

export interface ApiInventoryItem {
  id: number
  product_id: number
  product_name: string | null
  branch_id: number | null
  branch_name: string | null
  quantity: number
  reserved_quantity: number
  low_stock_threshold: number
  location: string | null
}

export interface ApiProductUnit {
  id: number
  name: string
  abbreviation: string | null
  conversion_factor: number
  price: number | null
  barcode: string | null
  sku: string | null
  is_default: boolean
}

export interface ApiInventoryBatch {
  id: number
  product_id: number
  product_name: string | null
  branch_id: number | null
  batch_number: string | null
  quantity_received: number
  quantity_remaining: number
  cost_per_unit: number
  expiry_date: string | null
  received_date: string
}

export interface ApiInventoryTransaction {
  id: number
  inventory_id: number
  product_id: number
  product_name: string | null
  type: 'purchase' | 'sale' | 'adjustment' | 'return' | 'transfer'
  quantity_change: number
  quantity_before: number
  quantity_after: number
  notes: string | null
  performed_by: number | null
  performed_by_name: string | null
  created_at: string
}

export interface DashboardData {
  today_revenue: number
  today_transactions: number
  payment_breakdown: Record<string, { count: number; total: number }>
  low_stock_count: number
  top_products: Array<{
    product_id: number
    product_name: string
    qty_sold: number
    revenue: number
  }>
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: ApiUser
}

export interface ApiOrgInfo {
  name: string
  slug: string
  status: string
  email: string | null
  phone: string | null
  country: string | null
  max_branches: number
  max_users: number
  max_products: number
  branch_count: number
  user_count: number
  active_product_count: number
  currency: string
  custom_units: string[] | null
}

export interface ApiSupplier {
  id: number
  org_id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
}

export type TransferStatus = 'initiated' | 'in_transit' | 'confirmed' | 'cancelled'

export type ReorderUrgency = 'critical' | 'warning' | 'watch' | 'no_sales' | 'ok'
export type AgingBucket = 'fresh' | 'slow' | 'stale' | 'dead' | 'never_sold'

export interface ReorderSuggestion {
  product_id: number
  product_name: string
  sku: string | null
  unit: string
  branch_id: number | null
  branch_name: string | null
  current_stock: number
  min_stock: number
  avg_daily_sales: number
  days_remaining: number | null
  suggested_reorder_qty: number
  urgency: ReorderUrgency
}

export interface AgingItem {
  product_id: number
  product_name: string
  sku: string | null
  unit: string
  category_name: string | null
  branch_id: number | null
  branch_name: string | null
  current_stock: number
  cost_value: number
  last_sale_days_ago: number | null
  aging_bucket: AgingBucket
}

export interface ApiStockTransfer {
  id: number
  org_id: number
  transfer_number: string
  product_id: number
  product_name: string | null
  from_branch_id: number
  from_branch_name: string | null
  to_branch_id: number
  to_branch_name: string | null
  quantity: number
  status: TransferStatus
  notes: string | null
  initiated_by: number | null
  initiator_name: string | null
  confirmed_by: number | null
  confirmer_name: string | null
  created_at: string
}

export interface ApiExpenditure {
  id: number
  org_id: number
  branch_id: number | null
  category: string
  amount: number
  description: string | null
  date: string
  recorded_by: number | null
  created_at: string
}

export interface ApiExpenditureSummary {
  total: number
  by_category: Record<string, number>
}

export interface ApiCustomer {
  id: number
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  loyalty_points: number
  total_spent: number
  total_orders: number
  credit_balance: number
  is_active: boolean
  created_at: string
}

export interface ApiCreditInvoice {
  id: number
  order_number: string
  total: number
  amount_paid: number
  outstanding: number
  created_at: string
}

export interface ApiCreditPayment {
  id: number
  customer_id: number
  order_id: number | null
  amount: number
  payment_method: string
  mpesa_ref: string | null
  notes: string | null
  created_at: string
}

export interface ApiAuditLog {
  id: number
  user_id: number | null
  user_name: string | null
  action: string
  entity_type: string | null
  entity_id: number | null
  entity_name: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface ApiPermissions {
  permissions: Record<string, Record<string, boolean>>
}

export interface ApiNotificationItem {
  type: string
  product_id: number
  product_name: string
  current_stock: number
  min_stock: number
  branch_id: number | null
  branch_name: string | null
}

export interface ApiNotifications {
  low_stock: ApiNotificationItem[]
  out_of_stock: ApiNotificationItem[]
  low_stock_count: number
  out_of_stock_count: number
}

export interface ApiAnalyticsSummary {
  total_revenue: number
  total_transactions: number
  avg_transaction: number
  period: string
}

export interface ApiAnalyticsDailyItem {
  date: string
  revenue: number
  transactions: number
  discount_total: number
}

export interface ApiPlanInfo {
  slug: string
  name: string
  price_monthly: number
  price_annual: number
  max_branches: number
  max_users: number
  max_products: number
  features: string[]
  is_current: boolean
  is_recommended: boolean
}

export interface ApiSubscriptionInfo {
  current_plan: string
  plan_name: string
  status: string
  trial_ends_at: string | null
  max_branches: number
  max_users: number
  max_products: number
  branch_count: number
  user_count: number
  active_product_count: number
  feature_flags: Record<string, boolean>
  available_plans: ApiPlanInfo[]
}

export interface ApiLoyaltySettings {
  enabled: boolean
  points_per_kes: number
  kes_per_point: number
  min_redeem_points: number
}

export interface ApiFeatureEntry {
  key: string
  label: string
  group: string
  description: string
}

export interface ApiEtimsConfig {
  id: number
  org_id: number
  kra_pin: string
  bhf_id: string
  device_serial: string | null
  sandbox_mode: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ApiEtimsSubmission {
  id: number
  org_id: number
  order_id: number | null
  cu_invoice_no: string | null
  status: 'pending' | 'submitted' | 'failed'
  error_message: string | null
  attempt_count: number
  next_retry_at: string | null
  submitted_at: string | null
  created_at: string
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ApiDailySummary {
  report_date: string
  total_revenue: number
  total_orders: number
  avg_order_value: number
  total_discount: number
  total_voids: number
  void_amount: number
  cash_total: number
  mpesa_total: number
  credit_total: number
  mpesa_cash_total: number
  by_payment: { method: string; count: number; total: number }[]
  by_cashier: { cashier_id: number | null; cashier_name: string; count: number; total: number }[]
  top_products: { name: string; qty: number; revenue: number }[]
}

export interface ApiShiftReport {
  attendance_id: number
  user_id: number
  user_name: string
  clock_in: string
  clock_out: string | null
  opening_float: number | null
  closing_cash: number | null
  shift_notes: string | null
  sales_count: number
  sales_total: number
  cash_sales: number
  mpesa_sales: number
  expected_cash: number
  variance: number | null
}

export interface ApiStockLevel {
  product_id: number
  product_name: string
  sku: string | null
  category_name: string | null
  branch_id: number | null
  branch_name: string | null
  quantity: number
  min_stock: number
  cost: number
  price: number
  stock_value: number
  status: 'ok' | 'low' | 'out_of_stock'
}

export interface ApiVoidLog {
  order_id: number
  order_number: string
  voided_at: string | null
  voided_by_name: string | null
  void_reason: string | null
  cashier_name: string | null
  branch_id: number | null
  branch_name: string | null
  total: number
  payment_method: string
  items_count: number
}
