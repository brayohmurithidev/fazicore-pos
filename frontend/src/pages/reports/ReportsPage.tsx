import { useState } from 'react'
import { BarChart3, TrendingUp, Package, CreditCard, Download, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAnalyticsSummary, useAnalyticsByPayment, useAnalyticsByCashier, useReorderSuggestions, useInventoryAging } from '@/lib/queries'
import { useFeature, useFeatureFlags } from '@/hooks/useFeature'
import { UpgradeWall } from '@/components/shared/UpgradeWall'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

type Period = 'day' | 'week' | 'month'
type ReportTab = 'sales' | 'inventory' | 'products' | 'credit'

// ── PDF Print ─────────────────────────────────────────────────────────────────

function printReport(title: string) {
  const style = document.createElement('style')
  style.innerHTML = `
    @media print {
      body > *:not(#print-area) { display: none !important; }
      #print-area { display: block !important; }
      .no-print { display: none !important; }
    }
  `
  document.head.appendChild(style)
  const area = document.getElementById('print-area')
  if (area) {
    area.style.display = 'block'
    const heading = document.createElement('h2')
    heading.textContent = title
    heading.style.cssText = 'font-size:18px;font-weight:bold;margin-bottom:16px;'
    area.prepend(heading)
  }
  window.print()
  document.head.removeChild(style)
  if (area) area.querySelector('h2')?.remove()
}

// ── Sales Tab ─────────────────────────────────────────────────────────────────

