import { useState, useMemo } from 'react'
import { downloadTextFile } from '@/lib/download'
import { Receipt, Download, Search, X, TrendingUp, ShoppingCart, CreditCard, Printer, Pencil, Ban, Loader2, Trash2, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PayBadge } from '@/components/shared/PayBadge'
import { useOrders, useBranches, useVoidOrder, useEditOrder, useProducts } from '@/lib/queries'
import { useAuthStore } from '@/stores/auth'
import { fmtKES } from '@/lib/data'
import { toast } from '@/lib/toast'
import { printReceipt } from '@/lib/print'
import { printESCPOS } from '@/lib/escpos'
import { useSettingsStore } from '@/stores/settings'
import { isTauri } from '@/hooks/useTauri'
import type { ApiOrder, ApiPaymentMethod } from '@/types/api'
import type { SaleInfo } from '@/types'

function todayISO() { return new Date().toISOString().slice(0, 10) }

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

function orderToSaleInfo(order: ApiOrder): SaleInfo {
  return {
    id: order.order_number,
    cashier: order.cashier_name ?? 'Unknown',
    payment: order.payment_method as SaleInfo['payment'],
    items: order.items.map((i) => ({
      id: String(i.product_id ?? i.id),
      name: i.product_name,
      category: '',
      price: i.unit_price,
      cost: 0,
      sku: i.product_sku ?? '',
      barcode: '',
      stock: 0,
      minStock: 0,
      expiryDate: '',
      unit: i.unit_name ?? '',
      vatRate: 0,
      units: [],
      qty: i.quantity,
      itemDiscount: i.discount_amount,
      selectedUnit: { id: i.unit_id ?? null, name: i.unit_name ?? '', abbreviation: null, conversion_factor: i.conversion_factor ?? 1, price: i.unit_price },
    })),
    subtotal: order.subtotal,
    total: order.total,
    cashTendered: order.cash_amount || undefined,
    cashAmount: order.cash_amount || undefined,
    mpesaAmount: order.mpesa_amount || undefined,
    mpesaRef: order.mpesa_ref || undefined,
    creditName: order.credit_customer_name || undefined,
    creditPhone: order.credit_customer_phone || undefined,
    notes: order.notes || undefined,
  }
}

