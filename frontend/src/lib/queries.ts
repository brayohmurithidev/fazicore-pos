import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  ApiBranch, ApiAttendance, ApiCategory, ApiCustomer, ApiCreditInvoice, ApiCreditPayment, ApiAuditLog,
  ApiInventoryItem, ApiInventoryTransaction, ApiOrder, ApiProduct,
  ApiPurchaseOrder, ApiUser, ApiOrgInfo, ApiSubscriptionInfo, ApiSupplier, ApiStockTransfer,
  ApiPermissions, ApiNotifications, ApiAnalyticsSummary, ApiAnalyticsDailyItem, ReorderSuggestion, AgingItem, DashboardData, TokenResponse,
} from '@/types/api'

export const FEATURE_CATALOG = [
  { key: 'mpesa_manual',        label: 'M-Pesa Manual Entry',     group: 'Payments',   description: 'Accept M-Pesa with manual reference entry' },
  { key: 'mpesa_stk',           label: 'M-Pesa STK Push',         group: 'Payments',   description: 'Automatically trigger M-Pesa payment prompts' },
  { key: 'sms_receipts',        label: 'SMS Receipts',            group: 'Receipts',   description: 'Send receipts via SMS to customers' },
  { key: 'credit_system',       label: 'Credit System',           group: 'Sales',      description: 'Issue invoices and track customer credit balances' },
  { key: 'advanced_reports',    label: 'Advanced Reports',        group: 'Analytics',  description: 'Full analytics: sales, inventory, products, credit' },
  { key: 'inventory_analytics', label: 'Inventory Analytics',     group: 'Analytics',  description: 'Reorder suggestions and aging stock reports' },
  { key: 'audit_logs',          label: 'Audit Logs',              group: 'Security',   description: 'Track all user actions for compliance' },
  { key: 'permissions_mgmt',    label: 'Custom Permissions',      group: 'Security',   description: 'Configure role-based access control per role' },
  { key: 'multi_branch',        label: 'Multi-Branch',            group: 'Operations', description: 'Manage multiple store locations' },
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
    queryFn: () =>
      api
        .get('/products/', { params: { q: q || undefined, category_id: categoryId || undefined, branch_id: branchId || undefined, limit: 200 } })
        .then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/products/', data).then((r) => r.data),
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
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/products/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ── Categories ────────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery<ApiCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories/').then((r) => r.data),
    staleTime: 60_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      api.post('/categories/', data).then((r) => r.data),
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
    queryFn: () => api.get('/users/').then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/users/', data).then((r) => r.data),
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
}

export function useOrders(filters: OrderFilters | number = {}) {
  const params: OrderFilters = typeof filters === 'number' ? { limit: filters } : filters
  if (!params.limit) params.limit = 50
  return useQuery<ApiOrder[]>({
    queryKey: ['orders', params],
    queryFn: () => api.get('/orders/', { params }).then((r) => r.data),
    refetchInterval: 30_000,
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation<ApiOrder, Error, Record<string, unknown>>({
    mutationFn: (data) => api.post('/orders/', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
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
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/inventory/adjust', data).then((r) => r.data),
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
      const form = new FormData()
      form.append('file', file)
      return api.post(`/uploads/product-image/${productId}`, form, {
        headers: { 'Content-Type': undefined },
      }).then((r) => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

// ── Customers ─────────────────────────────────────────────────────────────

export function useCustomers(q?: string) {
  return useQuery<ApiCustomer[]>({
    queryKey: ['customers', q],
    queryFn: () => api.get('/customers/', { params: q ? { q, limit: 100 } : { limit: 100 } }).then((r) => r.data),
    staleTime: 30_000,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/customers/', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      api.patch(`/customers/${id}`, data).then((r) => r.data),
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
    queryFn: () => api.get('/analytics/summary', { params }).then((r) => r.data),
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

// ── Org settings ──────────────────────────────────────────────────────────

export function useUpdateOrgSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { currency?: string; custom_units?: string[] }) =>
      api.patch('/org/settings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-info'] }),
  })
}
