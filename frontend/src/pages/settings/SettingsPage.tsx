import { useState } from 'react'
import {
  CheckCircle2, XCircle, Pencil, X, Check, Zap, Loader2, Lock, Star,
  Settings, CreditCard, Users, Shield, ClipboardList, Sparkles,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettingsStore } from '@/stores/settings'
import { useSubscription, usePermissions, useUpdatePermissions, FEATURE_CATALOG } from '@/lib/queries'
import { useFeatureFlags } from '@/hooks/useFeature'
import { useAuthStore } from '@/stores/auth'
import { UsersPage } from '@/pages/users/UsersPage'
import { AuditPage } from '@/pages/audit/AuditPage'
import { cn } from '@/lib/utils'
import type { Settings as SettingsType } from '@/types'
import type { ApiPlanInfo } from '@/types/api'

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'general' | 'payments' | 'users' | 'permissions' | 'audit' | 'plan'

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ label, sub, value, onChange, locked }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; locked?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-3.5 border-b border-gray-100 last:border-0 ${locked ? 'opacity-60' : ''}`}>
      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-900">{label}</div>
          {locked && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
              <Lock size={9} /> Upgrade
            </span>
          )}
        </div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <button
        onClick={() => !locked && onChange(!value)}
        disabled={locked}
        className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${locked ? 'cursor-not-allowed bg-gray-200' : value ? 'bg-gray-900' : 'bg-gray-300'}`}
      >
        <div className={`w-[18px] h-[18px] rounded-full bg-white absolute top-[3px] transition-all ${value && !locked ? 'left-[23px]' : 'left-[3px]'}`} />
      </button>
    </div>
  )
}

function Section({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold text-sm text-gray-900">{title}</div>
        {action}
      </div>
      <Separator className="mb-3" />
      {children}
    </div>
  )
}

// ── Business Information ───────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  'Minimart / Supermarket', 'Bar / Restaurant', 'Pharmacy', 'Hardware Store',
  'Clothing & Fashion', 'Electronics', 'Bakery', 'Other',
]
const CURRENCIES = [
  'KES — Kenyan Shilling', 'UGX — Ugandan Shilling', 'TZS — Tanzanian Shilling',
  'USD — US Dollar', 'GBP — British Pound',
]

