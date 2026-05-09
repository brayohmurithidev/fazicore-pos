import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, X, Trash2, Loader2, CheckCircle2, XCircle, Users, Package, GitBranch, Clock, Star, EyeOff, Eye } from "lucide-react";
import api from "@/lib/api";
import { cn, fmtMoney } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

const FEATURE_CATALOG = [
  { key: "mpesa_manual",        label: "M-Pesa Manual Entry",     group: "Payments" },
  { key: "mpesa_stk",           label: "M-Pesa STK Push",         group: "Payments" },
  { key: "sms_receipts",        label: "SMS Receipts",            group: "Receipts" },
  { key: "credit_system",       label: "Credit System",           group: "Sales" },
  { key: "advanced_reports",    label: "Advanced Reports",        group: "Analytics" },
  { key: "inventory_analytics", label: "Inventory Analytics",     group: "Analytics" },
  { key: "audit_logs",          label: "Audit Logs",              group: "Security" },
  { key: "permissions_mgmt",    label: "Custom Permissions",      group: "Security" },
  { key: "expenditure_tracking", label: "Expenditure Tracking",    group: "Finance" },
  { key: "multi_branch",        label: "Multi-Branch",            group: "Operations" },
  { key: "supplier_management", label: "Supplier Management",     group: "Operations" },
  { key: "barcode_mode",        label: "Barcode Scanner",         group: "Operations" },
  { key: "custom_units",        label: "Custom Product Units",    group: "Operations" },
  { key: "thermal_printing",    label: "Thermal Printing",        group: "Operations" },
  { key: "product_images",      label: "Product Images",          group: "Operations" },
  { key: "api_access",          label: "API Access",              group: "Developer" },
] as const;

type FeatureKey = typeof FEATURE_CATALOG[number]["key"];

const planSchema = z.object({
  name:          z.string().min(1, "Required"),
  slug:          z.string().min(1, "Required").regex(/^[a-z0-9-]+$/, "Lowercase, numbers and hyphens only"),
  description:   z.string().optional(),
  price_monthly: z.string().min(1, "Required"),
  price_annual:  z.string().min(1, "Required"),
  max_users:     z.string().optional(),
  max_products:  z.string().optional(),
  max_branches:  z.string().optional(),
  trial_days:    z.string().optional(),
  sort_order:    z.string().optional(),
});
type PlanForm = z.infer<typeof planSchema>;

function planToForm(p: SubscriptionPlan): PlanForm {
  return {
    name:          p.name,
    slug:          p.slug,
    description:   p.description ?? "",
    price_monthly: String(p.price_monthly),
    price_annual:  String(p.price_annual),
    max_users:     p.max_users != null ? String(p.max_users) : "",
    max_products:  p.max_products != null ? String(p.max_products) : "",
    max_branches:  p.max_branches != null ? String(p.max_branches) : "",
    trial_days:    p.trial_days ? String(p.trial_days) : "",
    sort_order:    String(p.sort_order),
  };
}

function defaultFlags(plan: SubscriptionPlan | null): Record<FeatureKey, boolean> {
  const base = Object.fromEntries(FEATURE_CATALOG.map((f) => [f.key, false])) as Record<FeatureKey, boolean>;
  if (plan?.features) {
    for (const [k, v] of Object.entries(plan.features)) {
      if (k in base) base[k as FeatureKey] = Boolean(v);
    }
  }
  return base;
}