function SalesTab({ period }: { period: Period }) {
  const { data: summary = [], isLoading: sumLoading } = useAnalyticsSummary({ period })
  const { data: byPayment = [], isLoading: pmtLoading } = useAnalyticsByPayment({ period: period })
  const { data: byCashier = [], isLoading: cashLoading } = useAnalyticsByCashier({ period: period })

  const totalRevenue = summary.reduce((s, d) => s + d.revenue, 0)
  const totalTx = summary.reduce((s, d) => s + d.transactions, 0)
  const totalDiscount = summary.reduce((s, d) => s + d.discount_total, 0)

  return (
    <div id="print-area" className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Revenue</div>
            <div className="text-2xl font-bold">{fmt(totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Transactions</div>
            <div className="text-2xl font-bold">{totalTx.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-0.5">Avg {fmt(totalTx ? totalRevenue / totalTx : 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Discounts Given</div>
            <div className="text-2xl font-bold text-red-600">{fmt(totalDiscount)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Daily breakdown */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Daily Sales</CardTitle></CardHeader>
        <CardContent>
          {sumLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : summary.length === 0 ? (
            <p className="text-sm text-gray-400">No sales data for this period</p>
          ) : (
            <div className="space-y-1">
              {summary.slice().reverse().map((row) => (
                <div key={row.date} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
                  <div className="w-24 text-xs text-gray-500">{new Date(row.date).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-gray-900 h-full rounded-full" style={{ width: `${Math.min(100, (row.revenue / (Math.max(...summary.map(s => s.revenue)) || 1)) * 100)}%` }} />
                  </div>
                  <div className="w-28 text-right text-sm font-semibold">{fmt(row.revenue)}</div>
                  <div className="w-12 text-right text-xs text-gray-400">{row.transactions} tx</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* By payment */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">By Payment Method</CardTitle></CardHeader>
          <CardContent>
            {pmtLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : (
              <div className="space-y-2">
                {(byPayment as Array<{ payment_method: string; count: number; total: number }>).map((row) => (
                  <div key={row.payment_method} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium capitalize">{row.payment_method}</div>
                      <div className="text-xs text-gray-400">{row.count} transactions</div>
                    </div>
                    <div className="text-sm font-semibold">{fmt(row.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By cashier */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">By Cashier</CardTitle></CardHeader>
          <CardContent>
            {cashLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : (
              <div className="space-y-2">
                {(byCashier as Array<{ cashier_name: string; count: number; total: number }>).map((row) => (
                  <div key={row.cashier_name} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{row.cashier_name}</div>
                      <div className="text-xs text-gray-400">{row.count} sales</div>
                    </div>
                    <div className="text-sm font-semibold">{fmt(row.total)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Inventory Tab ─────────────────────────────────────────────────────────────

function InventoryTab() {
  const { data: reorder = [], isLoading: reorderLoading } = useReorderSuggestions()
  const { data: aging = [], isLoading: agingLoading } = useInventoryAging()

  const critical = reorder.filter((r) => r.urgency === 'critical')
  const outOfStock = reorder.filter((r) => r.current_stock <= 0)

  return (
    <div id="print-area" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Critical Items</div><div className="text-2xl font-bold text-red-600">{critical.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Out of Stock</div><div className="text-2xl font-bold text-red-600">{outOfStock.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Dead Stock Items</div><div className="text-2xl font-bold text-amber-600">{aging.filter(a => a.aging_bucket === 'dead').length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Low Stock & Reorder</CardTitle></CardHeader>
        <CardContent>
          {reorderLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : reorder.length === 0 ? (
            <p className="text-sm text-gray-400">All stock levels are healthy</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[400px]">
              <thead><tr className="text-xs text-gray-500 border-b">{['Product', 'Stock', 'Min', 'Suggest', 'Urgency'].map(h => <th key={h} className="text-left pb-2 pr-4">{h}</th>)}</tr></thead>
              <tbody>
                {reorder.map((r) => (
                  <tr key={`${r.product_id}-${r.branch_id}`} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{r.product_name}{r.sku && <span className="text-gray-400 ml-1 text-xs">({r.sku})</span>}</td>
                    <td className="py-2 pr-4 text-red-600 font-semibold">{r.current_stock}</td>
                    <td className="py-2 pr-4 text-gray-500">{r.min_stock}</td>
                    <td className="py-2 pr-4 font-semibold">{r.suggested_reorder_qty}</td>
                    <td className="py-2">
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', { critical: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700', watch: 'bg-yellow-100 text-yellow-700' }[r.urgency] || 'bg-gray-100 text-gray-600')}>{r.urgency}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Aging Stock</CardTitle></CardHeader>
        <CardContent>
          {agingLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : aging.length === 0 ? (
            <p className="text-sm text-gray-400">No aging stock data</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[400px]">
              <thead><tr className="text-xs text-gray-500 border-b">{['Product', 'Stock', 'Value', 'Last Sale', 'Status'].map(h => <th key={h} className="text-left pb-2 pr-4">{h}</th>)}</tr></thead>
              <tbody>
                {aging.slice(0, 20).map((a) => (
                  <tr key={`${a.product_id}-${a.branch_id}`} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{a.product_name}</td>
                    <td className="py-2 pr-4">{a.current_stock}</td>
                    <td className="py-2 pr-4">{fmt(a.cost_value)}</td>
                    <td className="py-2 pr-4 text-gray-500">{a.last_sale_days_ago != null ? `${a.last_sale_days_ago}d ago` : 'Never'}</td>
                    <td className="py-2">
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', { dead: 'bg-red-100 text-red-700', stale: 'bg-amber-100 text-amber-700', slow: 'bg-yellow-100 text-yellow-700', fresh: 'bg-green-100 text-green-700', never_sold: 'bg-gray-100 text-gray-600' }[a.aging_bucket] || '')}>{a.aging_bucket.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ period }: { period: Period }) {
  const [sortBy, setSortBy] = useState<'revenue' | 'profit' | 'qty'>('revenue')
  const { data: products = [], isLoading } = useAnalyticsProducts({ period, sort_by: sortBy })

  const topRevenue = products[0]

  return (
    <div id="print-area" className="space-y-5">
      <div className="flex items-center gap-3 no-print">
        <span className="text-sm text-gray-500">Sort by:</span>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="profit">Profit</SelectItem>
            <SelectItem value="qty">Qty Sold</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Product Performance</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : products.length === 0 ? (
            <p className="text-sm text-gray-400">No sales data for this period</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b">
                  {['Product', 'Qty Sold', 'Revenue', 'Cost', 'Profit', 'Margin'].map(h => <th key={h} className="text-left pb-2 pr-4">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.product_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium">{p.product_name}{p.sku && <span className="text-gray-400 ml-1 text-xs">({p.sku})</span>}</td>
                    <td className="py-2 pr-4">{p.qty_sold}</td>
                    <td className="py-2 pr-4 font-semibold">{fmt(p.revenue)}</td>
                    <td className="py-2 pr-4 text-gray-500">{fmt(p.cost)}</td>
                    <td className={cn('py-2 pr-4 font-semibold', p.profit >= 0 ? 'text-green-700' : 'text-red-600')}>{fmt(p.profit)}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        {p.profit_margin >= 0 ? <ArrowUpRight size={12} className="text-green-600" /> : <ArrowDownRight size={12} className="text-red-500" />}
                        <span className={p.profit_margin >= 0 ? 'text-green-700' : 'text-red-600'}>{pct(p.profit_margin)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Credit Tab ────────────────────────────────────────────────────────────────

function CreditTab() {
  const { data: summary = [], isLoading } = useCreditSummaryReport()

  const totalOutstanding = (summary as Array<{ credit_balance: number }>).reduce((s, c) => s + c.credit_balance, 0)
  const totalPaid = (summary as Array<{ total_paid: number }>).reduce((s, c) => s + c.total_paid, 0)

  return (
    <div id="print-area" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Total Outstanding</div><div className="text-2xl font-bold text-red-600">{fmt(totalOutstanding)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Total Paid Back</div><div className="text-2xl font-bold text-green-700">{fmt(totalPaid)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Outstanding Balances by Customer</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : (summary as Array<{ customer_id: number; customer_name: string; credit_balance: number; total_invoices: number; total_paid: number }>).length === 0 ? (
            <p className="text-sm text-gray-400">No outstanding credit</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[360px]">
              <thead><tr className="text-xs text-gray-500 border-b">{['Customer', 'Invoices', 'Total Paid', 'Outstanding'].map(h => <th key={h} className="text-left pb-2 pr-4">{h}</th>)}</tr></thead>
              <tbody>
                {(summary as Array<{ customer_id: number; customer_name: string; credit_balance: number; total_invoices: number; total_paid: number }>).map((c) => (
                  <tr key={c.customer_id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{c.customer_name}</td>
                    <td className="py-2 pr-4">{c.total_invoices}</td>
                    <td className="py-2 pr-4 text-green-700">{fmt(c.total_paid)}</td>
                    <td className="py-2 font-bold text-red-600">{fmt(c.credit_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Hooks for products and credit ─────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

function useAnalyticsProducts(params: { period?: string; sort_by?: string }) {
  return useQuery({
    queryKey: ['analytics-products', params],
    queryFn: () => api.get('/analytics/products', { params }).then(r => r.data),
    staleTime: 30_000,
  })
}

function useCreditSummaryReport() {
  return useQuery({
    queryKey: ['credit-summary'],
    queryFn: () => api.get('/customers/credit/summary').then(r => r.data),
    staleTime: 30_000,
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS: { id: ReportTab; label: string; icon: React.ElementType; roles: string[] }[] = [
  { id: 'sales', label: 'Sales', icon: TrendingUp, roles: ['admin', 'manager'] },
  { id: 'inventory', label: 'Inventory', icon: Package, roles: ['admin', 'manager', 'stock'] },
  { id: 'products', label: 'Products', icon: BarChart3, roles: ['admin', 'manager'] },
  { id: 'credit', label: 'Credit', icon: CreditCard, roles: ['admin', 'manager'] },
]

export function ReportsPage() {
  const { user } = useAuthStore()
  const hasReports = useFeature('advanced_reports')
  const flags = useFeatureFlags()
  const [tab, setTab] = useState<ReportTab>('sales')
  const [period, setPeriod] = useState<Period>('month')

  if (!hasReports) {
    return <UpgradeWall feature="Advanced Reports" description="Get full sales analytics, inventory insights, product performance, and credit reports. Upgrade your plan to unlock reporting." />
  }

  const allowedTabs = TABS.filter(t => {
    if (!user || !t.roles.includes(user.role)) return false
    if (t.id === 'inventory' && flags.inventory_analytics === false) return false
    if (t.id === 'credit' && flags.credit_system === false) return false
    return true
  })

  const tabLabels: Record<ReportTab, string> = {
    sales: `Sales Report — ${period === 'day' ? 'Today' : period === 'week' ? 'Last 7 days' : 'Last 30 days'}`,
    inventory: 'Inventory Report',
    products: 'Product Performance',
    credit: 'Credit Report',
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Business intelligence & analytics</p>
        </div>
        <div className="flex items-center gap-3 no-print">
          {(tab === 'sales' || tab === 'products') && (
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printReport(tabLabels[tab])}>
            <Download size={13} />Export PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto no-print shrink-0 mb-4 sm:mb-5">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max min-w-full sm:w-fit">
          {allowedTabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all whitespace-nowrap',
                  tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon size={13} />{t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'sales' && <SalesTab period={period} />}
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'products' && <ProductsTab period={period} />}
        {tab === 'credit' && <CreditTab />}
      </div>
    </div>
  )
}
