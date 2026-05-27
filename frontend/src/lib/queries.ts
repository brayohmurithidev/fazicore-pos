import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { isLocalMode } from '@/lib/local-mode'
import {
  localGetProducts, localCreateProduct, localUpdateProduct, localDeleteProduct,
  localGetCategories, localCreateCategory,
  localGetCustomers, localCreateCustomer, localUpdateCustomer,
  localGetOrders, localCommitOrder, localAdjustInventory,
  localGetUsers, localCreateUser, localGetSalesReport,
  type LocalProduct, type LocalOrder, type LocalCategory, type LocalCustomer, type LocalUser,
} from '@/lib/local-commands'

function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg', quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
import type {
  ApiBranch, ApiAttendance, ApiCategory, ApiCustomer, ApiCreditInvoice, ApiCreditPayment, ApiAuditLog,
  ApiInventoryItem, ApiInventoryTransaction, ApiOrder, ApiProduct,
  ApiPurchaseOrder, ApiUser, ApiOrgInfo, ApiSubscriptionInfo, ApiSupplier, ApiStockTransfer,
  ApiPermissions, ApiNotifications, ApiAnalyticsDailyItem, ReorderSuggestion, AgingItem, DashboardData, TokenResponse,
  ApiExpenditure, ApiExpenditureSummary, ApiLoyaltySettings,
} from '@/types/api'

// ── Local-mode adapters ───────────────────────────────────────────────────────

function hashUUID(uuid: string): number {
  let h = 5381
  for (let i = 0; i < uuid.length; i++) {
    h = ((h << 5) + h) ^ uuid.charCodeAt(i)
  }
  return Math.abs(h)
}

function localProductToApi(p: LocalProduct): ApiProduct {
  return {
    id: p.id, name: p.name, description: null, sku: p.sku, barcode: p.barcode,
    price: p.price, cost: p.cost, category_id: p.category_id, category_name: p.category_name,
    image_url: p.local_image_path ?? p.image_url, unit: p.unit, vat_rate: p.vat_rate,
    expiry_date: null, min_stock: p.min_stock, is_active: p.is_active,
    track_inventory: p.track_inventory, stock_quantity: p.stock_quantity,
    parent_product_id: null, attributes: null, created_at: '',
  }
}

function localCategoryToApi(c: LocalCategory): ApiCategory {
  return { id: c.id, org_id: 0, name: c.name, color: null, is_active: true, created_at: '' }
}

function localCustomerToApi(c: LocalCustomer): ApiCustomer {
  return {
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    address: null, notes: null, loyalty_points: 0, total_spent: 0, total_orders: 0,
    credit_balance: c.credit_balance, is_active: true, created_at: '',
  }
}

function localOrderToApi(o: LocalOrder): ApiOrder {
  return {
    id: hashUUID(o.id), org_id: 0, branch_id: o.branch_id,
    order_number: o.id.slice(0, 8).toUpperCase(),
    customer_id: o.customer_id, cashier_id: o.cashier_id ?? 0, cashier_name: o.cashier_name,
    status: 'completed', payment_method: o.payment_method as ApiOrder['payment_method'],
    payment_status: 'paid', subtotal: o.subtotal, tax_amount: o.tax,
    discount_amount: o.discount, total: o.total,
    amount_paid: o.amount_tendered ?? o.total, change_given: o.change_due ?? 0,
    mpesa_ref: null, mpesa_amount: 0,
    cash_amount: o.payment_method === 'cash' ? (o.amount_tendered ?? o.total) : 0,
    credit_customer_name: null, credit_customer_phone: null,
    notes: o.notes, voided_by: null, voided_at: null, void_reason: null,
    edited_by: null, edited_at: null,
    items: o.items.map((it, idx) => ({
      id: idx + 1, product_id: it.product_id, product_name: it.name, product_sku: it.sku,
      quantity: it.qty, unit_price: it.price, discount_amount: 0, total: it.subtotal,
    })),
    created_at: o.created_at,
  }
}

function localUserToApi(u: LocalUser): ApiUser {
  return {
    id: u.id, org_id: 0, name: u.name, email: null,
    role: u.role as ApiUser['role'], branch_id: null, branch_name: null,
    avatar: null, photo_url: null, is_active: u.is_active, created_at: '',
  }
}