function PlanModal({ plan, onClose }: { plan: SubscriptionPlan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [flags, setFlags] = useState<Record<FeatureKey, boolean>>(() => defaultFlags(plan));
  const [isRecommended, setIsRecommended] = useState(plan?.is_recommended ?? false);

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<PlanForm>({
    resolver: zodResolver(planSchema),
    defaultValues: plan ? planToForm(plan) : { sort_order: "0" },
  });

  void watch("name");

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!plan) {
      setValue(
        "slug",
        e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        { shouldValidate: false },
      );
    }
  }

  function toggleFlag(key: FeatureKey) {
    setFlags((f) => ({ ...f, [key]: !f[key] }));
  }

  async function onSubmit(data: PlanForm) {
    const payload = {
      name:          data.name.trim(),
      slug:          data.slug.trim(),
      description:   data.description?.trim() || null,
      price_monthly: Number(data.price_monthly),
      price_annual:  Number(data.price_annual),
      max_users:     data.max_users ? Number(data.max_users) : null,
      max_products:  data.max_products ? Number(data.max_products) : null,
      max_branches:  data.max_branches ? Number(data.max_branches) : null,
      trial_days:    data.trial_days ? Number(data.trial_days) : 0,
      sort_order:    Number(data.sort_order ?? "0"),
      features:      flags,
      is_recommended: isRecommended,
    };
    try {
      if (plan) {
        await api.patch(`/admin/plans/${plan.id}`, payload);
      } else {
        await api.post("/admin/plans", payload);
      }
      qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError("root", { message: detail ?? "Failed to save plan." });
    }
  }

  const groups = [...new Set(FEATURE_CATALOG.map((f) => f.group))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Fixed header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="font-semibold text-slate-900">{plan ? "Edit Plan" : "New Plan"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0" noValidate>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Plan name" error={errors.name?.message} className="sm:col-span-2">
              <input
                {...register("name", { onChange: handleNameChange })}
                className={inputCls}
                placeholder="Starter"
              />
            </Field>
            <Field label="Slug" error={errors.slug?.message} className="sm:col-span-2">
              <input {...register("slug")} className={inputCls} placeholder="starter" />
            </Field>
            <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
              <input {...register("description")} className={inputCls} placeholder="Optional description" />
            </Field>
            <Field label="Price / month (KES)" error={errors.price_monthly?.message}>
              <input {...register("price_monthly")} type="number" min="0" className={inputCls} placeholder="2000" />
            </Field>
            <Field label="Price / year (KES)" error={errors.price_annual?.message}>
              <input {...register("price_annual")} type="number" min="0" className={inputCls} placeholder="20000" />
            </Field>
            <Field label="Max branches (blank = unlimited)" error={errors.max_branches?.message}>
              <input {...register("max_branches")} type="number" min="1" className={inputCls} placeholder="∞" />
            </Field>
            <Field label="Max users (blank = unlimited)" error={errors.max_users?.message}>
              <input {...register("max_users")} type="number" min="1" className={inputCls} placeholder="∞" />
            </Field>
            <Field label="Max products (blank = unlimited)" error={errors.max_products?.message}>
              <input {...register("max_products")} type="number" min="1" className={inputCls} placeholder="∞" />
            </Field>
            <Field label="Free trial days (0 = no trial)" error={errors.trial_days?.message}>
              <input {...register("trial_days")} type="number" min="0" className={inputCls} placeholder="0" />
            </Field>
            <Field label="Sort order" error={errors.sort_order?.message}>
              <input {...register("sort_order")} type="number" min="0" className={inputCls} />
            </Field>
            <Field label="Visibility" className="sm:col-span-2">
              <button
                type="button"
                onClick={() => setIsRecommended((v) => !v)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors",
                  isRecommended
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
                )}
              >
                <Star className={cn("h-3.5 w-3.5", isRecommended ? "fill-amber-500 text-amber-500" : "text-slate-300")} />
                {isRecommended ? "Marked as Recommended" : "Mark as Recommended"}
              </button>
            </Field>
          </div>

          {/* Feature flags */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Feature Access</p>
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group}>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{group}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FEATURE_CATALOG.filter((f) => f.group === group).map((feat) => (
                      <button
                        key={feat.key}
                        type="button"
                        onClick={() => toggleFlag(feat.key)}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-xs transition-colors",
                          flags[feat.key]
                            ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                            : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
                        )}
                      >
                        {flags[feat.key]
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          : <XCircle className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                        }
                        {feat.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errors.root && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{errors.root.message}</p>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end px-5 py-4 border-t border-slate-100 shrink-0">
          <button type="button" onClick={onClose} className={cancelBtnCls}>Cancel</button>
          <button type="submit" disabled={isSubmitting} className={primaryBtnCls}>
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {plan ? "Save changes" : "Create plan"}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}

function PlanCard({ plan, onEdit }: { plan: SubscriptionPlan; onEdit: () => void }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const features = (plan.features ?? {}) as Record<string, boolean>;
  const enabledFeatures = FEATURE_CATALOG.filter((f) => features[f.key] === true);
  const disabledFeatures = FEATURE_CATALOG.filter((f) => !features[f.key]);

  const toggleMutation = useMutation({
    mutationFn: (patch: { is_active?: boolean; is_recommended?: boolean }) =>
      api.patch(`/admin/plans/${plan.id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/plans/${plan.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail ?? "Failed to delete plan.");
    },
  });

  return (
    <div className={cn(
      "bg-white rounded-xl border p-5 flex flex-col gap-4 transition-shadow",
      plan.is_active ? "border-slate-200 hover:shadow-sm" : "border-dashed border-slate-300 opacity-60",
      plan.is_recommended && plan.is_active && "ring-2 ring-amber-300",
    )}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900">{plan.name}</h3>
            {plan.is_recommended && plan.is_active && (
              <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <Star className="h-2.5 w-2.5 fill-amber-500" />Recommended
              </span>
            )}
            {!plan.is_active && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Inactive</span>
            )}
            {plan.trial_days > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                <Clock className="h-2.5 w-2.5" />
                {plan.trial_days}d trial
              </span>
            )}
          </div>
          <p className="text-xs font-mono text-slate-400 mt-0.5">{plan.slug}</p>
        </div>
        <div className="flex items-center gap-1">
          {/* Quick-toggle: recommended */}
          <button
            title={plan.is_recommended ? "Remove recommended" : "Mark as recommended"}
            onClick={() => toggleMutation.mutate({ is_recommended: !plan.is_recommended })}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              plan.is_recommended ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:text-amber-400 hover:bg-slate-100",
            )}
          >
            <Star className={cn("h-3.5 w-3.5", plan.is_recommended && "fill-amber-500")} />
          </button>
          {/* Quick-toggle: active */}
          <button
            title={plan.is_active ? "Deactivate plan" : "Activate plan"}
            onClick={() => toggleMutation.mutate({ is_active: !plan.is_active })}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {plan.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            title="Delete plan"
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Inline delete confirmation */}
      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 -mt-1">
          <p className="text-xs font-semibold text-red-800 mb-1">Delete "{plan.name}"?</p>
          <p className="text-xs text-red-600 mb-3">This cannot be undone. Plans with active subscriptions cannot be deleted.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 text-xs font-medium border border-red-200 rounded-lg text-red-700 hover:bg-red-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDelete(false); deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
              className="flex-1 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </button>
          </div>
        </div>
      )}

      {plan.description && (
        <p className="text-xs text-slate-500 leading-relaxed">{plan.description}</p>
      )}

      <div>
        <p className="text-2xl font-bold text-slate-900">
          {fmtMoney(plan.price_monthly)}
          <span className="text-sm font-normal text-slate-400">/mo</span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{fmtMoney(plan.price_annual)} / year</p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3.5 w-3.5 text-slate-400" />
          {plan.max_branches === 1 ? "Single business" : plan.max_branches != null ? `${plan.max_branches} branches` : "Unlimited branches"}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          {plan.max_users != null ? `${plan.max_users} users` : "Unlimited users"}
        </span>
        <span className="flex items-center gap-1">
          <Package className="h-3.5 w-3.5 text-slate-400" />
          {plan.max_products != null ? `${plan.max_products} products` : "Unlimited products"}
        </span>
      </div>

      {/* Feature list */}
      <div className="space-y-1">
        {enabledFeatures.map((f) => (
          <div key={f.key} className="flex items-center gap-2 text-xs text-slate-700">
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
            {f.label}
          </div>
        ))}
        {disabledFeatures.map((f) => (
          <div key={f.key} className="flex items-center gap-2 text-xs text-slate-400">
            <XCircle className="h-3 w-3 text-slate-300 shrink-0" />
            {f.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlansPage() {
  const [modal, setModal] = useState<"create" | SubscriptionPlan | null>(null);

  const { data: plans = [], isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: () => api.get("/admin/plans").then((r) => r.data),
  });

  const sorted = [...plans].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      {modal !== null && (
        <PlanModal
          plan={modal === "create" ? null : modal}
          onClose={() => setModal(null)}
        />
      )}

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
            <p className="text-sm text-slate-500 mt-1">
              {plans.length} plan{plans.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setModal("create")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" /> New plan
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <p className="text-sm text-slate-500">No plans yet. Create your first plan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onEdit={() => setModal(plan)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const inputCls = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const cancelBtnCls = "px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg";
const primaryBtnCls = "px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2";

function Field({
  label, error, children, className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-xs font-medium text-slate-500">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
