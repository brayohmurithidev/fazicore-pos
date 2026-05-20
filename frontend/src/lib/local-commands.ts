import { invoke } from '@tauri-apps/api/core'

// ── Types (mirror Rust structs) ───────────────────────────────────────────────

export interface LocalUser {
  id: number
  name: string
  role: string
  is_active: boolean
}

export interface LocalProduct {
  id: number
  name: string
  price: number
  cost: number | null
  sku: string | null
  barcode: string | null
  unit: string
  category_id: number | null
  category_name: string | null
  stock_quantity: number
  min_stock: number
  image_url: string | null
  local_image_path: string | null
  vat_rate: number
  is_active: boolean
  track_inventory: boolean
  is_local: boolean
}

export interface LocalCustomer {
  id: number
  name: string
  phone: string | null
  email: string | null
  credit_balance: number
}

export interface LocalOrderItem {
  product_id: number
  name: string
  sku: string | null
  qty: number
  price: number
  cost: number | null
  vat_rate: number
  subtotal: number
}

export interface LocalOrder {
  id: string
  total: number
  subtotal: number
  tax: number
  discount: number
  payment_method: string
  amount_tendered: number | null
  change_due: number | null
  customer_id: number | null
  customer_name: string | null
  cashier_id: number | null
  cashier_name: string | null
  branch_id: number | null
  notes: string | null
  items: LocalOrderItem[]
  created_at: string
}

export interface LocalCategory {
  id: number
  name: string
}

export interface LocalSalesReport {
  total_sales: number
  total_orders: number
  total_tax: number
  total_discount: number
  top_products: { product_id: number; name: string; qty_sold: number; revenue: number }[]
  daily_totals: { date: string; total: number; orders: number }[]
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const localCountUsers = () =>
  invoke<number>('local_count_users')

export const localGetUsers = () =>
  invoke<LocalUser[]>('local_get_users')

export const localCreateUser = (name: string, pin: string, role: string) =>
  invoke<LocalUser>('local_create_user', { name, pin, role })

export const localUpdateUser = (
  id: number, name: string, pin: string | null, role: string, isActive: boolean
) => invoke<void>('local_update_user', { id, name, pin, role, isActive })

export const localVerifyPin = (userId: number, pin: string) =>
  invoke<LocalUser | null>('local_verify_pin', { userId, pin })

// ── Products ──────────────────────────────────────────────────────────────────

export const localGetProducts = () =>
  invoke<LocalProduct[]>('db_get_products')

export const localCreateProduct = (args: {
  name: string; price: number; cost?: number | null; sku?: string | null
  barcode?: string | null; unit: string; categoryId?: number | null
  categoryName?: string | null; stockQuantity: number; minStock: number
  vatRate: number; trackInventory: boolean
}) => invoke<LocalProduct>('local_create_product', {
  name: args.name, price: args.price, cost: args.cost ?? null,
  sku: args.sku ?? null, barcode: args.barcode ?? null, unit: args.unit,
  categoryId: args.categoryId ?? null, categoryName: args.categoryName ?? null,
  stockQuantity: args.stockQuantity, minStock: args.minStock,
  vatRate: args.vatRate, trackInventory: args.trackInventory,
})

export const localUpdateProduct = (args: {
  id: number; name: string; price: number; cost?: number | null; sku?: string | null
  barcode?: string | null; unit: string; categoryId?: number | null
  categoryName?: string | null; minStock: number; vatRate: number
  isActive: boolean; trackInventory: boolean
}) => invoke<void>('local_update_product', {
  id: args.id, name: args.name, price: args.price, cost: args.cost ?? null,
  sku: args.sku ?? null, barcode: args.barcode ?? null, unit: args.unit,
  categoryId: args.categoryId ?? null, categoryName: args.categoryName ?? null,
  minStock: args.minStock, vatRate: args.vatRate,
  isActive: args.isActive, trackInventory: args.trackInventory,
})

export const localDeleteProduct = (id: number) =>
  invoke<void>('local_delete_product', { id })

export const localAdjustInventory = (productId: number, qtyChange: number) =>
  invoke<void>('local_adjust_inventory', { productId, qtyChange })

// ── Categories ────────────────────────────────────────────────────────────────

export const localGetCategories = () =>
  invoke<LocalCategory[]>('local_get_categories')

export const localCreateCategory = (name: string) =>
  invoke<LocalCategory>('local_create_category', { name })

// ── Customers ─────────────────────────────────────────────────────────────────

export const localGetCustomers = () =>
  invoke<LocalCustomer[]>('db_get_customers')

export const localCreateCustomer = (name: string, phone?: string | null, email?: string | null) =>
  invoke<LocalCustomer>('local_create_customer', { name, phone: phone ?? null, email: email ?? null })

export const localUpdateCustomer = (id: number, name: string, phone?: string | null, email?: string | null) =>
  invoke<void>('local_update_customer', { id, name, phone: phone ?? null, email: email ?? null })

// ── Orders ────────────────────────────────────────────────────────────────────

export const localCommitOrder = (order: LocalOrder) =>
  invoke<void>('local_commit_order', { order })

export const localGetOrders = (
  limit = 100, offset = 0, fromDate?: string, toDate?: string
) => invoke<LocalOrder[]>('local_get_orders', {
  limit, offset,
  fromDate: fromDate ?? null,
  toDate: toDate ?? null,
})

export const localGetSalesReport = (fromDate: string, toDate: string) =>
  invoke<LocalSalesReport>('local_get_sales_report', { fromDate, toDate })
