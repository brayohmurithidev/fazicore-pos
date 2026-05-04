import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  LayoutDashboard, Monitor, Package, Receipt, Building2, Settings,
  ChevronLeft, ChevronRight, LogOut, BarChart3, UserCheck, Menu, X, Clock,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useBranches, useDashboard, useOrgInfo, useClockOut } from '@/lib/queries'
import { useFeatureFlags } from '@/hooks/useFeature'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import type { Role } from '@/types'
import { cn } from '@/lib/utils'

interface NavItem {
  id: string
  label: string
  icon: React.ElementType
  path: string
  roles: Role[]
}

const NAV: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard, path: '/dashboard',  roles: ['admin', 'manager'] },
  { id: 'pos',        label: 'POS',        icon: Monitor,         path: '/pos',        roles: ['admin', 'manager', 'cashier'] },
  { id: 'inventory',  label: 'Inventory',  icon: Package,         path: '/inventory',  roles: ['admin', 'manager', 'stock'] },
  { id: 'sales',      label: 'Sales',      icon: Receipt,         path: '/sales',      roles: ['admin', 'manager'] },
  { id: 'customers',  label: 'Customers',  icon: UserCheck,       path: '/customers',  roles: ['admin', 'manager', 'cashier'] },
  { id: 'reports',    label: 'Reports',    icon: BarChart3,       path: '/reports',    roles: ['admin', 'manager', 'stock'] },
  { id: 'branches',   label: 'Branches',   icon: Building2,       path: '/branches',   roles: ['admin'] },
  { id: 'settings',   label: 'Settings',   icon: Settings,        path: '/settings',   roles: ['admin'] },
]

function fmtTime(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function AppShell() {
  const { user, logout, attendanceId, clockInTime, setClockOut } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const { data: liveBranches = [] } = useBranches()
  const { data: dashData } = useDashboard()
  const { data: orgInfo } = useOrgInfo()
  const seedFromOrg = useSettingsStore((s) => s.seedFromOrg)
  const featureFlags = useFeatureFlags()
  const clockOutMutation = useClockOut()

  useInactivityLogout(15 * 60 * 1000)

  useEffect(() => {
    if (orgInfo) seedFromOrg(orgInfo)
  }, [orgInfo, seedFromOrg])

  if (!user) return null

  const isAdmin = user.role === 'admin'
  const isMultiBranch = liveBranches.length > 1
  const userBranchId = user.branch ? Number(user.branch) : null

  const branchName = (isAdmin || !isMultiBranch)
    ? null
    : (liveBranches.find((b) => b.id === userBranchId)?.name ?? user.branch_name ?? null)

  const allowedNav = NAV.filter((n) => {
    if (!n.roles.includes(user.role)) return false
    if (n.id === 'branches' && !isMultiBranch) return false
    if (n.id === 'customers' && featureFlags.credit_system === false) return false
    if (n.id === 'audit' && featureFlags.audit_logs === false) return false
    if (n.id === 'reports' && featureFlags.advanced_reports === false) return false
    return true
  })

  const lowStockCount = dashData?.low_stock_count ?? 0
  const clockDisplay = fmtTime(clockInTime)
  const isClockedIn = attendanceId != null && clockInTime != null

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleClockOut = () => {
    if (!attendanceId) return
    clockOutMutation.mutate(
      { attendance_id: attendanceId },
      { onSettled: () => setClockOut() }
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-gray-900 flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden',
          'fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-64 md:w-[68px]' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
            <Monitor size={18} className="text-gray-900" />
          </div>
          {!collapsed && (
            <div className="flex-1">
              <div className="text-[15px] font-extrabold text-white tracking-tight">Fazi POS</div>
              <div className="text-xs text-white/40">Fazilabs</div>
            </div>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden ml-auto text-white/40 hover:text-white/80 p-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
          {allowedNav.map((item) => {
            const Icon = item.icon
            const showBadge = item.id === 'inventory' && lowStockCount > 0
            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'relative w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-1 text-[15px] font-semibold transition-colors',
                    collapsed ? 'justify-center' : '',
                    isActive
                      ? 'bg-white/12 text-white'
                      : 'text-white/55 hover:bg-white/7 hover:text-white/80'
                  )
                }
              >
                <Icon size={21} className="flex-shrink-0" />
                {!collapsed && <span className="flex-1 whitespace-nowrap">{item.label}</span>}
                {showBadge && !collapsed && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-px rounded-full">
                    {lowStockCount}
                  </span>
                )}
                {showBadge && collapsed && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User + actions */}
        <div className="px-2 py-2.5 border-t border-white/10">
          {!collapsed && (
            <div className="px-3 py-2 mb-1 overflow-hidden">
              <div className="flex items-center gap-2.5">
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarFallback className="bg-white/15 text-white text-xs font-bold">
                    {user.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="overflow-hidden flex-1">
                  <div className="text-xs font-semibold text-white truncate">{user.name}</div>
                  <div className="text-[10px] text-white/40">{branchName}</div>
                </div>
              </div>
              {isClockedIn && clockDisplay && (
                <div className="flex items-center justify-between mt-2 px-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                    <span>In since {clockDisplay}</span>
                  </div>
                  <button
                    onClick={handleClockOut}
                    disabled={clockOutMutation.isPending}
                    title="Clock Out"
                    className="text-[10px] text-white/40 hover:text-orange-400 transition-colors disabled:opacity-50 flex items-center gap-0.5"
                  >
                    <Clock size={10} />
                    <span>Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-md bg-white/7 text-white/50 hover:text-white/80 text-xs mb-1"
          >
            {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span>Collapse</span></>}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-white/40 hover:text-white/70 text-xs"
          >
            <LogOut size={14} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="h-13 bg-white border-b border-gray-200 flex items-center px-4 sm:px-5 gap-3 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          {isClockedIn && clockDisplay && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span>In since {clockDisplay}</span>
            </div>
          )}
          {branchName && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <Building2 size={13} />
              <span>{branchName}</span>
            </div>
          )}
          <NotificationBell />
          <div className="w-px h-5 bg-gray-200" />
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7">
              <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-bold">
                {user.avatar}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-xs font-semibold text-gray-900">{user.name.split(' ')[0]}</span>
            <RoleBadge role={user.role} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
