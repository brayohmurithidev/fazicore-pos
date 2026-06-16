import { useState, useRef } from 'react'
import {
  ShoppingCart, Plus, Search, X, Loader2, ChevronRight,
  Truck, CheckCircle2, XCircle, Clock, Package, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  usePurchaseOrders, useCreatePurchaseOrder, useUpdatePOStatus, useDeletePurchaseOrder,
  useSuppliers, useBranches, useProducts,
} from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { fmtKES } from '@/lib/data'
import type { ApiPurchaseOrder, ApiProduct } from '@/types/api'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_FLOW: Record<string, { next: string; label: string; color: string }> = {
  pending:   { next: 'transit',   label: 'Mark In Transit',  color: 'bg-amber-500 hover:bg-amber-600' },
  transit:   { next: 'received',  label: 'Mark Received',    color: 'bg-green-600 hover:bg-green-700' },
  received:  { next: '',          label: '',                  color: '' },
  cancelled: { next: '',          label: '',                  color: '' },
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-800',
    transit:   'bg-blue-100 text-blue-800',
    received:  'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-700',
  }
  const icon: Record<string, React.ReactNode> = {
    pending:   <Clock size={11} />,
    transit:   <Truck size={11} />,
    received:  <CheckCircle2 size={11} />,
    cancelled: <XCircle size={11} />,
  }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full', map[status] ?? 'bg-gray-100 text-gray-600')}>
      {icon[status]}{status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })

// ── Line item row in create form ──────────────────────────────────────────────

interface LineItem {
  key: number
  product_id: number | null
  product_name: string
  quantity: string
  unit_cost: string
  expiry_date: string
}

