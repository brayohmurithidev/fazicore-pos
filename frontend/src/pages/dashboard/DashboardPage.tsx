import { useNavigate } from 'react-router'
import {
  Receipt, Package, AlertTriangle, Building2, AlertCircle,
  Monitor, BarChart3, UserCheck, Plus, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PayBadge } from '@/components/shared/PayBadge'
import { useAuthStore } from '@/stores/auth'
import { useDashboard, useOrders, useBranches } from '@/lib/queries'
import { fmtKES } from '@/lib/data'
import type { Role } from '@/types'

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

interface QuickAction {
  label: string
  description: string
  icon: React.ElementType
  path: string
  accent: string
  roles: Role[]
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New Sale',       description: 'Open POS register',       icon: Monitor,   path: '/pos',       accent: '#111827', roles: ['admin', 'manager', 'cashier'] },
  { label: 'Add Product',    description: 'Stock a new item',         icon: Plus,      path: '/inventory', accent: '#8B5CF6', roles: ['admin', 'manager', 'stock'] },
  { label: 'View Reports',   description: 'Sales & analytics',        icon: BarChart3, path: '/reports',   accent: '#3B82F6', roles: ['admin', 'manager'] },
  { label: 'Customers',      description: 'Manage credit accounts',   icon: UserCheck, path: '/customers', accent: '#059669', roles: ['admin', 'manager', 'cashier'] },
]

export function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const userBranchId = user?.branch ? (Number(user.branch) || undefined) : undefined
  const { data: dashData } = useDashboard(isAdmin ? undefined : userBranchId)
  const { data: orders } = useOrders(6)
  const { data: apiBranches } = useBranches()

  const branches = apiBranches ?? []
  const isMultiBranch = branches.length > 1

  const todayRevenue = dashData?.today_revenue ?? 0
  const todayTxCount = dashData?.today_transactions ?? 0
  const lowStockCount = dashData?.low_stock_count ?? 0
  const itemsSold = orders?.reduce((s, o) => s + o.items.reduce((si, i) => si + i.quantity, 0), 0) ?? 0

  const payBreak = dashData?.payment_breakdown
    ? Object.entries(dashData.payment_breakdown).map(([m, v]) => ({ m, ...v }))
    : []

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  const quickActions = QUICK_ACTIONS.filter((a) => user?.role && a.roles.includes(user.role as Role))

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl font-bold text-gray-900">
          {greeting}, {user?.name.split(' ')[0]}
        </h1>
        <div className="text-sm text-gray-400 mt-0.5">
          {new Date().toLocaleDateString('en-KE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 mb-5 sm:mb-6">
        <StatCard label="Today's Revenue" value={fmtKES(todayRevenue)} sub={`${todayTxCount} transactions`} icon={Receipt} accent="#3B82F6" />
        <StatCard label="Items Sold" value={itemsSold} sub="today" icon={Package} accent="#8B5CF6" />
        <StatCard label="Low Stock" value={lowStockCount} sub="need attention" icon={AlertTriangle} accent="#EF4444" />
        {isMultiBranch
          ? <StatCard label="Active Branches" value={branches.filter((b) => b.is_active !== false).length} sub="locations" icon={Building2} accent="#059669" />
          : <StatCard label="Customers Served" value={todayTxCount} sub="today" icon={Building2} accent="#059669" />
        }
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2.5">Quick Actions</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="group flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-gray-400 hover:shadow-sm transition-all"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                    style={{ background: action.accent + '15' }}
                  >
                    <Icon size={18} style={{ color: action.accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 leading-none mb-0.5">{action.label}</div>
                    <div className="text-[11px] text-gray-400 truncate">{action.description}</div>
                  </div>
                  <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Transactions + right column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-6">
        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-[18px] py-3.5 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-bold">Recent Transactions</CardTitle>
              <Badge variant="secondary">Today</Badge>
            </div>
          </CardHeader>
          <div>
            {orders?.length
              ? orders.map((o) => (
                  <div key={o.id} className="flex justify-between items-center px-[18px] py-2.5 border-b border-gray-50 text-sm last:border-0">
                    <div>
                      <div className="font-semibold font-mono text-xs">#{o.order_number}</div>
                      <div className="text-[11px] text-gray-400">
                        {o.cashier_name} · {new Date(o.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PayBadge method={o.payment_method} />
                      <span className="font-bold min-w-[70px] text-right">{fmtKES(o.total)}</span>
                    </div>
                  </div>
                ))
              : (
                <div className="px-[18px] py-8 text-center text-sm text-gray-400">
                  No transactions today yet
                </div>
              )
            }
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="font-bold text-sm mb-3.5">Payment Methods</div>
              {payBreak.filter((p) => p.count > 0).length > 0
                ? payBreak.filter((p) => p.count > 0).map((p) => (
                    <div key={p.m} className="flex justify-between items-center mb-2.5 last:mb-0">
                      <div className="flex items-center gap-2">
                        <PayBadge method={p.m as 'cash' | 'mpesa' | 'credit' | 'split' | 'other'} />
                        <span className="text-sm text-gray-500">{p.count} tx</span>
                      </div>
                      <span className="font-semibold text-sm">{fmtKES(p.total)}</span>
                    </div>
                  ))
                : <div className="text-sm text-gray-400">No sales recorded today</div>
              }
            </CardContent>
          </Card>

          {lowStockCount > 0 && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <AlertCircle size={16} className="text-amber-600" />
                  <div className="font-bold text-amber-900 text-sm">Low Stock Alert</div>
                </div>
                {dashData?.top_products?.slice(0, 4).map((p) => (
                  <div key={p.product_id} className="flex justify-between text-sm mb-1.5">
                    <span className="text-amber-900">{p.product_name}</span>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2.5 border-amber-200 text-amber-900 hover:bg-amber-100"
                  onClick={() => navigate('/inventory')}
                >
                  View Inventory
                </Button>
              </CardContent>
            </Card>
          )}

          {isMultiBranch && (
            <Card>
              <CardContent className="p-5">
                <div className="font-bold text-sm mb-3.5">Branch Performance</div>
                {branches.map((b) => (
                  <div key={b.id} className="mb-3 last:mb-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-gray-500">{b.location}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-sm overflow-hidden">
                      <div className="h-full bg-gray-900 rounded-sm" style={{ width: '50%' }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
