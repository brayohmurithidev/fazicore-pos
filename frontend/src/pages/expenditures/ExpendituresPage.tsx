import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, X, TrendingDown, Wallet, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useExpenditures, useExpenditureSummary,
  useCreateExpenditure, useUpdateExpenditure, useDeleteExpenditure,
  useBranches,
} from '@/lib/queries'
import { useFeature } from '@/hooks/useFeature'
import { UpgradeWall } from '@/components/shared/UpgradeWall'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { ApiExpenditure } from '@/types/api'

const CATEGORIES = ['rent', 'utilities', 'salaries', 'supplies', 'transport', 'marketing', 'maintenance', 'other']

const CATEGORY_COLORS: Record<string, string> = {
  rent:         'bg-purple-100 text-purple-800',
  utilities:    'bg-blue-100 text-blue-800',
  salaries:     'bg-green-100 text-green-800',
  supplies:     'bg-orange-100 text-orange-800',
  transport:    'bg-cyan-100 text-cyan-800',
  marketing:    'bg-pink-100 text-pink-800',
  maintenance:  'bg-amber-100 text-amber-800',
  other:        'bg-gray-100 text-gray-700',
}

const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function thisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = todayISO()
  return { from, to }
}

// ── Form Modal ────────────────────────────────────────────────────────────────

function ExpenditureModal({
  initial, onClose,
}: {
  initial: ApiExpenditure | null
  onClose: () => void
}) {
  const { data: branches = [] } = useBranches()
  const createMutation = useCreateExpenditure()
  const updateMutation = useUpdateExpenditure()

  const [form, setForm] = useState({
    category: initial?.category ?? 'other',
    amount: initial?.amount ? String(initial.amount) : '',
    description: initial?.description ?? '',
    date: initial?.date ?? todayISO(),
    branch_id: initial?.branch_id ? String(initial.branch_id) : '',
  })
  const [error, setError] = useState<string | null>(null)

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const amount = parseFloat(form.amount)
    if (!form.amount || isNaN(amount) || amount <= 0) { setError('Enter a valid amount.'); return }
    const payload = {
      category: form.category,
      amount,
      description: form.description.trim() || undefined,
      date: form.date,
      branch_id: form.branch_id ? parseInt(form.branch_id) : undefined,
    }
    try {
      if (initial) {
        await updateMutation.mutateAsync({ id: initial.id, ...payload })
        toast.success('Expenditure updated')
      } else {
        await createMutation.mutateAsync(payload)
        toast.success('Expenditure recorded')
      }
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Expenditure' : 'Record Expenditure'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Category</Label>
            <Select value={form.category} onValueChange={(v) => set('category', v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Amount (KES) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Date *</Label>
            <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Description</Label>
            <Input placeholder="Optional notes" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          {branches.length > 1 && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Branch</Label>
              <Select value={form.branch_id} onValueChange={(v) => set('branch_id', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All branches</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending && <Loader2 size={14} className="animate-spin mr-1" />}
              {initial ? 'Save changes' : 'Record'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function ExpendituresPage() {
  const hasExpenditure = useFeature('expenditure_tracking')
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  const { from: defaultFrom, to: defaultTo } = thisMonthRange()
  const [dateFrom, setDateFrom] = useState(defaultFrom)
  const [dateTo, setDateTo] = useState(defaultTo)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [modal, setModal] = useState<'create' | ApiExpenditure | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApiExpenditure | null>(null)

  const params = {
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    category: categoryFilter || undefined,
  }

  const { data: expenditures = [], isLoading } = useExpenditures(params)
  const { data: summary } = useExpenditureSummary({ date_from: dateFrom || undefined, date_to: dateTo || undefined })
  const deleteMutation = useDeleteExpenditure()

  if (!hasExpenditure) {
    return <UpgradeWall feature="Expenditure Tracking" description="Record rent, utilities, salaries and other business expenses. Get a clear picture of your spending." />
  }

  async function handleDelete(exp: ApiExpenditure) {
    try {
      await deleteMutation.mutateAsync(exp.id)
      toast.success('Expenditure deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete')
    }
  }

  const topCategory = summary
    ? Object.entries(summary.by_category).sort((a, b) => b[1] - a[1])[0]
    : null

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      {modal !== null && (
        <ExpenditureModal
          initial={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenditures</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track and manage business expenses</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setModal('create')} className="flex items-center gap-2">
            <Plus size={15} /> New Expenditure
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <SummaryCard
          label="Total this period"
          value={summary ? fmt(summary.total) : '—'}
          icon={Wallet}
          accent="#6366F1"
        />
        <SummaryCard
          label="No. of entries"
          value={String(expenditures.length)}
          icon={TrendingDown}
          accent="#EF4444"
        />
        <SummaryCard
          label="Top category"
          value={topCategory ? `${topCategory[0]} · ${fmt(topCategory[1])}` : '—'}
          icon={Tag}
          accent="#F59E0B"
          capitalize
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? '')}>
          <SelectTrigger className="w-40 text-sm h-9">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {(categoryFilter || dateFrom !== defaultFrom || dateTo !== defaultTo) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setCategoryFilter(''); setDateFrom(defaultFrom); setDateTo(defaultTo) }}
            className="flex items-center gap-1 text-gray-500"
          >
            <X size={13} /> Reset
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : expenditures.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingDown size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No expenditures in this period.</p>
            {isAdmin && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setModal('create')}>
                <Plus size={13} className="mr-1" /> Record first expenditure
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenditures.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap">{exp.date}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS.other)}>
                      {exp.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{exp.description ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">{fmt(exp.amount)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {deleteTarget?.id === exp.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(exp)}
                            disabled={deleteMutation.isPending}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded"
                          >
                            {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirm'}
                          </button>
                          <button onClick={() => setDeleteTarget(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1 py-1 rounded">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 justify-end">
                          <button
                            onClick={() => setModal(exp)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(exp)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={isAdmin ? 3 : 3} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{fmt(summary?.total ?? 0)}</td>
                {isAdmin && <td />}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Category breakdown */}
      {summary && Object.keys(summary.by_category).length > 0 && (
        <div className="mt-5 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Breakdown by Category</h3>
          <div className="space-y-3">
            {Object.entries(summary.by_category)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => {
                const pct = summary.total > 0 ? (total / summary.total) * 100 : 0
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full capitalize', CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other)}>{cat}</span>
                      <span className="text-sm font-semibold text-gray-900">{fmt(total)} <span className="text-xs font-normal text-gray-400">({pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, icon: Icon, accent, capitalize }: {
  label: string; value: string; icon: React.ElementType; accent: string; capitalize?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</div>
        <div className={cn('text-xl font-bold text-gray-900 leading-none', capitalize && 'capitalize')}>{value}</div>
      </div>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: accent + '18' }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
    </div>
  )
}