export const FEATURE_CATALOG = [
  { key: 'mpesa_manual',        label: 'M-Pesa Manual Entry',     group: 'Payments',   description: 'Accept M-Pesa with manual reference entry' },
  { key: 'mpesa_stk',           label: 'M-Pesa STK Push',         group: 'Payments',   description: 'Automatically trigger M-Pesa payment prompts' },
  { key: 'sms_receipts',        label: 'SMS Receipts',            group: 'Receipts',   description: 'Send receipts via SMS to customers' },
  { key: 'credit_system',       label: 'Credit System',           group: 'Sales',      description: 'Issue invoices and track customer credit balances' },
  { key: 'advanced_reports',    label: 'Advanced Reports',        group: 'Analytics',  description: 'Full analytics: sales, inventory, products, credit' },
  { key: 'inventory_analytics', label: 'Inventory Analytics',     group: 'Analytics',  description: 'Reorder suggestions and aging stock reports' },
  { key: 'audit_logs',          label: 'Audit Logs',              group: 'Security',   description: 'Track all user actions for compliance' },
  { key: 'permissions_mgmt',    label: 'Custom Permissions',      group: 'Security',   description: 'Configure role-based access control per role' },
  { key: 'expenditure_tracking', label: 'Expenditure Tracking',    group: 'Finance',    description: 'Record and report on business expenses' },
  { key: 'multi_branch',        label: 'Multi-Branch',            group: 'Operations', description: 'Manage multiple store locations' },
  { key: 'supplier_management', label: 'Supplier Management',     group: 'Operations', description: 'Manage suppliers and create purchase orders' },
  { key: 'barcode_mode',        label: 'Barcode Scanner',         group: 'Operations', description: 'Scan barcodes to add products at POS' },
  { key: 'custom_units',        label: 'Custom Product Units',    group: 'Operations', description: 'Define custom units of measure for products' },
  { key: 'api_access',          label: 'API Access',              group: 'Developer',  description: 'REST API access for third-party integrations' },
] as const

// ── Auth ──────────────────────────────────────────────────────────────────

export function useOrgUsers(orgSlug: string) {
  return useQuery<ApiUser[]>({
    queryKey: ['org-users', orgSlug],
    queryFn: () => api.get(`/auth/users?org_slug=${orgSlug}`).then((r) => r.data),
    enabled: !!orgSlug,
    staleTime: 30_000,
  })
}

export function usePinLogin() {
  return useMutation<TokenResponse, Error, { org_slug: string; user_id: number; pin: string }>({
    mutationFn: (body) => api.post('/auth/login', body).then((r) => r.data),
  })
}

export function useVerifyPin() {
  return useMutation<{ valid: boolean; role: string | null; name: string | null }, Error, { org_slug: string; user_id: number; pin: string }>({
    mutationFn: (body) => api.post('/auth/verify-pin', body).then((r) => r.data),
  })
}

// ── Attendance ────────────────────────────────────────────────────────────

export function useClockIn() {
  return useMutation<ApiAttendance, Error>({
    mutationFn: () => api.post('/attendance/clock-in').then((r) => r.data),
  })
}

export function useClockOut() {
  return useMutation<ApiAttendance, Error, { attendance_id: number }>({
    mutationFn: (body) => api.post('/attendance/clock-out', body).then((r) => r.data),
  })
}

export function useAttendanceList(forDate?: string) {
  return useQuery<ApiAttendance[]>({
    queryKey: ['attendance', forDate],
    queryFn: () =>
      api.get('/attendance/', { params: forDate ? { for_date: forDate } : undefined }).then((r) => r.data),
    staleTime: 30_000,
  })
}

// ── Org info ─────────────────────────────────────────────────────────────

