import { useNavigate } from 'react-router'
import {
  Receipt, Package, AlertTriangle, Building2, AlertCircle,
  Monitor, BarChart3, UserCheck, Plus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PayBadge } from '@/components/shared/PayBadge'
import { useAuthStore } from '@/stores/auth'
import { useDashboard, useOrders, useBranches } from '@/lib/queries'
import { fmtKES } from '@/lib/data'
import type { Role } from '@/types'

function StatCard({ label, value, sub, icon: Icon, amber = false }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; amber?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-gray-400 font-medium mb-2 uppercase tracking-wider">{label}</div>
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 leading-none">{value}</div>
            {sub && <div className="text-sm text-gray-400 mt-1.5">{sub}</div>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${amber ? 'bg-amber-50' : 'bg-gray-100'}`}>
            <Icon size={20} className={amber ? 'text-amber-600' : 'text-gray-500'} />
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
  roles: Role[]
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'New Sale',     description: 'Open POS register',     icon: Monitor,   path: '/pos',       roles: ['admin', 'manager', 'cashier'] },
  { label: 'Add Product',  description: 'Stock a new item',       icon: Plus,      path: '/inventory', roles: ['admin', 'manager', 'stock'] },
  { label: 'View Reports', description: 'Sales & analytics',      icon: BarChart3, path: '/reports',   roles: ['admin', 'manager'] },
  { label: 'Customers',    description: 'Manage credit accounts', icon: UserCheck, path: '/customers', roles: ['admin', 'manager', 'cashier'] },
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
      {/* Greeting */}
      <div className="mb-6 sm:mb-7">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
          {greeting}, {user?.name.split(' ')[0]}
        </h1>
        <div className="text-sm sm:text-base text-gray-400 mt-1">
          {new Date().toLocaleDateString('en-KE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-7">
        <StatCard label="Today's Revenue" value={fmtKES(todayRevenue)} sub={`${todayTxCount} transactions`} icon={Receipt} amber />
        <StatCard label="Items Sold" value={itemsSold} sub="today" icon={Package} />
        <StatCard label="Low Stock" value={lowStockCount} sub="need attention" icon={AlertTriangle} />
        {isMultiBranch
          ? <StatCard label="Active Branches" value={branches.filter((b) => b.is_active !== false).length} sub="locations" icon={Building2} />
          : <StatCard label="Customers Served" value={todayTxCount} sub="today" icon={Building2} />
        }
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div className="mb-7 sm:mb-8">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="group flex flex-col items-center justify-center gap-3 p-5 sm:p-6 bg-white border border-gray-200 rounded-xl text-center hover:border-amber-200 hover:shadow-sm active:scale-[0.98] transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-50 group-hover:bg-amber-50 flex items-center justify-center transition-colors">
                    <Icon size={22} className="text-gray-500 group-hover:text-amber-600 transition-colors" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-gray-900 leading-tight">{action.label}</div>
                    <div className="text-[12px] text-gray-400 mt-0.5">{action.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Transactions + right column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-6">
        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-5 py-4 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-bold">Recent Transactions</CardTitle>
              <Badge variant="secondary">Today</Badge>
            </div>
          </CardHeader>
          <div>
            {orders?.length
              ? orders.map((o) => (
                  <div key={o.id} className="flex justify-between items-center px-5 py-4 border-b border-gray-50 last:border-0">
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
              : (
                <div className="px-5 py-10 text-center text-sm text-gray-400">
                  No transactions today yet
                </div>
              )
            }
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="font-bold text-base mb-4">Payment Methods</div>
              {payBreak.filter((p) => p.count > 0).length > 0
                ? payBreak.filter((p) => p.count > 0).map((p) => (
                    <div key={p.m} className="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <PayBadge method={p.m as 'cash' | 'mpesa' | 'credit' | 'split' | 'other'} />
                        <span className="text-sm text-gray-500">{p.count} tx</span>
                      </div>
                      <span className="font-semibold text-sm">{fmtKES(p.total)}</span>
                    </div>
                  ))
                : <div className="text-sm text-gray-400 py-2">No sales recorded today</div>
              }
            </CardContent>
          </Card>

          {lowStockCount > 0 && (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={18} className="text-amber-600" />
                  <div className="font-bold text-amber-900 text-base">Low Stock Alert</div>
                </div>
                {dashData?.top_products?.slice(0, 4).map((p) => (
                  <div key={p.product_id} className="flex justify-between text-sm py-1.5 border-b border-amber-100 last:border-0">
                    <span className="text-amber-900">{p.product_name}</span>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 border-amber-200 text-amber-900 hover:bg-amber-100 h-10 text-sm"
                  onClick={() => navigate('/inventory')}
                >
                  View Inventory
                </Button>
              </CardContent>
            </Card>
          )}

          {isMultiBranch && (
            <Card>
              <CardContent className="p-5 sm:p-6">
                <div className="font-bold text-base mb-4">Branch Performance</div>
                {branches.map((b) => (
                  <div key={b.id} className="mb-4 last:mb-0">
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-gray-500">{b.location}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '50%' }} />
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
