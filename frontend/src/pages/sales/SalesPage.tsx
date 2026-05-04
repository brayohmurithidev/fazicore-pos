import { useState, useMemo } from 'react'
import { Receipt, Download, Search, X, TrendingUp, ShoppingCart, CreditCard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PayBadge } from '@/components/shared/PayBadge'
import { useOrders, useBranches } from '@/lib/queries'
import { useAuthStore } from '@/stores/auth'
import { fmtKES } from '@/lib/data'
import type { ApiOrder, ApiPaymentMethod } from '@/types/api'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

function StatCard({ label, value, sub, icon: Icon, accent = '#111827' }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string
}) {
  return (
    <Card>
      <CardContent className="p-[18px_20px]">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[11px] text-gray-500 font-semibold mb-1.5 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: accent + '18' }}>
            <Icon size={18} style={{ color: accent }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OrderDetailDialog({ order, onClose }: { order: ApiOrder | null; onClose: () => void }) {
  if (!order) return null

  const isCredit = order.payment_method === 'credit'
  const isSplit = order.payment_method === 'split'
  const isMpesa = order.payment_method === 'mpesa'

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">#{order.order_number}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 text-xs text-gray-500 -mt-1 mb-1">
          <span>{fmtDateTime(order.created_at)}</span>
          {order.cashier_name && <span>· Cashier: <span className="text-gray-700 font-medium">{order.cashier_name}</span></span>}
          <PayBadge method={order.payment_method as ApiPaymentMethod} />
        </div>

        {isCredit && (order.credit_customer_name || order.credit_customer_phone) && (
          <div className="bg-purple-50 rounded-md px-3 py-2 text-sm">
            <span className="font-semibold text-purple-700">Credit: </span>
            {order.credit_customer_name}{order.credit_customer_phone ? ` · ${order.credit_customer_phone}` : ''}
          </div>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-1.5 font-bold">Item</th>
              <th className="text-right py-1.5 font-bold w-10">Qty</th>
              <th className="text-right py-1.5 font-bold">Unit Price</th>
              <th className="text-right py-1.5 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-800">
                  {item.product_name}
                  {item.product_sku && <span className="text-xs text-gray-400 ml-1">({item.product_sku})</span>}
                </td>
                <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                <td className="py-2 text-right text-gray-600">KES {item.unit_price.toLocaleString()}</td>
                <td className="py-2 text-right font-semibold">KES {item.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-1">
          <div className="w-52 text-sm space-y-1">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>KES {order.subtotal.toLocaleString()}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Discount</span><span>−KES {order.discount_amount.toLocaleString()}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>VAT</span><span>KES {order.tax_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-base border-t-2 border-gray-900 pt-2 mt-1">
              <span>Total</span><span>KES {order.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {(isSplit || isMpesa || order.payment_method === 'cash') && (
          <div className="border-t pt-3 mt-1 text-sm text-gray-600 space-y-1">
            {(isSplit || order.payment_method === 'cash') && order.cash_amount > 0 && (
              <div className="flex justify-between">
                <span>Cash paid</span><span>KES {order.cash_amount.toLocaleString()}</span>
              </div>
            )}
            {(isSplit || isMpesa) && order.mpesa_amount > 0 && (
              <div className="flex justify-between">
                <span>M-Pesa paid</span>
                <span>KES {order.mpesa_amount.toLocaleString()}{order.mpesa_ref ? ` (${order.mpesa_ref})` : ''}</span>
              </div>
            )}
            {order.change_given > 0 && (
              <div className="flex justify-between text-green-700 font-medium">
                <span>Change given</span><span>KES {order.change_given.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {order.notes && (
          <div className="bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600 mt-1">
            <span className="font-semibold text-gray-700">Note: </span>{order.notes}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function downloadCSV(orders: ApiOrder[]) {
  const headers = ['Order #', 'Date', 'Time', 'Cashier', 'Items', 'Payment', 'Subtotal', 'Discount', 'Total', 'M-Pesa Ref', 'Notes']
  const rows = orders.map((o) => {
    const d = new Date(o.created_at)
    return [
      o.order_number,
      d.toLocaleDateString('en-KE'),
      d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
      o.cashier_name ?? '',
      o.items.reduce((s, i) => s + i.quantity, 0),
      o.payment_method,
      o.subtotal,
      o.discount_amount,
      o.total,
      o.mpesa_ref ?? '',
      (o.notes ?? '').replace(/,/g, ' '),
    ]
  })
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

export function SalesPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [paymentMethod, setPaymentMethod] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState<number | null>(null)
  const [selected, setSelected] = useState<ApiOrder | null>(null)

  const { data: branches = [] } = useBranches()

  // Admins filter by selected branch (or all); non-admins are server-scoped to their branch
  const effectiveBranchId = isAdmin ? (branchFilter || undefined) : undefined

  const { data: orders = [], isLoading } = useOrders({
    limit: 200,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    payment_method: paymentMethod || undefined,
    search: search || undefined,
    branch_id: effectiveBranchId,
  })

  const stats = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + o.total, 0)
    const count = orders.length
    const avg = count > 0 ? revenue / count : 0
    return { revenue, count, avg }
  }, [orders])

  const hasFilters = !!(paymentMethod || search || dateFrom !== todayISO() || dateTo !== todayISO() || branchFilter)

  function clearFilters() {
    setDateFrom(todayISO())
    setDateTo(todayISO())
    setPaymentMethod('')
    setSearch('')
    setBranchFilter(null)
  }

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sales Records</h1>
          <div className="text-sm text-gray-400 mt-0.5">Transaction history and records</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCSV(orders)} disabled={orders.length === 0}>
          <Download size={14} className="mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 mb-5 sm:mb-6">
        <StatCard label="Total Revenue" value={fmtKES(stats.revenue)} sub={`${stats.count} transactions`} icon={TrendingUp} accent="#3B82F6" />
        <StatCard label="Transactions" value={stats.count} sub="in selected range" icon={ShoppingCart} accent="#8B5CF6" />
        <StatCard label="Avg Order Value" value={fmtKES(stats.avg)} sub="per transaction" icon={CreditCard} accent="#059669" />
      </div>

      {/* Branch context label for non-admins */}
      {!isAdmin && user?.branch_name && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 w-fit">
          <Receipt size={12} />
          Showing sales for <span className="font-semibold text-gray-700">{user.branch_name}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Order #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-40 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <span>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <Select value={paymentMethod || '__all__'} onValueChange={(v) => setPaymentMethod(!v || v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="All methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="mpesa">M-Pesa</SelectItem>
            <SelectItem value="split">Split</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && branches.length > 0 && (
          <Select
            value={branchFilter ? String(branchFilter) : '__all__'}
            onValueChange={(v) => setBranchFilter(v === '__all__' ? null : Number(v))}
          >
            <SelectTrigger className="w-40 h-9 text-sm">
              <span>
                {branchFilter
                  ? (branches.find((b) => b.id === branchFilter)?.name ?? String(branchFilter))
                  : 'All branches'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All branches</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 h-9">
            <X size={13} className="mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Order #</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date / Time</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Cashier</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Items</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Payment</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-16 text-sm">Loading…</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    <Receipt size={32} className="text-gray-200 mx-auto mb-3" />
                    <div className="text-gray-400 text-sm">No transactions found</div>
                    {hasFilters && <div className="text-gray-300 text-xs mt-1">Try adjusting the filters</div>}
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelected(order)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-gray-800">#{order.order_number}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateTime(order.created_at)}</td>
                    <td className="px-4 py-3 text-gray-700">{order.cashier_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {order.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="px-4 py-3">
                      <PayBadge method={order.payment_method as ApiPaymentMethod} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmtKES(order.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {orders.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {orders.length} transaction{orders.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-gray-900">{fmtKES(stats.revenue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <OrderDetailDialog order={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
