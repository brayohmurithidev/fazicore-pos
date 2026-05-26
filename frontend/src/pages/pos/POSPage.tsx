import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Search, Trash2, Minus, Plus, Check, Receipt, SlidersHorizontal, BookmarkCheck, Bookmark, Keyboard, Building2, X as XIcon, ScanLine, WifiOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PaymentModal } from './PaymentModal'
import { ReceiptModal } from './ReceiptModal'
import { ManagerApprovalModal } from '@/components/shared/ManagerApprovalModal'
import { fmtKES } from '@/lib/data'
import { resolveImageUrl } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { isTauri } from '@tauri-apps/api/core'
import { useCategories, useCreateOrder, useBranches, usePermissions } from '@/lib/queries'
import { isLocalMode } from '@/lib/local-mode'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { usePOSProducts } from '@/hooks/usePOSProducts'
import { useOfflineStore } from '@/stores/offline'
import { printESCPOS } from '@/lib/escpos'
import type { CartItem, Product, SaleInfo } from '@/types'

// ── Kbd hint badge ────────────────────────────────────────────────────────────

function Kbd({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <kbd className={`ml-1.5 inline-flex items-center text-[9px] font-mono rounded px-1 py-px leading-none border ${
      light
        ? 'bg-white/20 border-white/30 text-white/70'
        : 'bg-gray-100 border-gray-200 text-gray-400'
    }`}>
      {children}
    </kbd>
  )
}

// ── Product tile ──────────────────────────────────────────────────────────────

function ProductTile({
  product, catColor, cartQty, onAdd,
}: {
  product: Product; catColor: string; cartQty: number; onAdd: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const available = product.stock - cartQty
  const isOut = product.stock === 0
  const isCapped = cartQty >= product.stock && product.stock > 0
  const isLow = product.stock > 0 && product.stock <= product.minStock && !isCapped

  return (
    <button
      onClick={() => !isOut && !isCapped && onAdd()}
      disabled={isOut || isCapped}
      className={`bg-white border rounded-xl p-2.5 text-left transition-all w-full ${
        isOut || isCapped
          ? 'opacity-50 cursor-not-allowed border-gray-100'
          : 'border-gray-200 hover:border-gray-800 hover:shadow-md active:scale-[0.97] cursor-pointer'
      }`}
    >
      {/* Thumbnail */}
      <div
        className="w-full aspect-square rounded-lg overflow-hidden mb-2 relative flex items-center justify-center"
        style={{ background: catColor + '18' }}
      >
        {product.imageUrl && !imgError ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-2xl font-black select-none" style={{ color: catColor + 'bb' }}>
            {product.name[0].toUpperCase()}
          </span>
        )}
        {isCapped && (
          <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
              Max in cart
            </span>
          </div>
        )}
      </div>

      <div className="text-xs font-semibold text-gray-900 leading-snug mb-1 line-clamp-2 min-h-[28px]">
        {product.name}
      </div>
      <div className="text-[13px] font-bold text-gray-900">{fmtKES(product.price)}</div>
      <div className={`text-[10px] mt-0.5 font-medium ${
        isOut ? 'text-red-500' : isCapped ? 'text-amber-500' : isLow ? 'text-orange-500' : 'text-gray-400'
      }`}>
        {isOut ? 'Out of stock' : isCapped ? `${product.stock} in cart` : isLow ? `Low: ${available}` : `${available} left`}
      </div>
    </button>
  )
}

// ── Cart row ──────────────────────────────────────────────────────────────────

