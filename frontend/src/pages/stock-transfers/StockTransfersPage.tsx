import { useState } from 'react'
import {
  ArrowLeftRight, Plus, Search, X, Loader2, ChevronRight,
  Truck, CheckCircle2, XCircle, Clock, ArrowRight, User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useStockTransfers, useInitiateTransfer, useTransferAction,
  useBranches, useProducts,
} from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { ApiStockTransfer } from '@/types/api'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    initiated:  'bg-amber-100 text-amber-800',
    in_transit: 'bg-blue-100 text-blue-800',
    confirmed:  'bg-green-100 text-green-800',
    cancelled:  'bg-red-100 text-red-700',
  }
  const icons: Record<string, React.ReactNode> = {
    initiated:  <Clock size={11} />,
    in_transit: <Truck size={11} />,
    confirmed:  <CheckCircle2 size={11} />,
    cancelled:  <XCircle size={11} />,
  }
  const labels: Record<string, string> = {
    initiated: 'Initiated', in_transit: 'In Transit',
    confirmed: 'Confirmed', cancelled: 'Cancelled',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', styles[status] ?? 'bg-gray-100 text-gray-600')}>
      {icons[status]}{labels[status] ?? status}
    </span>
  )
}

// ── Create transfer drawer ────────────────────────────────────────────────────

function CreateTransferDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId]         = useState<number | null>(null)
  const [productName, setProductName]     = useState('')
  const [fromBranchId, setFromBranchId]   = useState('')
  const [toBranchId, setToBranchId]       = useState('')
  const [quantity, setQuantity]           = useState('')
  const [notes, setNotes]                 = useState('')
  const [error, setError]                 = useState<string | null>(null)
  const [pickerOpen, setPickerOpen]       = useState(false)

  const { data: branches = [] } = useBranches()
  const { data: products = [] }  = useProducts(productSearch || undefined)
  const initiate = useInitiateTransfer()

  const reset = () => {
    setProductSearch(''); setProductId(null); setProductName('')
    setFromBranchId(''); setToBranchId(''); setQuantity(''); setNotes(''); setError(null)
  }

  const handleCreate = async () => {
    if (!productId) { setError('Select a product'); return }
    if (!fromBranchId) { setError('Select source branch'); return }
    if (!toBranchId) { setError('Select destination branch'); return }
    if (fromBranchId === toBranchId) { setError('Source and destination must differ'); return }
    const qty = parseInt(quantity)
    if (!qty || qty <= 0) { setError('Enter a valid quantity'); return }
    setError(null)
    try {
      await initiate.mutateAsync({
        product_id: productId,
        from_branch_id: parseInt(fromBranchId),
        to_branch_id: parseInt(toBranchId),
        quantity: qty,
        notes: notes.trim() || null,
      })
      toast.success('Transfer initiated — stock deducted from source')
      reset()
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to initiate transfer')
    }
  }

  const availableTo = branches.filter((b) => String(b.id) !== fromBranchId)

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <SheetContent side="right" className="w-full max-w-md p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Initiate Stock Transfer</h2>
          <button onClick={() => { reset(); onClose() }} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Product */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Product *</Label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input
                className="pl-8"
                placeholder="Search product…"
                value={productId ? productName : productSearch}
                onChange={(e) => {
                  if (productId) { setProductId(null); setProductName('') }
                  setProductSearch(e.target.value)
                  setPickerOpen(true)
                }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              />
              {productId && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onMouseDown={(e) => { e.preventDefault(); setProductId(null); setProductName(''); setProductSearch('') }}
                >
                  <X size={14} />
                </button>
              )}
              {pickerOpen && products.length > 0 && !productId && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {products.slice(0, 10).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setProductId(p.id); setProductName(p.name); setProductSearch(''); setPickerOpen(false)
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                      {p.sku && <span className="text-xs text-gray-400 ml-2 shrink-0 font-mono">{p.sku}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {productId && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                <CheckCircle2 size={11} />{productName}
              </p>
            )}
          </div>

          {/* From / To branches */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">From Branch *</Label>
              <Select value={fromBranchId} onValueChange={(v) => { if (v == null) return; setFromBranchId(v); if (v === toBranchId) setToBranchId('') }}>
                <SelectTrigger><SelectValue placeholder="Source…" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pb-2 text-gray-400"><ArrowRight size={16} /></div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">To Branch *</Label>
              <Select value={toBranchId} onValueChange={(v) => v != null && setToBranchId(v)} disabled={!fromBranchId}>
                <SelectTrigger><SelectValue placeholder="Destination…" /></SelectTrigger>
                <SelectContent>
                  {availableTo.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Quantity *</Label>
            <Input
              type="number"
              min="1"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">Stock is deducted from source immediately on initiation</p>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Notes <span className="font-normal">(optional)</span></Label>
            <Input
              placeholder="Reason for transfer…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 p-5">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { reset(); onClose() }}>Cancel</Button>
            <Button className="flex-1" onClick={handleCreate} disabled={initiate.isPending}>
              {initiate.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Initiate Transfer
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Transfer detail panel ─────────────────────────────────────────────────────

function TransferDetail({ transfer, onClose }: { transfer: ApiStockTransfer; onClose: () => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const action = useTransferAction()

  const run = async (act: 'mark-transit' | 'confirm' | 'cancel', successMsg: string) => {
    try {
      await action.mutateAsync({ id: transfer.id, action: act })
      toast.success(successMsg)
      if (act === 'cancel') onClose()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Action failed')
    }
  }

  const canAct = transfer.status === 'initiated' || transfer.status === 'in_transit'

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-200">
        <div>
          <div className="text-lg font-bold text-gray-900">{transfer.transfer_number}</div>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={transfer.status} />
            <span className="text-xs text-gray-400">{fmtDate(transfer.created_at)}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      {/* Route */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2.5 text-center">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">From</div>
            <div className="text-sm font-bold text-gray-900">{transfer.from_branch_name ?? `Branch ${transfer.from_branch_id}`}</div>
          </div>
          <ArrowRight size={16} className="text-gray-400 shrink-0" />
          <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2.5 text-center">
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">To</div>
            <div className="text-sm font-bold text-gray-900">{transfer.to_branch_name ?? `Branch ${transfer.to_branch_id}`}</div>
          </div>
        </div>
      </div>

      {/* Product + qty */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-2.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Product</span>
          <span className="font-semibold text-gray-900">{transfer.product_name ?? `Product #${transfer.product_id}`}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Quantity</span>
          <span className="font-bold text-2xl text-gray-900">{transfer.quantity}</span>
        </div>
        {transfer.notes && (
          <div className="flex items-start justify-between text-sm gap-4">
            <span className="text-gray-500 shrink-0">Notes</span>
            <span className="text-gray-700 text-right">{transfer.notes}</span>
          </div>
        )}
      </div>

      {/* People */}
      <div className="px-5 py-4 space-y-2">
        {transfer.initiator_name && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <User size={13} className="shrink-0" />
            <span>Initiated by <span className="font-medium text-gray-900">{transfer.initiator_name}</span></span>
          </div>
        )}
        {transfer.confirmer_name && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle2 size={13} className="text-green-600 shrink-0" />
            <span>Confirmed by <span className="font-medium text-gray-900">{transfer.confirmer_name}</span></span>
          </div>
        )}
      </div>

      {/* Actions */}
      {canAct && (
        <div className="mt-auto p-5 border-t border-gray-100 space-y-2 shrink-0">
          {transfer.status === 'initiated' && (
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => run('mark-transit', 'Marked as in transit')}
              disabled={action.isPending}
            >
              {action.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
              <Truck size={14} className="mr-1.5" />Mark In Transit
            </Button>
          )}
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => run('confirm', 'Transfer confirmed — stock added to destination')}
            disabled={action.isPending}
          >
            {action.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            <CheckCircle2 size={14} className="mr-1.5" />Confirm Receipt
          </Button>

          {!confirmCancel ? (
            <Button
              variant="outline"
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel Transfer
            </Button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500 text-center">Stock will be returned to source branch</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmCancel(false)}>Back</Button>
                <Button
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => run('cancel', 'Transfer cancelled — stock returned to source')}
                  disabled={action.isPending}
                >
                  {action.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Confirm Cancel'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all', 'initiated', 'in_transit', 'confirmed', 'cancelled'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'All', initiated: 'Initiated', in_transit: 'In Transit',
  confirmed: 'Confirmed', cancelled: 'Cancelled',
}

export function StockTransfersPage() {
  const isMediumScreen = useMediaQuery('(min-width: 768px)')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<ApiStockTransfer | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: transfers = [], isLoading } = useStockTransfers()

  const filtered = transfers.filter((t) => {
    const matchQ = !q
      || t.transfer_number.toLowerCase().includes(q.toLowerCase())
      || t.product_name?.toLowerCase().includes(q.toLowerCase())
      || t.from_branch_name?.toLowerCase().includes(q.toLowerCase())
      || t.to_branch_name?.toLowerCase().includes(q.toLowerCase())
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchQ && matchStatus
  })

  const pending = transfers.filter((t) => t.status === 'initiated' || t.status === 'in_transit').length

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Stock Transfers</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {transfers.length} transfer{transfers.length !== 1 ? 's' : ''}
              {pending > 0 && <span className="ml-2 text-amber-600 font-medium">· {pending} pending</span>}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <Plus size={14} />New Transfer
          </Button>
        </div>

        {/* Search + status filter */}
        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by product, branch or reference…"
              className="pl-8"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
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
                {FILTER_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ArrowLeftRight size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{q || statusFilter !== 'all' ? 'No transfers match your filter' : 'No stock transfers yet'}</p>
            </div>
          ) : filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={cn(
                'w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                selected?.id === t.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                selected?.id === t.id ? 'bg-white/15' : 'bg-gray-100'
              )}>
                <ArrowLeftRight size={16} className={selected?.id === t.id ? 'text-white' : 'text-gray-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm truncate">
                    {t.product_name ?? `Product #${t.product_id}`}
                  </span>
                  {selected?.id !== t.id && <StatusBadge status={t.status} />}
                </div>
                <div className={cn('text-xs flex items-center gap-1 truncate', selected?.id === t.id ? 'text-white/60' : 'text-gray-400')}>
                  <span>{t.from_branch_name ?? '—'}</span>
                  <ArrowRight size={10} className="shrink-0" />
                  <span>{t.to_branch_name ?? '—'}</span>
                  <span className="ml-1">· {fmtDate(t.created_at)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold">{t.quantity} units</div>
                <ChevronRight size={14} className={selected?.id === t.id ? 'text-white/50 ml-auto mt-0.5' : 'text-gray-300 ml-auto mt-0.5'} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: detail */}
      {selected && (
        <>
          <div className="hidden md:flex w-[400px] border-l border-gray-200 bg-white flex-col overflow-hidden">
            <TransferDetail transfer={selected} onClose={() => setSelected(null)} />
          </div>
          <Sheet open={!isMediumScreen && !!selected} onOpenChange={(v) => !v && setSelected(null)}>
            <SheetContent side="right" className="w-full max-w-sm p-0">
              <TransferDetail transfer={selected} onClose={() => setSelected(null)} />
            </SheetContent>
          </Sheet>
        </>
      )}

      <CreateTransferDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