function BusinessInfoSection() {
  const { settings, update } = useSettingsStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<SettingsType>>({})

  const startEdit = () => {
    setDraft({
      businessName: settings.businessName, businessType: settings.businessType,
      country: settings.country, currency: settings.currency,
      kraPin: settings.kraPin, vatNumber: settings.vatNumber,
      businessEmail: settings.businessEmail, businessPhone: settings.businessPhone,
    })
    setEditing(true)
  }

  const f = (k: keyof SettingsType) => (editing ? (draft[k] as string ?? '') : (settings[k] as string ?? ''))
  const setF = (k: keyof SettingsType) => (v: string) => setDraft((d) => ({ ...d, [k]: v }))

  if (editing) {
    return (
      <Section
        title="Business Information"
        action={
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors">
              <X size={12} /> Cancel
            </button>
            <button onClick={() => { update(draft); setEditing(false) }} className="flex items-center gap-1 text-xs text-white bg-gray-900 hover:bg-gray-700 px-2 py-1 rounded transition-colors">
              <Check size={12} /> Save
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <div className="col-span-1 sm:col-span-2">
            <Label className="text-xs text-gray-500 mb-1.5 block">Business Name</Label>
            <Input value={f('businessName')} onChange={(e) => setF('businessName')(e.target.value)} placeholder="Your business name" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Business Type</Label>
            {(() => {
              const knownType = BUSINESS_TYPES.includes(f('businessType')) ? f('businessType') : 'Other'
              return (
                <div className="flex flex-col gap-2">
                  <Select value={knownType} onValueChange={(v) => { if (v && v !== 'Other') setF('businessType')(v); else setF('businessType')('') }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {knownType === 'Other' && (
                    <Input value={f('businessType')} onChange={(e) => setF('businessType')(e.target.value)} placeholder="Describe your business type" autoFocus />
                  )}
                </div>
              )
            })()}
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Currency</Label>
            <Select value={f('currency')} onValueChange={(v) => setF('currency')(v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">Country</Label><Input value={f('country')} onChange={(e) => setF('country')(e.target.value)} placeholder="e.g. Kenya" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">Phone</Label><Input value={f('businessPhone')} onChange={(e) => setF('businessPhone')(e.target.value)} placeholder="+254 712 000 001" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">Email</Label><Input value={f('businessEmail')} onChange={(e) => setF('businessEmail')(e.target.value)} placeholder="info@mybusiness.co.ke" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">KRA PIN</Label><Input value={f('kraPin')} onChange={(e) => setF('kraPin')(e.target.value)} placeholder="P051234567W" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">VAT Number</Label><Input value={f('vatNumber')} onChange={(e) => setF('vatNumber')(e.target.value)} placeholder="VAT/2024/KE/001" /></div>
        </div>
      </Section>
    )
  }

  const rows: [string, string][] = [
    ['Business Name', settings.businessName], ['Business Type', settings.businessType],
    ['Country', settings.country], ['Currency', settings.currency],
    ...(settings.businessPhone ? [['Phone', settings.businessPhone] as [string, string]] : []),
    ...(settings.businessEmail ? [['Email', settings.businessEmail] as [string, string]] : []),
    ...(settings.kraPin ? [['KRA PIN', settings.kraPin] as [string, string]] : []),
    ...(settings.vatNumber ? [['VAT Number', settings.vatNumber] as [string, string]] : []),
  ]

  return (
    <Section title="Business Information" action={
      <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors">
        <Pencil size={11} /> Edit
      </button>
    }>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0 text-sm">
          <span className="text-gray-500">{k}</span>
          <span className="font-medium text-right max-w-[60%] truncate">{v || <span className="text-gray-300">—</span>}</span>
        </div>
      ))}
    </Section>
  )
}

// ── General tab ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const { settings, update } = useSettingsStore()
  const flags = useFeatureFlags()
  const patch = (k: keyof SettingsType, v: boolean) => update({ [k]: v })

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <BusinessInfoSection />
      <Section title="POS Behaviour">
        <Toggle label="Require Cashier PIN" sub="Cashier must enter PIN to start a shift" value={settings.requirePin} onChange={(v) => patch('requirePin', v)} />
        <Toggle label="Print Receipt by Default" sub="Auto-open receipt after every sale" value={settings.autoPrint} onChange={(v) => patch('autoPrint', v)} />
        <Toggle label="Low Stock Alerts" sub="Show warnings when stock is below minimum" value={settings.lowStockAlerts} onChange={(v) => patch('lowStockAlerts', v)} />
        <Toggle label="Expiry Date Tracking" sub="Alert when products near expiry" value={settings.expiryTracking} onChange={(v) => patch('expiryTracking', v)} />
        <Toggle label="Barcode Scanner Mode" sub="Enable barcode input field on POS screen" value={settings.barcodeMode} onChange={(v) => patch('barcodeMode', v)} locked={flags.barcode_mode === false} />
      </Section>
      <Section title="Receipt Settings">
        <Toggle label="Show VAT Breakdown" sub="Print VAT amounts on receipt" value={settings.showVat} onChange={(v) => patch('showVat', v)} />
        <Toggle label="Show Business Logo" sub="Include logo on printed receipts" value={settings.showLogo} onChange={(v) => patch('showLogo', v)} />
        <Toggle label="Digital Receipt (SMS)" sub="Send receipt via SMS to customer" value={settings.smsReceipt} onChange={(v) => patch('smsReceipt', v)} locked={flags.sms_receipts === false} />
      </Section>
      <Section title="Branches">
        <Toggle label="Branch-level Inventory" sub="Each branch tracks its own stock separately" value={settings.branchInventory} onChange={(v) => patch('branchInventory', v)} locked={flags.multi_branch === false} />
        <Toggle label="Consolidated Reports" sub="Combined reports across all branches" value={settings.consolidatedReports} onChange={(v) => patch('consolidatedReports', v)} locked={flags.multi_branch === false} />
        <Toggle label="Inter-branch Stock Transfer" sub="Allow moving stock between branches" value={settings.stockTransfer} onChange={(v) => patch('stockTransfer', v)} locked={flags.multi_branch === false} />
      </Section>
    </div>
  )
}

