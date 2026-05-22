import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { Building2, Users, Clock, TrendingUp } from "lucide-react"
import api from "@/lib/api"
import { fmtDate } from "@/lib/utils"
import { StatusBadge } from "@/components/shared"
import type { PlatformStats, Organization } from "@/types"

const STATS: {
  key: keyof PlatformStats
  label: string
  icon: React.ElementType
}[] = [
  { key: "total_organizations", label: "Total orgs",   icon: Building2  },
  { key: "active_organizations", label: "Active",       icon: TrendingUp },
  { key: "trial_organizations",  label: "Trialing",     icon: Clock      },
  { key: "total_users",          label: "Total users",  icon: Users      },
]

export default function DashboardPage() {
  const navigate = useNavigate()

  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get("/admin/stats").then((r) => r.data),
  })

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["admin", "organizations"],
    queryFn: () => api.get("/admin/organizations").then((r) => r.data),
  })

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Platform Overview</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="bg-white rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
              <Icon className="h-4 w-4" />
              <span className="text-xs font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-zinc-900">{stats?.[key] ?? "—"}</p>
          </div>
        ))}
      </div>

      {/* Recent orgs */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-900">Recent Organizations</h2>
          <button
            onClick={() => navigate("/organizations")}
            className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            View all →
          </button>
        </div>

        {isLoading ? (
          <div className="divide-y divide-zinc-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-4 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-zinc-100 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-40 bg-zinc-100 rounded" />
                  <div className="h-3 w-24 bg-zinc-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-12">No organizations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-zinc-500 bg-zinc-50 border-b border-zinc-100">
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Users</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {orgs.slice(0, 8).map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => navigate(`/organizations/${org.id}`)}
                    className="hover:bg-zinc-50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 shrink-0">
                          <Building2 className="h-4 w-4 text-zinc-500" />
                        </div>
                        <div>
                          <p className="font-medium text-zinc-900">{org.name}</p>
                          <p className="text-xs text-zinc-400 font-mono">{org.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600">{org.country}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={org.status} />
                    </td>
                    <td className="px-4 py-3.5 text-zinc-600">{org.user_count ?? 0}</td>
                    <td className="px-4 py-3.5 text-zinc-400 text-xs">{fmtDate(org.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
