import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  LayoutDashboard, Monitor, Package, Receipt, Building2, Settings,
  ChevronLeft, ChevronRight, LogOut, BarChart3, UserCheck, Menu, X, Clock, TrendingDown, UserCircle,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Toaster } from '@/components/ui/Toaster'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useBranches, useDashboard, useOrgInfo, useClockOut } from '@/lib/queries'
import { useFeatureFlags } from '@/hooks/useFeature'
import { useInactivityLogout } from '@/hooks/useInactivityLogout'
import { isTauri } from '@/hooks/useTauri'
import { TitleBar } from '@/components/layout/TitleBar'
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
  { id: 'sales',      label: 'Sales',      icon: Receipt,         path: '/sales',      roles: ['admin', 'manager', 'cashier'] },
  { id: 'customers',  label: 'Customers',  icon: UserCheck,       path: '/customers',  roles: ['admin', 'manager', 'cashier'] },
  { id: 'reports',       label: 'Reports',       icon: BarChart3,    path: '/reports',       roles: ['admin', 'manager', 'stock'] },
  { id: 'expenditures', label: 'Expenditures', icon: TrendingDown, path: '/expenditures', roles: ['admin', 'manager'] },
  { id: 'branches',     label: 'Branches',     icon: Building2,    path: '/branches',     roles: ['admin'] },
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
  const [profileOpen, setProfileOpen] = useState(false)
  const profileCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const openProfile = () => {
    if (profileCloseTimer.current) clearTimeout(profileCloseTimer.current)
    setProfileOpen(true)
  }
  const closeProfile = () => {
    profileCloseTimer.current = setTimeout(() => setProfileOpen(false), 150)
  }
  const toggleProfile = () => {
    if (profileCloseTimer.current) clearTimeout(profileCloseTimer.current)
    setProfileOpen((v) => !v)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [profileOpen])

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
    // Branches: show when the multi_branch feature is on (regardless of how many branches exist)
    if (n.id === 'branches' && featureFlags.multi_branch === false) return false
    if (n.id === 'customers' && featureFlags.credit_system === false) return false
    if (n.id === 'audit' && featureFlags.audit_logs === false) return false
    if (n.id === 'reports' && featureFlags.advanced_reports === false) return false
    if (n.id === 'expenditures' && featureFlags.expenditure_tracking === false) return false
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
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {/* Native title bar — only in Tauri desktop */}
      {isTauri && <TitleBar />}

      <div className="flex flex-1 overflow-hidden">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden',
          'fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-64 md:w-[68px]' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="px-3 py-3 border-b border-gray-100 flex items-center gap-2.5 overflow-hidden">
          <img src="/assets/fazistore-icon.svg" alt="Fazi POS" className="w-9 h-9 flex-shrink-0" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-extrabold tracking-tight leading-none">
                <span className="text-gray-900">fazi</span><span className="text-amber-500">store</span>
              </div>
              <div className="text-[9.5px] font-semibold tracking-[0.15em] text-gray-400 uppercase mt-0.5">
                Point of Sale &amp; Inventory
              </div>
            </div>
          )}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden ml-auto text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
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
                    'relative w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl mb-1 text-[14px] font-semibold transition-colors',
                    collapsed ? 'justify-center' : '',
                    isActive
                      ? 'bg-amber-50 text-gray-900'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                {({ isActive }: { isActive: boolean }) => (
                  <>
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
                      isActive ? 'bg-amber-100' : 'bg-gray-100'
                    )}>
                      <Icon size={20} className="text-amber-500" />
                    </div>
                    {!collapsed && <span className="flex-1 whitespace-nowrap">{item.label}</span>}
                    {showBadge && !collapsed && (
                      <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-px rounded-full">
                        {lowStockCount}
                      </span>
                    )}
                    {showBadge && collapsed && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* User + actions */}
        <div className="border-t border-gray-100 px-2 pt-2 pb-3">
          {/* User row */}
          {collapsed ? (
            <div className="flex flex-col items-center gap-1 py-1">
              <Avatar className="w-8 h-8">
                {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
                <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-bold">
                  {user.avatar}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => setCollapsed(false)}
                title="Expand sidebar"
                className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl">
              <Avatar className="w-8 h-8 flex-shrink-0">
                {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
                <AvatarFallback className="bg-amber-100 text-amber-700 text-sm font-bold">
                  {user.avatar}
                </AvatarFallback>
              </Avatar>
              <div className="overflow-hidden flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900 truncate">{user.name}</div>
                <div className="text-[11px] text-gray-400 truncate capitalize">{branchName ?? user.role}</div>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 flex-shrink-0 transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
            </div>
          )}

          {/* Clock status */}
          {!collapsed && isClockedIn && clockDisplay && (
            <div className="flex items-center justify-between mx-2 mt-1 mb-1">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span>In since {clockDisplay}</span>
              </div>
              <button
                onClick={handleClockOut}
                disabled={clockOutMutation.isPending}
                className="text-[11px] text-gray-400 hover:text-amber-600 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <Clock size={10} />
                <span>Clock Out</span>
              </button>
            </div>
          )}

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className={cn(
              'mt-1 flex items-center gap-2 px-2 py-2 rounded-xl text-[12px] text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors',
              collapsed ? 'w-full justify-center' : 'w-full'
            )}
          >
            <LogOut size={14} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-gray-50">
        {/* Topbar */}
        <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 sm:px-5 gap-3 flex-shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-1.5 rounded-md text-gray-400 hover:bg-gray-100"
          >
            <Menu size={17} />
          </button>
          <div className="flex-1" />
          {isClockedIn && clockDisplay && (
            <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-gray-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>In since {clockDisplay}</span>
            </div>
          )}
          {branchName && (
            <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-gray-400">
              <Building2 size={13} />
              <span>{branchName}</span>
            </div>
          )}
          <NotificationBell />
          <div className="w-px h-4 bg-gray-200" />
          <div
            ref={profileRef}
            className="relative"
            onMouseEnter={openProfile}
            onMouseLeave={closeProfile}
          >
            <div
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={toggleProfile}
            >
              <Avatar className="w-7 h-7">
                {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
                <AvatarFallback className="bg-gray-100 text-gray-700 text-xs font-bold">
                  {user.avatar}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline text-[13px] font-semibold text-gray-900">{user.name.split(' ')[0]}</span>
              <RoleBadge role={user.role} />
            </div>

            {profileOpen && (
              <div
                className="absolute right-0 top-[calc(100%+6px)] w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
                onMouseEnter={openProfile}
                onMouseLeave={closeProfile}
              >
                {/* Header */}
                <div className="px-4 py-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-11 h-11 flex-shrink-0">
                      {user.photo_url && <AvatarImage src={user.photo_url} alt={user.name} />}
                      <AvatarFallback className="bg-amber-100 text-amber-700 text-base font-bold">
                        {user.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-gray-900 truncate">{user.name}</div>
                      <div className="mt-1"><RoleBadge role={user.role} /></div>
                    </div>
                  </div>
                </div>

                {/* Info */}
                {(branchName || isClockedIn) && (
                  <div className="px-4 py-3 space-y-2.5 border-b border-gray-100">
                    {branchName && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Building2 size={12} className="text-gray-400 flex-shrink-0" />
                        <span>{branchName}</span>
                      </div>
                    )}
                    {isClockedIn && clockDisplay && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span>In since {clockDisplay}</span>
                        </div>
                        <button
                          onClick={handleClockOut}
                          disabled={clockOutMutation.isPending}
                          className="text-[11px] text-gray-400 hover:text-amber-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <Clock size={10} />
                          <span>Clock out</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="px-3 py-2 space-y-0.5">
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/profile') }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  >
                    <UserCircle size={14} className="text-gray-400" />
                    My Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                  >
                    <LogOut size={14} className="text-gray-400" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <Toaster />
      </div>
    </div>
  )
}
