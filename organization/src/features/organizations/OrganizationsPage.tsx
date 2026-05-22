import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  createColumnHelper, flexRender, type SortingState,
} from "@tanstack/react-table"
import { Building2, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, UserPlus } from "lucide-react"
import api from "@/lib/api"
import { cn, fmtDate } from "@/lib/utils"
import { StatusBadge } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Organization, OrgStatus } from "@/types"

const TABS: { label: string; value: OrgStatus | "all" }[] = [
  { label: "All",       value: "all" },
  { label: "Active",    value: "active" },
  { label: "Trial",     value: "trial" },
  { label: "Suspended", value: "suspended" },
]

const col = createColumnHelper<Organization>()

export default function OrganizationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab]       = useState<OrgStatus | "all">("all")
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: orgs = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["admin", "organizations"],
    queryFn: () => api.get("/admin/organizations").then((r) => r.data),
  })

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/organizations/${id}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "organizations"] }),
  })
  const activateMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/organizations/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "organizations"] }),
  })

  const filtered = useMemo(() => {
    let list = tab === "all" ? orgs : orgs.filter((o) => o.status === tab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q) || o.email.toLowerCase().includes(q),
      )
    }
    return list
  }, [orgs, tab, search])

  const columns = useMemo(() => [
    col.accessor("name", {
      header: "Organization",
      cell: (info) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 shrink-0">
            <Building2 className="h-4 w-4 text-zinc-500" />
          </div>
          <div>
            <p className="font-medium text-zinc-900">{info.getValue()}</p>
            <p className="text-xs text-zinc-400 font-mono">{info.row.original.slug}</p>
          </div>
        </div>
      ),
    }),
    col.accessor("email", {
      header: "Email",
      cell: (info) => <span className="text-zinc-600 text-xs">{info.getValue()}</span>,
    }),
    col.accessor("country", {
      header: "Country",
      cell: (info) => <span className="text-zinc-600">{info.getValue()}</span>,
    }),
    col.accessor("status", {
      header: "Status",
      cell: (info) => <StatusBadge status={info.getValue()} />,
    }),
    col.display({
      id: "usage",
      header: "Usage",
      cell: ({ row: { original: o } }) => (
        <div className="flex gap-3 text-xs text-zinc-500 tabular-nums">
          <span>{o.max_branches === 1 ? "Single" : o.max_branches === null ? `${o.branch_count}/∞ br` : `${o.branch_count}/${o.max_branches} br`}</span>
          <span>{o.user_count}/{o.max_users === null ? "∞" : o.max_users} usr</span>
          <span>{o.active_product_count}/{o.max_products === null ? "∞" : o.max_products} prod</span>
        </div>
      ),
    }),
    col.accessor("created_at", {
      header: "Joined",
      cell: (info) => <span className="text-zinc-400 text-xs">{fmtDate(info.getValue())}</span>,
    }),
    col.display({
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const org = row.original
        const isSuspended = org.status === "suspended" || org.status === "cancelled"
        return (
          <Button
            size="xs"
            variant={isSuspended ? "outline" : "destructive"}
            onClick={(e) => {
              e.stopPropagation()
              if (isSuspended) activateMutation.mutate(org.id)
              else suspendMutation.mutate(org.id)
            }}
          >
            {isSuspended ? "Activate" : "Suspend"}
          </Button>
        )
      },
    }),
  ], [suspendMutation, activateMutation])

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Customers</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{orgs.length} total</p>
        </div>
        <Button
          onClick={() => navigate("/organizations/new")}
          className="bg-zinc-900 text-white hover:bg-zinc-800"
        >
          <UserPlus />
          Onboard Customer
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-0.5 bg-zinc-100 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                tab === t.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, slug or email…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-zinc-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex gap-4 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-zinc-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-40 bg-zinc-100 rounded" />
                  <div className="h-3 w-24 bg-zinc-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="text-left text-xs font-medium text-zinc-500 bg-zinc-50 border-b border-zinc-100">
                    {hg.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 whitespace-nowrap select-none"
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <span className="text-zinc-300">
                              {header.column.getIsSorted() === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : header.column.getIsSorted() === "desc" ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronsUpDown className="h-3 w-3" />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-12 text-sm text-zinc-400">
                      No customers match your filters.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/organizations/${row.original.id}`)}
                      className="hover:bg-zinc-50 cursor-pointer transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3.5">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {table.getPageCount() > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-100 text-xs text-zinc-500">
            <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon-sm" variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
