import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from "@tanstack/react-table";
import {
  ArrowLeft, Building2, Users, CreditCard, Mail, Phone, Globe,
  CheckCircle2, Clock, AlertTriangle, XCircle, Plus, X, Loader2,
  Package, Pencil, BarChart2, Trash2,
} from "lucide-react";
import api from "@/lib/api";
import { cn, fmtDate, fmtMoney } from "@/lib/utils";
import type { Organization, OrgUser, Subscription, SubscriptionPlan, OrgStatus } from "@/types";

const STATUS_CFG: Record<OrgStatus, { label: string; badge: string; icon: React.ElementType }> = {
  trial:     { label: "Trial",     badge: "bg-amber-100 text-amber-700",     icon: Clock },
  active:    { label: "Active",    badge: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  suspended: { label: "Suspended", badge: "bg-red-100 text-red-700",         icon: AlertTriangle },
  cancelled: { label: "Cancelled", badge: "bg-slate-100 text-slate-500",     icon: XCircle },
};

const SUB_BADGE: Record<string, string> = {
  trialing:  "bg-amber-100 text-amber-700",
  active:    "bg-emerald-100 text-emerald-700",
  past_due:  "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

/* ── Add-user modal ─────────────────────────────────────────────── */
const addUserSchema = z.object({
  full_name: z.string().min(2, "Required"),
  email:     z.string().email("Invalid email").or(z.literal("")).optional(),
  password:  z.string().regex(/^\d{4}$/, "Must be exactly 4 digits"),
  role:      z.enum(["admin", "manager", "staff"]),
});
type AddUserForm = z.infer<typeof addUserSchema>;

function AddUserModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<AddUserForm>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { role: "staff" },
  });

  async function onSubmit(data: AddUserForm) {
    try {
      await api.post(`/admin/organizations/${orgId}/users`, data);
      qc.invalidateQueries({ queryKey: ["admin", "org-users", orgId] });
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError("root", { message: detail ?? "Failed to create user." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900">Add User</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field label="Full name" error={errors.full_name?.message}>
            <input {...register("full_name")} className={inputCls} placeholder="Jane Doe" />
          </Field>
          <Field label="Email (optional)" error={errors.email?.message}>
            <input {...register("email")} type="email" className={inputCls} placeholder="jane@example.com" />
          </Field>
          <Field label="POS PIN (4 digits)" error={errors.password?.message}>
            <input
              {...register("password")}
              type="password"
              inputMode="numeric"
              maxLength={4}
              className={inputCls}
              placeholder="••••"
            />
          </Field>
          <Field label="Role" error={errors.role?.message}>
            <select {...register("role")} className={inputCls}>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </Field>
          {errors.root && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{errors.root.message}</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className={cancelBtnCls}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className={primaryBtnCls}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Edit-user modal ────────────────────────────────────────────── */
const editUserSchema = z.object({
  full_name: z.string().min(2, "Required"),
  email:     z.string().email("Invalid email").or(z.literal("")).optional(),
  password:  z.string().regex(/^\d{4}$/, "Must be exactly 4 digits").or(z.literal("")).optional(),
  role:      z.enum(["admin", "manager", "staff"]),
  is_active: z.boolean(),
});
type EditUserForm = z.infer<typeof editUserSchema>;

function EditUserModal({ orgId, user, onClose }: { orgId: string; user: OrgUser; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      full_name: user.full_name,
      email:     user.email ?? "",
      password:  "",
      role:      user.role as "admin" | "manager" | "staff",
      is_active: user.is_active,
    },
  });

  async function onSubmit(data: EditUserForm) {
    const payload: Record<string, unknown> = {
      full_name: data.full_name,
      email:     data.email || null,
      role:      data.role,
      is_active: data.is_active,
    };
    if (data.password) payload.password = data.password;
    try {
      await api.patch(`/admin/organizations/${orgId}/users/${user.id}`, payload);
      qc.invalidateQueries({ queryKey: ["admin", "org-users", orgId] });
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError("root", { message: detail ?? "Failed to update user." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900">Edit User</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field label="Full name" error={errors.full_name?.message}>
            <input {...register("full_name")} className={inputCls} />
          </Field>
          <Field label="Email (optional)" error={errors.email?.message}>
            <input {...register("email")} type="email" className={inputCls} placeholder="jane@example.com" />
          </Field>
          <Field label="New PIN (leave blank to keep current)" error={errors.password?.message}>
            <input
              {...register("password")}
              type="password"
              inputMode="numeric"
              maxLength={4}
              className={inputCls}
              placeholder="••••"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" error={errors.role?.message}>
              <select {...register("role")} className={inputCls}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </Field>
            <Field label="Status" error={errors.is_active?.message}>
              <select {...register("is_active", { setValueAs: (v) => v === "true" || v === true })} className={inputCls}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </Field>
          </div>
          {errors.root && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{errors.root.message}</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className={cancelBtnCls}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className={primaryBtnCls}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Delete-user confirm ─────────────────────────────────────────── */
function DeleteUserModal({ orgId, user, onClose }: { orgId: string; user: OrgUser; onClose: () => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setLoading(true);
    try {
      await api.delete(`/admin/organizations/${orgId}/users/${user.id}`);
      qc.invalidateQueries({ queryKey: ["admin", "org-users", orgId] });
      qc.invalidateQueries({ queryKey: ["admin", "org", orgId] });
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Failed to delete user.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Delete User</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-slate-600 mb-1">
          Are you sure you want to delete <span className="font-semibold">{user.full_name}</span>?
        </p>
        <p className="text-xs text-slate-400 mb-5">This action cannot be undone.</p>
        {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button
            onClick={confirm}
            disabled={loading}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit-limits modal ──────────────────────────────────────────── */
const editLimitsSchema = z.object({
  max_branches: z.coerce.number().int().min(1, "Min 1"),
  max_users:    z.coerce.number().int().min(1, "Min 1"),
  max_products: z.coerce.number().int().min(1, "Min 1"),
});
type EditLimitsForm = z.infer<typeof editLimitsSchema>;

function EditLimitsModal({ org, onClose }: { org: Organization; onClose: () => void }) {
  const qc = useQueryClient();
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<EditLimitsForm>({
    resolver: zodResolver(editLimitsSchema),
    defaultValues: {
      max_branches: org.max_branches,
      max_users:    org.max_users,
      max_products: org.max_products,
    },
  });

  async function onSubmit(data: EditLimitsForm) {
    try {
      await api.patch(`/admin/organizations/${org.id}`, data);
      qc.invalidateQueries({ queryKey: ["admin", "org", org.id] });
      qc.invalidateQueries({ queryKey: ["admin", "orgs"] });
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError("root", { message: detail ?? "Failed to update limits." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900">Edit Billing Limits</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field label="Max branches" error={errors.max_branches?.message}>
            <input {...register("max_branches")} type="number" min="1" className={inputCls} />
          </Field>
          <Field label="Max users" error={errors.max_users?.message}>
            <input {...register("max_users")} type="number" min="1" className={inputCls} />
          </Field>
          <Field label="Max products" error={errors.max_products?.message}>
            <input {...register("max_products")} type="number" min="1" className={inputCls} />
          </Field>
          {errors.root && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{errors.root.message}</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className={cancelBtnCls}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className={primaryBtnCls}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Change-plan modal ──────────────────────────────────────────── */
const changePlanSchema = z.object({
  plan_slug:         z.string().min(1, "Select a plan"),
  billing_interval:  z.enum(["monthly", "annual"]),
});
type ChangePlanForm = z.infer<typeof changePlanSchema>;

function ChangePlanModal({
  orgId, plans, currentSlug, onClose,
}: {
  orgId: string;
  plans: SubscriptionPlan[];
  currentSlug?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const {
    register, handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ChangePlanForm>({
    resolver: zodResolver(changePlanSchema),
    defaultValues: { plan_slug: currentSlug ?? "", billing_interval: "monthly" },
  });

  async function onSubmit(data: ChangePlanForm) {
    try {
      await api.post(`/admin/organizations/${orgId}/subscription`, data);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "org-subscription", orgId] }),
        qc.invalidateQueries({ queryKey: ["admin", "org", orgId] }),
        qc.invalidateQueries({ queryKey: ["admin", "orgs"] }),
      ]);
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError("root", { message: detail ?? "Failed to update subscription." });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-slate-900">Change Plan</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field label="Plan" error={errors.plan_slug?.message}>
            <select {...register("plan_slug")} className={inputCls}>
              <option value="">— Select plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name} — {fmtMoney(p.price_monthly)}/mo
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing interval" error={errors.billing_interval?.message}>
            <select {...register("billing_interval")} className={inputCls}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          {errors.root && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{errors.root.message}</p>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className={cancelBtnCls}>Cancel</button>
            <button type="submit" disabled={isSubmitting} className={primaryBtnCls}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Users table ────────────────────────────────────────────────── */
const userCol = createColumnHelper<OrgUser>();

function buildUserColumns(
  onEdit: (u: OrgUser) => void,
  onDelete: (u: OrgUser) => void,
) {
  return [
    userCol.accessor("full_name", {
      header: "Name",
      cell: (info) => (
        <div>
          <p className="font-medium text-slate-900">{info.getValue()}</p>
          <p className="text-xs text-slate-400">{info.row.original.email}</p>
        </div>
      ),
    }),
    userCol.accessor("role", {
      header: "Role",
      cell: (info) => (
        <span className="capitalize text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
          {info.getValue()}
        </span>
      ),
    }),
    userCol.accessor("is_active", {
      header: "Status",
      cell: (info) => (
        <span className={cn(
          "text-xs font-medium px-2 py-0.5 rounded-full",
          info.getValue() ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
        )}>
          {info.getValue() ? "Active" : "Inactive"}
        </span>
      ),
    }),
    userCol.accessor("created_at", {
      header: "Joined",
      cell: (info) => <span className="text-xs text-slate-400">{fmtDate(info.getValue())}</span>,
    }),
    userCol.display({
      id: "actions",
      header: "",
      cell: (info) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => onEdit(info.row.original)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title="Edit user"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(info.row.original)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Delete user"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    }),
  ];
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function OrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showAddUser, setShowAddUser] = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [showEditLimits, setShowEditLimits] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<OrgUser | null>(null);

  const { data: org, isLoading: orgLoading } = useQuery<Organization>({
    queryKey: ["admin", "org", id],
    queryFn: () => api.get(`/admin/organizations/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<OrgUser[]>({
    queryKey: ["admin", "org-users", id],
    queryFn: () => api.get(`/admin/organizations/${id}/users`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: subscription } = useQuery<Subscription | null>({
    queryKey: ["admin", "org-subscription", id],
    queryFn: () =>
      api.get(`/admin/organizations/${id}/subscription`).then((r) => r.data).catch(() => null),
    enabled: !!id,
  });

  const { data: plans = [] } = useQuery<SubscriptionPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: () => api.get("/admin/plans").then((r) => r.data),
  });

  const suspendMutation = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${id}/suspend`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "org", id] }),
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/admin/organizations/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "org", id] }),
  });

  const userColumns = buildUserColumns(setEditingUser, setDeletingUser);
  const usersTable = useReactTable({
    data: users,
    columns: userColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (orgLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="h-5 w-28 bg-slate-100 rounded animate-pulse" />
        <div className="h-36 bg-slate-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!org) {
    return <div className="p-6 text-sm text-slate-500 text-center mt-20">Organization not found.</div>;
  }

  const cfg = STATUS_CFG[org.status] ?? STATUS_CFG.cancelled;
  const StatusIcon = cfg.icon;

  return (
    <>
      {showAddUser && <AddUserModal orgId={id!} onClose={() => setShowAddUser(false)} />}
      {editingUser && <EditUserModal orgId={id!} user={editingUser} onClose={() => setEditingUser(null)} />}
      {deletingUser && <DeleteUserModal orgId={id!} user={deletingUser} onClose={() => setDeletingUser(null)} />}
      {showEditLimits && <EditLimitsModal org={org} onClose={() => setShowEditLimits(false)} />}
      {showChangePlan && (
        <ChangePlanModal
          orgId={id!}
          plans={plans}
          currentSlug={subscription?.plan?.slug}
          onClose={() => setShowChangePlan(false)}
        />
      )}

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 sm:space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 shrink-0">
                <Building2 className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">{org.name}</h1>
                <p className="text-sm font-mono text-slate-400">{org.slug}</p>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                  {org.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{org.email}</span>}
                  {org.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{org.phone}</span>}
                  {org.country && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{org.country}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full", cfg.badge)}>
                <StatusIcon className="h-3 w-3" />
                {cfg.label}
              </span>
              {org.status !== "suspended" && org.status !== "cancelled" ? (
                <button
                  onClick={() => suspendMutation.mutate()}
                  disabled={suspendMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  Suspend
                </button>
              ) : (
                <button
                  onClick={() => activateMutation.mutate()}
                  disabled={activateMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
                >
                  Activate
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-100">
            <Stat label="Users"    value={org.max_users    === null ? `${org.user_count} / ∞`             : `${org.user_count} / ${org.max_users}`} />
            <Stat label="Branches" value={org.max_branches === 1    ? "Single"                             : org.max_branches === null ? `${org.branch_count} / ∞` : `${org.branch_count} / ${org.max_branches}`} />
            <Stat label="Products" value={org.max_products === null ? `${org.active_product_count} / ∞`    : `${org.active_product_count} / ${org.max_products}`} />
            <Stat label="Status"   value={cfg.label} />
            <Stat label="Joined"   value={fmtDate(org.created_at)} />
            {org.trial_ends_at
              ? <Stat label="Trial ends" value={fmtDate(org.trial_ends_at)} />
              : <Stat label="Country"    value={org.country || "—"} />
            }
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-900">Subscription</h2>
                </div>
                <button onClick={() => setShowChangePlan(true)} className="text-xs text-indigo-600 hover:underline">
                  Change plan
                </button>
              </div>
              {subscription ? (
                <div className="space-y-2 text-sm">
                  <Row label="Plan"    value={subscription.plan?.name ?? "—"} />
                  <Row
                    label="Status"
                    value={
                      <span className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                        SUB_BADGE[subscription.status] ?? "bg-slate-100 text-slate-500",
                      )}>
                        {subscription.status}
                      </span>
                    }
                  />
                  <Row label="Billing"    value={<span className="capitalize">{subscription.billing_interval}</span>} />
                  <Row label="Period end" value={fmtDate(subscription.current_period_end)} />
                  {subscription.last_payment_amount && (
                    <Row label="Last payment" value={fmtMoney(subscription.last_payment_amount)} />
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">No active subscription</p>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-900">Billing Limits</h2>
                </div>
                <button
                  onClick={() => setShowEditLimits(true)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </div>
              <div className="space-y-3">
                {org.max_branches === 1
                  ? <div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-slate-500"><Building2 className="h-3 w-3" />Branches</span><span className="font-medium text-slate-700">Single business</span></div>
                  : <UsageBar label="Branches" used={org.branch_count} max={org.max_branches} icon={Building2} />
                }
                <UsageBar label="Users"    used={org.user_count}   max={org.max_users}    icon={Users} />
                <UsageBar label="Products" used={org.active_product_count} max={org.max_products} icon={Package} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Users <span className="text-slate-400 font-normal">({users.length})</span>
                </h2>
              </div>
              <button
                onClick={() => setShowAddUser(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add user
              </button>
            </div>

            {usersLoading ? (
              <div className="divide-y divide-slate-100">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3 flex gap-3 animate-pulse">
                    <div className="h-4 bg-slate-100 rounded w-36" />
                    <div className="h-4 bg-slate-100 rounded w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {usersTable.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="text-left text-xs font-medium text-slate-500 bg-slate-50 border-b border-slate-100">
                        {hg.headers.map((h) => (
                          <th key={h.id} className="px-4 py-3">
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {usersTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={userColumns.length} className="text-center py-10 text-sm text-slate-400">
                          No users yet.
                        </td>
                      </tr>
                    ) : (
                      usersTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-4 py-3">
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
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────── */
const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const cancelBtnCls = "px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg";
const primaryBtnCls = "px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}

function UsageBar({ label, used, max, icon: Icon }: {
  label: string; used: number; max: number | null; icon: React.ElementType;
}) {
  if (max === null) {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-slate-500">
          <Icon className="h-3 w-3" />{label}
        </span>
        <span className="font-medium text-indigo-600">Unlimited</span>
      </div>
    );
  }
  const pct = max > 0 ? Math.min(Math.round((used / max) * 100), 100) : 0;
  const isHigh = pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="flex items-center gap-1.5 text-slate-500">
          <Icon className="h-3 w-3" />{label}
        </span>
        <span className={cn("font-medium tabular-nums", isHigh ? "text-red-600" : "text-slate-700")}>
          {used} / {max}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", isHigh ? "bg-red-400" : "bg-indigo-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
