import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import type { OrgStatus } from "@/types"

// ── Form field ─────────────────────────────────────────────────────────────────

export function Field({
  label, error, required, children, className,
}: {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-zinc-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  trial:     { label: "Trial",     cls: "bg-amber-50 text-amber-700 border-amber-200" },
  active:    { label: "Active",    cls: "bg-green-50 text-green-700 border-green-200" },
  suspended: { label: "Suspended", cls: "bg-red-50 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
  trialing:  { label: "Trialing",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  past_due:  { label: "Past due",  cls: "bg-red-50 text-red-700 border-red-200" },
  open:      { label: "Open",      cls: "bg-blue-50 text-blue-700 border-blue-200" },
  paid:      { label: "Paid",      cls: "bg-green-50 text-green-700 border-green-200" },
  overdue:   { label: "Overdue",   cls: "bg-red-50 text-red-700 border-red-200" },
  void:      { label: "Void",      cls: "bg-zinc-100 text-zinc-500 border-zinc-200" },
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-500 border-zinc-200" }
  return (
    <span className={cn("inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize", cls, className)}>
      {label}
    </span>
  )
}

// ── Inline form error ──────────────────────────────────────────────────────────

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{message}</p>
}

// ── Native select styling (matches shadcn Input) ───────────────────────────────

export const selectCls =
  "h-8 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 outline-none " +
  "focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"

// ── OrgStatus type re-export for convenience ───────────────────────────────────

export type { OrgStatus }
