import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, ArrowRight, Building2, Mail, Phone, Check,
  Loader2, ShieldCheck, User, CreditCard, Eye, EyeOff,
  Clock, GitBranch, Users, Package,
} from "lucide-react"
import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Field, FormError, selectCls } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SubscriptionPlan } from "@/types"

// ── Helpers ────────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

const INDUSTRIES = [
  "Retail", "Supermarket", "Restaurant", "Pharmacy", "Electronics",
  "Fashion & Apparel", "Hardware & Construction", "Beauty & Cosmetics",
  "Agriculture", "Automotive", "Education", "Other",
]
const COUNTRIES = [
  "Kenya", "Uganda", "Tanzania", "Rwanda", "Ethiopia",
  "Ghana", "Nigeria", "South Africa", "Other",
]

// ── Types ──────────────────────────────────────────────────────────────────────

interface BusinessForm { name: string; slug: string; industry: string; country: string }
interface ContactForm  { email: string; phone: string }
interface PlanForm     { plan_slug: string; billing_interval: "monthly" | "annual" }
interface AdminForm    { full_name: string; email: string; pin: string; pin_confirm: string }

const STEPS = [
  { id: 1, label: "Business", icon: Building2 },
  { id: 2, label: "Contact",  icon: Mail      },
  { id: 3, label: "Plan",     icon: CreditCard },
  { id: 4, label: "Admin",    icon: User      },
]

// ── Step components ────────────────────────────────────────────────────────────

function StepBusiness({ form, onChange, errors }: {
  form: BusinessForm
  onChange: (f: Partial<BusinessForm>) => void
  errors: Partial<Record<keyof BusinessForm, string>>
}) {
  const [slugEdited, setSlugEdited] = useState(false)

  function handleName(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    onChange({ name, ...(!slugEdited ? { slug: slugify(name) } : {}) })
  }

  return (
    <div className="space-y-4">
      <Field label="Business Name" required error={errors.name}>
        <Input value={form.name} onChange={handleName} placeholder="e.g. Mama Oliech General Store" />
      </Field>

      <Field label="Slug (unique identifier)" required error={errors.slug}>
        <div className="flex items-center">
          <span className="flex items-center px-3 h-8 text-xs text-zinc-400 bg-zinc-50 border border-r-0 border-zinc-200 rounded-l-lg whitespace-nowrap">
            fazi.app/
          </span>
          <Input
            value={form.slug}
            onChange={(e) => { setSlugEdited(true); onChange({ slug: slugify(e.target.value) }) }}
            placeholder="mama-oliech-store"
            className="rounded-l-none border-l-0 font-mono"
          />
        </div>
        <p className="text-[11px] text-zinc-400 mt-1">Lowercase letters, numbers and hyphens only.</p>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Industry" error={errors.industry}>
          <select value={form.industry} onChange={(e) => onChange({ industry: e.target.value })} className={selectCls}>
            <option value="">— Select industry —</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="Country" required error={errors.country}>
          <select value={form.country} onChange={(e) => onChange({ country: e.target.value })} className={selectCls}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
    </div>
  )
}

function StepContact({ form, onChange, errors }: {
  form: ContactForm
  onChange: (f: Partial<ContactForm>) => void
  errors: Partial<Record<keyof ContactForm, string>>
}) {
  return (
    <div className="space-y-4">
      <Field label="Business Email" required error={errors.email}>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="hello@business.com"
            className="pl-8"
          />
        </div>
      </Field>
      <Field label="Phone Number" error={errors.phone}>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+254 700 000 000"
            className="pl-8"
          />
        </div>
      </Field>
    </div>
  )
}