// ── Payments tab ──────────────────────────────────────────────────────────────

function PaymentsTab() {
  const { settings, update } = useSettingsStore()
  const flags = useFeatureFlags()
  const patch = (k: keyof SettingsType, v: boolean) => update({ [k]: v })

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Section title="Payment Methods">
        <Toggle label="Cash" sub="Accept cash payments" value={settings.cash} onChange={(v) => patch('cash', v)} />
        <Toggle label="M-Pesa Manual" sub="Customer sends M-Pesa, cashier enters the reference code" value={settings.mpesa} onChange={(v) => patch('mpesa', v)} locked={flags.mpesa_manual === false} />
        <Toggle label="M-Pesa STK Push" sub="Trigger a payment prompt on the customer's phone" value={settings.mpesa} onChange={(v) => patch('mpesa', v)} locked={flags.mpesa_stk === false} />
        <Toggle label="Credit Sales" sub="Allow sales on credit with debt tracking" value={settings.credit} onChange={(v) => patch('credit', v)} locked={flags.credit_system === false} />
        <Toggle label="Other Methods" sub="Bank transfer, card, etc." value={settings.other} onChange={(v) => patch('other', v)} />
        <Toggle label="Split Payments" sub="Allow part-cash, part-M-Pesa" value={settings.mpesa && settings.cash} onChange={() => {}} />
      </Section>
    </div>
  )
}

// ── Permissions tab ───────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  edit_prices:       { label: 'Edit Prices',        desc: 'Change product selling price' },
  view_reports:      { label: 'View Reports',        desc: 'Access sales & inventory reports' },
  delete_sales:      { label: 'Delete Sales',        desc: 'Void or delete orders' },
  manage_users:      { label: 'Manage Users',        desc: 'Create, edit and deactivate users' },
  apply_discounts:   { label: 'Apply Discounts',     desc: 'Give item or cart discounts at POS' },
  manage_inventory:  { label: 'Manage Inventory',    desc: 'Adjust stock levels & receive orders' },
  process_sales:     { label: 'Process Sales',       desc: 'Create and complete sales transactions' },
}
const ROLE_LABELS: Record<string, string> = { cashier: 'Cashier', manager: 'Manager', stock: 'Stock' }

