import { useState } from "react"
import { useParams, useNavigate } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm, type SubmitHandler } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  ArrowLeft, Building2, Users, CreditCard, Mail, Phone, Globe,
  Plus, Loader2, Package, Pencil, BarChart2, Trash2, Receipt,
  Send, RefreshCw,
} from "lucide-react"
import api from "@/lib/api"
import { cn, fmtDate, fmtMoney } from "@/lib/utils"
import { Field, FormError, StatusBadge, selectCls } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { Organization, OrgUser, Subscription, SubscriptionPlan, Invoice } from "@/types"

// ── Add user ───────────────────────────────────────────────────────────────────

const addUserSchema = z.object({
  full_name: z.string().min(2, "Required"),
  email:     z.string().email("Invalid email").or(z.literal("")).optional(),
  password:  z.string().regex(/^\d{4}$/, "Must be exactly 4 digits"),
  role:      z.enum(["admin", "manager", "staff"]),
})
type AddUserForm = z.infer<typeof addUserSchema>

function AddUserModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<AddUserForm>({ resolver: zodResolver(addUserSchema), defaultValues: { role: "staff" } })

  async function onSubmit(data: AddUserForm) {
    try {
      await api.post(`/admin/organizations/${orgId}/users`, data)
      qc.invalidateQueries({ queryKey: ["admin", "org-users", orgId] })
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError("root", { message: msg ?? "Failed to create user." })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1" noValidate>
          <Field label="Full name" error={errors.full_name?.message} required>
            <Input {...register("full_name")} placeholder="Jane Doe" />
          </Field>
          <Field label="Email (optional)" error={errors.email?.message}>
            <Input {...register("email")} type="email" placeholder="jane@example.com" />
          </Field>
          <Field label="POS PIN (4 digits)" error={errors.password?.message} required>
            <Input {...register("password")} type="password" inputMode="numeric" maxLength={4} placeholder="••••" />
          </Field>
          <Field label="Role" error={errors.role?.message}>
            <select {...register("role")} className={selectCls}>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </Field>
          <FormError message={errors.root?.message} />
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-zinc-900 text-white hover:bg-zinc-800">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Add User
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit user ──────────────────────────────────────────────────────────────────

const editUserSchema = z.object({
  full_name: z.string().min(2, "Required"),
  email:     z.string().email("Invalid email").or(z.literal("")).optional(),
  password:  z.string().regex(/^\d{4}$/, "Must be 4 digits").or(z.literal("")).optional(),
  role:      z.enum(["admin", "manager", "staff"]),
  is_active: z.boolean(),
})
type EditUserForm = z.infer<typeof editUserSchema>

function EditUserModal({ orgId, user, onClose }: { orgId: string; user: OrgUser; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<EditUserForm>({
      resolver: zodResolver(editUserSchema),
      defaultValues: {
        full_name: user.full_name,
        email:     user.email ?? "",
        password:  "",
        role:      user.role as "admin" | "manager" | "staff",
        is_active: user.is_active,
      },
    })

  async function onSubmit(data: EditUserForm) {
    const payload: Record<string, unknown> = { full_name: data.full_name, email: data.email || null, role: data.role, is_active: data.is_active }
    if (data.password) payload.password = data.password
    try {
      await api.patch(`/admin/organizations/${orgId}/users/${user.id}`, payload)
      qc.invalidateQueries({ queryKey: ["admin", "org-users", orgId] })
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError("root", { message: msg ?? "Failed to update user." })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1" noValidate>
          <Field label="Full name" error={errors.full_name?.message} required>
            <Input {...register("full_name")} />
          </Field>
          <Field label="Email (optional)" error={errors.email?.message}>
            <Input {...register("email")} type="email" placeholder="jane@example.com" />
          </Field>
          <Field label="New PIN (blank = keep current)" error={errors.password?.message}>
            <Input {...register("password")} type="password" inputMode="numeric" maxLength={4} placeholder="••••" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" error={errors.role?.message}>
              <select {...register("role")} className={selectCls}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
            <Field label="Status">
              <select {...register("is_active", { setValueAs: (v) => v === "true" || v === true })} className={selectCls}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </Field>
          </div>
          <FormError message={errors.root?.message} />
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-zinc-900 text-white hover:bg-zinc-800">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete user ────────────────────────────────────────────────────────────────

function DeleteUserModal({ orgId, user, onClose }: { orgId: string; user: OrgUser; onClose: () => void }) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  async function confirm() {
    setLoading(true)
    try {
      await api.delete(`/admin/organizations/${orgId}/users/${user.id}`)
      qc.invalidateQueries({ queryKey: ["admin", "org-users", orgId] })
      qc.invalidateQueries({ queryKey: ["admin", "org", orgId] })
      onClose()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to delete user.")
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <p className="text-sm text-zinc-600">
            Delete <span className="font-semibold">{user.full_name}</span>? This cannot be undone.
          </p>
          <FormError message={error} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={confirm}
              disabled={loading}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {loading && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit limits ────────────────────────────────────────────────────────────────

const editLimitsSchema = z.object({
  max_branches: z.coerce.number().int().min(1, "Min 1"),
  max_users:    z.coerce.number().int().min(1, "Min 1"),
  max_products: z.coerce.number().int().min(1, "Min 1"),
})
type EditLimitsForm = z.infer<typeof editLimitsSchema>

function EditLimitsModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<EditLimitsForm>({
      resolver: zodResolver(editLimitsSchema),
      defaultValues: {
        max_branches: org.max_branches ?? undefined,
        max_users:    org.max_users    ?? undefined,
        max_products: org.max_products ?? undefined,
      },
    })

  const onSubmit: SubmitHandler<EditLimitsForm> = async (data) => {
    try {
      await api.patch(`/admin/organizations/${org.id}`, data)
      qc.invalidateQueries({ queryKey: ["admin", "org", org.id] })
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] })
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError("root", { message: msg ?? "Failed to update limits." })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Billing Limits</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1" noValidate>
          <Field label="Max branches" error={errors.max_branches?.message}>
            <Input {...register("max_branches")} type="number" min="1" />
          </Field>
          <Field label="Max users" error={errors.max_users?.message}>
            <Input {...register("max_users")} type="number" min="1" />
          </Field>
          <Field label="Max products" error={errors.max_products?.message}>
            <Input {...register("max_products")} type="number" min="1" />
          </Field>
          <FormError message={errors.root?.message} />
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-zinc-900 text-white hover:bg-zinc-800">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Change plan ────────────────────────────────────────────────────────────────

const changePlanSchema = z.object({
  plan_slug:        z.string().min(1, "Select a plan"),
  billing_interval: z.enum(["monthly", "annual"]),
})
type ChangePlanForm = z.infer<typeof changePlanSchema>

function ChangePlanModal({ orgId, plans, currentSlug, onClose }: {
  orgId: string; plans: SubscriptionPlan[]; currentSlug?: string; onClose: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<ChangePlanForm>({
      resolver: zodResolver(changePlanSchema),
      defaultValues: { plan_slug: currentSlug ?? "", billing_interval: "monthly" },
    })

  async function onSubmit(data: ChangePlanForm) {
    try {
      await api.post(`/admin/organizations/${orgId}/subscription`, data)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "org-subscription", orgId] }),
        qc.invalidateQueries({ queryKey: ["admin", "org", orgId] }),
        qc.invalidateQueries({ queryKey: ["admin", "orgs"] }),
      ])
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError("root", { message: msg ?? "Failed to update subscription." })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 mt-1" noValidate>
          <Field label="Plan" error={errors.plan_slug?.message}>
            <select {...register("plan_slug")} className={selectCls}>
              <option value="">— Select plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.slug}>{p.name} — {fmtMoney(p.price_monthly)}/mo</option>
              ))}
            </select>
          </Field>
          <Field label="Billing interval" error={errors.billing_interval?.message}>
            <select {...register("billing_interval")} className={selectCls}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          <FormError message={errors.root?.message} />
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} className="bg-zinc-900 text-white hover:bg-zinc-800">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Usage bar ──────────────────────────────────────────────────────────────────

function UsageBar({ label, used, max, icon: Icon }: {
  label: string; used: number; max: number | null; icon: React.ElementType
}) {
  if (max === null) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-zinc-500"><Icon className="h-3 w-3" />{label}</span>
        <span className="font-medium text-zinc-700">Unlimited</span>
      </div>
    )
  }
  const pct    = max > 0 ? Math.min(Math.round((used / max) * 100), 100) : 0
  const isHigh = pct >= 80
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-zinc-500"><Icon className="h-3 w-3" />{label}</span>
        <span className={cn("font-medium tabular-nums", isHigh ? "text-red-600" : "text-zinc-700")}>{used} / {max}</span>
      </div>
      <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", isHigh ? "bg-red-400" : "bg-zinc-700")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OrgDetailPage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc       = useQueryClient()

  const [showAddUser,    setShowAddUser]    = useState(false)
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [showEditLimits, setShowEditLimits] = useState(false)
  const [editingUser,    setEditingUser]    = useState<OrgUser | null>(null)
  const [deletingUser,   setDeletingUser]   = useState<OrgUser | null>(null)
  const [promptPhone,    setPromptPhone]    = useState("")
  const [promptMsg,      setPromptMsg]      = useState<string | null>(null)

  const { data: org, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: ["admin", "org", id],
    queryFn: () => api.get(`/admin/organizations/${id}`).then((r) => r.data),
    enabled: !!id,
  })
  const { data: users = [], isLoading: usersLoading } = useQuery<OrgUser[]>({
    queryKey: ["admin", "org-users", id],
    queryFn: () => api.get(`/admin/organizations/${id}/users`).then((r) => r.data),
    enabled: !!id,
  })
  const { data: subscription } = useQuery<Subscription | null>({
    queryKey: ["admin", "org-subscription", id],
    queryFn: () => api.get(`/admin/organizations/${id}/subscription`).then((r) => r.data).catch(() => null),
    enabled: !!id,
  })
  const { data: plans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: () => api.get("/admin/plans").then((r) => r.data),
  })
  const { data: invoices = [], isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<Invoice[]>({
    queryKey: ["admin", "org-invoices", id],
    queryFn: () => api.get(`/admin/organizations/${id}/invoices`).then((r) => r.data),
    enabled: !!id,
  })

  const promptMutation = useMutation({
    mutationFn: (phone?: string) =>
      api.post(`/admin/organizations/${id}/invoices/prompt`, { phone: phone || undefined }).then((r) => r.data),
    onSuccess: (data) => setPromptMsg(data.message ?? "STK push sent"),
    onError:   (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed"
      setPromptMsg(`Error: ${msg}`)
    },
  })
  const markPaidMutation = useMutation({
    mutationFn: (invoiceId: number) => api.post(`/admin/organizations/${id}/invoices/${invoiceId}/mark-paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "org-invoices", id] })
      qc.invalidateQueries({ queryKey: ["admin", "org-subscription", id] })
    },
  })
  const suspendMutation = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${id}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "org", id] }),
  })
  const activateMutation = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "org", id] }),
  })

  if (orgLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-4 w-24 bg-zinc-100 rounded" />
        <div className="h-32 bg-zinc-100 rounded-xl" />
      </div>
    )
  }
  if (!org) {
    return <div className="p-6 text-sm text-zinc-500 text-center mt-20">Organization not found.</div>
  }

  const isSuspended = org.status === "suspended" || org.status === "cancelled"

  return (
    <>
      {showAddUser    && <AddUserModal    orgId={id!} onClose={() => setShowAddUser(false)} />}
      {editingUser    && <EditUserModal   orgId={id!} user={editingUser}  onClose={() => setEditingUser(null)} />}
      {deletingUser   && <DeleteUserModal orgId={id!} user={deletingUser} onClose={() => setDeletingUser(null)} />}
      {showEditLimits && <EditLimitsModal org={org}   onClose={() => setShowEditLimits(false)} />}
      {showChangePlan && (
        <ChangePlanModal
          orgId={id!} plans={plans}
          currentSlug={subscription?.plan?.slug}
          onClose={() => setShowChangePlan(false)}
        />
      )}

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Header */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 shrink-0">
                <Building2 className="h-5 w-5 text-zinc-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900">{org.name}</h1>
                <p className="text-xs font-mono text-zinc-400 mt-0.5">{org.slug}</p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-zinc-500">
                  {org.email   && <span className="flex items-center gap-1"><Mail className="h-3 w-3"  />{org.email}</span>}
                  {org.phone   && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{org.phone}</span>}
                  {org.country && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{org.country}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={org.status} />
              <Button
                size="sm"
                variant={isSuspended ? "outline" : "destructive"}
                disabled={suspendMutation.isPending || activateMutation.isPending}
                onClick={() => isSuspended ? activateMutation.mutate() : suspendMutation.mutate()}
              >
                {isSuspended ? "Activate" : "Suspend"}
              </Button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5 pt-4 border-t border-zinc-100">
            {[
              { label: "Users",    value: org.max_users === null    ? `${org.user_count} / ∞`             : `${org.user_count} / ${org.max_users}` },
              { label: "Branches", value: org.max_branches === 1    ? "Single"                             : org.max_branches === null ? `${org.branch_count} / ∞` : `${org.branch_count} / ${org.max_branches}` },
              { label: "Products", value: org.max_products === null ? `${org.active_product_count} / ∞`    : `${org.active_product_count} / ${org.max_products}` },
              { label: "Status",   value: org.status },
              { label: "Joined",   value: fmtDate(org.created_at) },
              { label: org.trial_ends_at ? "Trial ends" : "Country", value: org.trial_ends_at ? fmtDate(org.trial_ends_at) : (org.country || "—") },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-zinc-400 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-medium text-zinc-800 mt-0.5 capitalize">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="billing">Billing ({invoices.length})</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {/* Subscription */}
              <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-sm font-semibold text-zinc-900">Subscription</h2>
                  </div>
                  <button onClick={() => setShowChangePlan(true)} className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
                    Change →
                  </button>
                </div>
                {subscription ? (
                  <div className="space-y-2 text-sm">
                    {[
                      { label: "Plan",       value: subscription.plan?.name ?? "—" },
                      { label: "Status",     value: <StatusBadge status={subscription.status} /> },
                      { label: "Billing",    value: <span className="capitalize">{subscription.billing_interval}</span> },
                      { label: "Period end", value: fmtDate(subscription.current_period_end) },
                      ...(subscription.last_payment_amount
                        ? [{ label: "Last payment", value: fmtMoney(subscription.last_payment_amount) }]
                        : []),
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-zinc-500">{label}</span>
                        <span className="font-medium text-zinc-700">{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 py-4 text-center">No active subscription</p>
                )}
              </div>

              {/* Billing limits */}
              <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-sm font-semibold text-zinc-900">Billing Limits</h2>
                  </div>
                  <button onClick={() => setShowEditLimits(true)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                </div>
                <div className="space-y-3">
                  {org.max_branches === 1
                    ? <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-zinc-500"><Building2 className="h-3 w-3" />Branches</span>
                        <span className="font-medium text-zinc-700">Single business</span>
                      </div>
                    : <UsageBar label="Branches" used={org.branch_count} max={org.max_branches} icon={Building2} />
                  }
                  <UsageBar label="Users"    used={org.user_count}           max={org.max_users}    icon={Users}   />
                  <UsageBar label="Products" used={org.active_product_count} max={org.max_products} icon={Package} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Users ── */}
          <TabsContent value="users">
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden mt-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-900">Users</h2>
                </div>
                <Button size="sm" onClick={() => setShowAddUser(true)} className="bg-zinc-900 text-white hover:bg-zinc-800">
                  <Plus /> Add user
                </Button>
              </div>

              {usersLoading ? (
                <div className="divide-y divide-zinc-100">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="px-5 py-3 flex gap-3 animate-pulse">
                      <div className="h-4 bg-zinc-100 rounded w-36" />
                      <div className="h-4 bg-zinc-100 rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : users.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-10">No users yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-zinc-500 bg-zinc-50 border-b border-zinc-100">
                        <th className="px-5 py-3">Name</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Joined</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-zinc-900">{user.full_name}</p>
                            <p className="text-xs text-zinc-400">{user.email}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="capitalize text-xs font-medium text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded-full">
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={user.is_active ? "active" : "cancelled"} />
                          </td>
                          <td className="px-4 py-3.5 text-xs text-zinc-400">{fmtDate(user.created_at)}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => setEditingUser(user)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingUser(user)}
                                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Billing ── */}
          <TabsContent value="billing">
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden mt-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-zinc-400" />
                  <h2 className="text-sm font-semibold text-zinc-900">Invoices &amp; Payments</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => refetchInvoices()}
                    className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={promptMutation.isPending}
                    onClick={() => { setPromptMsg(null); promptMutation.mutate(promptPhone || undefined) }}
                  >
                    {promptMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                    Prompt Payment
                  </Button>
                </div>
              </div>

              {/* Paybill info */}
              <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-100 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-zinc-500">
                <span>
                  <span className="font-medium text-zinc-700">Paybill account:</span>{" "}
                  <code className="bg-white border border-zinc-200 rounded px-1 py-0.5 font-mono">{org.slug}</code>
                </span>
                {subscription?.billing_phone && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-zinc-700">Billing phone:</span>
                    {subscription.billing_phone}
                    <Input
                      className="h-6 w-32 text-xs px-2"
                      placeholder="Override…"
                      value={promptPhone}
                      onChange={(e) => setPromptPhone(e.target.value)}
                    />
                  </span>
                )}
                {promptMsg && (
                  <span className={cn("font-medium", promptMsg.startsWith("Error") ? "text-red-600" : "text-green-600")}>
                    {promptMsg}
                  </span>
                )}
              </div>

              {invoicesLoading ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : invoices.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-10">No invoices yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-zinc-500 bg-zinc-50 border-b border-zinc-100">
                        <th className="px-4 py-2.5">Invoice</th>
                        <th className="px-4 py-2.5">Plan</th>
                        <th className="px-4 py-2.5">Amount</th>
                        <th className="px-4 py-2.5">Period</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Method</th>
                        <th className="px-4 py-2.5">Receipt</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-zinc-600">{inv.invoice_number ?? `#${inv.id}`}</td>
                          <td className="px-4 py-3 text-zinc-700">{inv.plan_name}</td>
                          <td className="px-4 py-3 font-semibold tabular-nums">{inv.currency} {fmtMoney(inv.amount)}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                            {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                          <td className="px-4 py-3 text-xs text-zinc-500 capitalize">{inv.payment_method?.replace("_", " ") ?? "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-500">{inv.mpesa_receipt ?? "—"}</td>
                          <td className="px-4 py-3">
                            {(inv.status === "open" || inv.status === "overdue") && (
                              <button
                                onClick={() => markPaidMutation.mutate(inv.id)}
                                disabled={markPaidMutation.isPending}
                                className="text-xs text-zinc-600 hover:text-zinc-900 underline underline-offset-2 disabled:opacity-50"
                              >
                                Mark paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
