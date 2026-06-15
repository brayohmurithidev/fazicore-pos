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
import { ExpendituresPage } from '@/pages/expenditures/ExpendituresPage'
import { SuppliersPage } from '@/pages/suppliers/SuppliersPage'
import { PurchaseOrdersPage } from '@/pages/purchase-orders/PurchaseOrdersPage'
import { StockTransfersPage } from '@/pages/stock-transfers/StockTransfersPage'
import { EtimsPage } from '@/pages/etims/EtimsPage'
import { LoyaltyPage } from '@/pages/loyalty/LoyaltyPage'
import { AttendancePage } from '@/pages/attendance/AttendancePage'
import { ProfilePage } from '@/pages/profile/ProfilePage'
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
      { path: '/audit',        element: <RequireRole allow={['admin']}><AuditPage /></RequireRole> },
      { path: '/expenditures', element: <RequireRole allow={['admin','manager']}><ExpendituresPage /></RequireRole> },
      { path: '/suppliers',        element: <RequireRole allow={['admin','manager']}><SuppliersPage /></RequireRole> },
      { path: '/purchase-orders',  element: <RequireRole allow={['admin','manager']}><PurchaseOrdersPage /></RequireRole> },
      { path: '/stock-transfers',  element: <RequireRole allow={['admin','manager']}><StockTransfersPage /></RequireRole> },
      { path: '/etims',       element: <RequireRole allow={['admin','manager']}><EtimsPage /></RequireRole> },
      { path: '/loyalty',    element: <RequireRole allow={['admin','manager']}><LoyaltyPage /></RequireRole> },
      { path: '/attendance', element: <RequireRole allow={['admin','manager']}><AttendancePage /></RequireRole> },
      { path: '/settings',   element: <RequireRole allow={['admin','manager','cashier','stock']}><SettingsPage /></RequireRole> },
      { path: '/profile',    element: <RequireAuth><ProfilePage /></RequireAuth> },
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
