import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Building2, Users, Clock, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { fmtDate, cn } from "@/lib/utils";
import type { PlatformStats, Organization, OrgStatus } from "@/types";

const STATUS_BADGE: Record<OrgStatus, string> = {
  trial:     "bg-amber-100 text-amber-700",
  active:    "bg-emerald-100 text-emerald-700",
  suspended: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/admin/stats").then((r) => r.data),
  });

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["admin", "organizations"],
    queryFn: () => api.get("/admin/organizations").then((r) => r.data),
  });

  const recentOrgs = orgs.slice(0, 8);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-1">
          {new Date().toLocaleDateString("en-KE", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Orgs"   value={stats?.total_organizations ?? "—"} icon={Building2}    color="indigo" />
        <StatCard label="Active"       value={stats?.active_organizations  ?? "—"} icon={CheckCircle2} color="emerald" />
        <StatCard label="Trialing"     value={stats?.trial_organizations   ?? "—"} icon={Clock}        color="amber" />
        <StatCard label="Total Users"  value={stats?.total_users           ?? "—"} icon={Users}        color="blue" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Recent Organizations</h2>
          <button
            onClick={() => navigate("/organizations")}
            className="text-xs text-indigo-600 hover:underline"
          >
            View all
          </button>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-4 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-slate-100 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-40 bg-slate-100 rounded" />
                  <div className="h-3 w-24 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : recentOrgs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">No organizations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Users</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrgs.map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => navigate(`/organizations/${org.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 shrink-0">
                          <Building2 className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{org.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{org.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{org.country}</td>
                    <td className="px-4 py-3.5">
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                        STATUS_BADGE[org.status] ?? STATUS_BADGE.cancelled,
                      )}>
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{org.user_count ?? 0}</td>
                    <td className="px-4 py-3.5 text-slate-400 text-xs">{fmtDate(org.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const COLOR_MAP = {
  indigo:  { bg: "bg-indigo-50",  icon: "text-indigo-600"  },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600" },
  amber:   { bg: "bg-amber-50",   icon: "text-amber-600"   },
  blue:    { bg: "bg-blue-50",    icon: "text-blue-600"    },
} as const;

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: keyof typeof COLOR_MAP;
}) {
  const c = COLOR_MAP[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg shrink-0", c.bg)}>
        <Icon className={cn("h-5 w-5", c.icon)} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