function CartItemRow({ item, maxQty, catColor, onQty, onRemove, onItemDiscount, discountLimit, onDiscountExceedsLimit, canDiscount = true }: {
  item: CartItem; maxQty: number; catColor: string
  onQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  onItemDiscount: (id: string, pct: number) => void
  discountLimit?: number
  onDiscountExceedsLimit?: (id: string, pct: number) => void
  canDiscount?: boolean
}) {
  const [editingQty, setEditingQty] = useState(false)
  const [qtyStr, setQtyStr] = useState('')
  const [editingDiscount, setEditingDiscount] = useState(false)
  const [discountStr, setDiscountStr] = useState('')
  const qtyInputRef = useRef<HTMLInputElement>(null)
  const discountInputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setQtyStr(String(item.qty))
    setEditingQty(true)
    setTimeout(() => { qtyInputRef.current?.focus(); qtyInputRef.current?.select() }, 0)
  }

  const commitQty = () => {
    const v = parseInt(qtyStr, 10)
    if (!isNaN(v) && v > 0) onQty(item.id, Math.min(v, maxQty))
    else if (!isNaN(v) && v <= 0) onRemove(item.id)
    setEditingQty(false)
  }

  const startDiscount = () => {
    setDiscountStr(item.itemDiscount > 0 ? String(item.itemDiscount) : '')
    setEditingDiscount(true)
    setTimeout(() => { discountInputRef.current?.focus(); discountInputRef.current?.select() }, 0)
  }

  const commitDiscount = () => {
    const v = parseFloat(discountStr)
    const pct = (!isNaN(v) && v >= 0 && v <= 100) ? v : 0
    if (discountLimit !== undefined && pct > discountLimit) {
      onDiscountExceedsLimit?.(item.id, pct)
      setEditingDiscount(false)
      return
    }
    onItemDiscount(item.id, pct)
    setEditingDiscount(false)
  }

  const lineTotal = item.price * item.qty
  const lineDiscount = item.itemDiscount > 0 ? Math.round(lineTotal * item.itemDiscount / 100) : 0
  const lineNet = lineTotal - lineDiscount

  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        {/* Category accent */}
        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: catColor }} />

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-900 truncate">{item.name}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">{fmtKES(item.price)} / {item.unit}</span>
            {item.itemDiscount > 0 && (
              <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1 rounded">
                -{item.itemDiscount}%
              </span>
            )}
          </div>
        </div>

      {/* Qty controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => onQty(item.id, item.qty - 1)}
          className="w-6 h-6 rounded border border-gray-200 bg-gray-50 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200"
        >
          <Minus size={10} />
        </button>

        {editingQty ? (
          <input
            ref={qtyInputRef}
            type="number"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitQty()
              if (e.key === 'Escape') setEditingQty(false)
            }}
            className="w-10 h-6 text-center font-bold text-sm border border-gray-300 rounded focus:outline-none focus:border-gray-800"
          />
        ) : (
          <button
            onClick={startEdit}
            title="Click to edit quantity"
            className="w-7 text-center font-bold text-sm hover:bg-gray-100 rounded h-6 leading-6"
          >
            {item.qty}
          </button>
        )}

        <button
          onClick={() => onQty(item.id, item.qty + 1)}
          disabled={item.qty >= maxQty}
          className="w-6 h-6 rounded border border-gray-200 bg-gray-50 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Plus size={10} />
        </button>
      </div>

      <div className="text-right flex-shrink-0 w-[72px]">
        <div className={`text-sm font-bold ${lineDiscount > 0 ? 'text-green-700' : 'text-gray-900'}`}>
          {fmtKES(lineNet)}
        </div>
        {lineDiscount > 0 && (
          <div className="text-[10px] text-gray-400 line-through">{fmtKES(lineTotal)}</div>
        )}
      </div>

      <button
        onClick={() => onRemove(item.id)}
        className="text-gray-300 hover:text-red-500 p-1 transition-colors flex-shrink-0"
      >
        <Trash2 size={13} />
      </button>
    </div>

    {/* Per-item discount row */}
    {canDiscount && <div className="flex items-center justify-end gap-1.5 mt-0.5 pl-3">
      {editingDiscount ? (
        <div className="flex items-center gap-1">
          <input
            ref={discountInputRef}
            type="number"
            min={0}
            max={100}
            value={discountStr}
            onChange={(e) => setDiscountStr(e.target.value)}
            onBlur={commitDiscount}
            onKeyDown={(e) => { if (e.key === 'Enter') commitDiscount(); if (e.key === 'Escape') setEditingDiscount(false) }}
            className="w-14 h-5 text-center text-xs border border-green-300 rounded focus:outline-none focus:border-green-500"
            placeholder="0"
          />
          <span className="text-[10px] text-gray-400">% off</span>
        </div>
      ) : (
        <button
          onClick={startDiscount}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            item.itemDiscount > 0
              ? 'text-green-700 bg-green-50 hover:bg-green-100'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
        >
          {item.itemDiscount > 0 ? `Item discount: ${item.itemDiscount}% off` : '+ item discount'}
        </button>
      )}
    </div>}
  </div>
  )
}