function StatCard({ label, value, sub, icon: Icon, accent = '#111827' }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; accent?: string
}) {
  return (
    <Card>
      <CardContent className="p-[18px_20px]">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[11px] text-gray-500 font-semibold mb-1.5 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
            {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: accent + '18' }}>
            <Icon size={18} style={{ color: accent }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Void dialog ───────────────────────────────────────────────────────────────

function VoidDialog({ order, isCashier, onConfirm, onClose, isPending }: {
  order: ApiOrder
  isCashier: boolean
  onConfirm: (reason: string, pin?: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Void Receipt #{order.order_number}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">
          This will mark the receipt as voided ({fmtKES(order.total)}) and restore inventory.
          The record is kept for audit purposes.
        </p>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Reason <span className="text-gray-400">(optional)</span></Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer returned items" />
          </div>
          {isCashier && (
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Manager / Admin PIN <span className="text-red-400">*</span></Label>
              <Input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                autoFocus
              />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="destructive" size="sm"
            onClick={() => onConfirm(reason, isCashier ? pin : undefined)}
            disabled={isPending || (isCashier && !pin)}
          >
            {isPending && <Loader2 size={13} className="animate-spin mr-1" />}
            Void Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

type EditItem = { product_id: number | null; product_name: string; product_sku: string | null; quantity: number; unit_price: number; discount_amount: number }

function EditDialog({ order, isCashier, allProducts, onConfirm, onClose, isPending }: {
  order: ApiOrder
  isCashier: boolean
  allProducts: { id: number; name: string; sku: string | null; price: number }[]
  onConfirm: (items: EditItem[], discount: number, notes: string, pin?: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const [items, setItems] = useState<EditItem[]>(
    order.items.map((i) => ({
      product_id: i.product_id,
      product_name: i.product_name,
      product_sku: i.product_sku,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount_amount: i.discount_amount,
    }))
  )
  const [discount, setDiscount] = useState(String(order.discount_amount))
  const [notes, setNotes] = useState(order.notes ?? '')
  const [pin, setPin] = useState('')
  const [productSearch, setProductSearch] = useState('')

  const q = productSearch.trim().toLowerCase()
  const productResults = q.length >= 1
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
      ).slice(0, 20)
    : []
  const showResults = productResults.length > 0

  const setItem = (idx: number, patch: Partial<EditItem>) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  function addProduct(p: { id: number; name: string; sku: string | null; price: number }) {
    const existing = items.findIndex((i) => i.product_id === p.id)
    if (existing >= 0) {
      setItem(existing, { quantity: items[existing].quantity + 1 })
    } else {
      setItems((prev) => [...prev, {
        product_id: p.id,
        product_name: p.name,
        product_sku: p.sku,
        quantity: 1,
        unit_price: p.price,
        discount_amount: 0,
      }])
    }
    setProductSearch('')
  }

  const subtotal = items.reduce((s, i) => s + (i.unit_price * i.quantity - i.discount_amount), 0)
  const total = Math.max(0, subtotal - (parseFloat(discount) || 0))

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Receipt #{order.order_number}</DialogTitle>
        </DialogHeader>

        {/* Current items */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_56px_84px_32px] gap-1.5 pb-1 border-b border-gray-100">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Item</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center">Qty</span>
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-right">Line total</span>
            <span />
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_56px_84px_32px] gap-1.5 items-center">
              <div className="text-sm font-medium text-gray-800 truncate leading-tight" title={item.product_name}>
                {item.product_name}
                {item.product_sku && <span className="text-[10px] text-gray-400 ml-1">({item.product_sku})</span>}
              </div>
              <Input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) => setItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                className="h-8 text-sm text-center px-1"
              />
              <div className="text-xs text-right text-gray-600 tabular-nums">
                KES {(item.unit_price * item.quantity - item.discount_amount).toLocaleString()}
              </div>
              <button
                onClick={() => removeItem(idx)}
                className="text-gray-300 hover:text-red-500 transition-colors flex items-center justify-center h-8"
                title="Remove item"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-3">All items removed — saving will void the receipt</div>
          )}
        </div>

        {/* Add product search */}
        <div className="border-t pt-3">
          <Label className="text-xs text-gray-500 mb-1.5 block">Add product</Label>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search by name or SKU…"
              className="pl-8 h-9 text-sm"
            />
          </div>
          {showResults && (
            <div className="mt-1 border border-gray-200 rounded-md shadow-sm max-h-44 overflow-y-auto bg-white">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  <div className="text-left">
                    <div className="font-medium text-gray-800">{p.name}</div>
                    {p.sku && <div className="text-[11px] text-gray-400">{p.sku}</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-500 tabular-nums">KES {p.price.toLocaleString()}</span>
                    <Plus size={14} className="text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Totals and meta */}
        <div className="border-t pt-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500 w-28 shrink-0">Cart Discount (KES)</Label>
            <Input
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="h-8 text-sm w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-500 w-28 shrink-0">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-sm flex-1" />
          </div>
          <div className="flex justify-between text-sm font-bold pt-1 border-t">
            <span>New Total</span>
            <span>{fmtKES(total)}</span>
          </div>
        </div>

        {isCashier && (
          <div className="border-t pt-3">
            <Label className="text-xs text-gray-500 mb-1 block">Manager / Admin PIN <span className="text-red-400">*</span></Label>
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN to save changes"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => onConfirm(items, parseFloat(discount) || 0, notes, isCashier ? pin : undefined)}
            disabled={isPending || items.length === 0 || (isCashier && !pin)}
          >
            {isPending && <Loader2 size={13} className="animate-spin mr-1" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Order detail dialog ───────────────────────────────────────────────────────

function OrderDetailDialog({ order, onClose, onVoid, onEdit, onReprint, canVoid, canEdit }: {
  order: ApiOrder | null
  onClose: () => void
  onVoid: () => void
  onEdit: () => void
  onReprint: () => void
  canVoid: boolean
  canEdit: boolean
}) {
  if (!order) return null
  const isVoided = order.status === 'voided'
  const isSplit = order.payment_method === 'split'
  const isMpesa = order.payment_method === 'mpesa'

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="font-mono">#{order.order_number}</DialogTitle>
            {isVoided && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">VOIDED</span>
            )}
            {order.edited_at && !isVoided && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">EDITED</span>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs text-gray-500 -mt-1 mb-1">
          <span>{fmtDateTime(order.created_at)}</span>
          {order.cashier_name && <span>· Cashier: <span className="text-gray-700 font-medium">{order.cashier_name}</span></span>}
          <PayBadge method={order.payment_method as ApiPaymentMethod} />
        </div>

        {isVoided && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
            Voided{order.voided_at ? ` on ${fmtDateTime(order.voided_at)}` : ''}
            {order.void_reason ? ` · ${order.void_reason}` : ''}
          </div>
        )}

        {order.payment_method === 'credit' && (order.credit_customer_name || order.credit_customer_phone) && (
          <div className="bg-gray-50 rounded-md px-3 py-2 text-sm">
            <span className="font-semibold text-gray-700">Credit: </span>
            {order.credit_customer_name}{order.credit_customer_phone ? ` · ${order.credit_customer_phone}` : ''}
          </div>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-900">
              <th className="text-left py-1.5 font-bold">Item</th>
              <th className="text-right py-1.5 font-bold w-10">Qty</th>
              <th className="text-right py-1.5 font-bold">Unit</th>
              <th className="text-right py-1.5 font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-800">
                  {item.product_name}
                  {item.product_sku && <span className="text-xs text-gray-400 ml-1">({item.product_sku})</span>}
                </td>
                <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                <td className="py-2 text-right text-gray-600">KES {item.unit_price.toLocaleString()}</td>
                <td className="py-2 text-right font-semibold">KES {item.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-1">
          <div className="w-52 text-sm space-y-1">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span><span>KES {order.subtotal.toLocaleString()}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Discount</span><span>−KES {order.discount_amount.toLocaleString()}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>VAT</span><span>KES {order.tax_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-base border-t-2 border-gray-900 pt-2 mt-1">
              <span>Total</span><span>KES {order.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {(isSplit || isMpesa || order.payment_method === 'cash') && (
          <div className="border-t pt-3 mt-1 text-sm text-gray-600 space-y-1">
            {(isSplit || order.payment_method === 'cash') && order.cash_amount > 0 && (
              <div className="flex justify-between"><span>Cash paid</span><span>KES {order.cash_amount.toLocaleString()}</span></div>
            )}
            {(isSplit || isMpesa) && order.mpesa_amount > 0 && (
              <div className="flex justify-between">
                <span>M-Pesa paid</span>
                <span>KES {order.mpesa_amount.toLocaleString()}{order.mpesa_ref ? ` (${order.mpesa_ref})` : ''}</span>
              </div>
            )}
            {order.change_given > 0 && (
              <div className="flex justify-between text-green-700 font-medium">
                <span>Change given</span><span>KES {order.change_given.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {order.notes && (
          <div className="bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-600 mt-1">
            <span className="font-semibold text-gray-700">Note: </span>{order.notes}
          </div>
        )}

        <DialogFooter className="mt-2 flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onReprint}>
            <Printer size={13} /> Reprint
          </Button>
          {!isVoided && canEdit && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
              <Pencil size={13} /> Edit
            </Button>
          )}
          {!isVoided && canVoid && (
            <Button variant="destructive" size="sm" className="gap-1.5" onClick={onVoid}>
              <Ban size={13} /> Void
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function downloadCSV(orders: ApiOrder[]) {
  const headers = ['Order #', 'Date', 'Time', 'Cashier', 'Status', 'Items', 'Payment', 'Subtotal', 'Discount', 'Total', 'M-Pesa Ref', 'Notes']
  const rows = orders.map((o) => {
    const d = new Date(o.created_at)
    return [
      o.order_number,
      d.toLocaleDateString('en-KE'),
      d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
      o.cashier_name ?? '',
      o.status,
      o.items.reduce((s, i) => s + i.quantity, 0),
      o.payment_method,
      o.subtotal,
      o.discount_amount,
      o.total,
      o.mpesa_ref ?? '',
      (o.notes ?? '').replace(/,/g, ' '),
    ]
  })
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  void downloadTextFile(`sales-${new Date().toISOString().slice(0, 10)}.csv`, csv)
}

export function SalesPage() {
  const { user } = useAuthStore()
  const { settings } = useSettingsStore()
  const isCashier = user?.role === 'cashier'
  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'manager'
  const canVoid = isAdmin || isManager || isCashier   // cashiers must supply PIN
  const canEdit = isAdmin || isManager || isCashier

  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [paymentMethod, setPaymentMethod] = useState('')
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState<number | null>(null)

  const [selected, setSelected] = useState<ApiOrder | null>(null)
  const [voidTarget, setVoidTarget] = useState<ApiOrder | null>(null)
  const [editTarget, setEditTarget] = useState<ApiOrder | null>(null)

  const { data: branches = [] } = useBranches()
  const { data: allProducts = [] } = useProducts()
  const voidOrder = useVoidOrder()
  const editOrder = useEditOrder()

  const effectiveBranchId = isAdmin ? (branchFilter || undefined) : undefined

  const { data: orders = [], isLoading } = useOrders({
    limit: 200,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    payment_method: paymentMethod || undefined,
    search: search || undefined,
    branch_id: effectiveBranchId,
    cashier_id: isCashier && user?.id ? Number(user.id) : undefined,
  })

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== 'voided')
    const revenue = active.reduce((s, o) => s + o.total, 0)
    const count = active.length
    const avg = count > 0 ? revenue / count : 0
    return { revenue, count, avg }
  }, [orders])

  const hasFilters = !!(paymentMethod || search || dateFrom !== todayISO() || dateTo !== todayISO() || branchFilter)

  function clearFilters() {
    setDateFrom(todayISO()); setDateTo(todayISO())
    setPaymentMethod(''); setSearch(''); setBranchFilter(null)
  }

  async function handleReprint(order: ApiOrder) {
    const sale = orderToSaleInfo(order)
    if (isTauri) {
      // Always show the in-app preview so there's always something visible.
      // Attempt ESC/POS concurrently — succeeds silently if a thermal printer
      // is connected, fails silently if not.
      printReceipt(sale, settings)
      printESCPOS(sale, settings).catch(() => {})
    } else {
      try {
        const ok = await printESCPOS(sale, settings)
        if (!ok) printReceipt(sale, settings)
      } catch {
        printReceipt(sale, settings)
      }
    }
  }

  function handleVoidConfirm(reason: string, pin?: string) {
    if (!voidTarget) return
    voidOrder.mutate(
      { id: voidTarget.id, reason, pin },
      {
        onSuccess: (updated) => {
          toast.success(`Receipt #${voidTarget.order_number} voided`)
          setVoidTarget(null)
          setSelected(updated)
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast.error(msg ?? 'Failed to void receipt')
        },
      },
    )
  }

  function handleEditConfirm(items: EditItem[], discount: number, notes: string, pin?: string) {
    if (!editTarget) return
    editOrder.mutate(
      {
        id: editTarget.id,
        body: {
          items: items.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            product_sku: i.product_sku,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_amount: i.discount_amount,
          })),
          discount_amount: discount,
          notes,
          pin,
        },
      },
      {
        onSuccess: (updated) => {
          toast.success(`Receipt #${editTarget.order_number} updated`)
          setEditTarget(null)
          setSelected(updated)
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast.error(msg ?? 'Failed to edit receipt')
        },
      },
    )
  }

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="flex items-start justify-between mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Sales Records</h1>
          <div className="text-sm text-gray-400 mt-0.5">Transaction history and records</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCSV(orders)} disabled={orders.length === 0}>
          <Download size={14} className="mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-3.5 mb-5 sm:mb-6">
        <StatCard label="Total Revenue" value={fmtKES(stats.revenue)} sub={`${stats.count} transactions`} icon={TrendingUp} accent="#3B82F6" />
        <StatCard label="Transactions" value={stats.count} sub="in selected range" icon={ShoppingCart} accent="#8B5CF6" />
        <StatCard label="Avg Order Value" value={fmtKES(stats.avg)} sub="per transaction" icon={CreditCard} accent="#059669" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input placeholder="Order #..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-40 h-9 text-sm" />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300" />
          <span>to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300" />
        </div>
        <Select value={paymentMethod || '__all__'} onValueChange={(v) => setPaymentMethod(!v || v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="All methods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="mpesa">M-Pesa</SelectItem>
            <SelectItem value="split">M-Pesa &amp; Cash</SelectItem>
            <SelectItem value="credit">Credit</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && branches.length > 0 && (
          <Select value={branchFilter ? String(branchFilter) : '__all__'} onValueChange={(v) => setBranchFilter(v === '__all__' ? null : Number(v))}>
            <SelectTrigger className="w-40 h-9 text-sm">
              <span>{branchFilter ? (branches.find((b) => b.id === branchFilter)?.name ?? String(branchFilter)) : 'All branches'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
            <X size={13} className="mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Order #</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Date / Time</th>
                {!isCashier && <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Cashier</th>}
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Items</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Payment</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={isCashier ? 5 : 6} className="text-center text-gray-400 py-16 text-sm">Loading…</td></tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={isCashier ? 5 : 6} className="text-center py-16">
                    <Receipt size={32} className="text-gray-200 mx-auto mb-3" />
                    <div className="text-gray-400 text-sm">No transactions found</div>
                    {hasFilters && <div className="text-gray-300 text-xs mt-1">Try adjusting the filters</div>}
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isVoided = order.status === 'voided'
                  return (
                    <tr
                      key={order.id}
                      className={`border-b border-gray-50 cursor-pointer transition-colors ${isVoided ? 'opacity-50 bg-red-50 hover:bg-red-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelected(order)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-gray-800">#{order.order_number}</span>
                          {isVoided && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">VOID</span>}
                          {order.edited_at && !isVoided && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600">EDIT</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateTime(order.created_at)}</td>
                      {!isCashier && <td className="px-4 py-3 text-gray-700">{order.cashier_name ?? '—'}</td>}
                      <td className="px-4 py-3 text-right text-gray-600">{order.items.reduce((s, i) => s + i.quantity, 0)}</td>
                      <td className="px-4 py-3"><PayBadge method={order.payment_method as ApiPaymentMethod} /></td>
                      <td className={`px-4 py-3 text-right font-bold ${isVoided ? 'line-through text-gray-400' : 'text-gray-900'}`}>{fmtKES(order.total)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {orders.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={isCashier ? 4 : 5} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {stats.count} transaction{stats.count !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-extrabold text-gray-900">{fmtKES(stats.revenue)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Detail dialog */}
      <OrderDetailDialog
        order={selected}
        onClose={() => setSelected(null)}
        onVoid={() => { setVoidTarget(selected); setSelected(null) }}
        onEdit={() => { setEditTarget(selected); setSelected(null) }}
        onReprint={() => selected && handleReprint(selected)}
        canVoid={canVoid}
        canEdit={canEdit}
      />

      {/* Void dialog */}
      {voidTarget && (
        <VoidDialog
          order={voidTarget}
          isCashier={isCashier}
          onConfirm={handleVoidConfirm}
          onClose={() => setVoidTarget(null)}
          isPending={voidOrder.isPending}
        />
      )}

      {/* Edit dialog */}
      {editTarget && (
        <EditDialog
          order={editTarget}
          isCashier={isCashier}
          allProducts={allProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, price: p.price }))}
          onConfirm={handleEditConfirm}
          onClose={() => setEditTarget(null)}
          isPending={editOrder.isPending}
        />
      )}
    </div>
  )
}
