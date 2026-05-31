import { useNavigate } from 'react-router'
import {
  Package, AlertTriangle, Users, Building2, AlertCircle,
  Monitor, BarChart3, UserCheck, Plus, TrendingUp, TrendingDown, ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PayBadge } from '@/components/shared/PayBadge'
import { useAuthStore } from '@/stores/auth'
import { useDashboard, useOrders, useBranches, useAnalyticsSummary } from '@/lib/queries'
import { fmtKES } from '@/lib/data'
import type { Role } from '@/types'

// ── Lightweight SVG area chart (no dependency, renders on any engine) ────────
function MiniAreaChart({ data, className }: { data: number[]; className?: string }) {
  const w = 240, h = 56
  const series = data.length >= 2 ? data : [0, 0]
  const max = Math.max(...series)
  const min = Math.min(...series, 0)
  const range = max - min || 1
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return [x, y] as const
  })
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5a020" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#f5a020" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#revGrad)" />
      <polyline
        points={line}
        fill="none"
        stroke="#f5a020"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ── Compact secondary metric row ─────────────────────────────────────────────
function MiniStat({ label, value, sub, icon: Icon, tint }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType
  tint: { bg: string; fg: string }
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-xl ring-1 ring-gray-200/70 h-full">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${tint.bg}`}>
        <Icon size={18} className={tint.fg} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide leading-none">{label}</div>
        <div className="text-xl font-bold text-gray-900 leading-tight mt-1">{value}</div>
      </div>
      {sub && <div className="ml-auto text-[11px] text-gray-400 whitespace-nowrap">{sub}</div>}
    </div>
  )
}

interface QuickAction {
  label: string
  description: string
  icon: React.ElementType
  path: string
  roles: Role[]
  tier: 'primary' | 'accent' | 'ghost'
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New Sale',     description: 'Open POS register',     icon: Monitor,   path: '/pos',       roles: ['admin', 'manager', 'cashier'], tier: 'primary' },
  { label: 'Add Product',  description: 'Stock a new item',       icon: Plus,      path: '/inventory', roles: ['admin', 'manager', 'stock'],   tier: 'accent' },
  { label: 'View Reports', description: 'Sales & analytics',      icon: BarChart3, path: '/reports',   roles: ['admin', 'manager'],            tier: 'ghost' },
  { label: 'Customers',    description: 'Manage credit accounts', icon: UserCheck, path: '/customers', roles: ['admin', 'manager', 'cashier'], tier: 'ghost' },
]

