import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { lazy, Suspense } from "react";
import { useAuthStore } from "@/stores/authStore";
import AdminLayout from "@/components/layout/AdminLayout";

const LoginPage           = lazy(() => import("@/features/auth/LoginPage"));
const DashboardPage       = lazy(() => import("@/features/dashboard/DashboardPage"));
const OrganizationsPage   = lazy(() => import("@/features/organizations/OrganizationsPage"));
const OrgDetailPage       = lazy(() => import("@/features/organizations/OrgDetailPage"));
const CustomerOnboardPage = lazy(() => import("@/features/organizations/CustomerOnboardPage"));
const PlansPage           = lazy(() => import("@/features/plans/PlansPage"));

function Loader() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-4 border-zinc-200 border-t-zinc-900 animate-spin" />
        <p className="text-xs font-medium text-slate-400 tracking-wide">Fazicore Admin</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <AdminLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"              element={<DashboardPage />} />
            <Route path="organizations"          element={<OrganizationsPage />} />
            <Route path="organizations/new"      element={<CustomerOnboardPage />} />
            <Route path="organizations/:id"      element={<OrgDetailPage />} />
            <Route path="plans"                  element={<PlansPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