// ── Main POS page ─────────────────────────────────────────────────────────────

export function POSPage() {
  const { user } = useAuthStore()
  const { settings } = useSettingsStore()
  const searchRef = useRef<HTMLInputElement>(null)

  // ── State ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('all')
  const [cart, setCart] = useState<CartItem[]>([])
  const [heldCart, setHeldCart] = useState<CartItem[] | null>(null)
  const [orderNotes, setOrderNotes] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [lastSale, setLastSale] = useState<SaleInfo | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const scanFeedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const createOrder = useCreateOrder()
  const { isOnline, createOfflineOrder, setPosBranchOverride } = useOfflineStore()
  const isAdmin = user?.role === 'admin'
  const isCashier = user?.role === 'cashier'
  const CASHIER_DISCOUNT_LIMIT = 10

  const { data: permsData } = usePermissions()
  const posPerms = permsData?.permissions?.pos
  const allowCashierDiscount = posPerms?.allow_cashier_discount !== false
  const requireManagerPin = posPerms?.require_manager_pin !== false

  // Manager approval flow
  const pendingApproval = useRef<(() => void) | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [approvalTitle, setApprovalTitle] = useState('')
  const [approvalDesc, setApprovalDesc] = useState('')

  const requestApproval = (title: string, desc: string, callback: () => void) => {
    pendingApproval.current = callback
    setApprovalTitle(title)
    setApprovalDesc(desc)
    setApprovalOpen(true)
  }

  const handleApproved = () => {
    pendingApproval.current?.()
    pendingApproval.current = null
  }

  const noModalOpen = !payOpen && !receiptOpen && !approvalOpen && !discountOpen && !shortcutsOpen && !notesOpen

  const userBranchId = user?.branch ? (Number(user.branch) || undefined) : undefined

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: apiCategories = [] } = useCategories()
  const { data: apiBranches = [] } = useBranches()
  const isMultiBranch = apiBranches.length > 1

  // Admins in multi-branch shops can pick which branch they're selling at.
  // Auto-select when there is exactly one branch so single-location admins
  // are never asked to "pick" something with only one option.
  const [adminBranchId, setAdminBranchId] = useState<number | undefined>(
    () => apiBranches.length === 1 ? apiBranches[0]?.id : undefined
  )
  useEffect(() => {
    if (apiBranches.length === 1 && !adminBranchId) setAdminBranchId(apiBranches[0].id)
  }, [apiBranches])
  const effectiveBranchId = isAdmin && isMultiBranch ? adminBranchId : userBranchId

  // Keep offline sync scoped to the admin's chosen branch so SQLite stock is accurate
  useEffect(() => {
    if (isAdmin) setPosBranchOverride(adminBranchId ?? null)
    return () => { if (isAdmin) setPosBranchOverride(null) }
  }, [isAdmin, adminBranchId])

  const { data: apiProducts = [], isLoading: productsLoading } = usePOSProducts(effectiveBranchId)
  const userBranch = apiBranches.find((b) => b.id === effectiveBranchId)

  // Category map for O(1) color lookup
  const catMap = useMemo(
    () => new Map(apiCategories.map((c) => [String(c.id), { name: c.name, color: c.color || '#9CA3AF' }])),
    [apiCategories]
  )

  // Normalize API products
  const products = useMemo<Product[]>(
    () =>
      apiProducts.map((p) => ({
        id: String(p.id),
        name: p.name,
        category: String(p.category_id ?? ''),
        price: p.price,
        cost: p.cost ?? 0,
        sku: p.sku ?? '',
        barcode: p.barcode ?? '',
        stock: p.stock_quantity,
        minStock: p.min_stock,
        expiryDate: p.expiry_date ?? '',
        unit: p.unit,
        vatRate: p.vat_rate,
        imageUrl: resolveImageUrl(p.image_url) ?? undefined,
      })),
    [apiProducts]
  )

  // ── Barcode scanner ──────────────────────────────────────────────────────
  const showScanFeedback = useCallback((ok: boolean, text: string) => {
    clearTimeout(scanFeedbackTimer.current)
    setScanFeedback({ ok, text })
    scanFeedbackTimer.current = setTimeout(() => setScanFeedback(null), 1800)
  }, [])

  const handleScan = useCallback((code: string) => {
    const match = products.find((p) => p.barcode === code || p.sku === code)
    if (match) {
      setCart((prev) => {
        const existing = prev.find((i) => i.id === match.id)
        const currentQty = existing?.qty ?? 0
        if (currentQty >= match.stock) return prev
        if (existing) return prev.map((i) => i.id === match.id ? { ...i, qty: i.qty + 1 } : i)
        return [...prev, { ...match, qty: 1, itemDiscount: 0 }]
      })
      setSearch('')
      showScanFeedback(true, match.name)
    } else {
      setSearch(code)
      showScanFeedback(false, code)
    }
  }, [products, showScanFeedback])

  useBarcodeScanner({ onScan: handleScan, enabled: noModalOpen })

  // Client-side filter (no API call per keystroke)
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return products.filter((p) => {
      if (activeCat !== 'all' && p.category !== activeCat) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode === search ||
        p.sku.toLowerCase().includes(q)
      )
    })
  }, [products, search, activeCat])

  // Cart quantity map for stock checking
  const cartQtyMap = useMemo(() => new Map(cart.map((i) => [i.id, i.qty])), [cart])

  // ── Cart helpers ─────────────────────────────────────────────────────────
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id)
      const currentQty = existing?.qty ?? 0
      if (currentQty >= product.stock) return prev
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1, itemDiscount: 0 }]
    })
  }

  const updateQty = (id: string, qty: number) => {
    const product = products.find((p) => p.id === id)
    if (!product) return
    if (qty <= 0) setCart((prev) => prev.filter((i) => i.id !== id))
    else setCart((prev) => prev.map((i) => i.id === id ? { ...i, qty: Math.min(qty, product.stock) } : i))
  }

  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id))

  const updateItemDiscount = (id: string, pct: number) =>
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, itemDiscount: pct } : i))

  // ── Barcode / Enter to add ───────────────────────────────────────────────
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const exact = products.find((p) => p.barcode === search || p.sku === search)
    if (exact) {
      addToCart(exact)
      setSearch('')
      return
    }
    if (filtered.length === 1) {
      addToCart(filtered[0])
      setSearch('')
    }
  }

  // Auto-focus search on mount
  useEffect(() => { searchRef.current?.focus() }, [])

  // ── Global keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      // Escape: clear search or close open modal/overlay
      if (e.key === 'Escape') {
        if (payOpen || discountOpen || receiptOpen || shortcutsOpen) return // let Dialog handle it
        if (search) { setSearch(''); return }
        searchRef.current?.blur()
        return
      }

      // Don't steal keys while user is typing — except F-keys
      if (isTyping && !e.key.startsWith('F')) return

      // Don't run POS shortcuts while any dialog is open
      if (payOpen || discountOpen || receiptOpen || shortcutsOpen) return

      switch (e.key) {
        // Focus search
        case '/':
        case 'F1':
          e.preventDefault()
          searchRef.current?.focus()
          searchRef.current?.select()
          break

        // Charge
        case 'F2':
          e.preventDefault()
          if (cart.length > 0 && !payOpen) setPayOpen(true)
          break

        // Discount
        case 'F3':
          e.preventDefault()
          if (!discountOpen && (!isCashier || allowCashierDiscount)) { setDiscountInput(String(discount)); setDiscountOpen(true) }
          break

        // Hold order
        case 'F4':
          e.preventDefault()
          if (cart.length > 0) {
            setHeldCart(cart); setCart([]); setDiscount(0); setOrderNotes('')
          }
          break

        // Restore held
        case 'F5':
          e.preventDefault()
          if (heldCart) { setCart(heldCart); setHeldCart(null) }
          break

        // Undo last cart action — decrement/remove last item
        case 'Backspace':
          if (isTyping) break
          e.preventDefault()
          if (cart.length > 0) {
            const last = cart[cart.length - 1]
            if (last.qty > 1) {
              setCart((prev) => prev.map((i) => i.id === last.id ? { ...i, qty: i.qty - 1 } : i))
            } else {
              setCart((prev) => prev.filter((i) => i.id !== last.id))
            }
          }
          break

        // Shortcuts help
        case '?':
          if (!isTyping) setShortcutsOpen(true)
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart, discount, heldCart, payOpen, discountOpen, receiptOpen, shortcutsOpen, search])

  // ── Hold order ───────────────────────────────────────────────────────────
  const holdOrder = () => {
    if (cart.length === 0) return
    setHeldCart(cart)
    setCart([])
    setDiscount(0)
    setOrderNotes('')
  }

  const restoreHeld = () => {
    if (!heldCart) return
    setCart(heldCart)
    setHeldCart(null)
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  // lineNet = price after per-item discount; subtotal = sum of lineNets
  const subtotal = cart.reduce((s, i) => {
    const line = i.price * i.qty
    return s + (i.itemDiscount > 0 ? line - Math.round(line * i.itemDiscount / 100) : line)
  }, 0)
  const itemDiscountTotal = cart.reduce((s, i) => {
    const line = i.price * i.qty
    return s + (i.itemDiscount > 0 ? Math.round(line * i.itemDiscount / 100) : 0)
  }, 0)
  const cartDiscountAmt = Math.round(subtotal * discount / 100)
  const vatTotal = cart.reduce((s, i) => {
    if (!i.vatRate) return s
    const line = i.price * i.qty
    const lineNet = i.itemDiscount > 0 ? line - Math.round(line * i.itemDiscount / 100) : line
    return s + lineNet - lineNet / (1 + i.vatRate)
  }, 0)
  const total = subtotal - cartDiscountAmt
  const itemCount = cart.reduce((s, i) => s + i.qty, 0)

  // ── Payment complete ─────────────────────────────────────────────────────
  const handlePaymentComplete = async (payInfo: Record<string, unknown>) => {
    const method = payInfo.method as SaleInfo['payment']
    const sale: SaleInfo = {
      id: `POS-${Date.now().toString(36).toUpperCase()}`,
      items: [...cart],
      subtotal,
      total,
      payment: method,
      cashier: user?.name || '',
      branchName: isMultiBranch ? (userBranch?.name ?? user?.branch_name) : undefined,
      branchLocation: isMultiBranch ? (userBranch?.location ?? undefined) : undefined,
      notes: orderNotes || undefined,
      ...(payInfo as Partial<SaleInfo>),
    }

    const orderPayload = {
      payment_method: method,
      branch_id: effectiveBranchId ?? null,
      notes: orderNotes || undefined,
      items: cart.map((item) => ({
        product_id: Number(item.id) || undefined,
        product_name: item.name,
        product_sku: item.sku || undefined,
        quantity: item.qty,
        unit_price: item.price,
        discount_amount: item.itemDiscount > 0
          ? Math.round(item.price * item.qty * item.itemDiscount / 100)
          : 0,
      })),
      discount_amount: cartDiscountAmt,
      amount_paid: (payInfo.cashTendered as number) ?? total,
      mpesa_ref: (payInfo.mpesaRef as string) ?? undefined,
      mpesa_amount: (payInfo.mpesaAmount as number) ?? 0,
      cash_amount: (payInfo.cashAmount as number) ?? 0,
      credit_customer_name: (payInfo.creditName as string) ?? undefined,
      credit_customer_phone: (payInfo.creditPhone as string) ?? undefined,
    }

    if (!isLocalMode && isTauri() && !isOnline) {
      // Queue the sale locally for later sync; stock is decremented in SQLite immediately
      const stockItems: [number, number][] = cart
        .filter((item) => Number(item.id) > 0)
        .map((item) => [Number(item.id), item.qty])
      await createOfflineOrder(JSON.stringify(orderPayload), effectiveBranchId ?? null, stockItems)
    } else {
      createOrder.mutate(orderPayload, {
        onSuccess: (order) =>
          setLastSale((prev) => (prev ? { ...prev, id: order.order_number } : prev)),
      })
    }

    setLastSale(sale)
    setPayOpen(false)
    setCart([])
    setDiscount(0)
    setOrderNotes('')

    if (settings.autoPrint) {
      // Try thermal printer first; only show receipt modal if no printer found
      const ok = await printESCPOS(sale, settings)
      if (!ok) setReceiptOpen(true)
    } else {
      setReceiptOpen(true)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden bg-gray-50 relative">
      {/* ── Left: Product catalog ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Admin branch picker — only shown when there are genuinely multiple branches to choose from */}
        {isAdmin && isMultiBranch && apiBranches.length > 1 && (
          <div className={`px-4 py-1.5 border-b flex items-center gap-2.5 ${adminBranchId ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-200'}`}>
            <Building2 size={13} className={adminBranchId ? 'text-amber-600' : 'text-red-500'} />
            <span className={`text-xs font-medium shrink-0 ${adminBranchId ? 'text-amber-700' : 'text-red-600'}`}>
              {adminBranchId ? 'Selling at:' : 'Select a branch to start selling:'}
            </span>
            <Select
              value={adminBranchId ? String(adminBranchId) : ''}
              onValueChange={(v) => setAdminBranchId(v ? Number(v) : undefined)}
            >
              <SelectTrigger className={`h-7 text-xs w-44 bg-white ${adminBranchId ? 'border-amber-200' : 'border-red-300'}`}>
                <SelectValue placeholder="Pick a branch…" />
              </SelectTrigger>
              <SelectContent>
                {apiBranches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Search bar */}
        <div className="px-4 py-3 bg-white border-b border-gray-200">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              ref={searchRef}
              className="pl-9 pr-4 bg-gray-50 border-gray-200 focus:bg-white"
              placeholder="Search or scan barcode…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>

          {/* Scan feedback — appears briefly after each scan */}
          {scanFeedback && (
            <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium px-1 ${
              scanFeedback.ok ? 'text-green-600' : 'text-red-500'
            }`}>
              <ScanLine size={12} />
              {scanFeedback.ok
                ? <span>Added: <span className="font-semibold">{scanFeedback.text}</span></span>
                : <span>Not found: <span className="font-mono">{scanFeedback.text}</span></span>
              }
            </div>
          )}
        </div>

        {/* Category pills */}
        <div className="flex gap-1.5 px-4 py-2.5 overflow-x-auto bg-white border-b border-gray-100 flex-shrink-0">
          {[{ id: 'all', name: 'All', color: '#111827' }, ...apiCategories.map((c) => ({
            id: String(c.id),
            name: c.name,
            color: c.color || '#9CA3AF',
          }))].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCat(cat.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                activeCat === cat.id
                  ? 'text-white border-transparent shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
              style={activeCat === cat.id ? { background: cat.color, borderColor: cat.color } : {}}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {isAdmin && isMultiBranch && !adminBranchId ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Building2 size={24} className="text-red-500" />
              </div>
              <p className="font-semibold text-gray-700 mb-1">No branch selected</p>
              <p className="text-sm text-gray-400">Choose a branch from the bar above to load products and start selling.</p>
            </div>
          ) : productsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading products...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <Search size={32} className="mx-auto mb-2.5 text-gray-300" />
              <div className="font-medium">No products found</div>
              {search && <div className="text-xs mt-1 text-gray-300">Try a different search or scan a barcode</div>}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(116px,1fr))] gap-2 sm:gap-2.5">
              {filtered.map((p) => (
                <ProductTile
                  key={p.id}
                  product={p}
                  catColor={catMap.get(p.category)?.color ?? '#9CA3AF'}
                  cartQty={cartQtyMap.get(p.id) ?? 0}
                  onAdd={() => addToCart(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mobile cart button — only visible on small screens */}
        <div className="md:hidden flex-shrink-0 p-3 bg-white border-t border-gray-200">
          <button
            onClick={() => setMobileCartOpen(true)}
            className="w-full flex items-center justify-between bg-gray-900 text-white rounded-xl px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Receipt size={16} />
              <span className="font-semibold text-sm">View Cart</span>
              <Badge className="bg-white/20 text-white text-[10px] border-0">{itemCount}</Badge>
            </div>
            <span className="font-bold">{fmtKES(total)}</span>
          </button>
        </div>
      </div>

      {/* Mobile cart backdrop */}
      {mobileCartOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileCartOpen(false)}
        />
      )}

      {/* ── Right: Cart ───────────────────────────────────────────────────── */}
      <div className={`flex flex-col bg-white border-l border-gray-200 flex-shrink-0 transition-transform duration-200 md:w-[340px] md:flex md:relative md:translate-x-0 ${mobileCartOpen ? 'fixed inset-y-0 right-0 w-full max-w-sm z-50 translate-x-0' : 'fixed inset-y-0 right-0 w-full max-w-sm z-50 translate-x-full md:translate-x-0'}`}>

        {/* Cart header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMobileCartOpen(false)}
              className="md:hidden mr-1 text-gray-400 hover:text-gray-700 p-1"
            >
              <XIcon size={16} />
            </button>
            <div className="font-bold text-[15px] text-gray-900">Cart</div>
            <button
              onClick={() => setShortcutsOpen(true)}
              className="text-gray-300 hover:text-gray-500 p-0.5 rounded transition-colors"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={13} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {heldCart && (
              <button
                onClick={restoreHeld}
                className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md"
                title="Restore held order (F5)"
              >
                <BookmarkCheck size={11} />
                Restore
              </button>
            )}
            {cart.length > 0 && (
              <>
                <button
                  onClick={holdOrder}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded"
                  title="Hold order (F4)"
                >
                  <Bookmark size={14} />
                </button>
                <button
                  onClick={() => {
                    if (isCashier) {
                      requestApproval(
                        'Manager Approval Required',
                        'Voiding a transaction requires manager approval',
                        () => { setCart([]); setDiscount(0); setOrderNotes('') }
                      )
                    } else {
                      setCart([]); setDiscount(0); setOrderNotes('')
                    }
                  }}
                  className="text-red-400 text-xs font-semibold hover:text-red-600"
                >
                  Clear
                </button>
              </>
            )}
            <Badge variant="secondary" className="text-[11px]">{itemCount} items</Badge>
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4 min-h-0">
          {cart.length === 0 ? (
            <div className="text-center py-14">
              <Receipt size={36} className="mx-auto mb-2.5 text-gray-200" />
              <div className="text-sm text-gray-400 font-medium">Cart is empty</div>
              <div className="text-xs text-gray-300 mt-1">Add products from the catalog</div>
            </div>
          ) : (
            cart.map((item) => {
              const catColor = catMap.get(item.category)?.color ?? '#9CA3AF'
              const product = products.find((p) => p.id === item.id)
              return (
                <CartItemRow
                  key={item.id}
                  item={item}
                  maxQty={product?.stock ?? item.qty}
                  catColor={catColor}
                  onQty={updateQty}
                  onRemove={removeItem}
                  onItemDiscount={updateItemDiscount}
                  canDiscount={!isCashier || allowCashierDiscount}
                  discountLimit={isCashier && requireManagerPin ? CASHIER_DISCOUNT_LIMIT : undefined}
                  onDiscountExceedsLimit={(id, pct) =>
                    requestApproval(
                      'Manager Approval Required',
                      `Item discount of ${pct}% exceeds the ${CASHIER_DISCOUNT_LIMIT}% cashier limit`,
                      () => updateItemDiscount(id, pct)
                    )
                  }
                />
              )
            })
          )}
        </div>

        {/* Order notes (collapsible) */}
        {notesOpen && (
          <div className="px-4 py-2 border-t border-gray-100">
            <textarea
              className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:border-gray-400 text-gray-700 placeholder:text-gray-300"
              rows={2}
              placeholder="Order notes (optional)..."
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
            />
          </div>
        )}

        {/* Totals + actions */}
        <div className="p-4 border-t border-gray-200">
          <div className="mb-3 space-y-1.5">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="text-gray-700">{fmtKES(subtotal)}</span>
            </div>
            {vatTotal > 0.5 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>VAT (incl.)</span>
                <span>{fmtKES(Math.round(vatTotal))}</span>
              </div>
            )}
            {itemDiscountTotal > 0 && (
              <div className="flex justify-between text-xs text-green-600">
                <span>Item discounts</span>
                <span>−{fmtKES(itemDiscountTotal)}</span>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Cart discount ({discount}%)</span>
                <span>−{fmtKES(cartDiscountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-xl pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{fmtKES(total)}</span>
            </div>
          </div>

          {/* Secondary actions row */}
          <div className="flex gap-1.5 mb-2.5">
            {(!isCashier || allowCashierDiscount) && (
              <button
                onClick={() => { setDiscountInput(String(discount)); setDiscountOpen(true) }}
                className={`flex-1 py-1.5 border rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                  discount > 0
                    ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <SlidersHorizontal size={11} />
                {discount > 0 ? `${discount}% off` : 'Discount'}
                <Kbd>F3</Kbd>
              </button>
            )}
            <button
              onClick={() => setNotesOpen((v) => !v)}
              className={`flex-1 py-1.5 border rounded-md text-xs font-semibold transition-colors ${
                orderNotes
                  ? 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100'
                  : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                {orderNotes ? <Check size={11} /> : <Plus size={11} />}
                Note
              </span>
            </button>
          </div>

          <Button
            className="w-full h-11 text-base font-bold"
            disabled={cart.length === 0 || createOrder.isPending || (isAdmin && isMultiBranch && !adminBranchId)}
            onClick={() => setPayOpen(true)}
          >
            {isTauri() && !isOnline && <WifiOff size={14} className="opacity-70" />}
            Charge {fmtKES(total)}
            <Kbd light>F2</Kbd>
          </Button>
        </div>
      </div>

      {/* ── Discount dialog ───────────────────────────────────────────────── */}
      <Dialog open={discountOpen} onOpenChange={(v) => !v && setDiscountOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Apply Discount</DialogTitle></DialogHeader>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick %</div>
            <div className="flex gap-1.5 mb-3">
              {[5, 10, 15, 20, 25].map((d) => (
                <button
                  key={d}
                  onClick={() => setDiscountInput(String(d))}
                  className={`flex-1 py-2 rounded-md text-sm font-semibold border transition-colors ${
                    discountInput === String(d)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {d}%
                </button>
              ))}
            </div>
            <Input
              type="number"
              placeholder="Custom %"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="mb-4"
              min={0}
              max={100}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setDiscount(0); setDiscountOpen(false) }}>
                Remove
              </Button>
              <Button className="flex-1" onClick={() => {
                const pct = Math.min(100, Math.max(0, parseFloat(discountInput) || 0))
                if (isCashier && requireManagerPin && pct > CASHIER_DISCOUNT_LIMIT) {
                  setDiscountOpen(false)
                  requestApproval(
                    'Manager Approval Required',
                    `Cart discount of ${pct}% exceeds the ${CASHIER_DISCOUNT_LIMIT}% cashier limit`,
                    () => setDiscount(pct)
                  )
                } else {
                  setDiscount(pct)
                  setDiscountOpen(false)
                }
              }}>
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ManagerApprovalModal
        open={approvalOpen}
        onClose={() => { setApprovalOpen(false); pendingApproval.current = null }}
        onApprove={handleApproved}
        title={approvalTitle}
        description={approvalDesc}
      />

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={total}
        onComplete={handlePaymentComplete as never}
        settings={settings}
      />
      <ReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} sale={lastSale} />

      {/* ── Keyboard shortcuts reference ──────────────────────────────────── */}
      <Dialog open={shortcutsOpen} onOpenChange={(v) => !v && setShortcutsOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard size={16} /> Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm divide-y divide-gray-50">
            {([
              ['/', 'Focus search / scan input'],
              ['Enter', 'Add exact barcode/SKU match, or single result'],
              ['Escape', 'Clear search or close modal'],
              ['F2', 'Charge — open payment'],
              ['F3', 'Apply discount'],
              ['F4', 'Hold current order'],
              ['F5', 'Restore held order'],
              ['Backspace', 'Remove or decrement last cart item'],
              ['?', 'Show this shortcuts reference'],
            ] as [string, string][]).map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-2">
                <span className="text-gray-600">{desc}</span>
                <kbd className="ml-4 flex-shrink-0 text-[11px] font-mono bg-gray-100 border border-gray-200 rounded px-2 py-0.5 text-gray-500">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