export function useOrgInfo() {
  return useQuery<ApiOrgInfo>({
    queryKey: ['org-info'],
    queryFn: () => api.get('/org/info').then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useSubscription() {
  return useQuery<ApiSubscriptionInfo>({
    queryKey: ['subscription'],
    queryFn: () => api.get('/org/subscription').then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useOrgFeatures() {
  return useQuery<Record<string, boolean>>({
    queryKey: ['org-features'],
    queryFn: () => api.get('/org/features').then((r) => r.data),
    staleTime: 300_000,
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────

export function useDashboard(branchId?: number) {
  return useQuery<DashboardData>({
    queryKey: ['dashboard', branchId],
    queryFn: () =>
      api
        .get('/dashboard/', { params: branchId ? { branch_id: branchId } : {} })
        .then((r) => r.data),
    refetchInterval: 60_000,
  })
}

// ── Products ─────────────────────────────────────────────────────────────

export function useProducts(q?: string, categoryId?: number, branchId?: number) {
  return useQuery<ApiProduct[]>({
    queryKey: ['products', q, categoryId, branchId],
    queryFn: async () => {
      if (isLocalMode) {
        const products = await localGetProducts()
        return products.map(localProductToApi)
      }
      return api
        .get('/products/', { params: { q: q || undefined, category_id: categoryId || undefined, branch_id: branchId || undefined, limit: 200 } })
        .then((r) => r.data)
    },
    staleTime: 30_000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (isLocalMode) {
        const p = await localCreateProduct({
          name: data.name as string,
          price: data.price as number,
          cost: (data.cost as number) ?? null,
          sku: (data.sku as string) ?? null,
          barcode: (data.barcode as string) ?? null,
          unit: (data.unit as string) ?? 'pcs',
          categoryId: (data.category_id as number) ?? null,
          categoryName: (data.category_name as string) ?? null,
          stockQuantity: (data.stock_quantity as number) ?? 0,
          minStock: (data.min_stock as number) ?? 0,
          vatRate: (data.vat_rate as number) ?? 0,
          trackInventory: (data.track_inventory as boolean) ?? true,
        })
        return localProductToApi(p)
      }
      return api.post('/products/', data).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProduct(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/products/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpdateProductById() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      if (isLocalMode) {
        return localUpdateProduct({
          id,
          name: data.name as string,
          price: data.price as number,
          cost: (data.cost as number) ?? null,
          sku: (data.sku as string) ?? null,
          barcode: (data.barcode as string) ?? null,
          unit: (data.unit as string) ?? 'pcs',
          categoryId: (data.category_id as number) ?? null,
          categoryName: (data.category_name as string) ?? null,
          minStock: (data.min_stock as number) ?? 0,
          vatRate: (data.vat_rate as number) ?? 0,
          isActive: (data.is_active as boolean) ?? true,
          trackInventory: (data.track_inventory as boolean) ?? true,
        })
      }
      return api.patch(`/products/${id}`, data).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => isLocalMode
      ? localDeleteProduct(id)
      : api.delete(`/products/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useBulkCreateProducts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>[]) => api.post('/products/bulk', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ── Categories ────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<ApiCategory[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      if (isLocalMode) {
        const cats = await localGetCategories()
        return cats.map(localCategoryToApi)
      }
      return api.get('/categories/').then((r) => r.data)
    },
    staleTime: 60_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      if (isLocalMode) {
        const cat = await localCreateCategory(data.name)
        return localCategoryToApi(cat)
      }
      return api.post('/categories/', data).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

// ── Branches ──────────────────────────────────────────────────────────────

export function useBranches() {
  return useQuery<ApiBranch[]>({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches/').then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useCreateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/branches/', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  })
}

export function useUpdateBranch(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/branches/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  })
}

export function useDeleteBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/branches/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  })
}

// ── Users ─────────────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery<ApiUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      if (isLocalMode) {
        const users = await localGetUsers()
        return users.map(localUserToApi)
      }
      return api.get('/users/').then((r) => r.data)
    },
    staleTime: 30_000,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (isLocalMode) {
        const u = await localCreateUser(
          data.name as string,
          data.pin as string,
          data.role as string,
        )
        return localUserToApi(u)
      }
      return api.post('/users/', data).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUserById() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/users/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateMe() {
  return useMutation({
    mutationFn: (data: { name?: string; pin?: string }) =>
      api.patch('/users/me', data).then((r) => r.data),
  })
}

export function useUploadAvatar() {
  return useMutation({
    mutationFn: async (file: File) => {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      return api.post('/uploads/avatar', form, {
        headers: { 'Content-Type': undefined },
      }).then((r) => r.data as { url: string; object_name: string })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

// ── Orders ────────────────────────────────────────────────────────────────

export interface OrderFilters {
  limit?: number
  date_from?: string
  date_to?: string
  search?: string
  payment_method?: string
  branch_id?: number
  cashier_id?: number
}

export function useOrders(filters: OrderFilters | number = {}) {
  const params: OrderFilters = typeof filters === 'number' ? { limit: filters } : filters
  if (!params.limit) params.limit = 50
  return useQuery<ApiOrder[]>({
    queryKey: ['orders', params],
    queryFn: async () => {
      if (isLocalMode) {
        const orders = await localGetOrders(params.limit, 0, params.date_from, params.date_to)
        return orders.map(localOrderToApi)
      }
      return api.get('/orders/', { params }).then((r) => r.data)
    },
    refetchInterval: isLocalMode ? false : 30_000,
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation<ApiOrder, Error, Record<string, unknown>>({
    mutationFn: async (data) => {
      if (isLocalMode) {
        const apiItems = (data.items as Array<Record<string, unknown>>) ?? []
        const subtotal = apiItems.reduce(
          (s, it) => s + (it.unit_price as number) * (it.quantity as number) - ((it.discount_amount as number) ?? 0),
          0,
        )
        const discount = (data.discount_amount as number) ?? 0
        const total = subtotal - discount
        const order: LocalOrder = {
          id: crypto.randomUUID(),
          total, subtotal, tax: 0, discount,
          payment_method: (data.payment_method as string) ?? 'cash',
          amount_tendered: (data.amount_paid as number) ?? total,
          change_due: ((data.amount_paid as number) ?? total) - total,
          customer_id: (data.customer_id as number) ?? null,
          customer_name: null,
          cashier_id: null,
          cashier_name: null,
          branch_id: (data.branch_id as number) ?? null,
          notes: (data.notes as string) ?? null,
          items: apiItems.map((it) => ({
            product_id: (it.product_id as number) ?? 0,
            name: (it.product_name as string) ?? '',
            sku: (it.product_sku as string) ?? null,
            qty: (it.quantity as number) ?? 1,
            price: (it.unit_price as number) ?? 0,
            cost: null,
            vat_rate: 0,
            subtotal: ((it.unit_price as number) ?? 0) * ((it.quantity as number) ?? 1) - ((it.discount_amount as number) ?? 0),
          })),
          created_at: new Date().toISOString(),
        }
        await localCommitOrder(order)
        return localOrderToApi(order)
      }
      return api.post('/orders/', data).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useDeleteOrder() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: (id) => api.delete(`/orders/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

function invalidateOrderRelated(qc: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['orders'] }),
    qc.invalidateQueries({ queryKey: ['dashboard'] }),
    qc.invalidateQueries({ queryKey: ['inventory'] }),
    qc.invalidateQueries({ queryKey: ['products'] }),
    qc.invalidateQueries({ queryKey: ['notifications'] }),
    qc.invalidateQueries({ queryKey: ['analytics'] }),
    qc.invalidateQueries({ queryKey: ['customers'] }),
  ])
}

export function useVoidOrder() {
  const qc = useQueryClient()
  return useMutation<ApiOrder, Error, { id: number; reason?: string; pin?: string }>({
    mutationFn: ({ id, reason, pin }) =>
      api.post(`/orders/${id}/void`, { reason, pin }).then((r) => r.data),
    onSuccess: () => invalidateOrderRelated(qc),
  })
}

export function useEditOrder() {
  const qc = useQueryClient()
  return useMutation<ApiOrder, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: ({ id, body }) => api.patch(`/orders/${id}`, body).then((r) => r.data),
    onSuccess: () => invalidateOrderRelated(qc),
  })
}

// ── Inventory ─────────────────────────────────────────────────────────────

export function useInventory(branchId?: number) {
  return useQuery<ApiInventoryItem[]>({
    queryKey: ['inventory', branchId],
    queryFn: () =>
      api.get('/inventory/', { params: branchId ? { branch_id: branchId } : {} }).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useProductInventory(productId: number) {
  return useQuery<ApiInventoryItem[]>({
    queryKey: ['inventory', 'product', productId],
    queryFn: () =>
      api.get('/inventory/', { params: { product_id: productId } }).then((r) => r.data),
    staleTime: 20_000,
    enabled: productId > 0,
  })
}

export function useAdjustInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => isLocalMode
      ? localAdjustInventory(data.product_id as number, data.qty_change as number)
      : api.post('/inventory/adjust', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useTransferInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/inventory/transfer', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] })
    },
  })
}

export function useInventoryTransactions(productId?: number, type?: string) {
  return useQuery<ApiInventoryTransaction[]>({
    queryKey: ['inventory-transactions', productId, type],
    queryFn: () =>
      api.get('/inventory/transactions', {
        params: { product_id: productId, type, limit: 200 },
      }).then((r) => r.data),
    staleTime: 15_000,
  })
}

// ── Purchase Orders ───────────────────────────────────────────────────────

export function usePurchaseOrders() {
  return useQuery<ApiPurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: () => api.get('/purchase-orders/').then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation<ApiPurchaseOrder, Error, Record<string, unknown>>({
    mutationFn: (data) => api.post('/purchase-orders/', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })
}

export function useUpdatePOStatus() {
  const qc = useQueryClient()
  return useMutation<ApiPurchaseOrder, Error, { id: number; status: string }>({
    mutationFn: ({ id, status }) =>
      api.post(`/purchase-orders/${id}/status`, null, { params: { new_status: status } }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-transactions'] })
    },
  })
}

export function useDeletePurchaseOrder() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: (id) => api.delete(`/purchase-orders/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })
}

// ── Suppliers ─────────────────────────────────────────────────────────────

export function useSuppliers() {
  return useQuery<ApiSupplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers/').then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/suppliers/', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useUpdateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/suppliers/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/suppliers/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

// ── Stock Transfers ───────────────────────────────────────────────────────

export function useStockTransfers(status?: string) {
  return useQuery<ApiStockTransfer[]>({
    queryKey: ['stock-transfers', status],
    queryFn: () =>
      api.get('/stock-transfers/', { params: status ? { status } : {} }).then((r) => r.data),
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
}

export function useInitiateTransfer() {
  const qc = useQueryClient()
  return useMutation<ApiStockTransfer, Error, Record<string, unknown>>({
    mutationFn: (data) => api.post('/stock-transfers/', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useTransferAction() {
  const qc = useQueryClient()
  return useMutation<ApiStockTransfer, Error, { id: number; action: 'mark-transit' | 'confirm' | 'cancel' }>({
    mutationFn: ({ id, action }) =>
      api.post(`/stock-transfers/${id}/${action}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

// ── Uploads ───────────────────────────────────────────────────────────────

export function useUploadProductImage() {
  const qc = useQueryClient()
  return useMutation<{ url: string; object_name: string }, Error, { productId: number; file: File }>({
    mutationFn: async ({ productId, file }) => {
      const compressed = await compressImage(file)
      const form = new FormData()
      form.append('file', compressed)
      return api.post(`/uploads/product-image/${productId}`, form, {
        headers: { 'Content-Type': undefined },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ── Price history ─────────────────────────────────────────────────────────

export interface ApiPriceHistory {
  id: number
  old_price: number
  new_price: number
  reason: string | null
  changed_by_name: string | null
  created_at: string
}

export function usePriceHistory(productId: number | null) {
  return useQuery<ApiPriceHistory[]>({
    queryKey: ['price-history', productId],
    queryFn: () => api.get(`/products/${productId}/price-history`).then((r) => r.data),
    enabled: productId !== null,
    staleTime: 30_000,
  })
}

export function useAdjustPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, newPrice, reason }: { productId: number; newPrice: number; reason?: string }) =>
      api.post(`/products/${productId}/price`, { new_price: newPrice, reason: reason || null }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ── Product Units ─────────────────────────────────────────────────────────

export function useProductUnits(productId: number | null) {
  return useQuery<ApiProductUnit[]>({
    queryKey: ['product-units', productId],
    queryFn: () => api.get(`/products/${productId}/units`).then((r) => r.data),
    enabled: productId !== null,
    staleTime: 30_000,
  })
}

export function useCreateProductUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, data }: { productId: number; data: Partial<ApiProductUnit> }) =>
      api.post(`/products/${productId}/units`, data).then((r) => r.data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product-units', v.productId] }),
  })
}

export function useUpdateProductUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, unitId, data }: { productId: number; unitId: number; data: Partial<ApiProductUnit> }) =>
      api.patch(`/products/${productId}/units/${unitId}`, data).then((r) => r.data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product-units', v.productId] }),
  })
}

export function useDeleteProductUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, unitId }: { productId: number; unitId: number }) =>
      api.delete(`/products/${productId}/units/${unitId}`).then((r) => r.data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['product-units', v.productId] }),
  })
}

// ── Customers ─────────────────────────────────────────────────────────────

export function useCustomers(q?: string) {
  return useQuery<ApiCustomer[]>({
    queryKey: ['customers', q],
    queryFn: async () => {
      if (isLocalMode) {
        const customers = await localGetCustomers()
        return customers.map(localCustomerToApi)
      }
      return api.get('/customers/', { params: q ? { q, limit: 100 } : { limit: 100 } }).then((r) => r.data)
    },
    staleTime: 30_000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (isLocalMode) {
        const c = await localCreateCustomer(
          data.name as string,
          (data.phone as string) ?? null,
          (data.email as string) ?? null,
        )
        return localCustomerToApi(c)
      }
      return api.post('/customers/', data).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      if (isLocalMode) {
        return localUpdateCustomer(
          id,
          data.name as string,
          (data.phone as string) ?? null,
          (data.email as string) ?? null,
        )
      }
      return api.patch(`/customers/${id}`, data).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useCustomerInvoices(customerId: number) {
  return useQuery<ApiCreditInvoice[]>({
    queryKey: ['customer-invoices', customerId],
    queryFn: () => api.get(`/customers/${customerId}/invoices`).then((r) => r.data),
    enabled: customerId > 0,
    staleTime: 20_000,
  })
}

export function useCustomerPayments(customerId: number) {
  return useQuery<ApiCreditPayment[]>({
    queryKey: ['customer-payments', customerId],
    queryFn: () => api.get(`/customers/${customerId}/payments`).then((r) => r.data),
    enabled: customerId > 0,
    staleTime: 20_000,
  })
}

export function useRecordCreditPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, data }: { customerId: number; data: Record<string, unknown> }) =>
      api.post(`/customers/${customerId}/payments`, data).then((r) => r.data),
    onSuccess: (_, { customerId }) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer-invoices', customerId] })
      qc.invalidateQueries({ queryKey: ['customer-payments', customerId] })
      qc.invalidateQueries({ queryKey: ['credit-summary'] })
    },
  })
}