function StepPlan({ form, onChange, plans }: {
  form: PlanForm
  onChange: (f: Partial<PlanForm>) => void
  plans: SubscriptionPlan[]
}) {
  return (
    <div className="space-y-4">
      {/* Billing toggle */}
      <div className="flex gap-0.5 bg-zinc-100 rounded-lg p-1 w-fit">
        {(["monthly", "annual"] as const).map((interval) => (
          <button
            key={interval}
            onClick={() => onChange({ billing_interval: interval })}
            className={cn(
              "px-4 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
              form.billing_interval === interval
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {interval}
            {interval === "annual" && <span className="ml-1.5 text-[10px] text-green-600 font-semibold">Save 17%</span>}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {plans.map((plan) => {
          const price      = form.billing_interval === "annual" ? plan.price_annual : plan.price_monthly
          const isSelected = form.plan_slug === plan.slug
          return (
            <button
              key={plan.id}
              onClick={() => onChange({ plan_slug: plan.slug })}
              className={cn(
                "w-full text-left border-2 rounded-xl p-4 transition-all",
                isSelected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:border-zinc-300",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-zinc-900 text-sm">{plan.name}</span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-700 bg-zinc-200 px-1.5 py-0.5 rounded-full">
                        <Check className="h-2.5 w-2.5" /> Selected
                      </span>
                    )}
                    {plan.trial_days > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        <Clock className="h-2.5 w-2.5" /> {plan.trial_days}d trial
                      </span>
                    )}
                  </div>
                  {plan.description && <p className="text-xs text-zinc-500 mb-2">{plan.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-2.5 w-2.5 text-zinc-400" />
                      {plan.max_branches === 1 ? "Single" : plan.max_branches != null ? `${plan.max_branches} branches` : "Unlimited branches"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-2.5 w-2.5 text-zinc-400" />
                      {plan.max_users != null ? `${plan.max_users} users` : "Unlimited users"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-2.5 w-2.5 text-zinc-400" />
                      {plan.max_products != null ? `${plan.max_products} products` : "Unlimited products"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold text-zinc-900">
                    {parseFloat(price) === 0 ? "Free" : `KES ${Number(price).toLocaleString()}`}
                  </div>
                  {parseFloat(price) > 0 && (
                    <div className="text-[11px] text-zinc-400">/{form.billing_interval === "annual" ? "yr" : "mo"}</div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StepAdmin({ form, onChange, errors }: {
  form: AdminForm
  onChange: (f: Partial<AdminForm>) => void
  errors: Partial<Record<keyof AdminForm, string>>
}) {
  const [showPin, setShowPin] = useState(false)
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-100 rounded-lg p-3.5 text-xs text-amber-800">
        <p className="font-semibold mb-0.5">First admin account</p>
        <p>This person will have full access. They can create more users after logging in.</p>
      </div>
      <Field label="Full Name" required error={errors.full_name}>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={form.full_name}
            onChange={(e) => onChange({ full_name: e.target.value })}
            placeholder="Alice Wanjiru"
            className="pl-8"
          />
        </div>
      </Field>
      <Field label="Email (optional)" error={errors.email}>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <Input
            type="email"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="alice@business.com"
            className="pl-8"
          />
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="POS PIN" required error={errors.pin}>
          <div className="relative">
            <Input
              type={showPin ? "text" : "password"}
              value={form.pin}
              onChange={(e) => onChange({ pin: e.target.value.slice(0, 4) })}
              placeholder="••••"
              maxLength={4}
              className="pr-8 tracking-widest"
            />
            <button
              type="button"
              onClick={() => setShowPin((s) => !s)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
            >
              {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </Field>
        <Field label="Confirm PIN" required error={errors.pin_confirm}>
          <Input
            type={showPin ? "text" : "password"}
            value={form.pin_confirm}
            onChange={(e) => onChange({ pin_confirm: e.target.value.slice(0, 4) })}
            placeholder="••••"
            maxLength={4}
            className="tracking-widest"
          />
        </Field>
      </div>
      <p className="text-[11px] text-zinc-400 -mt-2">4-digit PIN used to log in to the POS terminal.</p>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CustomerOnboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [step, setStep]           = useState(1)
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState("")

  const [business, setBusiness] = useState<BusinessForm>({ name: "", slug: "", industry: "", country: "Kenya" })
  const [contact,  setContact]  = useState<ContactForm>({ email: "", phone: "" })
  const [plan,     setPlan]     = useState<PlanForm>({ plan_slug: "", billing_interval: "monthly" })
  const [admin,    setAdmin]    = useState<AdminForm>({ full_name: "", email: "", pin: "", pin_confirm: "" })

  const { data: plans = [], isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ["admin", "plans"],
    queryFn: () => api.get("/admin/plans").then((r) => r.data),
  })

  useEffect(() => {
    if (plans.length > 0 && !plan.plan_slug) {
      setPlan((p) => ({ ...p, plan_slug: plans[0].slug }))
    }
  }, [plans]) // eslint-disable-line react-hooks/exhaustive-deps

  const createOrg      = useMutation({ mutationFn: (data: Record<string, unknown>) => api.post("/admin/organizations", data).then((r) => r.data) })
  const createUser     = useMutation({ mutationFn: ({ orgId, data }: { orgId: string; data: Record<string, unknown> }) => api.post(`/admin/organizations/${orgId}/users`, data).then((r) => r.data) })
  const setSubscription = useMutation({ mutationFn: ({ orgId, data }: { orgId: string; data: Record<string, unknown> }) => api.post(`/admin/organizations/${orgId}/subscription`, data).then((r) => r.data) })

  function validate(s: number): boolean {
    const errs: Record<string, string> = {}
    if (s === 1) {
      if (!business.name.trim()) errs.name = "Business name is required"
      if (!business.slug.trim()) errs.slug = "Slug is required"
      else if (!/^[a-z0-9-]+$/.test(business.slug)) errs.slug = "Lowercase letters, numbers and hyphens only"
      if (!business.country) errs.country = "Country is required"
    }
    if (s === 2) {
      if (!contact.email.trim()) errs.email = "Email is required"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) errs.email = "Invalid email address"
    }
    if (s === 4) {
      if (!admin.full_name.trim()) errs.full_name = "Name is required"
      if (admin.pin.length !== 4 || !/^\d{4}$/.test(admin.pin)) errs.pin = "Must be exactly 4 digits"
      if (admin.pin !== admin.pin_confirm) errs.pin_confirm = "PINs do not match"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function next() { if (!validate(step)) return; setStep((s) => s + 1); setErrors({}) }
  function back() { setStep((s) => s - 1); setErrors({}) }

  async function submit() {
    if (!validate(4)) return
    setSubmitError("")
    try {
      const org = await createOrg.mutateAsync({
        name: business.name, slug: business.slug,
        email: contact.email, phone: contact.phone || null, country: business.country,
      })
      await createUser.mutateAsync({
        orgId: org.id,
        data: { full_name: admin.full_name, email: admin.email || undefined, password: admin.pin, role: "admin" },
      })
      if (plan.plan_slug) {
        await setSubscription.mutateAsync({ orgId: org.id, data: { plan_slug: plan.plan_slug, billing_interval: plan.billing_interval } })
      }
      // All steps succeeded — send welcome email now
      await api.post(`/admin/organizations/${org.id}/send-welcome`, { admin_email: admin.email || null })
      qc.invalidateQueries({ queryKey: ["admin", "organizations"] })
      navigate(`/organizations/${org.id}`)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string | object } } })?.response?.data?.detail
      setSubmitError(typeof detail === "string" ? detail : "Failed to onboard. Please check all fields.")
    }
  }

  const isPending      = createOrg.isPending || createUser.isPending || setSubscription.isPending
  const selectedPlan   = plans.find((p) => p.slug === plan.plan_slug)

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-60 bg-zinc-900 p-7 shrink-0">
        <button
          onClick={() => navigate("/organizations")}
          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">New Customer</span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            Complete all steps to onboard a new customer.
          </p>
        </div>

        <div className="space-y-0.5 flex-1">
          {STEPS.map((s) => {
            const done   = step > s.id
            const active = step === s.id
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm",
                  active ? "bg-white/10 text-white" : done ? "text-zinc-400" : "text-zinc-600",
                )}
              >
                <div className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shrink-0",
                  active ? "bg-white text-zinc-900" : done ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-500",
                )}>
                  {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                </div>
                <span className="font-medium">{s.label}</span>
              </div>
            )
          })}
        </div>

        {/* Summary preview */}
        {step > 1 && (
          <div className="mt-auto pt-5 border-t border-zinc-800 space-y-1.5">
            {business.name && (
              <div className="flex items-start gap-2">
                <Building2 className="h-3.5 w-3.5 text-zinc-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-zinc-300 leading-tight">{business.name}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">{business.slug}</p>
                </div>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <p className="text-[11px] text-zinc-400 truncate">{contact.email}</p>
              </div>
            )}
            {selectedPlan && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <p className="text-[11px] text-zinc-400">{selectedPlan.name} plan</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Mobile back */}
        <div className="lg:hidden flex items-center gap-2 px-5 py-4 border-b border-zinc-200 bg-white">
          <button onClick={() => navigate("/organizations")} className="text-zinc-500 hover:text-zinc-800">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-zinc-700">Onboard Customer</span>
        </div>

        <div className="flex-1 flex items-start justify-center p-6 lg:p-10">
          <div className="w-full max-w-lg">
            {/* Mobile step dots */}
            <div className="lg:hidden flex gap-1 mb-6">
              {STEPS.map((s) => (
                <div
                  key={s.id}
                  className={cn("h-1 flex-1 rounded-full transition-colors", step >= s.id ? "bg-zinc-900" : "bg-zinc-200")}
                />
              ))}
            </div>

            <div className="mb-6">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                Step {step} of {STEPS.length}
              </p>
              <h2 className="text-xl font-bold text-zinc-900">
                {step === 1 && "Business Details"}
                {step === 2 && "Contact Information"}
                {step === 3 && "Choose a Plan"}
                {step === 4 && "Admin Account"}
              </h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                {step === 1 && "Tell us about the customer's business."}
                {step === 2 && "How do we reach this customer?"}
                {step === 3 && "Select the plan that fits their needs."}
                {step === 4 && "Create the first admin user for this customer."}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
              {step === 1 && (
                <StepBusiness form={business} onChange={(f) => setBusiness((b) => ({ ...b, ...f }))} errors={errors} />
              )}
              {step === 2 && (
                <StepContact form={contact} onChange={(f) => setContact((c) => ({ ...c, ...f }))} errors={errors} />
              )}
              {step === 3 && (
                plansLoading ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading plans…</span>
                  </div>
                ) : plans.length === 0 ? (
                  <div className="text-center py-12 text-sm text-zinc-400">
                    No plans yet.{" "}
                    <button onClick={() => setStep(4)} className="text-zinc-700 underline underline-offset-2">
                      Skip this step
                    </button>
                  </div>
                ) : (
                  <StepPlan form={plan} onChange={(f) => setPlan((p) => ({ ...p, ...f }))} plans={plans} />
                )
              )}
              {step === 4 && (
                <div className="space-y-5">
                  <StepAdmin form={admin} onChange={(f) => setAdmin((a) => ({ ...a, ...f }))} errors={errors} />

                  {/* Summary */}
                  <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Summary</p>
                    {[
                      { label: "Business",  value: business.name },
                      { label: "Slug",      value: business.slug },
                      { label: "Industry",  value: business.industry || undefined },
                      { label: "Country",   value: business.country },
                      { label: "Email",     value: contact.email },
                      { label: "Phone",     value: contact.phone || undefined },
                      { label: "Plan",      value: selectedPlan?.name },
                      { label: "Billing",   value: plan.billing_interval === "annual" ? "Annual" : "Monthly" },
                    ]
                      .filter((r) => r.value)
                      .map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-start gap-3 text-sm py-2 border-b border-zinc-100 last:border-0">
                          <span className="text-zinc-500 shrink-0">{label}</span>
                          <span className="font-medium text-zinc-800 text-right">{value}</span>
                        </div>
                      ))
                    }
                  </div>

                  <FormError message={submitError} />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between mt-5">
              {step > 1 ? (
                <Button variant="outline" onClick={back} disabled={isPending}>
                  <ArrowLeft /> Back
                </Button>
              ) : <div />}

              {step < 4 ? (
                <Button onClick={next} className="bg-zinc-900 text-white hover:bg-zinc-800">
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button
                  onClick={submit}
                  disabled={isPending}
                  className="bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  {isPending
                    ? <><Loader2 className="animate-spin" /> Onboarding…</>
                    : <><Check /> Complete Onboarding</>
                  }
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
