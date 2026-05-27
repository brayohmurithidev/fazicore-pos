import { useState } from 'react'
import {
  Users, Plus, Search, Phone, Mail, X, ChevronRight,
  CheckCircle, AlertCircle, Loader2, ArrowDownLeft, Receipt, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCustomers, useCreateCustomer, useUpdateCustomer,
  useCustomerInvoices, useCustomerPayments, useRecordCreditPayment,
} from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFeature } from '@/hooks/useFeature'
import { UpgradeWall } from '@/components/shared/UpgradeWall'
import type { ApiCustomer, ApiCreditInvoice } from '@/types/api'
import { cn } from '@/lib/utils'

const fmt = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`

// ── Customer Form Modal ───────────────────────────────────────────────────────

function CustomerFormModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial: ApiCustomer | null
}) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [error, setError] = useState<string | null>(null)
  const create = useCreateCustomer()
  const update = useUpdateCustomer()
  const isPending = create.isPending || update.isPending

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleOpen = () => {
    setError(null)
    setForm(initial
      ? { name: initial.name, phone: initial.phone ?? '', email: initial.email ?? '', address: initial.address ?? '', notes: initial.notes ?? '' }
      : { name: '', phone: '', email: '', address: '', notes: '' })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setError(null)
    try {
      const payload = { name: form.name.trim(), phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null }
      if (initial) { await update.mutateAsync({ id: initial.id, data: payload }); toast.success('Customer updated') }
      else { await create.mutateAsync(payload); toast.success('Customer created') }
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save customer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>{initial ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 mt-1">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Full Name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="John Doe" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Phone</Label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254700000000" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Email (optional)</Label>
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john@example.com" type="email" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Address</Label>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, Town" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Notes</Label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Any notes..." />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-2 mt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Record Payment Modal ──────────────────────────────────────────────────────

function RecordPaymentModal({ open, onClose, customer, preselectedInvoice }: {
  open: boolean; onClose: () => void; customer: ApiCustomer; preselectedInvoice?: ApiCreditInvoice | null
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [mpesaRef, setMpesaRef] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const record = useRecordCreditPayment()

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > customer.credit_balance + 0.01) { setError(`Amount exceeds outstanding balance (${fmt(customer.credit_balance)})`); return }
    setError(null)
    try {
      await record.mutateAsync({
        customerId: customer.id,
        data: {
          amount: amt,
          payment_method: method,
          mpesa_ref: method === 'mpesa' ? mpesaRef || null : null,
          order_id: preselectedInvoice?.id ?? null,
          notes: notes || null,
        },
      })
      toast.success('Payment recorded')
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Payment failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader><DialogTitle>Record Payment — {customer.name}</DialogTitle></DialogHeader>
        <div className="text-sm text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
          Outstanding balance: <span className="font-bold text-amber-800">{fmt(customer.credit_balance)}</span>
          {preselectedInvoice && <span className="ml-2 text-xs">for #{preselectedInvoice.order_number}</span>}
        </div>
        <div className="grid gap-3 mt-1">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Amount (KES) *</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="0.00" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Payment Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? 'cash')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {method === 'mpesa' && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">M-Pesa Reference</Label>
              <Input value={mpesaRef} onChange={(e) => setMpesaRef(e.target.value)} placeholder="e.g. QHE3ST0KIV" />
            </div>
          )}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note..." />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-2 mt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={handleSave} disabled={record.isPending}>
              {record.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Record Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Customer Detail Drawer ────────────────────────────────────────────────────

function CustomerDetail({ customer, onClose, onEdit }: {
  customer: ApiCustomer; onClose: () => void; onEdit: () => void
}) {
  const [payOpen, setPayOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<ApiCreditInvoice | null>(null)
  const { data: invoices = [], isLoading: invLoading } = useCustomerInvoices(customer.id)
  const { data: payments = [], isLoading: pmtLoading } = useCustomerPayments(customer.id)

  const openPayment = (inv?: ApiCreditInvoice) => {
    setSelectedInvoice(inv ?? null)
    setPayOpen(true)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-200">
        <div>
          <div className="text-lg font-bold text-gray-900">{customer.name}</div>
          <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-3">
            {customer.phone && <span className="flex items-center gap-1"><Phone size={11} />{customer.phone}</span>}
            {customer.email && <span className="flex items-center gap-1"><Mail size={11} />{customer.email}</span>}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b border-gray-100">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900">{customer.total_orders}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Orders</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900">{fmt(customer.total_spent)}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Total Spent</div>
        </div>
        <div className="text-center">
          <div className={cn("text-lg font-bold", customer.credit_balance > 0 ? 'text-red-600' : 'text-gray-900')}>
            {fmt(customer.credit_balance)}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Outstanding</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-600">{customer.loyalty_points.toLocaleString()}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide">Points</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-3 border-b border-gray-100">
        <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}>Edit Customer</Button>
        {customer.credit_balance > 0 && (
          <Button size="sm" className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={() => openPayment()}>
            <ArrowDownLeft size={13} className="mr-1" />Record Payment
          </Button>
        )}
      </div>

      {/* Tabs content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Credit Invoices */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
            <Receipt size={12} />Credit Invoices
          </div>
          {invLoading ? <div className="text-xs text-gray-400">Loading…</div> : invoices.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center">No credit invoices</div>
          ) : (
            <div className="space-y-1.5">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-gray-900">#{inv.order_number}</div>
                    <div className="text-xs text-gray-400">{new Date(inv.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">{fmt(inv.total)}</div>
                    {inv.outstanding > 0 ? (
                      <button onClick={() => openPayment(inv)} className="text-xs text-red-600 hover:text-red-700 font-medium">
                        {fmt(inv.outstanding)} due <ArrowRight size={11} className="inline" />
                      </button>
                    ) : (
                      <span className="text-xs text-green-600 flex items-center gap-0.5"><CheckCircle size={10} />Paid</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment History */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
            <ArrowDownLeft size={12} />Payment History
          </div>
          {pmtLoading ? <div className="text-xs text-gray-400">Loading…</div> : payments.length === 0 ? (
            <div className="text-xs text-gray-400 py-3 text-center">No payments recorded</div>
          ) : (
            <div className="space-y-1.5">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium text-gray-900 capitalize">{p.payment_method}</div>
                    <div className="text-xs text-gray-400">{new Date(p.created_at).toLocaleDateString()}{p.mpesa_ref && ` · ${p.mpesa_ref}`}</div>
                  </div>
                  <div className="text-sm font-semibold text-green-700">+{fmt(p.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {payOpen && (
        <RecordPaymentModal
          open={payOpen}
          onClose={() => { setPayOpen(false); setSelectedInvoice(null) }}
          customer={customer}
          preselectedInvoice={selectedInvoice}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function CustomersPage() {
  const hasCreditSystem = useFeature('credit_system')
  const isMediumScreen = useMediaQuery('(min-width: 768px)')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<ApiCustomer | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ApiCustomer | null>(null)

  const { data: customers = [], isLoading } = useCustomers(q || undefined)

  if (!hasCreditSystem) {
    return <UpgradeWall feature="Credit System" description="Track customer invoices, outstanding balances, and payment history. Upgrade your plan to manage credit sales." />
  }

  const openAdd = () => { setEditTarget(null); setFormOpen(true) }
  const openEdit = (c: ApiCustomer) => { setEditTarget(c); setFormOpen(true) }

  const withCredit = customers.filter((c) => c.credit_balance > 0)
  const totalOutstanding = withCredit.reduce((s, c) => s + c.credit_balance, 0)

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Customers</h1>
            <p className="text-sm text-gray-500 mt-0.5">{customers.length} customers · {fmt(totalOutstanding)} outstanding credit</p>
          </div>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus size={14} />Add Customer
          </Button>
        </div>

        {/* Credit alert */}
        {withCredit.length > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-4 text-sm text-amber-800">
            <AlertCircle size={14} className="shrink-0" />
            <span><strong>{withCredit.length}</strong> customers have outstanding credit totalling <strong>{fmt(totalOutstanding)}</strong></span>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email…" className="pl-8" />
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
          ) : customers.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No customers found</p>
            </div>
          ) : customers.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={cn(
                'w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                selected?.id === c.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
              )}
            >
              <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                selected?.id === c.id ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-700')}>
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className={cn('text-xs truncate', selected?.id === c.id ? 'text-white/60' : 'text-gray-400')}>
                  {c.phone || c.email || 'No contact info'}
                </div>
              </div>
              <div className="text-right shrink-0">
                {c.credit_balance > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">{fmt(c.credit_balance)}</Badge>
                )}
                <ChevronRight size={14} className={cn('mt-0.5 ml-auto', selected?.id === c.id ? 'text-white/50' : 'text-gray-300')} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: detail — side panel on md+, Sheet on mobile */}
      {selected && (
        <>
          <div className="hidden md:flex w-[420px] border-l border-gray-200 bg-white flex-col overflow-hidden">
            <CustomerDetail
              customer={selected}
              onClose={() => setSelected(null)}
              onEdit={() => openEdit(selected)}
            />
          </div>
          <Sheet open={!isMediumScreen && !!selected} onOpenChange={(v) => !v && setSelected(null)}>
            <SheetContent side="right" className="w-full max-w-sm p-0">
              <CustomerDetail
                customer={selected}
                onClose={() => setSelected(null)}
                onEdit={() => openEdit(selected)}
              />
            </SheetContent>
          </Sheet>
        </>
      )}

      <CustomerFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null) }}
        initial={editTarget}
      />
    </div>
  )
}