export function useCreditSummary() {
  return useQuery({
    queryKey: ['credit-summary'],
    queryFn: () => api.get('/customers/credit/summary').then((r) => r.data),
    staleTime: 30_000,
  })
}

// ── Permissions ───────────────────────────────────────────────────────────

export function usePermissions() {
  return useQuery<ApiPermissions>({
    queryKey: ['permissions'],
    queryFn: () => api.get('/org/permissions').then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useUpdatePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (permissions: Record<string, Record<string, boolean>>) =>
      api.put('/org/permissions', { permissions }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['permissions'] }),
  })
}

// ── Notifications ─────────────────────────────────────────────────────────

export function useNotifications(opts?: { branchId?: number; enabled?: boolean }) {
  const branchId = opts?.branchId
  const enabled = opts?.enabled ?? true
  return useQuery<ApiNotifications>({
    queryKey: ['notifications', branchId],
    queryFn: () =>
      api.get('/org/notifications', { params: branchId ? { branch_id: branchId } : {} }).then((r) => r.data),
    refetchInterval: 120_000,
    staleTime: 60_000,
    enabled,
  })
}

// ── Audit Logs ────────────────────────────────────────────────────────────

export function useAuditLogs(filters?: { action?: string; entity_type?: string; user_id?: number }) {
  return useQuery<ApiAuditLog[]>({
    queryKey: ['audit-logs', filters],
    queryFn: () => api.get('/audit/', { params: { ...filters, limit: 100 } }).then((r) => r.data),
    staleTime: 20_000,
  })
}