function LineItemRow({ item, onUpdate, onRemove }: {
  item: LineItem
  onUpdate: (patch: Partial<LineItem>) => void
  onRemove: () => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { data: products = [] } = useProducts(q || undefined)
  const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectProduct = (p: ApiProduct) => {
    onUpdate({ product_id: p.id, product_name: p.name, unit_cost: p.cost != null ? String(p.cost) : '' })
    setQ('')
    setOpen(false)
  }

  const total = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0)

  return (
    <div className="grid gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
      {/* Product search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <Input
          className="pl-8 text-sm h-9"
          placeholder="Search product or type name…"
          value={item.product_id ? item.product_name : q}
          onChange={(e) => {
            if (item.product_id) {
              onUpdate({ product_id: null, product_name: e.target.value })
            } else {
              setQ(e.target.value)
              onUpdate({ product_name: e.target.value })
            }
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 150) }}
        />
        {open && products.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {products.slice(0, 8).map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); if (blurRef.current) clearTimeout(blurRef.current); selectProduct(p) }}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
              >
                <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                {p.cost != null && <span className="text-xs text-gray-400 ml-2 shrink-0">{fmtKES(p.cost)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Qty / Cost / Expiry / Remove */}
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
        <div>
          <Label className="text-[10px] text-gray-400 mb-0.5 block">Qty</Label>
          <Input
            className="h-9 text-sm"
            type="number"
            min="1"
            placeholder="1"
            value={item.quantity}
            onChange={(e) => onUpdate({ quantity: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-[10px] text-gray-400 mb-0.5 block">Unit Cost (KES)</Label>
          <Input
            className="h-9 text-sm"
            type="number"
            min="0"
            placeholder="0.00"
            value={item.unit_cost}
            onChange={(e) => onUpdate({ unit_cost: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-[10px] text-gray-400 mb-0.5 block">Expiry</Label>
          <Input
            className="h-9 text-sm"
            type="date"
            value={item.expiry_date}
            onChange={(e) => onUpdate({ expiry_date: e.target.value })}
          />
        </div>
        <div className="flex flex-col items-end gap-1 pt-4">
          {total > 0 && <span className="text-xs font-semibold text-gray-700">{fmtKES(total)}</span>}
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create PO drawer ──────────────────────────────────────────────────────────

let _key = 0
const newItem = (): LineItem => ({ key: ++_key, product_id: null, product_name: '', quantity: '1', unit_cost: '', expiry_date: '' })

function CreatePODrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [supplier, setSupplier] = useState('')
  const [branchId, setBranchId] = useState<string>('')
  const [items, setItems] = useState<LineItem[]>([newItem()])
  const [error, setError] = useState<string | null>(null)

  const { data: suppliers = [] } = useSuppliers()
  const { data: branches = [] } = useBranches()
  const create = useCreatePurchaseOrder()

  const updateItem = (key: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it) => it.key === key ? { ...it, ...patch } : it))

  const removeItem = (key: number) =>
    setItems((prev) => prev.length > 1 ? prev.filter((it) => it.key !== key) : prev)

  const total = items.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_cost) || 0), 0)

  const handleCreate = async () => {
    if (!supplier.trim()) { setError('Supplier name is required'); return }
    const validItems = items.filter((it) => it.product_name.trim() && parseFloat(it.quantity) > 0 && parseFloat(it.unit_cost) >= 0)
    if (validItems.length === 0) { setError('Add at least one item with a name, quantity, and cost'); return }
    setError(null)
    try {
      await create.mutateAsync({
        supplier: supplier.trim(),
        branch_id: branchId ? parseInt(branchId) : null,
        items: validItems.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name.trim(),
          quantity: parseFloat(it.quantity),
          unit_cost: parseFloat(it.unit_cost),
          expiry_date: it.expiry_date || null,
        })),
      })
      toast.success('Purchase order created')
      setSupplier(''); setBranchId(''); setItems([newItem()]); setError(null)
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to create purchase order')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-lg p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
          <h2 className="text-base font-bold text-gray-900">New Purchase Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Supplier */}
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Supplier *</Label>
            {suppliers.length > 0 ? (
              <Select value={supplier} onValueChange={(v) => v != null && setSupplier(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Enter supplier name"
              />
            )}
          </div>

          {/* Branch */}
          {branches.length > 1 && (
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Destination Branch</Label>
              <Select value={branchId} onValueChange={(v) => v != null && setBranchId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select branch…" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-gray-500">Items *</Label>
              <span className="text-xs text-gray-400">{items.length} line{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {items.map((it) => (
                <LineItemRow
                  key={it.key}
                  item={it}
                  onUpdate={(patch) => updateItem(it.key, patch)}
                  onRemove={() => removeItem(it.key)}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 w-full border-dashed"
              onClick={() => setItems((prev) => [...prev, newItem()])}
            >
              <Plus size={13} className="mr-1.5" />Add Line
            </Button>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 p-5 space-y-3">
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-gray-500">Order Total</span>
            <span className="text-gray-900">{fmtKES(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" onClick={handleCreate} disabled={create.isPending}>
              {create.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Create PO
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── PO Detail panel ───────────────────────────────────────────────────────────

function PODetail({ po, onClose }: { po: ApiPurchaseOrder; onClose: () => void }) {
  const [confirmCancel, setConfirmCancel] = useState(false)
  const updateStatus = useUpdatePOStatus()
  const deletePO = useDeletePurchaseOrder()

  const flow = STATUS_FLOW[po.status]

  const advance = async () => {
    if (!flow?.next) return
    try {
      await updateStatus.mutateAsync({ id: po.id, status: flow.next })
      toast.success(flow.next === 'received' ? 'Stock updated — inventory adjusted' : `Status updated to ${flow.next}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const cancel = async () => {
    try {
      await updateStatus.mutateAsync({ id: po.id, status: 'cancelled' })
      toast.success('Purchase order cancelled')
      onClose()
    } catch {
      toast.error('Failed to cancel')
    }
  }

  const handleDelete = async () => {
    try {
      await deletePO.mutateAsync(po.id)
      toast.success('Purchase order deleted')
      onClose()
    } catch {
      toast.error('Failed to delete purchase order')
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-200">
        <div>
          <div className="text-lg font-bold text-gray-900">{po.po_number}</div>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={po.status} />
            <span className="text-xs text-gray-400">{fmtDate(po.created_at)}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      {/* Meta */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Supplier</span>
          <span className="font-semibold text-gray-900">{po.supplier}</span>
        </div>
        {po.branch_name && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Branch</span>
            <span className="font-semibold text-gray-900">{po.branch_name}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Total</span>
          <span className="font-bold text-gray-900">{fmtKES(po.total)}</span>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-5">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Package size={12} />{po.items.length} item{po.items.length !== 1 ? 's' : ''}
        </div>
        <div className="space-y-2">
          {po.items.map((item) => (
            <div key={item.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{item.product_name}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {item.quantity} × {fmtKES(item.unit_cost)}
                  {item.expiry_date && <span className="ml-2 text-amber-600">Exp: {item.expiry_date}</span>}
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-900 ml-3 shrink-0">
                {fmtKES(item.quantity * item.unit_cost)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="p-5 border-t border-gray-100 space-y-2 shrink-0">
        {/* Advance status */}
        {flow?.next && (
          <Button
            className={cn('w-full text-white', flow.color)}
            onClick={advance}
            disabled={updateStatus.isPending}
          >
            {updateStatus.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            {flow.label}
          </Button>
        )}

        {/* Cancel / Delete */}
        {po.status === 'pending' && !confirmCancel && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-amber-700 border-amber-200 hover:bg-amber-50"
              onClick={() => setConfirmCancel(true)}
            >
              Cancel Order
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleDelete}
              disabled={deletePO.isPending}
            >
              {deletePO.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Delete'}
            </Button>
          </div>
        )}
        {po.status === 'transit' && !confirmCancel && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-amber-700 border-amber-200 hover:bg-amber-50"
            onClick={() => setConfirmCancel(true)}
          >
            Cancel Order
          </Button>
        )}
        {confirmCancel && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmCancel(false)}>Back</Button>
            <Button
              size="sm"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={cancel}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? <Loader2 size={13} className="animate-spin" /> : 'Confirm Cancel'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['all', 'pending', 'transit', 'received', 'cancelled'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

export function PurchaseOrdersPage() {
  const isMediumScreen = useMediaQuery('(min-width: 768px)')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<ApiPurchaseOrder | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: pos = [], isLoading } = usePurchaseOrders()

  const filtered = pos.filter((po) => {
    const matchQ = !q || po.po_number.toLowerCase().includes(q.toLowerCase()) || po.supplier.toLowerCase().includes(q.toLowerCase())
    const matchStatus = statusFilter === 'all' || po.status === statusFilter
    return matchQ && matchStatus
  })

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Purchase Orders</h1>
            <p className="text-sm text-gray-500 mt-0.5">{pos.length} order{pos.length !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <Plus size={14} />New PO
          </Button>
        </div>

        {/* Search + status filter */}
        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by PO number or supplier…" className="pl-8" />
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
                {s.charAt(0).toUpperCase() + s.slice(1)}
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
              <ShoppingCart size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{q || statusFilter !== 'all' ? 'No orders match your filter' : 'No purchase orders yet'}</p>
            </div>
          ) : filtered.map((po) => (
            <button
              key={po.id}
              onClick={() => setSelected(po)}
              className={cn(
                'w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                selected?.id === po.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                selected?.id === po.id ? 'bg-white/15' : 'bg-gray-100'
              )}>
                <ShoppingCart size={16} className={selected?.id === po.id ? 'text-white' : 'text-gray-500'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm">{po.po_number}</span>
                  {selected?.id !== po.id && <StatusBadge status={po.status} />}
                </div>
                <div className={cn('text-xs truncate', selected?.id === po.id ? 'text-white/60' : 'text-gray-400')}>
                  {po.supplier} · {po.items.length} item{po.items.length !== 1 ? 's' : ''} · {fmtDate(po.created_at)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold">{fmtKES(po.total)}</div>
                <ChevronRight size={14} className={selected?.id === po.id ? 'text-white/50 ml-auto mt-0.5' : 'text-gray-300 ml-auto mt-0.5'} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: detail */}
      {selected && (
        <>
          <div className="hidden md:flex w-[420px] border-l border-gray-200 bg-white flex-col overflow-hidden">
            <PODetail
              po={selected}
              onClose={() => setSelected(null)}
            />
          </div>
          <Sheet open={!isMediumScreen && !!selected} onOpenChange={(v) => !v && setSelected(null)}>
            <SheetContent side="right" className="w-full max-w-sm p-0">
              <PODetail
                po={selected}
                onClose={() => setSelected(null)}
              />
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Create drawer */}
      <CreatePODrawer open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
