import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { POSPage } from '@/pages/pos/POSPage'
import { InventoryPage } from '@/pages/inventory/InventoryPage'
import { SalesPage } from '@/pages/sales/SalesPage'
import { BranchesPage } from '@/pages/branches/BranchesPage'
import { UsersPage } from '@/pages/users/UsersPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { CustomersPage } from '@/pages/customers/CustomersPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { AuditPage } from '@/pages/audit/AuditPage'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'

function roleHome(role: string): string {
  if (role === 'cashier') return '/pos'
  if (role === 'stock') return '/inventory'
  return '/dashboard'
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ allow, children }: { allow: Role[]; children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (!allow.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />
  return <>{children}</>
}

function RoleHome() {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(user.role)} replace />
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RoleHome /> },
      { path: '/dashboard',  element: <RequireRole allow={['admin','manager']}><DashboardPage /></RequireRole> },
      { path: '/pos',        element: <RequireRole allow={['admin','manager','cashier']}><POSPage /></RequireRole> },
      { path: '/inventory',  element: <RequireRole allow={['admin','manager','stock']}><InventoryPage /></RequireRole> },
      { path: '/sales',      element: <RequireRole allow={['admin','manager','cashier']}><SalesPage /></RequireRole> },
      { path: '/customers',  element: <RequireRole allow={['admin','manager','cashier']}><CustomersPage /></RequireRole> },
      { path: '/reports',    element: <RequireRole allow={['admin','manager','stock']}><ReportsPage /></RequireRole> },
      { path: '/branches',   element: <RequireRole allow={['admin']}><BranchesPage /></RequireRole> },
      { path: '/users',      element: <RequireRole allow={['admin']}><UsersPage /></RequireRole> },
      { path: '/audit',      element: <RequireRole allow={['admin']}><AuditPage /></RequireRole> },
      { path: '/settings',   element: <RequireRole allow={['admin']}><SettingsPage /></RequireRole> },
    ],
  },
  {
    path: '*',
    element: <RequireAuth><RoleHome /></RequireAuth>,
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
