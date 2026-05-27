import { useState } from 'react'
import {
  BarChart3, TrendingUp, Package, CreditCard, Download, Loader2,
  ArrowUpRight, ArrowDownRight, CalendarDays, Users, Layers, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  useAnalyticsSummary, useAnalyticsByPayment, useAnalyticsByCashier,
  useReorderSuggestions, useInventoryAging,
  useDailySummary, useShiftReport, useStockLevels, useVoidLog,
} from '@/lib/queries'
import { useFeature, useFeatureFlags } from '@/hooks/useFeature'
import { UpgradeWall } from '@/components/shared/UpgradeWall'
import { useAuthStore } from '@/stores/auth'
import { cn } from '@/lib/utils'

const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}
const today = () => new Date().toISOString().slice(0, 10)

type Period = 'day' | 'week' | 'month'
type ReportTab = 'sales' | 'daily' | 'shift' | 'inventory' | 'stock' | 'products' | 'credit' | 'voids'

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

// ── Stat card helper ──────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">{label}</div>
        <div className={cn('text-2xl font-bold', color)}>{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  )
}

// ── Daily Summary Tab ─────────────────────────────────────────────────────────

function DailyTab() {
  const [reportDate, setReportDate] = useState(today())
  const { data, isLoading } = useDailySummary({ report_date: reportDate })

  return (
    <div id="print-area" className="space-y-5">
      <div className="flex items-center gap-3 no-print">
        <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="w-44 h-8 text-sm" />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Revenue" value={fmt(data.total_revenue)} sub={`${data.total_orders} orders`} />
            <Stat label="Avg Order" value={fmt(data.avg_order_value)} />
            <Stat label="Discounts" value={fmt(data.total_discount)} color="text-amber-600" />
            <Stat label="Voids" value={`${data.total_voids}`} sub={fmt(data.void_amount)} color="text-red-600" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Payment Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.by_payment.length === 0 ? (
                  <p className="text-sm text-gray-400">No sales</p>
                ) : data.by_payment.map(row => (
                  <div key={row.method} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium capitalize">{row.method}</div>
                      <div className="text-xs text-gray-400">{row.count} transactions</div>
                    </div>
                    <div className="text-sm font-semibold">{fmt(row.total)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">By Cashier</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.by_cashier.length === 0 ? (
                  <p className="text-sm text-gray-400">No sales</p>
                ) : data.by_cashier.map(row => (
                  <div key={row.cashier_id} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{row.cashier_name}</div>
                      <div className="text-xs text-gray-400">{row.count} sales</div>
                    </div>
                    <div className="text-sm font-semibold">{fmt(row.total)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {data.top_products.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Top Products</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-gray-500 border-b">{['Product', 'Qty', 'Revenue'].map(h => <th key={h} className="text-left pb-2 pr-4">{h}</th>)}</tr></thead>
                    <tbody>
                      {data.top_products.map((p, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium">{p.name}</td>
                          <td className="py-2 pr-4">{p.qty}</td>
                          <td className="py-2 font-semibold">{fmt(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ── Shift Report Tab ──────────────────────────────────────────────────────────

function ShiftTab() {
  const [reportDate, setReportDate] = useState(today())
  const { data: shifts = [], isLoading } = useShiftReport({ report_date: reportDate })

  const totalSales = shifts.reduce((s, r) => s + r.sales_total, 0)
  const totalVariance = shifts.reduce((s, r) => s + (r.variance ?? 0), 0)

  return (
    <div id="print-area" className="space-y-5">
      <div className="flex items-center gap-3 no-print">
        <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="w-44 h-8 text-sm" />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : shifts.length === 0 ? (
        <p className="text-sm text-gray-400">No shifts recorded for this date.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Cashiers" value={`${shifts.length}`} />
            <Stat label="Total Sales" value={fmt(totalSales)} />
            <Stat
              label="Net Float Variance"
              value={fmt(totalVariance)}
              color={totalVariance >= 0 ? 'text-green-700' : 'text-red-600'}
              sub={totalVariance >= 0 ? 'surplus' : 'shortage'}
            />
          </div>

          {shifts.map(shift => {
            const hours = shift.clock_out
              ? ((new Date(shift.clock_out).getTime() - new Date(shift.clock_in).getTime()) / 3_600_000).toFixed(1)
              : null
            return (
              <Card key={shift.attendance_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{shift.user_name}</CardTitle>
                    <span className="text-xs text-gray-400">
                      {fmtTime(shift.clock_in)} — {shift.clock_out ? fmtTime(shift.clock_out) : 'Active'}
                      {hours && ` (${hours}h)`}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div><div className="text-xs text-gray-500 mb-0.5">Sales</div><div className="font-semibold">{fmt(shift.sales_total)}</div><div className="text-xs text-gray-400">{shift.sales_count} orders</div></div>
                    <div><div className="text-xs text-gray-500 mb-0.5">Opening Float</div><div className="font-semibold">{shift.opening_float != null ? fmt(shift.opening_float) : '—'}</div></div>
                    <div><div className="text-xs text-gray-500 mb-0.5">Expected Cash</div><div className="font-semibold">{fmt(shift.expected_cash)}</div><div className="text-xs text-gray-400">Float + Cash Sales</div></div>
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Closing Cash</div>
                      <div className="font-semibold">{shift.closing_cash != null ? fmt(shift.closing_cash) : '—'}</div>
                      {shift.variance != null && (
                        <div className={cn('text-xs font-bold', shift.variance >= 0 ? 'text-green-700' : 'text-red-600')}>
                          {shift.variance >= 0 ? '+' : ''}{fmt(shift.variance)} variance
                        </div>
                      )}
                    </div>
                  </div>
                  {shift.shift_notes && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-xs text-gray-600 italic">{shift.shift_notes}</div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </>
      )}
    </div>
  )
}

// ── Sales Tab ─────────────────────────────────────────────────────────────────

function SalesTab({ period }: { period: Period }) {
  const { data: summary = [], isLoading: sumLoading } = useAnalyticsSummary({ period })
  const { data: byPayment = [], isLoading: pmtLoading } = useAnalyticsByPayment({ period })
  const { data: byCashier = [], isLoading: cashLoading } = useAnalyticsByCashier({ period })

  const totalRevenue = summary.reduce((s, d) => s + d.revenue, 0)
  const totalTx = summary.reduce((s, d) => s + d.transactions, 0)
  const totalDiscount = summary.reduce((s, d) => s + d.discount_total, 0)

  return (
    <div id="print-area" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Revenue" value={fmt(totalRevenue)} />
        <Stat label="Transactions" value={totalTx.toLocaleString()} sub={`Avg ${fmt(totalTx ? totalRevenue / totalTx : 0)}`} />
        <Stat label="Discounts Given" value={fmt(totalDiscount)} color="text-red-600" />
      </div>

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Critical Items" value={`${critical.length}`} color="text-red-600" />
        <Stat label="Out of Stock" value={`${outOfStock.length}`} color="text-red-600" />
        <Stat label="Dead Stock Items" value={`${aging.filter(a => a.aging_bucket === 'dead').length}`} color="text-amber-600" />
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
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', { critical: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700', watch: 'bg-yellow-100 text-yellow-700', no_sales: 'bg-gray-100 text-gray-600', ok: 'bg-green-100 text-green-700' }[r.urgency] || 'bg-gray-100 text-gray-600')}>{r.urgency}</span>
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

// ── Stock Levels Tab ──────────────────────────────────────────────────────────

function StockTab() {
  const [includeZero, setIncludeZero] = useState(false)
  const { data: items = [], isLoading } = useStockLevels({ include_zero: includeZero })

  const totalValue = items.reduce((s, i) => s + i.stock_value, 0)
  const outOfStock = items.filter(i => i.status === 'out_of_stock').length
  const lowStock = items.filter(i => i.status === 'low').length

  return (
    <div id="print-area" className="space-y-5">
      <div className="flex items-center gap-3 no-print">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={includeZero} onChange={e => setIncludeZero(e.target.checked)} className="rounded" />
          Include out-of-stock
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Total Stock Value" value={fmt(totalValue)} />
        <Stat label="Low Stock" value={`${lowStock}`} color="text-amber-600" />
        <Stat label="Out of Stock" value={`${outOfStock}`} color="text-red-600" />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Current Stock Levels</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : items.length === 0 ? (
            <p className="text-sm text-gray-400">No stock data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    {['Product', 'Category', 'Qty', 'Min', 'Cost', 'Value', 'Status'].map(h => (
                      <th key={h} className="text-left pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={`${item.product_id}-${item.branch_id}`} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-3 font-medium">
                        {item.product_name}
                        {item.sku && <span className="text-gray-400 ml-1 text-xs">({item.sku})</span>}
                        {item.branch_name && <div className="text-xs text-gray-400">{item.branch_name}</div>}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 text-xs">{item.category_name || '—'}</td>
                      <td className="py-2 pr-3 font-semibold">{item.quantity}</td>
                      <td className="py-2 pr-3 text-gray-500">{item.min_stock}</td>
                      <td className="py-2 pr-3 text-gray-500">{fmt(item.cost)}</td>
                      <td className="py-2 pr-3 font-semibold">{fmt(item.stock_value)}</td>
                      <td className="py-2">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase', {
                          ok: 'bg-green-100 text-green-700',
                          low: 'bg-amber-100 text-amber-700',
                          out_of_stock: 'bg-red-100 text-red-700',
                        }[item.status])}>
                          {item.status === 'out_of_stock' ? 'Out' : item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface AnalyticsProductItem {
  product_id: number
  product_name: string
  sku?: string
  qty_sold: number
  revenue: number
  cost: number
  profit: number
  profit_margin: number
}

function useAnalyticsProducts(params: { period?: string; sort_by?: string }) {
  return useQuery<AnalyticsProductItem[]>({
    queryKey: ['analytics-products', params],
    queryFn: () => api.get('/analytics/products', { params }).then(r => r.data),
    staleTime: 30_000,
  })
}

function ProductsTab({ period }: { period: Period }) {
  const [sortBy, setSortBy] = useState<'revenue' | 'profit' | 'qty'>('revenue')
  const { data: products = [], isLoading } = useAnalyticsProducts({ period, sort_by: sortBy })

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

function useCreditSummaryReport() {
  return useQuery({
    queryKey: ['credit-summary'],
    queryFn: () => api.get('/customers/credit/summary').then(r => r.data),
    staleTime: 30_000,
  })
}

function CreditTab() {
  const { data: summary = [], isLoading } = useCreditSummaryReport()
  const totalOutstanding = (summary as Array<{ credit_balance: number }>).reduce((s, c) => s + c.credit_balance, 0)
  const totalPaid = (summary as Array<{ total_paid: number }>).reduce((s, c) => s + c.total_paid, 0)

  return (
    <div id="print-area" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat label="Total Outstanding" value={fmt(totalOutstanding)} color="text-red-600" />
        <Stat label="Total Paid Back" value={fmt(totalPaid)} color="text-green-700" />
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

// ── Void Log Tab ──────────────────────────────────────────────────────────────

function VoidsTab() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(today())
  const { data: voids = [], isLoading } = useVoidLog({ date_from: dateFrom, date_to: dateTo })

  const totalVoidAmount = voids.reduce((s, v) => s + v.total, 0)

  return (
    <div id="print-area" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">From</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">To</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40 h-8 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total Voids" value={`${voids.length}`} color="text-red-600" />
        <Stat label="Void Amount" value={fmt(totalVoidAmount)} color="text-red-600" />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Void & Refund Log</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Loader2 size={16} className="animate-spin text-gray-400" /> : voids.length === 0 ? (
            <p className="text-sm text-gray-400">No voids in this date range</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    {['Order #', 'Date', 'Cashier', 'Voided By', 'Amount', 'Method', 'Reason'].map(h => (
                      <th key={h} className="text-left pb-2 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {voids.map(v => (
                    <tr key={v.order_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-3 font-mono text-xs">{v.order_number}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500">
                        {v.voided_at ? new Date(v.voided_at).toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="py-2 pr-3">{v.cashier_name || '—'}</td>
                      <td className="py-2 pr-3 text-gray-500">{v.voided_by_name || '—'}</td>
                      <td className="py-2 pr-3 font-semibold text-red-600">{fmt(v.total)}</td>
                      <td className="py-2 pr-3 capitalize text-xs">{v.payment_method}</td>
                      <td className="py-2 text-xs text-gray-500 max-w-[160px] truncate">{v.void_reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS: { id: ReportTab; label: string; icon: React.ElementType; roles: string[]; featureFlag?: string }[] = [
  { id: 'daily',     label: 'Daily',     icon: CalendarDays, roles: ['admin', 'manager'] },
  { id: 'shift',     label: 'Shift',     icon: Users,        roles: ['admin', 'manager'] },
  { id: 'sales',     label: 'Sales',     icon: TrendingUp,   roles: ['admin', 'manager'] },
  { id: 'products',  label: 'Products',  icon: BarChart3,    roles: ['admin', 'manager'] },
  { id: 'stock',     label: 'Stock',     icon: Layers,       roles: ['admin', 'manager', 'stock'], featureFlag: 'inventory_analytics' },
  { id: 'inventory', label: 'Reorder',   icon: Package,      roles: ['admin', 'manager', 'stock'], featureFlag: 'inventory_analytics' },
  { id: 'voids',     label: 'Voids',     icon: Ban,          roles: ['admin', 'manager'] },
  { id: 'credit',    label: 'Credit',    icon: CreditCard,   roles: ['admin', 'manager'], featureFlag: 'credit_system' },
]

export function ReportsPage() {
  const { user } = useAuthStore()
  const hasReports = useFeature('advanced_reports')
  const flags = useFeatureFlags()
  const [tab, setTab] = useState<ReportTab>('daily')
  const [period, setPeriod] = useState<Period>('month')

  if (!hasReports) {
    return <UpgradeWall feature="Advanced Reports" description="Get full sales analytics, inventory insights, product performance, and credit reports. Upgrade your plan to unlock reporting." />
  }

  const allowedTabs = TABS.filter(t => {
    if (!user || !t.roles.includes(user.role)) return false
    if (t.featureFlag && flags[t.featureFlag] === false) return false
    return true
  })

  const periodTabs: ReportTab[] = ['sales', 'products']
  const showPeriod = periodTabs.includes(tab)

  const tabLabels: Record<ReportTab, string> = {
    daily: 'Daily Sales Summary',
    shift: 'Shift Report',
    sales: `Sales Report — ${period === 'day' ? 'Today' : period === 'week' ? 'Last 7 days' : 'Last 30 days'}`,
    inventory: 'Reorder Suggestions',
    stock: 'Current Stock Levels',
    products: 'Product Performance',
    credit: 'Credit Report',
    voids: 'Void & Refund Log',
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Business intelligence & analytics</p>
        </div>
        <div className="flex items-center gap-3 no-print">
          {showPeriod && (
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

      <div className="overflow-x-auto no-print shrink-0 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
          {allowedTabs.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap',
                  tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                <Icon size={13} />{t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'daily'     && <DailyTab />}
        {tab === 'shift'     && <ShiftTab />}
        {tab === 'sales'     && <SalesTab period={period} />}
        {tab === 'products'  && <ProductsTab period={period} />}
        {tab === 'stock'     && <StockTab />}
        {tab === 'inventory' && <InventoryTab />}
        {tab === 'voids'     && <VoidsTab />}
        {tab === 'credit'    && <CreditTab />}
      </div>
    </div>
  )
}
