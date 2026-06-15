import { useState } from 'react'
import {
  FileCheck, Settings, CheckCircle2, XCircle, Clock, RefreshCw,
  Wifi, WifiOff, AlertTriangle, Loader2, Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useEtimsConfig, useUpdateEtimsConfig, useTestEtimsConnection,
  useEtimsSubmissions, useRetryEtimsSubmission,
} from '@/lib/queries'
import { toast } from '@/lib/toast'
import type { ApiEtimsSubmission } from '@/types/api'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    submitted: { cls: 'bg-green-100 text-green-800',  icon: <CheckCircle2 size={11} />, label: 'Submitted' },
    pending:   { cls: 'bg-amber-100 text-amber-800',  icon: <Clock size={11} />,        label: 'Pending'   },
    failed:    { cls: 'bg-red-100 text-red-700',      icon: <XCircle size={11} />,      label: 'Failed'    },
  }
  const s = map[status] ?? { cls: 'bg-gray-100 text-gray-600', icon: null, label: status }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', s.cls)}>
      {s.icon}{s.label}
    </span>
  )
}

// ── Config card ───────────────────────────────────────────────────────────────

function ConfigCard() {
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({ kra_pin: '', bhf_id: '00', device_serial: '', sandbox_mode: true, is_active: false })
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [testError, setTestError] = useState('')

  const { data: config, isLoading } = useEtimsConfig()
  const update = useUpdateEtimsConfig()
  const testConn = useTestEtimsConnection()

  const openEdit = () => {
    setForm({
      kra_pin: config?.kra_pin ?? '',
      bhf_id: config?.bhf_id ?? '00',
      device_serial: config?.device_serial ?? '',
      sandbox_mode: config?.sandbox_mode ?? true,
      is_active: config?.is_active ?? false,
    })
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!form.kra_pin.trim()) { toast.error('KRA PIN is required'); return }
    try {
      await update.mutateAsync({
        kra_pin: form.kra_pin.trim(),
        bhf_id: form.bhf_id.trim() || '00',
        device_serial: form.device_serial.trim() || null,
        sandbox_mode: form.sandbox_mode,
        is_active: form.is_active,
      })
      toast.success('eTIMS configuration saved')
      setEditOpen(false)
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save config')
    }
  }

  const handleTest = async () => {
    setTestResult(null); setTestError('')
    try {
      const res = await testConn.mutateAsync()
      if (res.ok) { setTestResult('ok') }
      else { setTestResult('fail'); setTestError(res.error ?? 'Connection failed') }
    } catch {
      setTestResult('fail'); setTestError('Could not reach eTIMS service')
    }
  }

  if (isLoading) return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-3">
      <Loader2 size={16} className="animate-spin text-gray-400" />
      <span className="text-sm text-gray-400">Loading configuration…</span>
    </div>
  )

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', config?.is_active ? 'bg-green-100' : 'bg-gray-100')}>
              <Shield size={20} className={config?.is_active ? 'text-green-700' : 'text-gray-400'} />
            </div>
            <div>
              <div className="font-bold text-gray-900">KRA eTIMS Integration</div>
              <div className="text-xs text-gray-500 mt-0.5">Kenya Revenue Authority — Electronic Tax Invoice Management System</div>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={openEdit} className="gap-1.5 shrink-0">
            <Settings size={13} />{config ? 'Edit' : 'Configure'}
          </Button>
        </div>

        {!config ? (
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>eTIMS is not configured. Set up your KRA PIN and Branch ID to start submitting invoices automatically.</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">KRA PIN</div>
              <div className="text-sm font-bold text-gray-900 font-mono">{config.kra_pin}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Branch ID</div>
              <div className="text-sm font-bold text-gray-900 font-mono">{config.bhf_id}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Mode</div>
              <div className={cn('text-sm font-bold', config.sandbox_mode ? 'text-amber-600' : 'text-gray-900')}>
                {config.sandbox_mode ? 'Sandbox' : 'Live'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Status</div>
              <div className={cn('text-sm font-bold', config.is_active ? 'text-green-700' : 'text-gray-400')}>
                {config.is_active ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        )}

        {config && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testConn.isPending}
              className="gap-1.5"
            >
              {testConn.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : testResult === 'ok'
                  ? <Wifi size={13} className="text-green-600" />
                  : testResult === 'fail'
                    ? <WifiOff size={13} className="text-red-500" />
                    : <Wifi size={13} />
              }
              Test Connection
            </Button>
            {testResult === 'ok' && (
              <span className="text-xs text-green-700 font-medium flex items-center gap-1">
                <CheckCircle2 size={12} />Connected successfully
              </span>
            )}
            {testResult === 'fail' && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <XCircle size={12} />{testError || 'Connection failed'}
              </span>
            )}
            {config.sandbox_mode && (
              <span className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                Sandbox — invoices are not legally binding
              </span>
            )}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>eTIMS Configuration</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 mt-1">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">KRA PIN *</Label>
              <Input
                value={form.kra_pin}
                onChange={(e) => setForm((f) => ({ ...f, kra_pin: e.target.value.toUpperCase() }))}
                placeholder="e.g. P051234567Y"
                className="font-mono tracking-widest"
                maxLength={20}
              />
              <p className="text-xs text-gray-400 mt-1">Your organisation's KRA PIN (10–20 characters)</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Branch ID (BHF ID)</Label>
              <Input
                value={form.bhf_id}
                onChange={(e) => setForm((f) => ({ ...f, bhf_id: e.target.value }))}
                placeholder="00"
                className="font-mono"
                maxLength={10}
              />
              <p className="text-xs text-gray-400 mt-1">Usually "00" for single-branch businesses</p>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Device Serial <span className="font-normal">(optional)</span></Label>
              <Input
                value={form.device_serial}
                onChange={(e) => setForm((f) => ({ ...f, device_serial: e.target.value }))}
                placeholder="VSCU serial number"
                className="font-mono"
              />
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-gray-900">Sandbox Mode</div>
                  <div className="text-xs text-gray-400">Test submissions — not sent to KRA live system</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, sandbox_mode: !f.sandbox_mode }))}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                    form.sandbox_mode ? 'bg-amber-500' : 'bg-gray-300'
                  )}
                >
                  <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', form.sandbox_mode ? 'translate-x-4.5' : 'translate-x-0.5')} />
                </button>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-sm font-medium text-gray-900">Active</div>
                  <div className="text-xs text-gray-400">Enable automatic submission of invoices to eTIMS</div>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                    form.is_active ? 'bg-green-600' : 'bg-gray-300'
                  )}
                >
                  <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', form.is_active ? 'translate-x-4.5' : 'translate-x-0.5')} />
                </button>
              </label>
            </div>
            <div className="flex gap-2 mt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button size="sm" className="flex-1" onClick={handleSave} disabled={update.isPending}>
                {update.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Submission row ─────────────────────────────────────────────────────────────

function SubmissionRow({ sub }: { sub: ApiEtimsSubmission }) {
  const retry = useRetryEtimsSubmission()

  const handleRetry = async () => {
    try {
      await retry.mutateAsync(sub.id)
      toast.success('Retry queued')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Retry failed')
    }
  }

  return (
    <div className="flex items-start gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">
      <div className="pt-0.5 shrink-0">
        <StatusBadge status={sub.status} />
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Order</div>
          <div className="text-sm font-semibold text-gray-900">
            {sub.order_id ? `#${sub.order_id}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">CU Invoice No.</div>
          <div className="text-sm font-mono text-gray-900">{sub.cu_invoice_no ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">
            {sub.status === 'submitted' ? 'Submitted' : sub.status === 'failed' ? 'Last attempt' : 'Queued'}
          </div>
          <div className="text-sm text-gray-700">{fmtDate(sub.submitted_at ?? sub.created_at)}</div>
        </div>
      </div>
      <div className="shrink-0 text-right space-y-1">
        {sub.attempt_count > 0 && (
          <div className="text-[11px] text-gray-400">{sub.attempt_count} attempt{sub.attempt_count !== 1 ? 's' : ''}</div>
        )}
        {sub.status === 'failed' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={retry.isPending}
            className="h-7 px-2.5 text-xs gap-1"
          >
            {retry.isPending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Retry
          </Button>
        )}
        {sub.next_retry_at && sub.status === 'pending' && (
          <div className="text-[11px] text-gray-400">
            Next: {new Date(sub.next_retry_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
      {sub.error_message && (
        <div className="col-span-full mt-2 text-xs text-red-600 bg-red-50 rounded px-2.5 py-1.5 w-full">
          {sub.error_message}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all', 'pending', 'submitted', 'failed'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export function EtimsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { data: submissions = [], isLoading } = useEtimsSubmissions(statusFilter === 'all' ? undefined : statusFilter)

  const counts = {
    pending:   submissions.filter((s) => s.status === 'pending').length,
    failed:    submissions.filter((s) => s.status === 'failed').length,
    submitted: submissions.filter((s) => s.status === 'submitted').length,
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">eTIMS</h1>
          <p className="text-sm text-gray-500 mt-0.5">KRA tax invoice submissions</p>
        </div>

        {/* Config card */}
        <ConfigCard />

        {/* Summary chips */}
        {(counts.pending > 0 || counts.failed > 0) && (
          <div className="flex gap-2 flex-wrap">
            {counts.pending > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full">
                <Clock size={12} />{counts.pending} pending
              </div>
            )}
            {counts.failed > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                <XCircle size={12} />{counts.failed} failed — needs retry
              </div>
            )}
          </div>
        )}

        {/* Submissions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Submissions</h2>
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                    statusFilter === s
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  )}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">
              <FileCheck size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {statusFilter !== 'all' ? `No ${statusFilter} submissions` : 'No submissions yet — complete a sale to generate your first invoice'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {submissions.map((sub) => (
                <SubmissionRow key={sub.id} sub={sub} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