// ── Analytics (for reports) ───────────────────────────────────────────────

export function useAnalyticsSummary(params: {
  period?: 'day' | 'week' | 'month'
  date_from?: string
  date_to?: string
  branch_id?: number
}) {
  return useQuery<ApiAnalyticsDailyItem[]>({
    queryKey: ['analytics-summary', params],
    queryFn: async () => {
      if (isLocalMode) {
        const now = new Date()
        const from = params.date_from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
        const to = params.date_to ?? now.toISOString().slice(0, 10)
        const report = await localGetSalesReport(from, to)
        return report.daily_totals.map((d) => ({
          date: d.date,
          revenue: d.total,
          transactions: d.orders,
          discount_total: 0,
        }))
      }
      return api.get('/analytics/summary', { params }).then((r) => r.data)
    },
    staleTime: 30_000,
  })
}

export function useAnalyticsByPayment(params: { period?: 'day' | 'week' | 'month'; date_from?: string; date_to?: string; branch_id?: number }) {
  return useQuery({
    queryKey: ['analytics-payment', params],
    queryFn: () => api.get('/analytics/by-payment', { params }).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useAnalyticsByCashier(params: { period?: 'day' | 'week' | 'month'; date_from?: string; date_to?: string; branch_id?: number }) {
  return useQuery({
    queryKey: ['analytics-cashier', params],
    queryFn: () => api.get('/analytics/by-cashier', { params }).then((r) => r.data),
    staleTime: 30_000,
  })
}

// ── Analytics ─────────────────────────────────────────────────────────────

export function useReorderSuggestions(days = 30, branchId?: number) {
  return useQuery<ReorderSuggestion[]>({
    queryKey: ['reorder-suggestions', days, branchId],
    queryFn: () =>
      api.get('/inventory/analytics/reorder-suggestions', {
        params: { days, branch_id: branchId ?? undefined },
      }).then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useInventoryAging(branchId?: number) {
  return useQuery<AgingItem[]>({
    queryKey: ['inventory-aging', branchId],
    queryFn: () =>
      api.get('/inventory/analytics/aging', {
        params: { branch_id: branchId ?? undefined },
      }).then((r) => r.data),
    staleTime: 60_000,
  })
}

// ── Expenditures ──────────────────────────────────────────────────────────

export function useExpenditures(params?: { date_from?: string; date_to?: string; category?: string; branch_id?: number }) {
  return useQuery<ApiExpenditure[]>({
    queryKey: ['expenditures', params],
    queryFn: () => api.get('/expenditures/', { params }).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useExpenditureSummary(params?: { date_from?: string; date_to?: string }) {
  return useQuery<ApiExpenditureSummary>({
    queryKey: ['expenditures-summary', params],
    queryFn: () => api.get('/expenditures/summary', { params }).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useCreateExpenditure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { category: string; amount: number; description?: string; date: string; branch_id?: number }) =>
      api.post('/expenditures/', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenditures'] }),
  })
}

export function useUpdateExpenditure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; category?: string; amount?: number; description?: string; date?: string; branch_id?: number }) =>
      api.patch(`/expenditures/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenditures'] }),
  })
}

export function useDeleteExpenditure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/expenditures/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenditures'] }),
  })
}

// ── Org settings ──────────────────────────────────────────────────────────

export function useUpdateOrgSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { currency?: string; custom_units?: string[] }) =>
      api.patch('/org/settings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-info'] }),
  })
}

// ── M-Pesa ────────────────────────────────────────────────────────────────

const MPESA_CREDS_KEY = ['mpesa-credentials-v2']

export function useMpesaCredentials() {
  return useQuery({
    queryKey: MPESA_CREDS_KEY,
    queryFn: () => api.get('/mpesa/credentials').then((r) => {
      const d = r.data
      // guard against stale single-object cache
      return (Array.isArray(d) ? d : d ? [d] : []) as MpesaCredentialsOut[]
    }),
    retry: false,
  })
}

export function useSaveMpesaCredentials() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: MpesaCredentialsIn) => api.put('/mpesa/credentials', data).then((r) => r.data as MpesaCredentialsOut),
    onSuccess: () => qc.invalidateQueries({ queryKey: MPESA_CREDS_KEY }),
  })
}

export function useDeleteMpesaCredentials() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (environment: 'sandbox' | 'production') => api.delete(`/mpesa/credentials/${environment}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: MPESA_CREDS_KEY }),
  })
}

export function useSetLiveMpesaEnvironment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (environment: 'sandbox' | 'production') =>
      api.post(`/mpesa/credentials/set-live/${environment}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: MPESA_CREDS_KEY }),
  })
}

export function useInitiateStkPush() {
  return useMutation({
    mutationFn: (data: { phone: string; amount: number; order_ref: string }) =>
      api.post('/mpesa/stk-push', data).then((r) => r.data as StkPushResult),
  })
}

export interface UpgradeInitiated {
  checkout_request_id: string
  amount: number
  plan_name: string
  billing_interval: string
  customer_message: string
}

export function useUpgradeSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { plan_slug: string; billing_interval: 'monthly' | 'annual'; phone: string }) =>
      api.post('/org/subscription/upgrade', data).then((r) => r.data as UpgradeInitiated),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

export function useQueryUpgradeStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (checkoutRequestId: string) =>
      api.post(`/org/subscription/upgrade/query/${checkoutRequestId}`).then((r) => r.data as StkStatusResult),
    onSuccess: (data) => {
      if (data.status === 'completed') {
        qc.invalidateQueries({ queryKey: ['subscription'] })
      }
    },
  })
}

export function useStkStatus(checkoutRequestId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['stk-status', checkoutRequestId],
    queryFn: () => api.get(`/mpesa/stk-status/${checkoutRequestId}`).then((r) => r.data as StkStatusResult),
    enabled: !!checkoutRequestId && enabled,
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  })
}

export function useRegisterC2bUrls() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (environment?: 'sandbox' | 'production') =>
      api.post(`/mpesa/register-c2b${environment ? `?environment=${environment}` : ''}`).then((r) => r.data as { ok: boolean }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MPESA_CREDS_KEY }),
  })
}

export function useSimulateC2b() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { phone: string; amount: number; bill_ref?: string }) =>
      api.post('/mpesa/simulate-c2b?environment=sandbox', body).then((r) => r.data as { ok: boolean }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mpesa-transactions'] }),
  })
}

export function useMpesaTransactions(unattachedOnly = false) {
  return useQuery({
    queryKey: ['mpesa-transactions', unattachedOnly],
    queryFn: () => api.get(`/mpesa/transactions?unattached_only=${unattachedOnly}`).then((r) => r.data as MpesaTransactionItem[]),
    refetchInterval: unattachedOnly ? 5000 : false,
  })
}

// ── M-Pesa types ──────────────────────────────────────────────────────────

export interface MpesaCredentialsOut {
  environment: 'sandbox' | 'production'
  shortcode: string
  consumer_key_masked: string
  consumer_secret_masked: string
  passkey_masked: string
  callback_url_override: string | null
  is_active: boolean
  is_live: boolean
  stk_callback_url: string
  c2b_confirmation_url: string
  c2b_validation_url: string
}

export interface MpesaCredentialsIn {
  environment: 'sandbox' | 'production'
  shortcode: string
  consumer_key: string
  consumer_secret: string
  passkey: string
  callback_url_override?: string
}

export interface StkPushResult {
  checkout_request_id: string
  merchant_request_id: string
  response_code: string
  customer_message: string
}

export interface StkStatusResult {
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'timeout'
  mpesa_receipt_number: string | null
  result_desc: string | null
  amount: number
  phone: string | null
}

export interface MpesaTransactionItem {
  id: number
  transaction_type: 'stk_push' | 'c2b'
  status: string
  phone: string | null
  sender_name: string | null
  amount: number
  mpesa_receipt_number: string | null
  order_id: number | null
  created_at: string
}

// ── Loyalty ────────────────────────────────────────────────────────────────

export function useLoyaltySettings() {
  return useQuery<ApiLoyaltySettings>({
    queryKey: ['loyalty-settings'],
    queryFn: () => api.get('/loyalty/settings').then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useUpdateLoyaltySettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ApiLoyaltySettings>) =>
      api.patch('/loyalty/settings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-settings'] }),
  })
}