const TIER_CLS: Record<QuickAction['tier'], { card: string; chip: string; icon: string; label: string; desc: string }> = {
  primary: {
    card: 'bg-amber-500 border-amber-500 hover:bg-amber-600 hover:border-amber-600 shadow-sm',
    chip: 'bg-white/20',
    icon: 'text-white',
    label: 'text-white',
    desc: 'text-amber-50/90',
  },
  accent: {
    card: 'bg-amber-50 border-amber-200 hover:border-amber-300 hover:bg-amber-100/70',
    chip: 'bg-amber-100',
    icon: 'text-amber-600',
    label: 'text-gray-900',
    desc: 'text-amber-700/70',
  },
  ghost: {
    card: 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm',
    chip: 'bg-gray-100',
    icon: 'text-gray-500',
    label: 'text-gray-900',
    desc: 'text-gray-400',
  },
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const userBranchId = user?.branch ? (Number(user.branch) || undefined) : undefined
  const branchFilter = isAdmin ? undefined : userBranchId

  const { data: dashData } = useDashboard(branchFilter)
  const { data: orders } = useOrders(6)
  const { data: apiBranches } = useBranches()

  // Last 7 days for the revenue trend chart
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(today.getDate() - 6)
  const { data: weekSeries = [] } = useAnalyticsSummary({
    date_from: isoDay(weekAgo),
    date_to: isoDay(today),
    branch_id: branchFilter,
  })

  const branches = apiBranches ?? []
  const isMultiBranch = branches.length > 1

  const todayRevenue = dashData?.today_revenue ?? 0
  const todayTxCount = dashData?.today_transactions ?? 0
  const lowStockCount = dashData?.low_stock_count ?? 0
  const itemsSold = orders?.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0) ?? 0

  // Zero-fill the 7-day window so the chart always has 7 points
  const revByDate = Object.fromEntries(weekSeries.map((d) => [d.date, d.revenue]))
  const dayKeys = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(today.getDate() - (6 - i))
    return isoDay(d)
  })
  const revenueSeries = dayKeys.map((k) => revByDate[k] ?? 0)
  // Today's authoritative figure comes from the dashboard summary
  revenueSeries[6] = todayRevenue
  const prevRevenue = revenueSeries[5]
  const trendPct = prevRevenue > 0 ? ((todayRevenue - prevRevenue) / prevRevenue) * 100 : null
  const trendUp = (trendPct ?? 0) >= 0
  const hasWeekData = revenueSeries.some((v) => v > 0)
  const peakRevenue = Math.max(...revenueSeries)
  const avgSale = todayTxCount > 0 ? todayRevenue / todayTxCount : 0

  const payBreak = dashData?.payment_breakdown
    ? Object.entries(dashData.payment_breakdown).map(([m, v]) => ({ m, ...v })).filter((p) => p.count > 0)
    : []
  const payTotal = payBreak.reduce((s, p) => s + p.total, 0) || 1

  const topProducts = (dashData?.top_products ?? []).slice(0, 5)
  const maxQty = Math.max(...topProducts.map((p) => p.qty_sold), 1)

  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const quickActions = QUICK_ACTIONS.filter((a) => user?.role && a.roles.includes(user.role as Role))

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      {/* Greeting */}
      <div className="mb-5 sm:mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {greeting}, {user?.name.split(' ')[0]}
        </h1>
        <div className="text-sm text-gray-400 mt-1">
          {today.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Hero row: revenue dominates, secondary stats de-emphasized */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-5 sm:mb-6">
        {/* Revenue hero */}
        <Card className="lg:col-span-2 ring-amber-200/60 bg-gradient-to-br from-white to-amber-50/40">
          <CardContent className="p-5 sm:p-6 flex flex-col h-full">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-amber-700/80 font-semibold uppercase tracking-wider">Today's Revenue</div>
                <div className="flex items-end gap-3 mt-2 flex-wrap">
                  <div className="text-4xl sm:text-5xl font-bold text-gray-900 leading-none tracking-tight">
                    {fmtKES(todayRevenue)}
                  </div>
                  {trendPct !== null && (
                    <div className={`inline-flex items-center gap-1 text-sm font-semibold mb-0.5 px-2 py-0.5 rounded-full ${
                      trendUp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {Math.abs(trendPct).toFixed(0)}%
                    </div>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-2">
                  {todayTxCount} transaction{todayTxCount === 1 ? '' : 's'}
                  <span className="text-gray-400"> · vs {fmtKES(prevRevenue)} yesterday</span>
                </div>
              </div>
              {/* In-hero secondary stat — earns the card's width on slow days */}
              <div className="text-right flex-shrink-0 pl-2">
                <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Avg sale</div>
                <div className="text-lg sm:text-xl font-bold text-gray-700 mt-1 leading-none">{fmtKES(avgSale)}</div>
              </div>
            </div>
            {/* 7-day trend — pinned to the bottom so the card never feels empty */}
            <div className="mt-auto pt-5">
              {hasWeekData ? (
                <>
                  <MiniAreaChart data={revenueSeries} className="w-full h-16" />
                  <div className="flex justify-between text-[11px] text-gray-400 mt-1.5">
                    <span>Last 7 days</span>
                    <span>Peak {fmtKES(peakRevenue)}</span>
                  </div>
                </>
              ) : (
                <div className="h-16 rounded-lg border border-dashed border-amber-200 flex items-center justify-center text-[12px] text-gray-400">
                  No sales in the last 7 days
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Secondary metrics — slim, tinted, clearly subordinate */}
        <div className="grid grid-rows-3 gap-3">
          <MiniStat label="Items Sold" value={itemsSold} sub="today" icon={Package}
            tint={{ bg: 'bg-blue-50', fg: 'text-blue-600' }} />
          <MiniStat label="Low Stock" value={lowStockCount} sub={lowStockCount > 0 ? 'attention' : 'all good'} icon={AlertTriangle}
            tint={lowStockCount > 0 ? { bg: 'bg-orange-50', fg: 'text-orange-600' } : { bg: 'bg-gray-100', fg: 'text-gray-400' }} />
          {isMultiBranch
            ? <MiniStat label="Active Branches" value={branches.filter((b) => b.is_active !== false).length} sub="locations" icon={Building2}
                tint={{ bg: 'bg-violet-50', fg: 'text-violet-600' }} />
            : <MiniStat label="Customers Served" value={todayTxCount} sub="today" icon={Users}
                tint={{ bg: 'bg-emerald-50', fg: 'text-emerald-600' }} />
          }
        </div>
      </div>

      {/* Quick Actions — compact, tiered by importance */}
      {quickActions.length > 0 && (
        <div className="mb-5 sm:mb-6">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Quick Actions</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              const t = TIER_CLS[action.tier]
              return (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className={`group flex items-center gap-3 px-4 py-3.5 border rounded-xl text-left active:scale-[0.98] transition-all ${t.card}`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${t.chip}`}>
                    <Icon size={18} className={t.icon} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-[13px] font-semibold leading-tight ${t.label}`}>{action.label}</div>
                    <div className={`text-[11px] mt-0.5 truncate ${t.desc}`}>{action.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Lower grid: transactions (dominant) + insights column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Recent Transactions */}
        <Card className="lg:col-span-2 py-0">
          <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100">
            <div className="text-base font-bold text-gray-900">Recent Transactions</div>
            <Badge variant="secondary">Today</Badge>
          </div>
          <div>
            {orders?.length
              ? orders.map((o) => (
                  <div key={o.id} className="flex justify-between items-center px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <div>
                      <div className="font-bold font-mono text-sm">#{o.order_number}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {o.cashier_name} · {new Date(o.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <PayBadge method={o.payment_method} />
                      <span className="font-bold text-sm min-w-[75px] text-right">{fmtKES(o.total)}</span>
                    </div>
                  </div>
                ))
              : <div className="px-5 py-12 text-center text-sm text-gray-400">No transactions today yet</div>
            }
          </div>
        </Card>

        {/* Insights column */}
        <div className="flex flex-col gap-4">
          {/* Top selling products */}
          <Card>
            <CardContent className="p-5">
              <div className="font-bold text-base text-gray-900 mb-4">Top Selling Products</div>
              {topProducts.length > 0 ? (
                <div className="space-y-3">
                  {topProducts.map((p) => (
                    <div key={p.product_id}>
                      <div className="flex justify-between items-baseline gap-2 mb-1">
                        <span className="text-sm text-gray-700 truncate">{p.product_name}</span>
                        <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">{p.qty_sold} sold</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(p.qty_sold / maxQty) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-gray-400 py-2">No sales recorded yet</div>}
            </CardContent>
          </Card>

          {/* Payment methods with proportion bars */}
          <Card>
            <CardContent className="p-5">
              <div className="font-bold text-base text-gray-900 mb-4">Payment Methods</div>
              {payBreak.length > 0 ? (
                <div className="space-y-3">
                  {payBreak.map((p) => (
                    <div key={p.m}>
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <PayBadge method={p.m as 'cash' | 'mpesa' | 'credit' | 'split' | 'other'} />
                          <span className="text-xs text-gray-400">{p.count} tx</span>
                        </div>
                        <span className="font-semibold text-sm">{fmtKES(p.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-800 rounded-full" style={{ width: `${(p.total / payTotal) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-sm text-gray-400 py-2">No sales recorded today</div>}
            </CardContent>
          </Card>

          {/* Low stock alert */}
          {lowStockCount > 0 && (
            <Card className="bg-amber-50 ring-amber-200">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={18} className="text-amber-600" />
                  <div className="font-bold text-amber-900 text-base">Low Stock Alert</div>
                </div>
                <div className="text-sm text-amber-800/90 mb-3">
                  {lowStockCount} item{lowStockCount === 1 ? '' : 's'} need restocking.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-amber-300 text-amber-900 hover:bg-amber-100"
                  onClick={() => navigate('/inventory')}
                >
                  View Inventory <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
