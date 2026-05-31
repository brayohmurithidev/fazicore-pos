import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { downloadTextFile, buildCSV, downloadXlsx, openPrintHtml } from '@/lib/download'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Search, Plus, ArrowLeftRight, Truck, Package, AlertTriangle, Loader2,
  CheckCircle2, Download, Printer, Pencil, Trash2, SlidersHorizontal,
  TrendingDown, TrendingUp, BarChart3, X, XCircle, ChevronRight, Barcode, Wand2,
  ShoppingCart, Upload, FileDown, ChevronDown, Tag,
} from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { LimitReachedDialog, parseLimitError, type LimitError } from '@/components/shared/LimitReachedDialog'
import {
  useProducts, useCategories, useCreateCategory, useCreateProduct, useUpdateProductById,
  useDeleteProduct, useOrgInfo, useAdjustInventory, useBranches,
  usePurchaseOrders, useCreatePurchaseOrder, useUpdatePOStatus, useDeletePurchaseOrder,
  useInventoryTransactions, useProductInventory,
  useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useStockTransfers, useInitiateTransfer, useTransferAction, useUploadProductImage,
  useReorderSuggestions, useInventoryAging, usePermissions, useBulkCreateProducts,
  useAdjustPrice, usePriceHistory, type ApiPriceHistory,
  useProductUnits, useCreateProductUnit, useDeleteProductUnit,
} from '@/lib/queries'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { toast } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFeature } from '@/hooks/useFeature'
import { fmtKES } from '@/lib/data'
import { resolveImageUrl } from '@/lib/api'
import { useTauriFileDrop } from '@/hooks/useTauriFileDrop'
import type { ApiProduct, ApiCategory, ApiPurchaseOrder, ApiInventoryItem, ApiSupplier, TransferStatus, ReorderUrgency, AgingBucket, ApiProductUnit } from '@/types/api'

// ── Utilities ─────────────────────────────────────────────────────────────

function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  void downloadTextFile(filename, buildCSV(headers, rows))
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

function buildPrintHtml(title: string, headers: string[], rows: (string | number)[][], subtitle?: string) {
  const tableRows = rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')
  return `<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#111;padding:28px 32px}
      h1{font-size:20px;font-weight:700;margin-bottom:4px}
      .sub{font-size:12px;color:#666;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:#111;color:#fff;padding:8px 10px;text-align:left;font-weight:600;font-size:11px;letter-spacing:.3px}
      td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px}
      tr:nth-child(even) td{background:#f9f9f9}
      .footer{margin-top:24px;font-size:11px;color:#999;display:flex;justify-content:space-between}
      @media print{body{padding:16px 20px}}
    </style></head><body>
    <h1>${title}</h1>
    <div class="sub">${subtitle ?? ''} &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-KE')}</div>
    <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${tableRows}</tbody></table>
    <div class="footer"><span>Powered by Fazi POS</span><span>${rows.length} records</span></div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
}

function openPrintWindow(title: string, headers: string[], rows: (string | number)[][], subtitle?: string) {
  void openPrintHtml(buildPrintHtml(title, headers, rows, subtitle))
}

const today = new Date()
function daysUntil(d: string | null) {
  if (!d) return null
  return Math.round((new Date(d).getTime() - today.getTime()) / 86400000)
}

// ── Barcode ────────────────────────────────────────────────────────────────

function BarcodeDisplay({ value, format = 'auto', height = 50, className = '' }: {
  value: string; format?: string; height?: number; className?: string
}) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    const autoFmt = /^\d{13}$/.test(value) ? 'EAN13'
      : /^\d{12}$/.test(value) ? 'UPC'
      : /^\d{8}$/.test(value) ? 'EAN8'
      : 'CODE128'
    const fmt = format === 'auto' ? autoFmt : format

    const tryRender = (f: string) => {
      try {
        JsBarcode(ref.current!, value, {
          format: f, height, displayValue: true,
          fontSize: 10, margin: 4, background: 'transparent',
        })
        return true
      } catch { return false }
    }

    // If auto-detected format fails (e.g. bad check digit), fall back to CODE128
    if (!tryRender(fmt) && fmt !== 'CODE128') tryRender('CODE128')
  }, [value, format, height])

  if (!value) return null
  return <svg ref={ref} className={className} />
}

function BarcodePrintModal({ products, open, onClose }: {
  products: ApiProduct[]; open: boolean; onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [copies, setCopies] = useState(1)

  useEffect(() => {
    if (!open) return
    // Pre-select products that have a barcode or SKU
    setSelected(new Set(products.filter((p) => p.barcode || p.sku).map((p) => p.id)))
    setCopies(1)
  }, [open, products])

  const printable = products.filter((p) => selected.has(p.id) && (p.barcode || p.sku))

  const handlePrint = () => {
    const labels = printable.flatMap((p) => Array.from({ length: copies }, () => p))
    const rows: typeof labels[] = []
    for (let i = 0; i < labels.length; i += 3) rows.push(labels.slice(i, i + 3))

    const svgData = printable.flatMap((p) => Array.from({ length: copies }, () => p.barcode || p.sku || ''))

    const labelRows = rows.map((row) => `<div class="row">${row.map((p) => `<div class="label">
          <div class="name">${p.name}</div>
          <svg></svg>
          <div class="price">KES ${p.price.toLocaleString()}</div>
        </div>`).join('')}</div>`).join('')

    const html = `<!DOCTYPE html><html><head><title>Barcode Labels</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0 }
        body { font-family: -apple-system, sans-serif; padding: 10mm; background: white }
        .row { display: flex; gap: 4mm; margin-bottom: 4mm }
        .label { border: 1px solid #e5e7eb; border-radius: 4px; padding: 3mm 4mm; text-align: center; width: calc(33.33% - 3mm); min-height: 28mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1mm }
        .name { font-size: 8pt; font-weight: 600; color: #111; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
        .price { font-size: 9pt; font-weight: 700; color: #111 }
        svg { max-width: 100%; height: 40px }
        @media print { body { padding: 5mm } }
      </style></head><body>
      ${labelRows}
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>
      <script>
        window.onload = function() {
          var svgs = document.querySelectorAll('svg');
          var vals = ${JSON.stringify(svgData)};
          svgs.forEach(function(svg, i) {
            if (!vals[i]) return;
            try { JsBarcode(svg, vals[i], { height: 36, displayValue: true, fontSize: 8, margin: 2, background: 'transparent' }); } catch(e) {}
          });
          setTimeout(function() { window.print(); }, 600);
        };
      <\/script></body></html>`

    void openPrintHtml(html)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader><DialogTitle>Print Barcode Labels</DialogTitle></DialogHeader>
        <div className="flex items-center gap-3 mt-1 mb-3">
          <Label className="text-xs text-gray-500 whitespace-nowrap">Copies per label</Label>
          <Input type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))} className="w-20" />
          <span className="text-xs text-gray-400 ml-auto">{printable.length} label{printable.length !== 1 ? 's' : ''} × {copies} = {printable.length * copies} total</span>
        </div>
        <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
          {products.filter((p) => p.barcode || p.sku).map((p) => (
            <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" className="rounded" checked={selected.has(p.id)}
                onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n })} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs text-gray-400">{p.barcode ?? p.sku}</div>
              </div>
              <div className="flex-shrink-0 scale-75 origin-right">
                <BarcodeDisplay value={p.barcode ?? p.sku ?? ''} height={28} />
              </div>
            </label>
          ))}
          {products.filter((p) => p.barcode || p.sku).length === 0 && (
            <div className="text-center py-10 text-sm text-gray-400">No products with barcodes or SKUs</div>
          )}
        </div>
        <div className="flex gap-2 mt-3 flex-shrink-0">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handlePrint} disabled={printable.length === 0}>
            <Printer size={13} className="mr-1.5" />Print {printable.length * copies} Label{printable.length * copies !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── 4-state stock status ───────────────────────────────────────────────────

type StockStatus = 'out' | 'critical' | 'low' | 'healthy'

interface StatusMeta {
  status: StockStatus
  label: string
  textCls: string
  bgCls: string
  dotCls: string
  rowBorderCls: string
  rowBgCls: string
}

function getStockStatus(qty: number, min: number): StatusMeta {
  if (qty === 0) return {
    status: 'out', label: 'Out of Stock',
    textCls: 'text-red-700', bgCls: 'bg-red-100', dotCls: 'bg-red-500',
    rowBorderCls: 'border-l-[3px] border-l-red-500', rowBgCls: 'bg-red-50/40',
  }
  if (min > 0 && qty < min * 0.5) return {
    status: 'critical', label: 'Critical',
    textCls: 'text-orange-700', bgCls: 'bg-orange-100', dotCls: 'bg-orange-500',
    rowBorderCls: 'border-l-[3px] border-l-orange-400', rowBgCls: 'bg-orange-50/40',
  }
  if (qty <= min) return {
    status: 'low', label: 'Low Stock',
    textCls: 'text-amber-700', bgCls: 'bg-amber-100', dotCls: 'bg-amber-400',
    rowBorderCls: 'border-l-[3px] border-l-amber-400', rowBgCls: 'bg-amber-50/30',
  }
  return {
    status: 'healthy', label: 'In Stock',
    textCls: 'text-green-700', bgCls: 'bg-green-100', dotCls: 'bg-green-500',
    rowBorderCls: '', rowBgCls: '',
  }
}

function StatusPill({ qty, min }: { qty: number; min: number }) {
  const s = getStockStatus(qty, min)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bgCls} ${s.textCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dotCls}`} />
      {s.label}
    </span>
  )
}

const PO_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pending',     cls: 'bg-amber-50 text-amber-700' },
  transit:   { label: 'In Transit',  cls: 'bg-blue-50 text-blue-700' },
  received:  { label: 'Received',    cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled',   cls: 'bg-gray-100 text-gray-500' },
}

function POStatusBadge({ status }: { status: string }) {
  const { label, cls } = PO_STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' }
  return <Badge className={`${cls} border-0`}>{label}</Badge>
}

function TxTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    purchase: 'bg-amber-50 text-amber-700',
    sale: 'bg-emerald-50 text-emerald-700',
    adjustment: 'bg-gray-100 text-gray-600',
    return: 'bg-gray-100 text-gray-700',
    transfer: 'bg-gray-100 text-gray-700',
  }
  return <Badge className={`${map[type] ?? 'bg-gray-100 text-gray-700'} border-0 text-[11px]`}>{type}</Badge>
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
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: accent + '18' }}>
            <Icon size={18} style={{ color: accent }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Product Form Modal ────────────────────────────────────────────────────

const BLANK_FORM = { name: '', category_id: '', price: '', cost: '', sku: '', barcode: '', stock: '', min_stock: '10', unit: 'piece', vat_rate: '0.16', expiry_date: '', description: '' }

function ProductFormModal({ open, onClose, initial, categories, allProducts, isPending, onSave, onSelectExisting }: {
  open: boolean; onClose: () => void; initial: ApiProduct | null
  categories: ApiCategory[]; allProducts: ApiProduct[]; isPending: boolean
  onSave: (data: Record<string, unknown>, initialStock: number, imageFile?: File) => Promise<void>
  onSelectExisting: (product: ApiProduct) => void
}) {
  const [form, setForm] = useState(BLANK_FORM)
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageDragging, setImageDragging] = useState(false)
  const [imageUrlBroken, setImageUrlBroken] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const createCat = useCreateCategory()
  const hasCustomUnits = useFeature('custom_units')
  const hasProductImages = useFeature('product_images')
  const { data: orgInfo } = useOrgInfo()
  const STANDARD_UNITS = ['piece','bottle','packet','bag','tin','pack','tub','crate','litre','kg','100g','dozen']
  const unitOptions = hasCustomUnits && orgInfo?.custom_units?.length
    ? [...STANDARD_UNITS, ...orgInfo.custom_units.filter((u) => !STANDARD_UNITS.includes(u))]
    : STANDARD_UNITS

  useEffect(() => {
    if (!open) return
    setCreatingCat(false); setNewCatName('')
    setImageFile(null); setImagePreview(null); setImageUrlBroken(false)
    if (initial) {
      setForm({
        name: initial.name,
        category_id: initial.category_id != null ? String(initial.category_id) : '',
        price: String(initial.price),
        cost: initial.cost != null ? String(initial.cost) : '',
        sku: initial.sku ?? '', barcode: initial.barcode ?? '', stock: '',
        min_stock: String(initial.min_stock), unit: initial.unit,
        vat_rate: String(initial.vat_rate), expiry_date: initial.expiry_date ?? '',
        description: initial.description ?? '',
      })
    } else { setForm(BLANK_FORM) }
  }, [open, initial])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleCreateCat = async () => {
    if (!newCatName.trim()) return
    const cat = await createCat.mutateAsync({ name: newCatName.trim() }) as ApiCategory
    set('category_id', String(cat.id))
    setCreatingCat(false); setNewCatName('')
  }

  const applyImageFile = (file: File) => {
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // Tauri: listens to OS-level file drops (from Finder/Explorer). The standard
  // HTML5 onDrop below handles web/browser drag-and-drop as a fallback.
  const { isDragging: tauriDragging } = useTauriFileDrop(open && !!hasProductImages, applyImageFile)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) applyImageFile(file)
    // reset so the same file can be re-selected
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setImageDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) applyImageFile(file)
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setImageUrlBroken(false)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return
    setSaveError(null)
    try {
      await onSave({
        name: form.name.trim(), description: form.description || null,
        price: parseFloat(form.price) || 0, cost: form.cost ? parseFloat(form.cost) : null,
        sku: form.sku || null, barcode: form.barcode || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        unit: form.unit, vat_rate: parseFloat(form.vat_rate) || 0,
        min_stock: parseInt(form.min_stock) || 0, expiry_date: form.expiry_date || null,
      }, parseInt(form.stock) || 0, imageFile ?? undefined)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setSaveError(msg)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? 'Edit Product' : 'Add New Product'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
          <div className="col-span-2 sm:col-span-2">
            <Label className="mb-1.5 block text-xs text-gray-500">Product Name *</Label>
            <div className="relative">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tusker Lager 500ml" />
              {!initial && form.name.length >= 2 && (() => {
                const q = form.name.toLowerCase()
                const matches = allProducts.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 5)
                if (!matches.length) return null
                return (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="px-3 py-1.5 text-[10px] text-amber-700 bg-amber-50 border-b border-amber-100 font-medium">
                      Similar products found — click to edit instead of creating a duplicate
                    </div>
                    {matches.map((p) => (
                      <button key={p.id} type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
                        onClick={() => onSelectExisting(p)}
                      >
                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          KES {p.price.toLocaleString()} · Stock: {p.stock_quantity} {p.unit}
                          {p.sku && ` · ${p.sku}`}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <Label className="mb-1.5 block text-xs text-gray-500">Description</Label>
            <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Short description (optional)" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Category</Label>
            {creatingCat ? (
              <div className="flex gap-1.5">
                <Input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCat()} placeholder="New category name..." className="flex-1" />
                <Button size="sm" className="h-9 px-3 shrink-0" onClick={handleCreateCat} disabled={!newCatName.trim() || createCat.isPending}>
                  {createCat.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
                </Button>
                <Button size="sm" variant="outline" className="h-9 px-2.5 shrink-0" onClick={() => setCreatingCat(false)}>✕</Button>
              </div>
            ) : (
              <Select value={form.category_id} onValueChange={(v) => { if (v === '__new__') { setCreatingCat(true); setNewCatName('') } else set('category_id', v ?? '') }}>
                <SelectTrigger>
                  <SelectValue placeholder="— None —">
                    {form.category_id
                      ? (categories.find((c) => String(c.id) === form.category_id)?.name ?? '— None —')
                      : '— None —'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— None —</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  <SelectItem value="__new__" className="text-amber-600 font-semibold border-t border-gray-100 mt-1 rounded-none">+ New category</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Unit</Label>
            <Select value={form.unit} onValueChange={(v) => set('unit', v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Selling Price (KES) *</Label>
            <Input value={form.price} onChange={(e) => set('price', e.target.value)} type="number" placeholder="0.00" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Cost Price (KES)</Label>
            <Input value={form.cost} onChange={(e) => set('cost', e.target.value)} type="number" placeholder="0.00" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">SKU</Label>
            <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="e.g. SKU-001" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Barcode</Label>
            <div className="flex gap-2">
              <Input
                value={form.barcode}
                onChange={(e) => set('barcode', e.target.value)}
                placeholder="e.g. 6001234567890"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-shrink-0 px-2.5"
                title="Generate barcode"
                onClick={() => {
                  const base = String(Date.now()).slice(-12).padStart(12, '0')
                  let sum = 0
                  for (let i = 0; i < 12; i++) sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3)
                  const check = (10 - (sum % 10)) % 10
                  set('barcode', base + check)
                }}
              >
                <Wand2 size={14} />
              </Button>
            </div>
            {form.barcode && (
              <div className="mt-2 flex justify-center bg-white border border-gray-100 rounded-md py-2">
                <BarcodeDisplay value={form.barcode} height={40} />
              </div>
            )}
          </div>
          {!initial && (
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Initial Stock</Label>
              <Input value={form.stock} onChange={(e) => set('stock', e.target.value)} type="number" placeholder="0" />
            </div>
          )}
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Low Stock Alert (min)</Label>
            <Input value={form.min_stock} onChange={(e) => set('min_stock', e.target.value)} type="number" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">VAT Rate</Label>
            <Select value={form.vat_rate} onValueChange={(v) => set('vat_rate', v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0% — Zero-rated</SelectItem>
                <SelectItem value="0.16">16% — Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Expiry Date</Label>
            <Input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
          </div>
          {hasProductImages && <div className="col-span-2">
            <Label className="mb-1.5 block text-xs text-gray-500">Product Image</Label>
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={handleImageChange} />
            {/* Drop zone */}
            {(() => {
              // imagePreview = local object URL (newly picked file)
              // initial?.image_url = stored URL (may be unreachable in dev)
              // imageUrlBroken = true when stored URL 404s
              const localPreview = imagePreview
              const storedUrl = !imageUrlBroken ? resolveImageUrl(initial?.image_url) : null
              const hasImage = !!(localPreview || storedUrl)
              const isDropActive = imageDragging || tauriDragging
              return (
                <div
                  onClick={() => imageInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setImageDragging(true) }}
                  onDragEnter={(e) => { e.preventDefault(); setImageDragging(true) }}
                  onDragLeave={() => setImageDragging(false)}
                  onDrop={handleDrop}
                  className={`relative w-full rounded-xl border-2 border-dashed cursor-pointer transition-all overflow-hidden
                    ${isDropActive
                      ? 'border-amber-400 bg-amber-50 scale-[1.01]'
                      : hasImage
                        ? 'border-gray-200 hover:border-gray-400'
                        : 'border-gray-200 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                    }`}
                  style={{ minHeight: hasImage ? '140px' : '96px' }}
                >
                  {hasImage ? (
                    <>
                      <img
                        src={localPreview ?? storedUrl ?? ''}
                        alt="Product"
                        className="w-full object-contain"
                        style={{ maxHeight: '200px' }}
                        onError={() => {
                          if (!localPreview) setImageUrlBroken(true)
                        }}
                      />
                      <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                        <span className="text-white text-xs font-semibold bg-black/50 px-2.5 py-1 rounded-full">Click or drop to replace</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clearImage() }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors z-10"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-1.5 pointer-events-none select-none">
                      {isDropActive
                        ? <Package size={28} className="text-amber-400" />
                        : <Package size={28} className="text-gray-300" />
                      }
                      <span className="text-xs font-medium text-gray-500">
                        {isDropActive ? 'Drop to upload' : 'Click or drag & drop'}
                      </span>
                      <span className="text-[11px] text-gray-400">JPEG, PNG, WebP · max 5 MB</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>}
        </div>
        {saveError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mt-2">{saveError}</p>
        )}
        <div className="flex gap-2 mt-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave} disabled={isPending || !form.name || !form.price}>
            {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            {initial ? 'Save Changes' : 'Add Product'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Stock Adjust Modal ─────────────────────────────────────────────────────

function StockAdjustModal({ product, onClose, onSave, isPending, branches, defaultBranchId }: {
  product: ApiProduct | null; onClose: () => void
  onSave: (data: Record<string, unknown>) => void; isPending: boolean
  branches?: { id: number; name: string }[]; defaultBranchId?: number
}) {
  const [type, setType] = useState<'adjustment' | 'return' | 'purchase'>('adjustment')
  const [dir, setDir] = useState<'add' | 'remove'>('add')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [pickedBranch, setPickedBranch] = useState<number | undefined>(defaultBranchId)

  useEffect(() => {
    setPickedBranch(defaultBranchId)
    setQty(''); setDir('add'); setType('adjustment'); setNotes('')
  }, [product?.id, defaultBranchId])

  const needsBranchPicker = !!branches && branches.length > 1 && !defaultBranchId
  const effectiveBranchId = defaultBranchId ?? pickedBranch

  if (!product) return null
  const parsed = parseInt(qty) || 0
  const change = parsed * (dir === 'remove' ? -1 : 1)
  const newQty = product.stock_quantity + change
  const overRemove = dir === 'remove' && parsed > product.stock_quantity
  const canSave = parsed > 0 && !overRemove && !isPending && (!needsBranchPicker || !!pickedBranch)

  return (
    <Dialog open={!!product} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader><DialogTitle>Adjust Stock</DialogTitle></DialogHeader>

        <div className="bg-gray-50 rounded-lg p-3.5">
          <div className="font-semibold text-sm text-gray-900">{product.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            SKU: {product.sku ?? '—'}&nbsp;·&nbsp;Current:&nbsp;
            <span className="font-bold text-gray-700">{product.stock_quantity} {product.unit}</span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Direction first so the dropdown never overlaps it */}
          {needsBranchPicker && (
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Branch *</Label>
              <Select value={pickedBranch ? String(pickedBranch) : ''} onValueChange={(v) => setPickedBranch(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select branch…" />
                </SelectTrigger>
                <SelectContent>
                  {branches!.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Action</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['add', 'remove'] as const).map((d) => (
                <button key={d} onClick={() => setDir(d)}
                  className={`py-2.5 rounded-md text-sm font-semibold border transition-colors ${
                    dir === d
                      ? d === 'add'
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}>
                  {d === 'add' ? '+ Add stock' : '− Remove stock'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Reason</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="adjustment">Manual Count Correction</SelectItem>
                <SelectItem value="return">Customer Return</SelectItem>
                <SelectItem value="purchase">Stock Receipt (no PO)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Quantity</Label>
            <Input
              type="number" value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Enter quantity" min={1} autoFocus
              className={overRemove ? 'border-red-400 focus-visible:ring-red-400' : ''}
            />
            {overRemove && (
              <p className="text-xs text-red-600 mt-1">
                Cannot remove more than current stock ({product.stock_quantity} {product.unit})
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note for audit trail" />
          </div>

          <div className={`flex items-center justify-between text-sm rounded-md px-3.5 py-2.5 border ${
            overRemove
              ? 'bg-red-50 border-red-200 text-red-700'
              : parsed > 0
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-gray-50 border-gray-200 text-gray-500'
          }`}>
            <span className="font-medium">New stock level</span>
            <span className="font-bold">
              {parsed > 0 ? `${Math.max(0, newQty)} ${product.unit}` : `— ${product.unit}`}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={!canSave}
            onClick={() => onSave({ product_id: product.id, qty_change: change, type, notes: notes || undefined, branch_id: effectiveBranchId ?? null })}>
            {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Save Adjustment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Product Detail Pane ───────────────────────────────────────────────────

function PriceAdjustModal({ product, open, onClose }: {
  product: ApiProduct; open: boolean; onClose: () => void
}) {
  const [newPrice, setNewPrice] = useState('')
  const [reason, setReason] = useState('')
  const adjustPrice = useAdjustPrice()

  useEffect(() => { if (!open) { setNewPrice(''); setReason('') } }, [open])

  const diff = parseFloat(newPrice) - product.price
  const pct = product.price > 0 ? (diff / product.price) * 100 : 0

  const handleSave = async () => {
    const price = parseFloat(newPrice)
    if (!price || price <= 0) return
    await adjustPrice.mutateAsync({ productId: product.id, newPrice: price, reason: reason.trim() || undefined })
    toast.success('Price updated')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader><DialogTitle>Adjust Selling Price</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3 text-sm">
            <span className="text-gray-500">Current price</span>
            <span className="font-bold text-gray-900">{fmtKES(product.price)}</span>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">New Price *</Label>
            <Input
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder={String(product.price)}
              autoFocus
            />
            {newPrice && parseFloat(newPrice) > 0 && parseFloat(newPrice) !== product.price && (
              <p className={`text-xs mt-1.5 font-medium flex items-center gap-1 ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {diff > 0 ? '+' : ''}{fmtKES(diff)} ({diff > 0 ? '+' : ''}{pct.toFixed(1)}%)
              </p>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Supplier cost increase, promotion…" />
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!newPrice || parseFloat(newPrice) <= 0 || parseFloat(newPrice) === product.price || adjustPrice.isPending}
            onClick={handleSave}
          >
            {adjustPrice.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Update Price
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const BLANK_UNIT = { name: '', abbreviation: '', conversion_factor: '', price: '', barcode: '', sku: '' }

function ProductUnitsSection({ product, canManage }: { product: ApiProduct; canManage: boolean }) {
  const { data: units = [], isLoading } = useProductUnits(product.id)
  const createUnit = useCreateProductUnit()
  const deleteUnit = useDeleteProductUnit()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(BLANK_UNIT)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!form.name || !form.conversion_factor) return
    await createUnit.mutateAsync({
      productId: product.id,
      data: {
        name: form.name.trim(),
        abbreviation: form.abbreviation.trim() || null,
        conversion_factor: parseFloat(form.conversion_factor) || 1,
        price: form.price ? parseFloat(form.price) : null,
        barcode: form.barcode.trim() || null,
        sku: form.sku.trim() || null,
      } as Partial<ApiProductUnit>,
    })
    setForm(BLANK_UNIT)
    setAdding(false)
  }

  return (
    <div className="px-5 py-4 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selling Units</div>
        {canManage && !adding && (
          <button onClick={() => setAdding(true)} className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-0.5 transition-colors">
            <Plus size={11} />Add unit
          </button>
        )}
      </div>

      {/* Base unit row */}
      <div className="flex items-center justify-between py-1.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-700 font-medium">{product.unit}</span>
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">base</span>
        </div>
        <span className="text-gray-500 text-xs">{fmtKES(product.price)}</span>
      </div>

      {/* Additional units */}
      {isLoading ? (
        <div className="h-6 bg-gray-100 rounded animate-pulse mt-1" />
      ) : (
        units.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-1.5 text-sm border-t border-gray-50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-700 font-medium">{u.name}</span>
              {u.abbreviation && <span className="text-[10px] text-gray-400">({u.abbreviation})</span>}
              <span className="text-[10px] text-gray-400">×{u.conversion_factor} {product.unit}</span>
              {u.barcode && <span className="text-[10px] text-gray-300 font-mono truncate max-w-[60px]">{u.barcode}</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-gray-500 text-xs">{fmtKES(u.price ?? product.price * u.conversion_factor)}</span>
              {canManage && (
                <button
                  onClick={() => { if (window.confirm(`Remove unit "${u.name}"?`)) deleteUnit.mutate({ productId: product.id, unitId: u.id }) }}
                  className="text-gray-300 hover:text-red-500 p-0.5 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {/* Inline add form */}
      {adding && (
        <div className="mt-3 border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Unit name *</label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Crate" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Abbrev.</label>
              <Input value={form.abbreviation} onChange={(e) => set('abbreviation', e.target.value)} placeholder="crt" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Factor * (how many {product.unit}s)</label>
              <Input type="number" value={form.conversion_factor} onChange={(e) => set('conversion_factor', e.target.value)} placeholder="24" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Sell price (blank = auto)</label>
              <Input type="number" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder={form.conversion_factor ? String(product.price * (parseFloat(form.conversion_factor) || 1)) : ''} className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">Barcode</label>
              <Input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="optional" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium mb-1 block">SKU</label>
              <Input value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="optional" className="h-7 text-xs" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1 h-7 text-xs" disabled={!form.name || !form.conversion_factor || createUnit.isPending} onClick={handleAdd}>
              {createUnit.isPending && <Loader2 size={11} className="animate-spin mr-1" />}
              Save unit
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => { setAdding(false); setForm(BLANK_UNIT) }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductDetailPane({ product, categories, onClose, onEdit, onAdjust, onDelete, canManage = true, isAdmin = false }: {
  product: ApiProduct
  categories: ApiCategory[]
  onClose: () => void
  onEdit: () => void
  onAdjust: () => void
  onDelete: () => void
  canManage?: boolean
  isAdmin?: boolean
}) {
  const { data: locations = [], isLoading: locLoading } = useProductInventory(product.id)
  const { data: txns = [], isLoading: txnLoading } = useInventoryTransactions(product.id)
  const { data: priceHistory = [] } = usePriceHistory(product.id)
  const [priceModalOpen, setPriceModalOpen] = useState(false)
  const s = getStockStatus(product.stock_quantity, product.min_stock)
  const catColor = categories.find((c) => c.id === product.category_id)?.color ?? '#6B7280'
  const expDays = daysUntil(product.expiry_date)
  const recentTxns = txns.slice(0, 10)
  const uploadImage = useUploadProductImage()
  const imgInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await uploadImage.mutateAsync({ productId: product.id, file })
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex gap-3.5 min-w-0">
          {/* Thumbnail */}
          <div className="w-14 h-14 rounded-xl flex-shrink-0 relative overflow-hidden group">
            <div className="w-full h-full rounded-xl flex items-center justify-center text-white text-xl font-bold select-none"
              style={{ background: catColor }}>
              {product.name[0].toUpperCase()}
            </div>
            {product.image_url && (
              <img src={resolveImageUrl(product.image_url) ?? ''} alt={product.name}
                className="absolute inset-0 w-full h-full object-cover rounded-xl ring-1 ring-gray-200"
                onError={(e) => { e.currentTarget.style.display = 'none' }} />
            )}
            {canManage && (
              <>
                <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                <button
                  onClick={() => imgInputRef.current?.click()}
                  disabled={uploadImage.isPending}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                >
                  {uploadImage.isPending
                    ? <Loader2 size={16} className="text-white animate-spin" />
                    : <Pencil size={14} className="text-white" />}
                </button>
              </>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-gray-900 text-[15px] leading-snug">{product.name}</div>
            <div className="text-[11px] text-gray-400 mt-0.5 space-x-2">
              {product.sku && <span>SKU: {product.sku}</span>}
              {product.barcode && <span>· {product.barcode}</span>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusPill qty={product.stock_quantity} min={product.min_stock} />
              {product.category_name && (
                <Badge variant="outline" className="text-[11px] h-5 px-1.5">{product.category_name}</Badge>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0 ml-1 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Quick actions */}
      {(canManage || isAdmin) && (
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0 space-y-2">
          <div className="flex gap-2">
            {canManage && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
                <Pencil size={13} className="mr-1.5" />Edit <kbd className="ml-auto text-[10px] text-gray-400 font-mono bg-gray-100 px-1 rounded">E</kbd>
              </Button>
            )}
            <Button size="sm" className="flex-1" onClick={onAdjust}>
              <SlidersHorizontal size={13} className="mr-1.5" />Adjust <kbd className="ml-auto text-[10px] text-gray-100/70 font-mono bg-white/20 px-1 rounded">A</kbd>
            </Button>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setPriceModalOpen(true)}>
              <Tag size={13} className="mr-1.5" />Edit Price
            </Button>
          )}
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Stock overview */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Stock Overview</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 rounded-lg py-3">
              <div className={`text-2xl font-bold leading-none ${s.textCls}`}>{product.stock_quantity}</div>
              <div className="text-[11px] text-gray-400 mt-1">{product.unit}</div>
              <div className="text-[10px] text-gray-400">Available</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-3">
              <div className="text-2xl font-bold leading-none text-gray-700">{product.min_stock}</div>
              <div className="text-[11px] text-gray-400 mt-1">{product.unit}</div>
              <div className="text-[10px] text-gray-400">Reorder at</div>
            </div>
            <div className="bg-gray-50 rounded-lg py-3 text-center">
              <div className="text-lg font-bold leading-none text-gray-700">{fmtKES(product.price)}</div>
              <div className="text-[10px] text-gray-400 mt-1">Sell price</div>
              {product.cost != null && <div className="text-[10px] text-gray-400">Cost: {fmtKES(product.cost)}</div>}
            </div>
          </div>
          {expDays !== null && (
            <div className={`mt-2.5 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md ${expDays < 0 ? 'bg-red-50 text-red-700' : expDays <= 7 ? 'bg-orange-50 text-orange-700' : expDays <= 30 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'}`}>
              <AlertTriangle size={12} />
              {expDays < 0 ? 'Expired' : `Expires in ${expDays} days — ${new Date(product.expiry_date!).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </div>
          )}
        </div>

        {/* By location */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">By Location</div>
          {locLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : locations.length === 0 ? (
            <div className="text-xs text-gray-400">No location data yet</div>
          ) : (
            <div className="space-y-1.5">
              {locations.map((loc: ApiInventoryItem) => {
                const ls = getStockStatus(loc.quantity, loc.low_stock_threshold)
                return (
                  <div key={loc.id} className={`flex items-center justify-between py-2 px-3 rounded-lg ${ls.rowBgCls || 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ls.dotCls}`} />
                      <span className="text-sm text-gray-700 font-medium truncate">{loc.branch_name ?? 'Main'}</span>
                      {loc.location && <span className="text-[11px] text-gray-400">({loc.location})</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-bold ${ls.textCls}`}>{loc.quantity}</span>
                      {loc.reserved_quantity > 0 && (
                        <span className="text-[11px] text-gray-400">{loc.reserved_quantity} reserved</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Barcode */}
        {(product.barcode || product.sku) && (
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Barcode</div>
            <div className="flex justify-center bg-gray-50 rounded-lg py-3">
              <BarcodeDisplay value={product.barcode ?? product.sku ?? ''} height={48} />
            </div>
          </div>
        )}

        {/* Units */}
        <ProductUnitsSection product={product} canManage={canManage} />

        {/* Price history */}
        {priceHistory.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Price History</div>
            <div className="space-y-0.5">
              {priceHistory.slice(0, 5).map((h: ApiPriceHistory) => {
                const diff = h.new_price - h.old_price
                return (
                  <div key={h.id} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${diff > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {diff > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-700">
                        {fmtKES(h.old_price)} → {fmtKES(h.new_price)}
                        <span className={`ml-1.5 text-[11px] font-medium ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          ({diff > 0 ? '+' : ''}{fmtKES(diff)})
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {h.changed_by_name ?? 'System'} · {new Date(h.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {h.reason && <> · {h.reason}</>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent activity */}
        <div className="px-5 py-4">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Activity</div>
          {txnLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : recentTxns.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">No transactions yet</div>
          ) : (
            <div className="space-y-0.5">
              {recentTxns.map((tx) => (
                <div key={tx.id} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${tx.quantity_change > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {tx.quantity_change > 0 ? '+' : ''}{tx.quantity_change}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <TxTypeBadge type={tx.type} />
                      {tx.notes && <span className="text-[11px] text-gray-400 truncate max-w-[120px]">{tx.notes}</span>}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {tx.quantity_before}→{tx.quantity_after} · {tx.performed_by_name ?? 'System'} · {new Date(tx.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PriceAdjustModal product={product} open={priceModalOpen} onClose={() => setPriceModalOpen(false)} />

      {/* Delete footer */}
      {canManage && (
        <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 hover:text-red-700"
            onClick={onDelete}
          >
            <Trash2 size={13} className="mr-1.5" />Delete Product
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Products Tab ──────────────────────────────────────────────────────────

type StockFilter = 'all' | 'in-stock' | 'low' | 'out'

function ProductsTab({ branchId }: { branchId?: number }) {
  const { user } = useAuthStore()
  const { data: permsData } = usePermissions()
  const { data: rawBranches = [] } = useBranches()
  const role = user?.role
  const canManage = role === 'admin' || role === 'manager'
    || (role === 'cashier' && permsData?.permissions?.cashier?.manage_inventory === true)
    || (role === 'stock' && permsData?.permissions?.stock?.manage_inventory !== false)
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  // Keep the search box in sync when the global topbar search navigates here
  // with a new ?q= while this page is already mounted.
  useEffect(() => {
    const q = searchParams.get('q')
    if (q !== null) setSearch(q)
  }, [searchParams])
  const [catFilter, setCatFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<ApiProduct | null>(null)
  const [adjustProduct, setAdjustProduct] = useState<ApiProduct | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<ApiProduct | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [deleteConfirm, setDeleteConfirm] = useState<ApiProduct | null>(null)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false)
  const [limitError, setLimitError] = useState<LimitError | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const focusedRowRef = useRef<HTMLTableRowElement>(null)

  // Always load all products — filter locally for zero-latency
  const { data: products = [], isLoading } = useProducts(undefined, undefined, branchId)
  const { data: categories = [] } = useCategories()
  const { data: orgInfo } = useOrgInfo()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProductById()
  const deleteProduct = useDeleteProduct()
  const adjustInventory = useAdjustInventory()
  const bulkCreateProducts = useBulkCreateProducts()
  const hasProductImages = useFeature('product_images')
  const importRef = useRef<HTMLInputElement>(null)

  const TEMPLATE_HEADERS = ['name', 'price', 'description', 'sku', 'barcode', 'category', 'cost', 'unit', 'vat_rate', 'min_stock', 'stock_quantity']
  const TEMPLATE_ROW = [['Sample Product', '100', 'Optional description', 'SKU-001', '', 'Electronics', '70', 'piece', '0.16', '5', '20']]

  const downloadTemplateCSV = () => downloadCSV('products_template.csv', TEMPLATE_HEADERS, TEMPLATE_ROW)
  const downloadTemplateXlsx = () => void downloadXlsx('products_template.xlsx', TEMPLATE_HEADERS, TEMPLATE_ROW)

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')

    let headers: string[]
    let dataRows: string[][]

    if (isXlsx) {
      try {
        const XLSX = await import('xlsx')
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
        if (raw.length < 2) { toast.error('Spreadsheet has no data rows'); return }
        headers = raw[0].map((h) => String(h).trim().toLowerCase())
        dataRows = raw.slice(1).map((r) => r.map((c) => String(c ?? '').trim()))
      } catch (err) {
        toast.error(`Could not read spreadsheet: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
    } else {
      const text = await file.text()
      const lines = text.trim().split(/\r?\n/)
      if (lines.length < 2) { toast.error('CSV has no data rows'); return }
      headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())
      dataRows = lines.slice(1).filter(Boolean).map(parseCSVLine)
    }

    if (!headers.includes('name') || !headers.includes('price')) {
      toast.error('File must have "name" and "price" columns')
      return
    }

    const col = (cols: string[], key: string) => { const i = headers.indexOf(key); return i === -1 ? '' : cols[i]?.trim() ?? '' }
    const rows: Record<string, unknown>[] = []
    for (const cols of dataRows) {
      const name = col(cols, 'name')
      const price = parseFloat(col(cols, 'price'))
      if (!name || isNaN(price)) continue
      const catName = col(cols, 'category')
      const cat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
      rows.push({
        name,
        price,
        description: col(cols, 'description') || null,
        sku: col(cols, 'sku') || null,
        barcode: col(cols, 'barcode') || null,
        category_id: cat?.id ?? null,
        cost: parseFloat(col(cols, 'cost')) || null,
        unit: col(cols, 'unit') || 'piece',
        vat_rate: parseFloat(col(cols, 'vat_rate')) || 0.16,
        min_stock: parseInt(col(cols, 'min_stock')) || 10,
        initial_stock: parseInt(col(cols, 'stock_quantity')) || 0,
      })
    }
    if (rows.length === 0) { toast.error('No valid rows found in file'); return }
    bulkCreateProducts.mutate(rows, {
      onSuccess: (res: { created: number }) => toast.success(`Imported ${res.created} product${res.created !== 1 ? 's' : ''}`),
      onError: (err) => {
        const limit = parseLimitError(err)
        if (limit) setLimitError(limit)
        else toast.error('Import failed — check file format')
      },
    })
  }

  // Sync selectedProduct with fresh data after mutations
  const currentSelected = useMemo(() =>
    selectedProduct ? (products.find((p) => p.id === selectedProduct.id) ?? selectedProduct) : null,
    [products, selectedProduct]
  )

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.is_active)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q)) ||
        (p.barcode?.includes(q)) ||
        (p.category_name?.toLowerCase().includes(q))
      )
    }
    if (catFilter !== 'all') list = list.filter((p) => p.category_id === Number(catFilter))
    if (stockFilter === 'in-stock') list = list.filter((p) => p.stock_quantity > p.min_stock)
    if (stockFilter === 'low') list = list.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock)
    if (stockFilter === 'out') list = list.filter((p) => p.stock_quantity === 0)
    return list
  }, [products, search, catFilter, stockFilter])

  const atLimit = orgInfo ? (orgInfo.max_products !== null && products.filter((p) => p.is_active).length >= orgInfo.max_products) : false
  const isLargeScreen = useMediaQuery('(min-width: 1024px)')
  const detailOpen = !!currentSelected

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (isInput && e.key !== 'Escape') return

      switch (e.key) {
        case '/':
          if (!isInput) { e.preventDefault(); searchRef.current?.focus() }
          break
        case 'Escape':
          if (isInput) { (e.target as HTMLInputElement).blur() }
          else { setSelectedProduct(null); setSelectedIds(new Set()) }
          break
        case 'ArrowDown': case 'j':
          if (!isInput) { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, filtered.length - 1)) }
          break
        case 'ArrowUp': case 'k':
          if (!isInput) { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)) }
          break
        case 'Enter':
          if (!isInput && focusedIdx >= 0 && filtered[focusedIdx]) setSelectedProduct(filtered[focusedIdx])
          break
        case 'n':
          if (!isInput && canManage) { e.preventDefault(); setEditProduct(null); setAddOpen(true) }
          break
        case 'e':
          if (!isInput && canManage && currentSelected) { e.preventDefault(); setEditProduct(currentSelected); setAddOpen(true) }
          break
        case 'a':
          if (!isInput && currentSelected) { e.preventDefault(); setAdjustProduct(currentSelected) }
          break
        case 'x':
          if (!isInput && focusedIdx >= 0 && filtered[focusedIdx]) {
            const p = filtered[focusedIdx]
            setSelectedIds((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, focusedIdx, currentSelected])

  // Scroll focused row into view
  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedIdx])

  const uploadImage = useUploadProductImage()

  const handleSave = async (data: Record<string, unknown>, initialStock: number, imageFile?: File) => {
    try {
      if (editProduct) {
        await updateProduct.mutateAsync({ id: editProduct.id, data })
        if (imageFile) await uploadImage.mutateAsync({ productId: editProduct.id, file: imageFile })
        toast.success('Product updated')
      } else {
        const created = await createProduct.mutateAsync(data) as ApiProduct
        if (initialStock > 0) {
          await adjustInventory.mutateAsync({ product_id: created.id, branch_id: user?.branch ? (Number(user.branch) || null) : null, qty_change: initialStock, notes: 'Initial stock' })
        }
        if (imageFile) await uploadImage.mutateAsync({ productId: created.id, file: imageFile })
        toast.success('Product created')
      }
      setAddOpen(false); setEditProduct(null)
    } catch (err) {
      const limit = parseLimitError(err)
      if (limit) { setAddOpen(false); setLimitError(limit) }
      else { toast.error('Failed to save product'); throw err }
    }
  }

  const handleAdjust = async (data: Record<string, unknown>) => {
    // branch_id comes from the modal (admin branch picker or defaultBranchId);
    // backend also enforces current_user.branch_id for non-admins as a safety net
    await adjustInventory.mutateAsync(data)
    toast.success('Stock adjusted')
    setAdjustProduct(null)
  }

  const handleDelete = async (product: ApiProduct) => {
    await deleteProduct.mutateAsync(product.id)
    toast.success('Product deleted')
    setDeleteConfirm(null)
    if (selectedProduct?.id === product.id) setSelectedProduct(null)
  }

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setBulkDeletePending(true)
    try {
      await Promise.all([...selectedIds].map((id) => deleteProduct.mutateAsync(id)))
      toast.success(`${selectedIds.size} product${selectedIds.size > 1 ? 's' : ''} deleted`)
      if (selectedProduct && selectedIds.has(selectedProduct.id)) setSelectedProduct(null)
      setSelectedIds(new Set())
    } finally {
      setBulkDeletePending(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map((p) => p.id)))
  }

  const EXPORT_HEADERS = ['Name', 'SKU', 'Barcode', 'Category', 'Sell Price', 'Cost', 'Stock', 'Min Stock', 'Unit', 'Status']
  const exportRows = (rows: ApiProduct[]) => rows.map((p) => [p.name, p.sku ?? '', p.barcode ?? '', p.category_name ?? '', p.price, p.cost ?? '', p.stock_quantity, p.min_stock, p.unit, getStockStatus(p.stock_quantity, p.min_stock).label])
  const exportFilename = `products-${new Date().toISOString().slice(0, 10)}`

  const exportCSV = (rows: ApiProduct[]) => downloadCSV(`${exportFilename}.csv`, EXPORT_HEADERS, exportRows(rows))
  const exportXlsx = (rows: ApiProduct[]) => void downloadXlsx(`${exportFilename}.xlsx`, EXPORT_HEADERS, exportRows(rows))
  const exportPDF = () => openPrintWindow(
    'Product Catalogue',
    ['Product', 'SKU', 'Category', 'Sell Price', 'Cost', 'Stock', 'Status'],
    filtered.map((p) => [p.name, p.sku ?? '—', p.category_name ?? '—', fmtKES(p.price), p.cost ? fmtKES(p.cost) : '—', `${p.stock_quantity} ${p.unit}`, getStockStatus(p.stock_quantity, p.min_stock).label]),
    `${filtered.length} products`
  )

  const selectedRows = filtered.filter((p) => selectedIds.has(p.id))
  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input ref={searchRef} className="pl-9 pr-8" placeholder="Search name, SKU, barcode… ( / )" value={search} onChange={(e) => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <Select value={catFilter} onValueChange={(v) => setCatFilter(v ?? 'all')}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockFilter)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock</SelectItem>
            <SelectItem value="in-stock">In stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1.5 ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Download size={13} className="mr-1.5" />Export<ChevronDown size={11} className="ml-1 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportPDF}>
                <Printer size={13} className="mr-2" />PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportXlsx(filtered)}>
                <FileDown size={13} className="mr-2" />Spreadsheet (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCSV(filtered)}>
                <FileDown size={13} className="mr-2" />CSV (.csv)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => setBarcodeModalOpen(true)}><Barcode size={13} className="mr-1.5" />Labels</Button>
          {canManage && (
            <>
              <input ref={importRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
              <DropdownMenu>
                <DropdownMenuTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  <FileDown size={13} className="mr-1.5" />Template<ChevronDown size={11} className="ml-1 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={downloadTemplateXlsx}>
                    <FileDown size={13} className="mr-2" />Spreadsheet (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={downloadTemplateCSV}>
                    <FileDown size={13} className="mr-2" />CSV (.csv)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={bulkCreateProducts.isPending}>
                {bulkCreateProducts.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Upload size={13} className="mr-1.5" />}
                Import
              </Button>
              <Button size="sm" disabled={atLimit} title={atLimit ? 'Product limit reached' : undefined}
                onClick={() => { setEditProduct(null); setAddOpen(true) }}>
                <Plus size={13} className="mr-1.5" />Add Product
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Master-detail layout */}
      <div className="flex gap-0 min-h-0 overflow-hidden rounded-xl border border-gray-200">
        {/* Left — product list */}
        <div className={`flex flex-col min-w-0 overflow-hidden ${detailOpen ? 'flex-1' : 'w-full'}`}>
          <div className="overflow-x-auto overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="w-10 pl-4">
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded accent-gray-900 cursor-pointer" />
                  </TableHead>
                  <TableHead>Product</TableHead>
                  {!detailOpen && <TableHead>Category</TableHead>}
                  {!detailOpen && <TableHead className="text-right">Sell</TableHead>}
                  {!detailOpen && <TableHead className="text-right">Cost</TableHead>}
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  {!detailOpen && <TableHead>Expiry</TableHead>}
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={detailOpen ? 5 : 9}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={detailOpen ? 5 : 9} className="text-center py-16">
                      <Package size={36} className="mx-auto mb-2.5 text-gray-200" />
                      <div className="text-sm text-gray-400">No products found</div>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((p, idx) => {
                  const s = getStockStatus(p.stock_quantity, p.min_stock)
                  const isFocused = focusedIdx === idx
                  const isSelected = currentSelected?.id === p.id
                  const isChecked = selectedIds.has(p.id)
                  const catColor = categories.find((c) => c.id === p.category_id)?.color
                  const expDays = daysUntil(p.expiry_date)
                  return (
                    <TableRow
                      key={p.id}
                      ref={isFocused ? focusedRowRef : undefined}
                      onClick={() => setSelectedProduct(isSelected ? null : p)}
                      className={`cursor-pointer transition-colors ${s.rowBorderCls} ${isSelected ? 'bg-amber-50 hover:bg-amber-50' : isFocused ? 'bg-gray-50' : s.rowBgCls + ' hover:bg-gray-50/80'}`}
                    >
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked}
                          onChange={() => setSelectedIds((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })}
                          className="w-3.5 h-3.5 rounded accent-gray-900 cursor-pointer" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-md flex-shrink-0 relative overflow-hidden">
                            <div className="w-full h-full rounded-md flex items-center justify-center text-white text-sm font-bold select-none"
                              style={{ background: catColor ?? '#9CA3AF' }}>
                              {p.name[0].toUpperCase()}
                            </div>
                            {hasProductImages && p.image_url && (
                              <img src={resolveImageUrl(p.image_url) ?? ''} alt={p.name}
                                className="absolute inset-0 w-full h-full object-cover rounded-md ring-1 ring-gray-200"
                                onError={(e) => { e.currentTarget.style.display = 'none' }} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-900 truncate max-w-[140px]">{p.name}</div>
                            <div className="text-[11px] text-gray-400">{p.sku ? `SKU: ${p.sku}` : '—'}</div>
                          </div>
                        </div>
                      </TableCell>
                      {!detailOpen && <TableCell><Badge variant="outline" className="text-[11px]">{p.category_name ?? '—'}</Badge></TableCell>}
                      {!detailOpen && <TableCell className="text-right font-semibold text-sm">{fmtKES(p.price)}</TableCell>}
                      {!detailOpen && <TableCell className="text-right text-sm text-gray-500">{p.cost != null ? fmtKES(p.cost) : '—'}</TableCell>}
                      <TableCell className="text-right">
                        <span className={`font-bold text-sm ${s.textCls}`}>{p.stock_quantity}</span>
                        <span className="text-[11px] text-gray-400 ml-1">{p.unit}</span>
                      </TableCell>
                      <TableCell><StatusPill qty={p.stock_quantity} min={p.min_stock} /></TableCell>
                      {!detailOpen && (
                        <TableCell>
                          {expDays === null ? <span className="text-gray-300 text-xs">—</span>
                            : expDays < 0 ? <span className="text-red-600 text-xs font-semibold">Expired</span>
                            : expDays <= 7 ? <span className="text-orange-600 text-xs font-semibold">{expDays}d</span>
                            : expDays <= 30 ? <span className="text-amber-600 text-xs font-semibold">{expDays}d</span>
                            : <span className="text-xs text-gray-400">{new Date(p.expiry_date!).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                          }
                        </TableCell>
                      )}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          {canManage && (
                            <button title="Edit (E)" onClick={(e) => { e.currentTarget.blur(); setEditProduct(p); setAddOpen(true) }}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><Pencil size={13} /></button>
                          )}
                          <button title="Adjust stock (A)" onClick={(e) => { e.currentTarget.blur(); setAdjustProduct(p) }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"><SlidersHorizontal size={13} /></button>
                          <button title="Open detail" onClick={(e) => { e.currentTarget.blur(); setSelectedProduct(isSelected ? null : p) }}
                            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${isSelected ? 'text-amber-600' : 'text-gray-400 hover:text-gray-700'}`}><ChevronRight size={13} /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-xs text-gray-400 shrink-0">
            <span>{filtered.length} products {stockFilter !== 'all' || search ? '(filtered)' : ''}</span>
            {orgInfo && <span>{products.filter((p) => p.is_active).length} / {orgInfo.max_products === null ? '∞' : orgInfo.max_products} slots used</span>}
          </div>
        </div>

        {/* Right — detail pane (side panel on lg+, Sheet on smaller screens) */}
        {detailOpen && currentSelected && (
          <>
            <div className="hidden lg:block w-[380px] xl:w-[420px] shrink-0 border-l border-gray-200 overflow-y-auto">
              <ProductDetailPane
                product={currentSelected}
                categories={categories}
                onClose={() => setSelectedProduct(null)}
                onEdit={() => { setEditProduct(currentSelected); setAddOpen(true) }}
                onAdjust={() => setAdjustProduct(currentSelected)}
                onDelete={() => setDeleteConfirm(currentSelected)}
                canManage={canManage}
                isAdmin={role === 'admin'}
              />
            </div>
            <Sheet open={!isLargeScreen && detailOpen && !!currentSelected} onOpenChange={(v) => !v && setSelectedProduct(null)}>
              <SheetContent side="right" className="w-full max-w-sm p-0">
                <ProductDetailPane
                  product={currentSelected}
                  categories={categories}
                  onClose={() => setSelectedProduct(null)}
                  onEdit={() => { setEditProduct(currentSelected); setAddOpen(true) }}
                  onAdjust={() => setAdjustProduct(currentSelected)}
                  onDelete={() => setDeleteConfirm(currentSelected)}
                  canManage={canManage}
                  isAdmin={role === 'admin'}
                />
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>

      {/* Keyboard hint bar */}
      <div className="flex items-center gap-4 mt-2.5 flex-wrap select-none">
        {([['/', 'search'], ['N', 'new'], ['E', 'edit'], ['A', 'adjust'], ['↑↓', 'navigate'], ['Enter', 'detail'], ['X', 'select'], ['Esc', 'close']] as [string, string][]).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1 text-[11px] text-gray-400">
            <kbd className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">{key}</kbd>
            {label}
          </span>
        ))}
      </div>

      {/* Bulk action floating bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-full px-5 py-2.5 flex items-center gap-3 shadow-2xl shadow-black/20">
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <div className="w-px h-4 bg-white/20" />
          <button onClick={() => exportCSV(selectedRows)} className="text-sm flex items-center gap-1.5 hover:text-gray-300 transition-colors">
            <Download size={13} />Export
          </button>
          {canManage && (
            <button onClick={handleBulkDelete} disabled={bulkDeletePending} className="text-sm flex items-center gap-1.5 hover:text-red-400 transition-colors disabled:opacity-50">
              {bulkDeletePending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Delete ({selectedIds.size})
            </button>
          )}
          <div className="w-px h-4 bg-white/20" />
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white transition-colors"><X size={14} /></button>
        </div>
      )}

      <ProductFormModal open={addOpen} onClose={() => { setAddOpen(false); setEditProduct(null) }}
        initial={editProduct} categories={categories} allProducts={products}
        isPending={createProduct.isPending || updateProduct.isPending} onSave={handleSave}
        onSelectExisting={(p) => { setEditProduct(p); }} />
      <StockAdjustModal
        product={adjustProduct}
        onClose={() => setAdjustProduct(null)}
        onSave={handleAdjust}
        isPending={adjustInventory.isPending}
        branches={role === 'admin' ? rawBranches.map((b) => ({ id: b.id, name: b.name })) : undefined}
        defaultBranchId={branchId}
      />
      <LimitReachedDialog limit={limitError} onClose={() => setLimitError(null)} />
      <BarcodePrintModal products={products} open={barcodeModalOpen} onClose={() => setBarcodeModalOpen(false)} />

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <div className="flex flex-col items-center text-center pt-2 pb-1">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <Trash2 size={22} className="text-red-600" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-lg">Delete Product?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mt-2">
              You're about to permanently delete{' '}
              <span className="font-semibold text-gray-800">{deleteConfirm?.name}</span>.
              <br />This will remove the product and all its stock records. This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending
                ? <Loader2 size={13} className="animate-spin mr-1.5" />
                : <Trash2 size={13} className="mr-1.5" />}
              Delete Product
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Purchase Orders Tab ───────────────────────────────────────────────────

function SupplierCombobox({ value, onChange, suppliers, onCreateNew }: {
  value: string; onChange: (name: string) => void
  suppliers: ApiSupplier[]; onCreateNew: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = value
    ? suppliers.filter((s) => s.name.toLowerCase().includes(value.toLowerCase()))
    : suppliers

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search or enter supplier name"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
              onMouseDown={() => { onChange(s.name); setOpen(false) }}
            >
              <span>{s.name}</span>
              {s.contact_name && <span className="text-xs text-gray-400">{s.contact_name}</span>}
            </button>
          ))}
          {filtered.length === 0 && value && (
            <div className="px-3 py-2 text-xs text-gray-400">No matching suppliers — press Create to add one</div>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-amber-600 font-semibold border-t border-gray-100 flex items-center gap-1.5 hover:bg-amber-50 cursor-pointer"
            onMouseDown={() => { setOpen(false); onCreateNew() }}
          >
            <Plus size={12} />Create new supplier…
          </button>
        </div>
      )}
    </div>
  )
}

function QuickCreateSupplierModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (s: ApiSupplier) => void
}) {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const createSupplier = useCreateSupplier()

  useEffect(() => { if (!open) { setName(''); setContactName(''); setPhone('') } }, [open])

  const handleSave = async () => {
    if (!name.trim()) return
    const created = await createSupplier.mutateAsync({
      name: name.trim(),
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
    }) as ApiSupplier
    toast.success('Supplier created')
    onCreated(created)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader><DialogTitle>New Supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Supplier Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EABL Distributors Ltd" autoFocus />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Contact Person</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. John Kamau" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" type="tel" />
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={!name.trim() || createSupplier.isPending} onClick={handleSave}>
            {createSupplier.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Create Supplier
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function QuickCreateProductModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (p: ApiProduct) => void
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const { data: categories = [] } = useCategories()
  const createProduct = useCreateProduct()

  useEffect(() => { if (!open) { setName(''); setPrice(''); setCost(''); setCategoryId('') } }, [open])

  const handleSave = async () => {
    if (!name.trim() || !price) return
    const created = await createProduct.mutateAsync({
      name: name.trim(),
      price: parseFloat(price),
      cost: cost ? parseFloat(cost) : null,
      category_id: categoryId ? Number(categoryId) : null,
      unit: 'piece', vat_rate: 0.16, min_stock: 10,
    }) as ApiProduct
    toast.success('Product created')
    onCreated(created)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader><DialogTitle>New Product</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Product Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Engine Oil 5L" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Selling Price *</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Cost Price</Label>
              <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-gray-500">Category</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
              <SelectTrigger><span className={categoryId ? undefined : 'text-muted-foreground'}>{categoryId ? (categories.find((c) => String(c.id) === categoryId)?.name ?? '—') : '— None —'}</span></SelectTrigger>
              <SelectContent className="min-w-[200px]">
                <SelectItem value="">— None —</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={!name.trim() || !price || createProduct.isPending} onClick={handleSave}>
            {createProduct.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
            Create Product
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewPOModal({ open, onClose, products, branches }: {
  open: boolean; onClose: () => void
  products: ApiProduct[]; branches: { id: number; name: string }[]
}) {
  const [supplier, setSupplier] = useState('')
  const [branchId, setBranchId] = useState('')
  const [lines, setLines] = useState([{ product_id: '', product_name: '', qty: '', unit_cost: '', unit_id: '', unit_name: '', conversion_factor: '1', expiry_date: '' }])
  const [quickCreateLineIdx, setQuickCreateLineIdx] = useState<number | null>(null)
  const [quickCreateSupplierOpen, setQuickCreateSupplierOpen] = useState(false)
  const { data: suppliers = [] } = useSuppliers()
  const createPO = useCreatePurchaseOrder()

  const setLine = (i: number, k: string, v: string) => setLines((l) => l.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const total = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.unit_cost) || 0), 0)

  const handleProductChange = (i: number, v: string) => {
    if (v === '__create__') { setQuickCreateLineIdx(i); return }
    const p = products.find((x) => x.id === Number(v))
    setLines((l) => l.map((r, idx) => idx === i ? { ...r, product_id: v ?? '', product_name: p?.name ?? '', unit_cost: p?.cost ? String(p.cost) : r.unit_cost, unit_id: '', unit_name: '', conversion_factor: '1' } : r))
  }

  const handleUnitChange = (i: number, unitIdStr: string) => {
    const line = lines[i]
    const p = products.find((x) => String(x.id) === line.product_id)
    if (unitIdStr === 'base' || !unitIdStr) {
      setLines((l) => l.map((r, idx) => idx === i ? { ...r, unit_id: '', unit_name: '', conversion_factor: '1', unit_cost: p?.cost ? String(p.cost) : r.unit_cost } : r))
    } else {
      const u = p?.units.find((u) => String(u.id) === unitIdStr)
      if (!u) return
      const autoUnitCost = p?.cost ? String(Math.round(p.cost * u.conversion_factor * 100) / 100) : line.unit_cost
      setLines((l) => l.map((r, idx) => idx === i ? { ...r, unit_id: unitIdStr, unit_name: u.name, conversion_factor: String(u.conversion_factor), unit_cost: autoUnitCost } : r))
    }
  }

  const handleQuickCreated = (p: ApiProduct) => {
    if (quickCreateLineIdx === null) return
    setLines((l) => l.map((r, idx) => idx === quickCreateLineIdx
      ? { ...r, product_id: String(p.id), product_name: p.name, unit_cost: p.cost ? String(p.cost) : r.unit_cost }
      : r))
    setQuickCreateLineIdx(null)
  }

  const handleCreate = async () => {
    const items = lines.filter((l) => l.qty && l.unit_cost).map((l) => ({
      product_id: l.product_id ? Number(l.product_id) : undefined,
      product_name: l.product_name,
      quantity: parseInt(l.qty) || 0,
      unit_cost: parseFloat(l.unit_cost) || 0,
      expiry_date: l.expiry_date || null,
      unit_id: l.unit_id ? Number(l.unit_id) : undefined,
      unit_name: l.unit_name || undefined,
      conversion_factor: parseFloat(l.conversion_factor) || 1,
    }))
    await createPO.mutateAsync({ supplier, branch_id: branchId ? Number(branchId) : null, items })
    toast.success('Purchase order created')
    setSupplier(''); setBranchId(''); setLines([{ product_id: '', product_name: '', qty: '', unit_cost: '', unit_id: '', unit_name: '', conversion_factor: '1', expiry_date: '' }])
    onClose()
  }

  return (
    <>
      <QuickCreateSupplierModal
        open={quickCreateSupplierOpen}
        onClose={() => setQuickCreateSupplierOpen(false)}
        onCreated={(s) => { setSupplier(s.name); setQuickCreateSupplierOpen(false) }}
      />
      <QuickCreateProductModal
        open={quickCreateLineIdx !== null}
        onClose={() => setQuickCreateLineIdx(null)}
        onCreated={handleQuickCreated}
      />
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-gray-500">Supplier *</Label>
              <SupplierCombobox
                value={supplier}
                onChange={setSupplier}
                suppliers={suppliers}
                onCreateNew={() => setQuickCreateSupplierOpen(true)}
              />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-gray-500">Deliver to Branch</Label>
              <Select value={branchId} onValueChange={(v) => setBranchId(v ?? '')}>
                <SelectTrigger>
                  <span className={branchId ? undefined : 'text-muted-foreground'}>
                    {branchId ? (branches.find((b) => String(b.id) === branchId)?.name ?? branchId) : '— Any branch —'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Any branch —</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mb-1 flex justify-between items-center">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order Lines</Label>
            <button onClick={() => setLines((l) => [...l, { product_id: '', product_name: '', qty: '', unit_cost: '', unit_id: '', unit_name: '', conversion_factor: '1', expiry_date: '' }])}
              className="text-xs text-gray-900 font-semibold flex items-center gap-1 hover:opacity-70">
              <Plus size={12} />Add line
            </button>
          </div>
          <div className="rounded-lg border overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Product</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500 w-24">Unit</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-14">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">Unit Cost</th>
                  <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 w-28">Expiry</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-18">Total</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const lineProduct = products.find((p) => String(p.id) === line.product_id)
                  const hasUnits = (lineProduct?.units?.length ?? 0) > 0
                  return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-2 py-1.5">
                      <Select value={line.product_id ?? ''} onValueChange={(v) => v != null && handleProductChange(i, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <span className={line.product_id ? undefined : 'text-muted-foreground'}>
                            {line.product_id ? (lineProduct?.name ?? line.product_name) : 'Select product'}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="min-w-[260px]">
                          <SelectItem value="__create__" className="text-amber-600 font-medium">
                            <span className="flex items-center gap-1.5"><Plus size={12} />Create new product…</span>
                          </SelectItem>
                          {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5">
                      {hasUnits ? (
                        <Select value={line.unit_id != null ? String(line.unit_id) : 'base'} onValueChange={(v) => handleUnitChange(i, v === 'base' ? '' : (v ?? ''))}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="base">{lineProduct?.unit ?? 'Base'}</SelectItem>
                            {lineProduct?.units.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}{u.conversion_factor !== 1 ? ` ×${u.conversion_factor}` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-gray-400 px-1">{lineProduct?.unit ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5"><Input type="number" value={line.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} className="h-8 text-xs text-right" placeholder="0" /></td>
                    <td className="px-2 py-1.5"><Input type="number" value={line.unit_cost} onChange={(e) => setLine(i, 'unit_cost', e.target.value)} className="h-8 text-xs text-right" placeholder="0.00" /></td>
                    <td className="px-2 py-1.5"><Input type="date" value={line.expiry_date} onChange={(e) => setLine(i, 'expiry_date', e.target.value)} className="h-8 text-xs" /></td>
                    <td className="px-3 py-1.5 text-right text-xs font-semibold">{fmtKES((parseFloat(line.qty) || 0) * (parseFloat(line.unit_cost) || 0))}</td>
                    <td className="px-1 py-1.5 text-center">
                      {lines.length > 1 && <button onClick={() => setLines((l) => l.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 p-0.5"><XCircle size={13} /></button>}
                    </td>
                  </tr>
                )})}

              </tbody>
            </table>
          </div>
          <div className="flex justify-between font-bold text-sm bg-gray-50 rounded-md px-3.5 py-2.5 mb-4">
            <span>Order Total</span><span>{fmtKES(total)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!supplier || createPO.isPending || lines.every((l) => !l.qty)} onClick={handleCreate}>
              {createPO.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
              <Truck size={13} className="mr-1.5" />Create PO
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

const PO_STATUSES = [
  { value: 'pending',   label: 'Pending' },
  { value: 'transit',   label: 'In Transit' },
  { value: 'received',  label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PO_STATUS_HOVER: Record<string, string> = {
  pending:   'hover:bg-amber-100',
  transit:   'hover:bg-blue-100',
  received:  'hover:bg-emerald-100',
  cancelled: 'hover:bg-gray-200',
}

function POStatusSelect({ po, updateStatus }: { po: ApiPurchaseOrder; updateStatus: ReturnType<typeof useUpdatePOStatus> }) {
  const { label, cls } = PO_STATUS_MAP[po.status] ?? { label: po.status, cls: 'bg-gray-100 text-gray-700' }
  const hover = PO_STATUS_HOVER[po.status] ?? ''
  const style = `${cls} ${hover}`
  return (
    <Select
      value={po.status}
      onValueChange={(v) => {
        if (v && v !== po.status)
          updateStatus.mutate({ id: po.id, status: v }, { onSuccess: () => toast.success('Status updated') })
      }}
    >
      <SelectTrigger className={`h-6 w-auto rounded-full px-2.5 border-0 shadow-none text-xs font-medium gap-1 transition-colors [&_svg]:size-3 ${style}`}>
        <span>{label}</span>
      </SelectTrigger>
      <SelectContent>
        {PO_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function PODetailSheet({ po, onClose }: { po: ApiPurchaseOrder | null; onClose: () => void }) {
  const updateStatus = useUpdatePOStatus()
  const deletePO = useDeletePurchaseOrder()

  if (!po) return null

  const handleDelete = () => {
    if (!window.confirm(`Delete ${po.po_number}? This cannot be undone.`)) return
    deletePO.mutate(po.id, { onSuccess: () => { toast.success('Purchase order deleted'); onClose() } })
  }

  return (
    <Sheet open={!!po} onOpenChange={(v) => !v && onClose()}>
      <SheetContent showCloseButton={false} className="sm:max-w-[520px] overflow-y-auto p-0 flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <SheetTitle className="font-mono text-base font-bold text-gray-900 mb-2">{po.po_number}</SheetTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Status</span>
              <POStatusSelect po={po} updateStatus={updateStatus} />
              {updateStatus.isPending && <Loader2 size={12} className="animate-spin text-gray-400" />}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors mt-0.5">
            <X size={16} />
          </button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-4 border-b border-gray-100">
          <div>
            <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Supplier</div>
            <div className="font-semibold text-sm text-gray-900">{po.supplier}</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Branch</div>
            <div className="font-semibold text-sm text-gray-900">{po.branch_name ?? '—'}</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Date</div>
            <div className="font-semibold text-sm text-gray-900">{new Date(po.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-1">Order Total</div>
            <div className="font-bold text-sm text-gray-900">{fmtKES(po.total)}</div>
          </div>
        </div>

        {/* Order lines */}
        <div className="px-6 py-4 flex-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Order Lines</div>
          <div className="rounded-lg border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Product</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-14">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">Unit Cost</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 w-28">Expiry</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 font-medium text-gray-900">{item.product_name}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{fmtKES(item.unit_cost)}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500">
                      {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">{fmtKES(item.quantity * item.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-between font-bold text-sm bg-gray-50 rounded-lg px-4 py-3">
            <span>Total</span><span>{fmtKES(po.total)}</span>
          </div>
        </div>

        {/* Footer */}
        {po.status !== 'received' && (
          <div className="px-6 pb-6 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={handleDelete}
              disabled={deletePO.isPending}
            >
              {deletePO.isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Trash2 size={13} className="mr-1.5" />}
              Delete PO
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PurchaseOrdersTab({ products, branches }: { products: ApiProduct[]; branches: { id: number; name: string }[] }) {
  const [newOpen, setNewOpen] = useState(false)
  const [detailPO, setDetailPO] = useState<ApiPurchaseOrder | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: orders = [], isLoading } = usePurchaseOrders()
  const updateStatus = useUpdatePOStatus()
  const deletePO = useDeletePurchaseOrder()

  const filtered = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)

  const exportCSV = () => downloadCSV(
    `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`,
    ['PO Number', 'Supplier', 'Branch', 'Items', 'Total', 'Status', 'Date'],
    filtered.map((o) => [o.po_number, o.supplier, o.branch_name ?? '', o.items.length, o.total, o.status, new Date(o.created_at).toLocaleDateString('en-KE')])
  )

  return (
    <>
      <div className="flex items-center gap-2.5 mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? '')}>
          <SelectTrigger className="w-36">
            <span>{statusFilter === 'all' ? 'All statuses' : (PO_STATUSES.find((s) => s.value === statusFilter)?.label ?? statusFilter)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PO_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download size={13} className="mr-1.5" />CSV</Button>
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus size={13} className="mr-1.5" />New PO</Button>
        </div>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead>PO Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell></TableRow>)
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <Truck size={36} className="mx-auto mb-2.5 text-gray-200" />
                  <div className="text-sm text-gray-400">No purchase orders yet</div>
                  <Button size="sm" className="mt-4" onClick={() => setNewOpen(true)}><Plus size={13} className="mr-1.5" />Create your first PO</Button>
                </TableCell>
              </TableRow>
            ) : filtered.map((po) => (
              <TableRow key={po.id}>
                <TableCell>
                  <button onClick={() => setDetailPO(po)} className="font-mono font-bold text-gray-900 hover:text-amber-600 text-sm transition-colors">{po.po_number}</button>
                </TableCell>
                <TableCell className="font-medium text-sm">{po.supplier}</TableCell>
                <TableCell className="text-sm text-gray-500">{po.branch_name ?? '—'}</TableCell>
                <TableCell className="text-right text-sm">{po.items.length}</TableCell>
                <TableCell className="text-right font-semibold text-sm">{fmtKES(po.total)}</TableCell>
                <TableCell><POStatusSelect po={po} updateStatus={updateStatus} /></TableCell>
                <TableCell className="text-sm text-gray-500">{new Date(po.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</TableCell>
                <TableCell>
                  {po.status !== 'received' && (
                    <button
                      onClick={() => deletePO.mutate(po.id, { onSuccess: () => toast.success('Purchase order deleted') })}
                      className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <NewPOModal open={newOpen} onClose={() => setNewOpen(false)} products={products} branches={branches} />
      <PODetailSheet po={detailPO} onClose={() => setDetailPO(null)} />
    </>
  )
}

// ── Transfers Tab ─────────────────────────────────────────────────────────

function NewTransferModal({ open, onClose, products, branches }: {
  open: boolean; onClose: () => void
  products: ApiProduct[]; branches: { id: number; name: string }[]
}) {
  const [fromBranch, setFromBranch] = useState('')
  const [toBranch, setToBranch] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const transfer = useInitiateTransfer()

  const selectedProduct = products.find((p) => p.id === Number(productId))
  // Stock actually held at the chosen source branch (not the all-branch total)
  const { data: sourceLocations = [] } = useProductInventory(Number(productId) || 0)
  const sourceQty = fromBranch
    ? (sourceLocations.find((l: ApiInventoryItem) => String(l.branch_id) === fromBranch)?.quantity ?? 0)
    : (selectedProduct?.stock_quantity ?? 0)
  const canTransfer = fromBranch && toBranch && fromBranch !== toBranch && productId
    && parseInt(qty) > 0 && parseInt(qty) <= sourceQty

  const handleTransfer = async () => {
    setError('')
    try {
      await transfer.mutateAsync({ from_branch_id: Number(fromBranch), to_branch_id: Number(toBranch), product_id: Number(productId), quantity: parseInt(qty), notes: notes || undefined })
      setDone(true)
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err instanceof Error ? err.message : 'Could not initiate transfer. Please try again.')
      )
    }
  }
  const reset = () => { setFromBranch(''); setToBranch(''); setProductId(''); setQty(''); setNotes(''); setDone(false); setError(''); onClose() }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && reset()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader><DialogTitle>Transfer Stock</DialogTitle></DialogHeader>
        {done ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3.5"><CheckCircle2 size={26} className="text-green-600" /></div>
            <div className="font-bold text-base mb-1.5">Transfer Initiated</div>
            <div className="text-sm text-gray-500 mb-5">{qty} × {selectedProduct?.name} deducted from source. Confirm receipt on the Transfers tab.</div>
            <Button className="w-full" onClick={reset}>Done</Button>
          </div>
        ) : (
          <div className="space-y-3.5 mt-1">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
              <div>
                <Label className="mb-1.5 block text-xs text-gray-500">From Branch</Label>
                <Select value={fromBranch} onValueChange={(v) => setFromBranch(v ?? '')}>
                  <SelectTrigger>
                    <span className={fromBranch ? undefined : 'text-muted-foreground'}>
                      {fromBranch ? (branches.find((b) => String(b.id) === fromBranch)?.name ?? fromBranch) : 'Select'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <ArrowLeftRight size={18} className="text-gray-400 mb-2.5 flex-shrink-0" />
              <div>
                <Label className="mb-1.5 block text-xs text-gray-500">To Branch</Label>
                <Select value={toBranch} onValueChange={(v) => setToBranch(v ?? '')}>
                  <SelectTrigger>
                    <span className={toBranch ? undefined : 'text-muted-foreground'}>
                      {toBranch ? (branches.find((b) => String(b.id) === toBranch)?.name ?? toBranch) : 'Select'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>{branches.filter((b) => String(b.id) !== fromBranch).map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Product</Label>
              <Select value={productId} onValueChange={(v) => setProductId(v ?? '')}>
                <SelectTrigger>
                  <span className={productId ? undefined : 'text-muted-foreground'}>
                    {productId ? (selectedProduct?.name ?? 'Select product') : 'Select product'}
                  </span>
                </SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name} ({p.stock_quantity} {p.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Quantity</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" min={1} max={sourceQty} />
              {selectedProduct && (
                <p className={`text-xs mt-1 ${fromBranch && sourceQty === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {fromBranch
                    ? `Available at source: ${sourceQty} ${selectedProduct.unit}`
                    : `Select a source branch — total ${selectedProduct.stock_quantity} ${selectedProduct.unit} across branches`}
                </p>
              )}
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for transfer (optional)" />
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={reset}>Cancel</Button>
              <Button className="flex-1" disabled={!canTransfer || transfer.isPending} onClick={handleTransfer}>
                {transfer.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                <ArrowLeftRight size={13} className="mr-1.5" />Transfer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const TRANSFER_STATUS_META: Record<TransferStatus, { label: string; textCls: string; bgCls: string; dotCls: string }> = {
  initiated: { label: 'Initiated', textCls: 'text-gray-700', bgCls: 'bg-gray-100', dotCls: 'bg-gray-400' },
  in_transit: { label: 'In Transit', textCls: 'text-amber-700', bgCls: 'bg-amber-100', dotCls: 'bg-amber-400' },
  confirmed: { label: 'Confirmed', textCls: 'text-green-700', bgCls: 'bg-green-100', dotCls: 'bg-green-500' },
  cancelled: { label: 'Cancelled', textCls: 'text-gray-500', bgCls: 'bg-gray-100', dotCls: 'bg-gray-400' },
}

function TransferStatusPill({ status }: { status: TransferStatus }) {
  const m = TRANSFER_STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.bgCls} ${m.textCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dotCls}`} />
      {m.label}
    </span>
  )
}

function TransfersTab({ products, branches }: { products: ApiProduct[]; branches: { id: number; name: string }[] }) {
  const [newOpen, setNewOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const { data: transfers = [], isLoading } = useStockTransfers(statusFilter !== 'all' ? statusFilter : undefined)
  const transferAction = useTransferAction()

  const exportCSV = () => downloadCSV(
    `transfers-${new Date().toISOString().slice(0, 10)}.csv`,
    ['#', 'Product', 'From', 'To', 'Qty', 'Status', 'Initiated By', 'Date'],
    transfers.map((t) => [t.transfer_number, t.product_name ?? '', t.from_branch_name ?? '', t.to_branch_name ?? '', t.quantity, t.status, t.initiator_name ?? '', new Date(t.created_at).toLocaleDateString('en-KE')])
  )

  const act = (id: number, action: 'mark-transit' | 'confirm' | 'cancel') =>
    transferAction.mutate({ id, action }, {
      onSuccess: () => toast.success(action === 'confirm' ? 'Transfer confirmed' : action === 'cancel' ? 'Transfer cancelled' : 'Marked in transit'),
    })

  return (
    <>
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <div className="flex gap-1.5">
          {(['all', 'initiated', 'in_transit', 'confirmed', 'cancelled'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${statusFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s === 'all' ? 'All' : s === 'in_transit' ? 'In Transit' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={transfers.length === 0}><Download size={13} className="mr-1.5" />CSV</Button>
          <Button size="sm" onClick={() => setNewOpen(true)}><ArrowLeftRight size={13} className="mr-1.5" />New Transfer</Button>
        </div>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead>Ref</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>From → To</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Initiated By</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell></TableRow>)
            ) : transfers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16">
                  <ArrowLeftRight size={36} className="mx-auto mb-2.5 text-gray-200" />
                  <div className="text-sm text-gray-400">No transfers yet</div>
                  <Button size="sm" className="mt-4" onClick={() => setNewOpen(true)}><Plus size={13} className="mr-1.5" />Initiate Transfer</Button>
                </TableCell>
              </TableRow>
            ) : transfers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-xs text-gray-500">{t.transfer_number}</TableCell>
                <TableCell className="font-medium text-sm">{t.product_name ?? '—'}</TableCell>
                <TableCell className="text-sm text-gray-600">{t.from_branch_name ?? '—'} → {t.to_branch_name ?? '—'}</TableCell>
                <TableCell className="text-right font-bold text-sm">{t.quantity}</TableCell>
                <TableCell><TransferStatusPill status={t.status} /></TableCell>
                <TableCell className="text-sm text-gray-500">{t.initiator_name ?? '—'}</TableCell>
                <TableCell className="text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {t.status === 'initiated' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => act(t.id, 'mark-transit')} disabled={transferAction.isPending}>In Transit</Button>
                    )}
                    {(t.status === 'initiated' || t.status === 'in_transit') && (
                      <>
                        <Button size="sm" className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700" onClick={() => act(t.id, 'confirm')} disabled={transferAction.isPending}>Confirm</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-red-600 hover:text-red-700 border-red-200" onClick={() => act(t.id, 'cancel')} disabled={transferAction.isPending}>Cancel</Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <NewTransferModal open={newOpen} onClose={() => setNewOpen(false)} products={products} branches={branches} />
    </>
  )
}

// ── Suppliers Tab ─────────────────────────────────────────────────────────

function buildSupplierReportHtml(supplier: ApiSupplier, orders: ApiPurchaseOrder[]): string {
  const totalSpend = orders.reduce((s, o) => s + o.total, 0)
  const received = orders.filter((o) => o.status === 'received')
  const avgOrder = orders.length > 0 ? totalSpend / orders.length : 0
  const date = new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
  const rows = orders.map((o) => `
    <tr>
      <td class="mono">${o.po_number}</td>
      <td>${new Date(o.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      <td>${o.branch_name ?? '—'}</td>
      <td style="text-align:center">${o.items.length}</td>
      <td><span class="badge ${o.status}">${PO_STATUS_MAP[o.status]?.label ?? o.status}</span></td>
      <td class="amount">${fmtKES(o.total)}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Supplier Report — ${supplier.name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;color:#111;padding:40px;font-size:13px}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
.title{font-size:20px;font-weight:700}.sub{font-size:12px;color:#6b7280;margin-top:4px}
.card{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:24px}
.supplier-name{font-size:17px;font-weight:700;margin-bottom:10px}
.meta{display:flex;flex-wrap:wrap;gap:20px}
.meta-item label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:2px}
.meta-item span{font-weight:500}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px}
.stat{border:1px solid #e5e7eb;border-radius:8px;padding:14px;text-align:center}
.stat .val{font-size:18px;font-weight:700}.stat .lbl{font-size:10px;color:#6b7280;margin-top:3px}
h2{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:9px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
td{padding:9px 12px;border-bottom:1px solid #f3f4f6}tr:last-child td{border-bottom:none}
.amount{text-align:right;font-weight:600}th:last-child{text-align:right}
.mono{font-family:monospace;font-size:12px}.badge{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
.badge.received{background:#d1fae5;color:#065f46}.badge.pending{background:#fef3c7;color:#92400e}
.badge.transit{background:#dbeafe;color:#1e40af}.badge.cancelled{background:#f3f4f6;color:#6b7280}
tfoot td{font-weight:700;background:#f9fafb;border-top:2px solid #e5e7eb}
@media print{body{padding:20px}}
</style></head><body>
<div class="header"><div><div class="title">Supplier Report</div><div class="sub">Generated ${date}</div></div></div>
<div class="card">
  <div class="supplier-name">${supplier.name}</div>
  <div class="meta">
    ${supplier.contact_name ? `<div class="meta-item"><label>Contact</label><span>${supplier.contact_name}</span></div>` : ''}
    ${supplier.phone ? `<div class="meta-item"><label>Phone</label><span>${supplier.phone}</span></div>` : ''}
    ${supplier.email ? `<div class="meta-item"><label>Email</label><span>${supplier.email}</span></div>` : ''}
    ${supplier.address ? `<div class="meta-item"><label>Address</label><span>${supplier.address}</span></div>` : ''}
  </div>
</div>
<div class="stats">
  <div class="stat"><div class="val">${orders.length}</div><div class="lbl">Total Orders</div></div>
  <div class="stat"><div class="val">${received.length}</div><div class="lbl">Completed</div></div>
  <div class="stat"><div class="val">${fmtKES(totalSpend)}</div><div class="lbl">Total Spend</div></div>
  <div class="stat"><div class="val">${orders.length > 0 ? fmtKES(avgOrder) : '—'}</div><div class="lbl">Avg Order Value</div></div>
</div>
<h2>Purchase History</h2>
<table>
  <thead><tr><th>PO Number</th><th>Date</th><th>Branch</th><th style="text-align:center">Items</th><th>Status</th><th style="text-align:right">Total</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px">No purchase orders yet</td></tr>'}</tbody>
  ${orders.length > 0 ? `<tfoot><tr><td colspan="5">Total</td><td class="amount">${fmtKES(totalSpend)}</td></tr></tfoot>` : ''}
</table>
<script>window.onload=()=>window.print()</script>
</body></html>`
}

function SupplierReportSheet({ supplier, orders, onClose }: {
  supplier: ApiSupplier | null; orders: ApiPurchaseOrder[]; onClose: () => void
}) {
  const supplierOrders = useMemo(() =>
    [...orders.filter((o) => o.supplier === supplier?.name)]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [orders, supplier?.name]
  )
  const totalSpend = supplierOrders.reduce((s, o) => s + o.total, 0)
  const received = supplierOrders.filter((o) => o.status === 'received')

  if (!supplier) return null

  return (
    <Sheet open={!!supplier} onOpenChange={(v) => !v && onClose()}>
      <SheetContent showCloseButton={false} className="sm:max-w-[540px] overflow-y-auto p-0 flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <SheetTitle className="text-base font-bold text-gray-900">{supplier.name}</SheetTitle>
            <p className="text-xs text-gray-400 mt-0.5">Supplier Report</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void openPrintHtml(buildSupplierReportHtml(supplier, supplierOrders))}>
              <Download size={13} className="mr-1.5" />Export PDF
            </Button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Contact info */}
        {(supplier.contact_name || supplier.phone || supplier.email || supplier.address) && (
          <div className="px-6 py-4 border-b border-gray-100 grid grid-cols-2 gap-x-6 gap-y-3">
            {supplier.contact_name && <div><div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Contact</div><div className="text-sm font-medium">{supplier.contact_name}</div></div>}
            {supplier.phone && <div><div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Phone</div><div className="text-sm font-medium">{supplier.phone}</div></div>}
            {supplier.email && <div><div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Email</div><div className="text-sm font-medium">{supplier.email}</div></div>}
            {supplier.address && <div><div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Address</div><div className="text-sm font-medium">{supplier.address}</div></div>}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'Total Orders', value: String(supplierOrders.length) },
            { label: 'Completed', value: String(received.length) },
            { label: 'Total Spend', value: fmtKES(totalSpend) },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-4 text-center">
              <div className="text-lg font-bold text-gray-900">{value}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* PO history */}
        <div className="px-6 py-4 flex-1">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Purchase History</div>
          {supplierOrders.length === 0 ? (
            <div className="text-center py-12">
              <Truck size={32} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">No purchase orders yet</p>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">PO Number</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Date</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierOrders.map((o) => (
                    <tr key={o.id} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-gray-700">{o.po_number}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{new Date(o.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-3 py-2.5 text-center"><POStatusBadge status={o.status} /></td>
                      <td className="px-3 py-2.5 text-right font-semibold">{fmtKES(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-bold text-gray-700">Total</td>
                    <td className="px-3 py-2.5 text-right font-bold">{fmtKES(totalSpend)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SuppliersTab() {
  const [addOpen, setAddOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<ApiSupplier | null>(null)
  const [reportSupplier, setReportSupplier] = useState<ApiSupplier | null>(null)
  const [form, setForm] = useState({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' })
  const { data: suppliers = [], isLoading } = useSuppliers()
  const { data: orders = [] } = usePurchaseOrders()
  const createSupplier = useCreateSupplier()
  const updateSupplier = useUpdateSupplier()
  const deleteSupplier = useDeleteSupplier()

  const openAdd = () => { setForm({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' }); setEditSupplier(null); setAddOpen(true) }
  const openEdit = (s: ApiSupplier) => { setForm({ name: s.name, contact_name: s.contact_name ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', notes: s.notes ?? '' }); setEditSupplier(s); setAddOpen(true) }
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const data = { name: form.name.trim(), contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null }
    if (editSupplier) { await updateSupplier.mutateAsync({ id: editSupplier.id, data }); toast.success('Supplier updated') }
    else { await createSupplier.mutateAsync(data); toast.success('Supplier created') }
    setAddOpen(false)
  }

  const exportCSV = () => downloadCSV(
    `suppliers-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Name', 'Contact', 'Phone', 'Email', 'Address', 'Total Orders', 'Total Spend'],
    suppliers.map((s) => {
      const pos = orders.filter((o) => o.supplier === s.name)
      return [s.name, s.contact_name ?? '', s.phone ?? '', s.email ?? '', s.address ?? '', pos.length, pos.reduce((acc, o) => acc + o.total, 0)]
    })
  )

  const isPending = createSupplier.isPending || updateSupplier.isPending

  return (
    <>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="ml-auto flex gap-1.5">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={suppliers.length === 0}><Download size={13} className="mr-1.5" />CSV</Button>
          <Button size="sm" onClick={openAdd}><Plus size={13} className="mr-1.5" />Add Supplier</Button>
        </div>
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 hover:bg-gray-50">
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Total Spend</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><div className="h-4 bg-gray-100 rounded animate-pulse" /></TableCell></TableRow>)
            ) : suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16">
                  <Truck size={36} className="mx-auto mb-2.5 text-gray-200" />
                  <div className="text-sm text-gray-400">No suppliers yet</div>
                  <Button size="sm" className="mt-4" onClick={openAdd}><Plus size={13} className="mr-1.5" />Add Supplier</Button>
                </TableCell>
              </TableRow>
            ) : suppliers.map((s) => {
              const pos = orders.filter((o) => o.supplier === s.name)
              const totalSpend = pos.reduce((acc, o) => acc + o.total, 0)
              return (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => setReportSupplier(s)}>
                  <TableCell className="font-semibold text-sm text-gray-900">{s.name}</TableCell>
                  <TableCell className="text-sm text-gray-600">{s.contact_name ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{s.phone ?? '—'}</TableCell>
                  <TableCell className="text-sm text-gray-600">{s.email ?? '—'}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{pos.length}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{pos.length > 0 ? fmtKES(totalSpend) : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => openEdit(s)}><Pencil size={12} /></Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600 hover:text-red-700 border-red-200" onClick={() => { if (window.confirm(`Delete ${s.name}?`)) deleteSupplier.mutate(s.id, { onSuccess: () => toast.success('Supplier deleted') }) }}><Trash2 size={12} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <SupplierReportSheet supplier={reportSupplier} orders={orders} onClose={() => setReportSupplier(null)} />

      <Dialog open={addOpen} onOpenChange={(v) => !v && setAddOpen(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader><DialogTitle>{editSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-gray-500">Supplier Name *</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Kenya Breweries Ltd" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Contact Person</Label>
              <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="John Doe" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Phone</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254 7xx xxx xxx" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Email</Label>
              <Input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="supplier@email.com" type="email" />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs text-gray-500">Address</Label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="City, Country" />
            </div>
            <div className="col-span-2">
              <Label className="mb-1.5 block text-xs text-gray-500">Notes</Label>
              <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Payment terms, lead times…" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)} disabled={isPending}>Cancel</Button>
            <Button className="flex-1" onClick={handleSave} disabled={isPending || !form.name.trim()}>
              {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {editSupplier ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Reports Tab ───────────────────────────────────────────────────────────

const URGENCY_META: Record<ReorderUrgency, { label: string; textCls: string; bgCls: string; dotCls: string }> = {
  critical: { label: 'Critical', textCls: 'text-red-700', bgCls: 'bg-red-100', dotCls: 'bg-red-500' },
  warning:  { label: 'Warning',  textCls: 'text-orange-700', bgCls: 'bg-orange-100', dotCls: 'bg-orange-500' },
  watch:    { label: 'Watch',    textCls: 'text-amber-700', bgCls: 'bg-amber-100', dotCls: 'bg-amber-400' },
  no_sales: { label: 'No Sales', textCls: 'text-gray-600', bgCls: 'bg-gray-100', dotCls: 'bg-gray-400' },
  ok:       { label: 'OK',       textCls: 'text-green-700', bgCls: 'bg-green-100', dotCls: 'bg-green-500' },
}

const AGING_META: Record<AgingBucket, { label: string; textCls: string; bgCls: string }> = {
  fresh:      { label: 'Fresh',      textCls: 'text-green-700',  bgCls: 'bg-green-100' },
  slow:       { label: 'Slow',       textCls: 'text-amber-700',  bgCls: 'bg-amber-100' },
  stale:      { label: 'Stale',      textCls: 'text-orange-700', bgCls: 'bg-orange-100' },
  dead:       { label: 'Dead Stock', textCls: 'text-red-700',    bgCls: 'bg-red-100' },
  never_sold: { label: 'Never Sold', textCls: 'text-gray-600',   bgCls: 'bg-gray-100' },
}

function ReportsTab({ products, branchId, isMultiBranch }: { products: ApiProduct[]; branchId?: number; isMultiBranch: boolean }) {
  const { settings } = useSettingsStore()
  const bizName = settings.businessName || 'My Business'
  const [velocityDays, setVelocityDays] = useState(30)
  const [barcodeOpen, setBarcodeOpen] = useState(false)

  const { data: reorderData = [], isLoading: reorderLoading } = useReorderSuggestions(velocityDays, branchId)
  const { data: agingData = [], isLoading: agingLoading } = useInventoryAging(branchId)

  const lowStock = useMemo(() =>
    products.filter((p) => p.is_active && p.stock_quantity <= p.min_stock)
      .sort((a, b) => a.stock_quantity - b.stock_quantity),
    [products]
  )
  const expiring = useMemo(() =>
    products.filter((p) => { const d = daysUntil(p.expiry_date); return d !== null && d <= 30 })
      .sort((a, b) => daysUntil(a.expiry_date)! - daysUntil(b.expiry_date)!),
    [products]
  )

  const exportReorderCSV = () => downloadCSV(`reorder-suggestions-${new Date().toISOString().slice(0, 10)}.csv`,
    isMultiBranch
      ? ['Product', 'SKU', 'Branch', 'Unit', 'Current Stock', 'Min Stock', 'Avg Daily Sales', 'Days Remaining', 'Suggested Reorder Qty', 'Urgency']
      : ['Product', 'SKU', 'Unit', 'Current Stock', 'Min Stock', 'Avg Daily Sales', 'Days Remaining', 'Suggested Reorder Qty', 'Urgency'],
    reorderData.map((r) => isMultiBranch
      ? [r.product_name, r.sku ?? '', r.branch_name ?? '—', r.unit, r.current_stock, r.min_stock, r.avg_daily_sales, r.days_remaining ?? 'N/A', r.suggested_reorder_qty, r.urgency]
      : [r.product_name, r.sku ?? '', r.unit, r.current_stock, r.min_stock, r.avg_daily_sales, r.days_remaining ?? 'N/A', r.suggested_reorder_qty, r.urgency]))

  const exportAgingCSV = () => downloadCSV(`inventory-aging-${new Date().toISOString().slice(0, 10)}.csv`,
    isMultiBranch
      ? ['Product', 'SKU', 'Branch', 'Category', 'Unit', 'Stock', 'Cost Value (KES)', 'Last Sale (days ago)', 'Bucket']
      : ['Product', 'SKU', 'Category', 'Unit', 'Stock', 'Cost Value (KES)', 'Last Sale (days ago)', 'Bucket'],
    agingData.map((a) => isMultiBranch
      ? [a.product_name, a.sku ?? '', a.branch_name ?? '—', a.category_name ?? '', a.unit, a.current_stock, a.cost_value, a.last_sale_days_ago ?? 'Never', a.aging_bucket]
      : [a.product_name, a.sku ?? '', a.category_name ?? '', a.unit, a.current_stock, a.cost_value, a.last_sale_days_ago ?? 'Never', a.aging_bucket]))

  const exportLowStockCSV = () => downloadCSV(`low-stock-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Product', 'SKU', 'Category', 'Current Stock', 'Min Stock', 'Deficit', 'Unit'],
    lowStock.map((p) => [p.name, p.sku ?? '', p.category_name ?? '', p.stock_quantity, p.min_stock, Math.max(0, p.min_stock - p.stock_quantity), p.unit]))

  const printLowStock = () => openPrintWindow(`Low Stock Report — ${bizName}`,
    ['Product', 'SKU', 'Category', 'Current', 'Min', 'Deficit', 'Status'],
    lowStock.map((p) => [p.name, p.sku ?? '—', p.category_name ?? '—', `${p.stock_quantity} ${p.unit}`, `${p.min_stock} ${p.unit}`, `${Math.max(0, p.min_stock - p.stock_quantity)} ${p.unit}`, getStockStatus(p.stock_quantity, p.min_stock).label]),
    `${lowStock.length} items need attention`)

  const exportExpiryCSV = () => downloadCSV(`expiry-alerts-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Product', 'SKU', 'Category', 'Stock', 'Expiry Date', 'Days Left'],
    expiring.map((p) => [p.name, p.sku ?? '', p.category_name ?? '', p.stock_quantity, p.expiry_date ?? '', daysUntil(p.expiry_date) ?? '']))

  const printExpiry = () => openPrintWindow(`Expiry Alert Report — ${bizName}`,
    ['Product', 'SKU', 'Category', 'Stock', 'Expiry Date', 'Days Left'],
    expiring.map((p) => [p.name, p.sku ?? '—', p.category_name ?? '—', `${p.stock_quantity} ${p.unit}`, p.expiry_date ?? '—', daysUntil(p.expiry_date) ?? '—']),
    `${expiring.length} items expiring within 30 days`)

  // Totals for aging cost summary
  const agingTotals = useMemo(() => {
    const t: Record<AgingBucket, number> = { fresh: 0, slow: 0, stale: 0, dead: 0, never_sold: 0 }
    agingData.forEach((a) => { t[a.aging_bucket] = (t[a.aging_bucket] ?? 0) + a.cost_value })
    return t
  }, [agingData])

  return (
    <div className="space-y-8">

      {/* Barcode print shortcut */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-gray-900">Barcode Labels</h3>
          <p className="text-xs text-gray-400 mt-0.5">Print labels for products with barcodes or SKUs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setBarcodeOpen(true)}>
          <Barcode size={13} className="mr-1.5" />Print Labels
        </Button>
      </div>
      <Separator />

      {/* Reorder Suggestions */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-sm text-gray-900">Reorder Suggestions</h3>
            <p className="text-xs text-gray-400 mt-0.5">Based on sales velocity — products to reorder now</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(velocityDays)} onValueChange={(v) => setVelocityDays(Number(v))}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7-day window</SelectItem>
                <SelectItem value="14">14-day window</SelectItem>
                <SelectItem value="30">30-day window</SelectItem>
                <SelectItem value="60">60-day window</SelectItem>
                <SelectItem value="90">90-day window</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportReorderCSV} disabled={reorderData.length === 0}><Download size={13} className="mr-1.5" />CSV</Button>
          </div>
        </div>
        {reorderLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : reorderData.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl py-10 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-green-400" />
            <div className="text-sm font-medium text-gray-500">All products have sufficient stock</div>
          </div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead>Product</TableHead>
                  {isMultiBranch && <TableHead>Branch</TableHead>}
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Daily Sales</TableHead>
                  <TableHead className="text-right">Days Left</TableHead>
                  <TableHead className="text-right">Suggest Reorder</TableHead>
                  <TableHead>Urgency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reorderData.map((r) => {
                  const m = URGENCY_META[r.urgency]
                  return (
                    <TableRow key={`${r.product_id}-${r.branch_id ?? 'org'}`}>
                      <TableCell>
                        <div className="font-semibold text-sm">{r.product_name}</div>
                        <div className="text-[11px] text-gray-400">{r.sku ?? '—'}</div>
                      </TableCell>
                      {isMultiBranch && (
                        <TableCell className="text-xs text-gray-500">{r.branch_name ?? '—'}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <span className="font-bold text-sm">{r.current_stock}</span>
                        <span className="text-[11px] text-gray-400 ml-1">{r.unit}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">
                        {r.avg_daily_sales > 0 ? `${r.avg_daily_sales}/day` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.days_remaining !== null
                          ? <span className={`text-sm font-bold ${r.days_remaining <= 3 ? 'text-red-600' : r.days_remaining <= 7 ? 'text-orange-600' : 'text-amber-600'}`}>{r.days_remaining}d</span>
                          : <span className="text-sm text-gray-400">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.suggested_reorder_qty > 0
                          ? <span className="font-bold text-sm text-amber-700">{r.suggested_reorder_qty} {r.unit}</span>
                          : <span className="text-sm text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.bgCls} ${m.textCls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dotCls}`} />
                          {m.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Separator />

      {/* Inventory Aging */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm text-gray-900">Inventory Aging</h3>
            <p className="text-xs text-gray-400 mt-0.5">Slow-moving and dead stock analysis by last sale date</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportAgingCSV} disabled={agingData.length === 0}><Download size={13} className="mr-1.5" />CSV</Button>
        </div>
        {/* Cost summary pills */}
        {agingData.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {(Object.entries(agingTotals) as [AgingBucket, number][]).filter(([, v]) => v > 0).map(([bucket, val]) => {
              const m = AGING_META[bucket]
              return (
                <div key={bucket} className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${m.bgCls} ${m.textCls}`}>
                  {m.label}: {fmtKES(val)}
                </div>
              )
            })}
          </div>
        )}
        {agingLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : agingData.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl py-10 text-center">
            <ShoppingCart size={32} className="mx-auto mb-2 text-green-400" />
            <div className="text-sm font-medium text-gray-500">All stocked items have recent sales</div>
          </div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead>Product</TableHead>
                  {isMultiBranch && <TableHead>Branch</TableHead>}
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Cost Value</TableHead>
                  <TableHead>Last Sale</TableHead>
                  <TableHead>Bucket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agingData.map((a) => {
                  const m = AGING_META[a.aging_bucket]
                  return (
                    <TableRow key={`${a.product_id}-${a.branch_id ?? 'org'}`}>
                      <TableCell>
                        <div className="font-semibold text-sm">{a.product_name}</div>
                        <div className="text-[11px] text-gray-400">{a.sku ?? '—'}</div>
                      </TableCell>
                      {isMultiBranch && (
                        <TableCell className="text-xs text-gray-500">{a.branch_name ?? '—'}</TableCell>
                      )}
                      <TableCell><Badge variant="outline" className="text-[11px]">{a.category_name ?? '—'}</Badge></TableCell>
                      <TableCell className="text-right text-sm font-semibold">{a.current_stock} {a.unit}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{fmtKES(a.cost_value)}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {a.last_sale_days_ago !== null ? `${a.last_sale_days_ago} days ago` : 'Never'}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.bgCls} ${m.textCls}`}>{m.label}</span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Separator />

      {/* Low Stock */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm text-gray-900">Low Stock Report</h3>
            <p className="text-xs text-gray-400 mt-0.5">{lowStock.length} products at or below minimum</p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={exportLowStockCSV} disabled={lowStock.length === 0}><Download size={13} className="mr-1.5" />CSV</Button>
            <Button variant="outline" size="sm" onClick={printLowStock} disabled={lowStock.length === 0}><Printer size={13} className="mr-1.5" />Print</Button>
          </div>
        </div>
        {lowStock.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl py-10 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-green-400" />
            <div className="text-sm font-medium text-gray-500">All products are well-stocked</div>
          </div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead>Product</TableHead><TableHead>Category</TableHead>
                  <TableHead className="text-right">Current</TableHead><TableHead className="text-right">Minimum</TableHead>
                  <TableHead className="text-right">Deficit</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((p) => {
                  const s = getStockStatus(p.stock_quantity, p.min_stock)
                  return (
                    <TableRow key={p.id} className={s.rowBorderCls}>
                      <TableCell><div className="font-semibold text-sm">{p.name}</div><div className="text-[11px] text-gray-400">{p.sku ?? '—'}</div></TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{p.category_name ?? '—'}</Badge></TableCell>
                      <TableCell className="text-right"><span className={`font-bold text-sm ${s.textCls}`}>{p.stock_quantity}</span><span className="text-[11px] text-gray-400 ml-1">{p.unit}</span></TableCell>
                      <TableCell className="text-right text-sm text-gray-500">{p.min_stock} {p.unit}</TableCell>
                      <TableCell className="text-right"><span className="text-sm font-semibold text-red-600">{Math.max(0, p.min_stock - p.stock_quantity)} {p.unit}</span></TableCell>
                      <TableCell><StatusPill qty={p.stock_quantity} min={p.min_stock} /></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <Separator />

      {/* Expiry */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm text-gray-900">Expiry Alerts</h3>
            <p className="text-xs text-gray-400 mt-0.5">{expiring.length} products expiring within 30 days</p>
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={exportExpiryCSV} disabled={expiring.length === 0}><Download size={13} className="mr-1.5" />CSV</Button>
            <Button variant="outline" size="sm" onClick={printExpiry} disabled={expiring.length === 0}><Printer size={13} className="mr-1.5" />Print</Button>
          </div>
        </div>
        {expiring.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl py-10 text-center">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-green-400" />
            <div className="text-sm font-medium text-gray-500">No products expiring in the next 30 days</div>
          </div>
        ) : (
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead>Product</TableHead><TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead><TableHead>Expiry Date</TableHead><TableHead>Days Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiring.map((p) => {
                  const d = daysUntil(p.expiry_date)!
                  return (
                    <TableRow key={p.id}>
                      <TableCell><div className="font-semibold text-sm">{p.name}</div><div className="text-[11px] text-gray-400">{p.sku ?? '—'}</div></TableCell>
                      <TableCell><Badge variant="outline" className="text-[11px]">{p.category_name ?? '—'}</Badge></TableCell>
                      <TableCell className="text-right text-sm font-semibold">{p.stock_quantity} {p.unit}</TableCell>
                      <TableCell className="text-sm">{new Date(p.expiry_date!).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</TableCell>
                      <TableCell><span className={`text-sm font-semibold ${d < 0 ? 'text-red-600' : d <= 7 ? 'text-orange-600' : 'text-amber-600'}`}>{d < 0 ? 'Expired' : `${d} days`}</span></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <BarcodePrintModal products={products} open={barcodeOpen} onClose={() => setBarcodeOpen(false)} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

type Tab = 'products' | 'orders' | 'transfers' | 'suppliers' | 'reports'

export function InventoryPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const hasSupplierMgmt = useFeature('supplier_management')
  const [tab, setTab] = useState<Tab>('products')
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null)

  // Admins can pick a branch or view all; others are server-scoped to their branch
  const effectiveBranchId = isAdmin ? (selectedBranchId ?? undefined) : undefined

  const { data: products = [] } = useProducts(undefined, undefined, effectiveBranchId)
  const { data: orders = [] } = usePurchaseOrders()
  const { data: rawBranches = [] } = useBranches()
  const { data: orgInfo } = useOrgInfo()

  const branches = rawBranches.map((b) => ({ id: b.id, name: b.name }))
  const isMultiBranch = rawBranches.length > 1
  const activeProducts = products.filter((p) => p.is_active)
  const lowCount = activeProducts.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock).length
  const outCount = activeProducts.filter((p) => p.stock_quantity === 0).length
  const criticalCount = activeProducts.filter((p) => p.min_stock > 0 && p.stock_quantity > 0 && p.stock_quantity < p.min_stock * 0.5).length
  const pendingPOs = orders.filter((o) => o.status === 'pending').length
  const inventoryValue = activeProducts.reduce((s, p) => s + (p.cost ?? p.price) * p.stock_quantity, 0)

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'products', label: 'Products', count: activeProducts.length },
    ...(hasSupplierMgmt ? [{ id: 'orders' as Tab, label: 'Purchase Orders', count: pendingPOs || undefined }] : []),
    ...(isMultiBranch ? [{ id: 'transfers' as Tab, label: 'Transfers' }] : []),
    ...(hasSupplierMgmt ? [{ id: 'suppliers' as Tab, label: 'Suppliers' }] : []),
    { id: 'reports', label: 'Reports', count: lowCount + outCount || undefined },
  ]

  // Reset to products if active tab becomes hidden
  if (tab === 'transfers' && !isMultiBranch) setTab('products')
  if ((tab === 'orders' || tab === 'suppliers') && !hasSupplierMgmt) setTab('products')

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Products, stock levels, purchase orders and reports
            {!isAdmin && user?.branch_name && (
              <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {user.branch_name}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && rawBranches.length > 0 && (
            <Select
              value={selectedBranchId ? String(selectedBranchId) : '__all__'}
              onValueChange={(v) => setSelectedBranchId(v === '__all__' ? null : Number(v))}
            >
              <SelectTrigger className="w-44 h-8 text-xs">
                <span>
                  {selectedBranchId
                    ? (rawBranches.find((b) => b.id === selectedBranchId)?.name ?? String(selectedBranchId))
                    : 'All branches'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All branches</SelectItem>
                {rawBranches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {orgInfo && <span className="text-xs text-gray-400">{activeProducts.length}/{orgInfo.max_products === null ? '∞' : orgInfo.max_products} products</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 mb-5 sm:mb-6">
        <StatCard label="Total Products" value={activeProducts.length} icon={Package} accent="#3B82F6" />
        <StatCard label="Inventory Value" value={fmtKES(inventoryValue)} sub="at cost price" icon={BarChart3} accent="#8B5CF6" />
        <StatCard label="Low / Out of Stock" value={`${lowCount + criticalCount} / ${outCount}`} sub={criticalCount > 0 ? `${criticalCount} critical` : 'need attention'} icon={TrendingDown} accent="#EF4444" />
        <StatCard label="Pending Orders" value={pendingPOs} sub="purchase orders" icon={Truck} accent="#F59E0B" />
      </div>

      {/* Alert banner */}
      {(outCount > 0 || criticalCount > 0 || lowCount > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 flex items-center gap-2.5">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1 text-sm flex flex-wrap gap-x-2">
            {outCount > 0 && <span className="font-bold text-red-700">{outCount} out of stock</span>}
            {criticalCount > 0 && <span className="font-semibold text-orange-700">{criticalCount} critical</span>}
            {lowCount > 0 && <span className="font-semibold text-amber-800">{lowCount} low stock</span>}
            <span className="text-amber-700">— {activeProducts.filter((p) => p.stock_quantity <= p.min_stock).slice(0, 3).map((p) => p.name).join(', ')}{lowCount + outCount > 3 ? '…' : ''}</span>
          </div>
          <Button size="sm" variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-100 flex-shrink-0" onClick={() => setTab('reports')}>
            View Report
          </Button>
        </div>
      )}

      {/* Tab nav */}
      <div className="overflow-x-auto mb-5">
        <div className="flex gap-0 border-b border-gray-200 min-w-max">
          {TABS.map(({ id, label, count }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold -mb-px border-b-2 transition-colors whitespace-nowrap ${tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
              {count != null && count > 0 && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${tab === id ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'products' && <ProductsTab branchId={effectiveBranchId} />}
      {tab === 'orders' && <PurchaseOrdersTab products={products} branches={branches} />}
      {tab === 'transfers' && <TransfersTab products={products} branches={branches} />}
      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'reports' && <ReportsTab products={products} branchId={effectiveBranchId} isMultiBranch={isMultiBranch} />}
    </div>
  )
}