function PermissionsTab() {
  const { user } = useAuthStore()
  const { data, isLoading } = usePermissions()
  const updatePerms = useUpdatePermissions()
  const [local, setLocal] = useState<Record<string, Record<string, boolean>> | null>(null)
  const [saved, setSaved] = useState(false)

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-sm text-gray-400 text-center mt-10">
        Only admins can manage role permissions.
      </div>
    )
  }

  const perms = local ?? data?.permissions ?? {}

  const toggle = (role: string, perm: string) => {
    const base = local ?? data?.permissions ?? {}
    setLocal({ ...base, [role]: { ...(base[role] ?? {}), [perm]: !(base[role]?.[perm] ?? false) } })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!local) return
    await updatePerms.mutateAsync(local)
    setLocal(null); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveAction = local ? (
    <Button size="sm" className="h-7 px-3 text-xs" onClick={handleSave} disabled={updatePerms.isPending}>
      {updatePerms.isPending && <Loader2 size={11} className="animate-spin mr-1" />}Save
    </Button>
  ) : saved ? (
    <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12} />Saved</span>
  ) : null

  const setPosPerm = (perm: string, value: boolean) => {
    const base = local ?? data?.permissions ?? {}
    setLocal({ ...base, pos: { ...(base.pos ?? {}), [perm]: value } })
    setSaved(false)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Section title="Role Permissions" action={saveAction}>
        {isLoading ? <Loader2 size={14} className="animate-spin text-gray-400" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr>
                  <th className="text-left text-xs text-gray-500 pb-3 pr-4 font-semibold">Permission</th>
                  {Object.keys(ROLE_LABELS).map(role => (
                    <th key={role} className="text-center text-xs text-gray-500 pb-3 px-4 font-semibold">{ROLE_LABELS[role]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(PERMISSION_LABELS).map(([perm, { label, desc }]) => (
                  <tr key={perm} className="border-t border-gray-100">
                    <td className="py-3 pr-4">
                      <div className="text-sm font-medium text-gray-900">{label}</div>
                      <div className="text-xs text-gray-400">{desc}</div>
                    </td>
                    {Object.keys(ROLE_LABELS).map(role => {
                      const enabled = perms[role]?.[perm] ?? false
                      return (
                        <td key={role} className="py-3 px-4 text-center">
                          <button
                            onClick={() => toggle(role, perm)}
                            className={`rounded-full relative transition-colors inline-block ${enabled ? 'bg-gray-900' : 'bg-gray-200'}`}
                            style={{ width: 40, height: 22 }}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-[3px] transition-all ${enabled ? 'left-[21px]' : 'left-[3px]'}`} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-3">Admins always have all permissions regardless of these settings.</p>
          </div>
        )}
      </Section>

      <Section title="Discount Controls" action={saveAction}>
        <Toggle
          label="Allow cashier discount"
          sub="Cashiers can apply discounts at the POS"
          value={perms?.pos?.allow_cashier_discount !== false}
          onChange={(v) => setPosPerm('allow_cashier_discount', v)}
        />
        <Toggle
          label="Require manager PIN for large discounts"
          sub="Discounts above 10% require manager or admin approval"
          value={perms?.pos?.require_manager_pin !== false}
          onChange={(v) => setPosPerm('require_manager_pin', v)}
        />
      </Section>
    </div>
  )
}

// ── Plan tab ──────────────────────────────────────────────────────────────────

function UsageBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((current / max) * 100))
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-gray-900'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{max < 0 ? `${current} / Unlimited` : `${current} / ${max}`}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${max < 0 ? 20 : pct}%` }} />
      </div>
    </div>
  )
}

const PLAN_ORDER = ['free', 'starter', 'growth', 'business', 'enterprise']
const PLAN_COLORS: Record<string, string> = {
  free: '#9CA3AF', starter: '#6B7280', growth: '#3B82F6', business: '#8B5CF6', enterprise: '#111827',
}

function PlanCard({ plan, isCurrent }: { plan: ApiPlanInfo; isCurrent: boolean }) {
  const color = PLAN_COLORS[plan.slug] ?? '#111827'
  const isEnterprise = plan.slug === 'enterprise'
  return (
    <div className={`rounded-xl border-2 p-4 flex flex-col gap-3 transition-all ${
      isCurrent ? 'border-gray-900 bg-gray-50' : plan.is_recommended ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-400'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="font-bold text-sm">{plan.name}</span>
          {plan.is_recommended && !isCurrent && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">
              <Star size={9} className="fill-amber-600" />Recommended
            </span>
          )}
        </div>
        {isCurrent && <Badge className="text-[10px] px-1.5 py-0 h-5">Current</Badge>}
      </div>
      <div>
        {isEnterprise ? (
          <span className="text-base font-bold text-gray-900">Custom pricing</span>
        ) : plan.price_monthly === 0 ? (
          <span className="text-base font-bold text-gray-900">Free</span>
        ) : (
          <div>
            <span className="text-xl font-extrabold text-gray-900">KES {plan.price_monthly.toLocaleString()}</span>
            <span className="text-xs text-gray-400">/mo</span>
            {plan.price_annual > 0 && (
              <div className="text-[11px] text-green-600 font-medium">
                KES {plan.price_annual.toLocaleString()}/yr · save {Math.round(100 - (plan.price_annual / (plan.price_monthly * 12)) * 100)}%
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1 py-2 border-y border-gray-100">
        {[{ label: 'Branches', value: plan.max_branches }, { label: 'Users', value: plan.max_users }, { label: 'Products', value: plan.max_products }].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-sm font-bold text-gray-900">{value < 0 ? '∞' : value.toLocaleString()}</div>
            <div className="text-[10px] text-gray-400">{label}</div>
          </div>
        ))}
      </div>
      {plan.features.length > 0 && (
        <ul className="space-y-1">
          {plan.features.map((feat) => (
            <li key={feat} className="flex items-center gap-1.5 text-xs text-gray-600">
              <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />{feat}
            </li>
          ))}
        </ul>
      )}
      {!isCurrent && (
        <button
          className="mt-auto w-full py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-80"
          style={{ background: color }}
          onClick={() => alert(`Contact sales@fazilabs.com to upgrade to ${plan.name}.`)}
        >
          {isEnterprise ? 'Contact Sales' : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  )
}

function PlanTab() {
  const { data: sub, isLoading } = useSubscription()
  const flags = useFeatureFlags()
  const featureGroups = [...new Set(FEATURE_CATALOG.map((f) => f.group))]

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Loading plan info...</div>
  }
  if (!sub) return null

  const statusLabel: Record<string, string> = { trial: 'Free Trial', active: 'Active', suspended: 'Suspended', cancelled: 'Cancelled' }
  const statusColor: Record<string, string> = {
    trial: 'bg-amber-100 text-amber-800', active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800', cancelled: 'bg-gray-100 text-gray-600',
  }
  const trialEnd = sub.trial_ends_at
    ? new Date(sub.trial_ends_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const sortedPlans = [...sub.available_plans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.slug) - PLAN_ORDER.indexOf(b.slug)
  )
  const currentFlags = sub.feature_flags ?? {}

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      {/* Current plan */}
      <Section title="Current Plan">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-gray-900">{sub.plan_name} Plan</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {statusLabel[sub.status] ?? sub.status}
              </span>
            </div>
            {trialEnd && sub.status === 'trial' && (
              <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                <Zap size={11} />Trial ends {trialEnd} — upgrade to keep full access
              </div>
            )}
          </div>
        </div>
        <div className="text-[11px] font-semibold text-gray-400 mb-3 uppercase tracking-wide">Usage</div>
        <UsageBar label="Branches" current={sub.branch_count} max={sub.max_branches} />
        <UsageBar label="Users" current={sub.user_count} max={sub.max_users} />
        <UsageBar label="Products" current={sub.active_product_count} max={sub.max_products} />
      </Section>

      {/* Included features */}
      <Section title="Included Features">
        {featureGroups.map((group) => (
          <div key={group} className="mb-4 last:mb-0">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{group}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {FEATURE_CATALOG.filter((f) => f.group === group).map((feat) => {
                const enabled = flags[feat.key] === true
                return (
                  <div key={feat.key} className={`flex items-center gap-1.5 text-xs py-1 ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                    {enabled
                      ? <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                      : <XCircle size={12} className="text-gray-300 shrink-0" />
                    }
                    {feat.label}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div className="hidden">{currentFlags && null}</div>
      </Section>

      {/* Available plans */}
      <div className="text-[11px] font-semibold text-gray-400 mb-3 uppercase tracking-wide">Available Plans</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sortedPlans.map((plan) => (
          <PlanCard key={plan.slug} plan={plan} isCurrent={plan.is_current} />
        ))}
      </div>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuthStore()
  const flags = useFeatureFlags()
  const [tab, setTab] = useState<TabId>('general')

  const isAdmin = user?.role === 'admin'

  const TABS = ([
    { id: 'general',     label: 'General',      icon: Settings },
    { id: 'payments',    label: 'Payments',     icon: CreditCard },
    { id: 'users',       label: 'Users',        icon: Users,        adminOnly: true },
    { id: 'permissions', label: 'Permissions',  icon: Shield,       adminOnly: true },
    { id: 'audit',       label: 'Audit Log',    icon: ClipboardList, adminOnly: true, hidden: flags.audit_logs === false },
    { id: 'plan',        label: 'Plan & Billing', icon: Sparkles },
  ] as { id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean; hidden?: boolean }[]).filter((t) => !t.hidden && (!t.adminOnly || isAdmin))

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile: horizontal tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-gray-200 bg-white shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0',
                tab === t.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      {/* Desktop: side nav + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="hidden md:flex flex-col w-48 shrink-0 border-r border-gray-200 bg-white py-4 px-2 gap-0.5 overflow-y-auto">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pb-2">Settings</div>
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  tab === t.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon size={15} className="shrink-0" />
                {t.label}
              </button>
            )
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'general'     && <GeneralTab />}
          {tab === 'payments'    && <PaymentsTab />}
          {tab === 'users'       && <UsersPage />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'audit'       && <AuditPage />}
          {tab === 'plan'        && <PlanTab />}
        </div>
      </div>
    </div>
  )
}
