import { useState, useEffect, useRef } from 'react'
import {
  Phone, CheckCircle2, XCircle, Wifi, Search,
  RefreshCw, Banknote, CreditCard, Landmark, FileText,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Numpad } from '@/components/shared/Numpad'
import { useFeatureFlags } from '@/hooks/useFeature'
import { fmtKES } from '@/lib/data'
import {
  useInitiateStkPush, useStkStatus, useMpesaCredentials,
  useMpesaTransactions, useCustomers, type MpesaTransactionItem,
} from '@/lib/queries'
import type { PaymentMethod, Settings } from '@/types'

interface PaymentInfo {
  method: PaymentMethod
  cashTendered?: number
  cashAmount?: number
  mpesaAmount?: number
  mpesaRef?: string
  creditName?: string
  creditPhone?: string
  externalRef?: string
}

// ── Method tile ───────────────────────────────────────────────────────────────

function MethodTile({
  selected, onClick, children, label,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 p-3 transition-all text-center
        ${selected
          ? 'border-gray-900 bg-gray-900/5 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-400'
        }`}
    >
      <div className="h-8 flex items-center justify-center">{children}</div>
      <span className={`text-[11px] font-semibold leading-tight ${selected ? 'text-gray-900' : 'text-gray-600'}`}>
        {label}
      </span>
    </button>
  )
}

// ── M-Pesa STK Push flow ──────────────────────────────────────────────────────

function StkFlow({
  amount, orderRef, onConfirm, onCancel, hasDaraja,
}: {
  amount: number
  orderRef: string
  onConfirm: (ref: string, receiptNumber: string) => void
  onCancel: () => void
  hasDaraja: boolean
}) {
  const [phone, setPhone]           = useState('')
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [stage, setStage]           = useState<'input' | 'waiting' | 'success' | 'failed'>('input')
  const [errMsg, setErrMsg]         = useState('')

  const initStk  = useInitiateStkPush()
  const { data: stkStatus } = useStkStatus(checkoutId, stage === 'waiting')

  useEffect(() => {
    if (!stkStatus || stage !== 'waiting') return
    if (stkStatus.status === 'completed') {
      setStage('success')
      onConfirm(stkStatus.mpesa_receipt_number ?? '', stkStatus.mpesa_receipt_number ?? '')
    } else if (['failed', 'cancelled', 'timeout'].includes(stkStatus.status)) {
      setStage('failed')
      setErrMsg(stkStatus.result_desc ?? 'Payment failed or was cancelled')
    }
  }, [stkStatus, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!hasDaraja) {
      setStage('waiting')
      setTimeout(() => {
        setStage('success')
        onConfirm(`QH${Math.random().toString(36).substr(2, 8).toUpperCase()}`, '')
      }, 3000)
      return
    }
    if (!phone.replace(/\s/g, '').match(/^(07|01|2547|2541)\d{8}$/)) {
      setErrMsg('Enter a valid Safaricom number (07XX or 01XX)'); return
    }
    setErrMsg('')
    try {
      const result = await initStk.mutateAsync({ phone, amount, order_ref: orderRef })
      setCheckoutId(result.checkout_request_id)
      setStage('waiting')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setErrMsg(err?.response?.data?.detail ?? 'Could not initiate STK push. Check M-Pesa settings.')
    }
  }

  if (stage === 'input') return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-xl p-3.5 mb-5 flex gap-2.5 items-center">
        <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
        <div>
          <div className="font-bold text-green-900">M-Pesa STK Push</div>
          <div className="text-xs text-green-700">
            {hasDaraja ? 'Customer gets a prompt on their phone' : 'Simulation mode — configure Daraja in Settings to go live'}
          </div>
        </div>
      </div>
      <div className="text-3xl font-extrabold text-center mb-4">{fmtKES(amount)}</div>
      <Label className="mb-1.5 block">Customer Phone Number</Label>
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" className="mb-1" />
      {errMsg && <p className="text-xs text-red-500 mt-1">{errMsg}</p>}
      <p className="text-xs text-gray-400 mb-4">Safaricom number registered for M-Pesa</p>
      <Button className="w-full bg-[#00A550] hover:bg-[#008f45] text-white h-11" onClick={handleSend} disabled={initStk.isPending}>
        {initStk.isPending ? 'Sending...' : 'Send STK Push'}
      </Button>
    </div>
  )

  if (stage === 'waiting') return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <Wifi size={28} className="text-green-600 animate-pulse" />
      </div>
      <div className="font-bold text-base mb-1.5">Waiting for customer...</div>
      <div className="text-sm text-gray-500 mb-2">Prompt sent to <strong>{phone || 'customer'}</strong></div>
      <div className="text-xs text-gray-400 mb-5">This page will update automatically when payment is received</div>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
  )

  if (stage === 'success') return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={30} className="text-green-600" />
      </div>
      <div className="font-bold text-lg text-green-900 mb-1.5">Payment Confirmed!</div>
      <div className="text-base mb-1">{fmtKES(amount)} received</div>
      {stkStatus?.mpesa_receipt_number && (
        <div className="text-xs text-gray-400">Ref: {stkStatus.mpesa_receipt_number}</div>
      )}
    </div>
  )

  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <XCircle size={30} className="text-red-600" />
      </div>
      <div className="font-bold text-lg text-red-900 mb-2">Payment Failed</div>
      <div className="text-sm text-gray-500 mb-5">{errMsg || 'Customer did not complete payment'}</div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => { setStage('input'); setErrMsg('') }}>Try Again</Button>
        <Button variant="destructive" className="flex-1" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Incoming C2B transaction picker ───────────────────────────────────────────

function IncomingPaymentPicker({ amount, onSelect, onClose }: {
  amount: number
  onSelect: (tx: MpesaTransactionItem) => void
  onClose: () => void
}) {
  const [todayOnly, setTodayOnly] = useState(true)
  const { data: txs = [], isLoading, refetch } = useMpesaTransactions(true)

  const todayStr = new Date().toDateString()
  const fmt = (iso: string) => {
    const d = new Date(iso)
    const time = d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
    if (d.toDateString() === todayStr) return `Today · ${time}`
    return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }) + ` · ${time}`
  }

  const visible = todayOnly
    ? txs.filter((tx) => new Date(tx.created_at).toDateString() === todayStr)
    : txs

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Incoming M-Pesa Payments</div>
          <div className="text-xs text-gray-400">Select a payment that matches {fmtKES(amount)}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTodayOnly((v) => !v)}
            className={`text-xs px-2 py-1 rounded border transition-colors ${todayOnly ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {todayOnly ? 'Today' : 'All'}
          </button>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="px-2">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="text-xs text-gray-400 text-center py-6">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No unattached payments found{todayOnly ? ' today' : ''}.<br />
          {todayOnly
            ? <button className="text-xs text-green-700 font-semibold mt-1" onClick={() => setTodayOnly(false)}>Show all dates</button>
            : <span className="text-xs">Payments appear here when customers pay via paybill/till directly.</span>
          }
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {visible.map((tx) => {
            const matches = Math.abs(tx.amount - amount) < 1
            return (
              <button key={tx.id} onClick={() => onSelect(tx)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${matches ? 'border-green-300 bg-green-50 hover:bg-green-100' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{fmtKES(tx.amount)}</div>
                    {tx.sender_name && <div className="text-xs font-medium text-gray-700 truncate">{tx.sender_name}</div>}
                    <div className="text-xs text-gray-400">{tx.phone} · {fmt(tx.created_at)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-gray-700">{tx.mpesa_receipt_number}</div>
                    {matches && <div className="text-[10px] text-green-600 font-semibold">Exact match</div>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onClose}>Back to manual entry</Button>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  total: number
  onComplete: (info: PaymentInfo) => void
  settings: Settings
}

export function PaymentModal({ open, onClose, total, onComplete, settings }: Props) {
  const [method, setMethod]             = useState<PaymentMethod>('cash')
  const [cashStr, setCashStr]           = useState('')
  const [mpesaCashStr, setMpesaCashStr] = useState('')
  const [mpesaRef, setMpesaRef]         = useState('')
  const [mpesaMode, setMpesaMode]       = useState<'stk' | 'manual'>('stk')
  const [creditName, setCreditName]     = useState('')
  const [creditPhone, setCreditPhone]   = useState('')
  const [externalRef, setExternalRef]   = useState('')   // card / bank / cheque / airtel ref
  const [airtelPhone, setAirtelPhone]   = useState('')
  const [bankName, setBankName]         = useState('')
  const [chequeNo, setChequeNo]         = useState('')
  const [custOpen, setCustOpen]         = useState(false)
  const [stkOpen, setStkOpen]           = useState(false)
  const [showPicker, setShowPicker]     = useState(false)

  const flags = useFeatureFlags()
  const { data: custMatches = [] } = useCustomers(
    method === 'credit' && creditName.trim().length > 0 ? creditName.trim() : undefined
  )
  const { data: darajaConfigs = [] } = useMpesaCredentials()
  const hasDaraja = !!(darajaConfigs.find((c) => c.is_live && c.is_active))

  const hasManual = settings.mpesaManual && flags.mpesa_manual !== false
  const hasStk    = settings.mpesaStk    && flags.mpesa_stk    !== false
  const hasMpesa  = hasManual || hasStk

  useEffect(() => {
    if (open) {
      setCashStr(''); setMpesaCashStr(''); setMpesaRef('')
      setCreditName(''); setCreditPhone(''); setExternalRef('')
      setAirtelPhone(''); setBankName(''); setChequeNo('')
      setCustOpen(false); setStkOpen(false); setShowPicker(false)
      setMethod('cash')
      setMpesaMode(hasStk ? 'stk' : 'manual')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setMpesaCashStr(''); setMpesaRef('') }, [mpesaMode])

  const cash        = parseFloat(cashStr) || 0
  const change      = method === 'cash' ? Math.max(0, cash - total) : 0
  const mpesaCash   = parseFloat(mpesaCashStr) || 0
  const mpesaAmount = Math.max(0, total - mpesaCash)
  const isSplit     = method === 'mpesa' && mpesaCash > 0

  const canProceed = () => {
    if (method === 'cash')          return cash >= total
    if (method === 'mpesa') {
      if (mpesaMode === 'stk')      return mpesaCash <= total
      return mpesaRef.trim().length >= 6 && mpesaCash <= total
    }
    if (method === 'credit')        return creditName.trim().length > 0 && creditPhone.trim().length > 0
    if (method === 'airtel')        return airtelPhone.trim().length >= 9
    if (method === 'card')          return true   // approval code optional
    if (method === 'bank_transfer') return externalRef.trim().length > 0
    if (method === 'cheque')        return chequeNo.trim().length > 0
    return true
  }

  // Build list of enabled method tiles
  const methodTiles: { id: PaymentMethod; label: string; tile: React.ReactNode }[] = [
    {
      id: 'cash', label: 'Cash',
      tile: <Banknote size={24} className="text-emerald-600" />,
    },
    ...(hasMpesa ? [{
      id: 'mpesa' as PaymentMethod, label: 'M-Pesa',
      tile: <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-7 w-auto" />,
    }] : []),
    {
      id: 'card', label: 'Card',
      tile: <CreditCard size={24} className="text-blue-600" />,
    },
    {
      id: 'airtel', label: 'Airtel Money',
      tile: (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-600">
          <span className="text-white font-black text-[10px] leading-none">AIR</span>
        </div>
      ),
    },
    {
      id: 'bank_transfer', label: 'Bank Transfer',
      tile: <Landmark size={24} className="text-indigo-600" />,
    },
    {
      id: 'cheque', label: 'Cheque',
      tile: <FileText size={24} className="text-amber-600" />,
    },
    ...(settings.credit && flags.credit_system !== false ? [{
      id: 'credit' as PaymentMethod, label: 'Credit',
      tile: <Phone size={24} className="text-slate-500" />,
    }] : []),
  ]

  const handleCharge = () => {
    if (method === 'mpesa') {
      if (mpesaMode === 'stk' || (!hasManual && hasStk)) { setStkOpen(true); return }
      onComplete({ method: mpesaCash > 0 ? 'split' : 'mpesa', cashTendered: mpesaCash, cashAmount: mpesaCash, mpesaAmount, mpesaRef: mpesaRef.trim() })
      return
    }
    if (method === 'airtel') {
      onComplete({ method: 'airtel', externalRef: `${airtelPhone.trim()}${externalRef.trim() ? `·${externalRef.trim()}` : ''}` })
      return
    }
    if (method === 'card') {
      onComplete({ method: 'card', externalRef: externalRef.trim() || undefined })
      return
    }
    if (method === 'bank_transfer') {
      onComplete({ method: 'bank_transfer', externalRef: `${bankName.trim() ? `${bankName.trim()} · ` : ''}${externalRef.trim()}` })
      return
    }
    if (method === 'cheque') {
      onComplete({ method: 'cheque', externalRef: chequeNo.trim() })
      return
    }
    onComplete({ method, cashTendered: cash, cashAmount: 0, mpesaAmount: 0, creditName, creditPhone })
  }

  const handleStkConfirm = (ref: string, receiptNumber: string) => {
    setStkOpen(false)
    onComplete({ method: isSplit ? 'split' : 'mpesa', cashTendered: mpesaCash, cashAmount: mpesaCash, mpesaAmount, mpesaRef: receiptNumber || ref })
  }

  const handlePickerSelect = (tx: MpesaTransactionItem) => {
    setMpesaRef(tx.mpesa_receipt_number ?? '')
    if (tx.amount !== total) setMpesaCashStr(String(total - tx.amount))
    setShowPicker(false)
  }

  const canProceedRef = useRef(canProceed)
  canProceedRef.current = canProceed
  const handleChargeRef = useRef(handleCharge)
  handleChargeRef.current = handleCharge

  useEffect(() => {
    if (!open || stkOpen || showPicker) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter') { e.preventDefault(); if (canProceedRef.current()) handleChargeRef.current() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, stkOpen, showPicker])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Charge Customer</DialogTitle>
        </DialogHeader>

        {stkOpen ? (
          <StkFlow amount={mpesaAmount} orderRef={`POS-${Date.now()}`} onConfirm={handleStkConfirm} onCancel={() => setStkOpen(false)} hasDaraja={hasDaraja} />
        ) : (
          <>
            <div className="mb-4">
              <div className="text-xs text-gray-500 mb-0.5">Total Due</div>
              <div className="text-4xl font-extrabold text-gray-900">{fmtKES(total)}</div>
            </div>

            {/* ── Method tiles ── */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {methodTiles.map((m) => (
                <MethodTile key={m.id} selected={method === m.id} onClick={() => setMethod(m.id)} label={m.label}>
                  {m.tile}
                </MethodTile>
              ))}
            </div>

            {/* ── Cash ── */}
            {method === 'cash' && (
              <div>
                <Numpad value={cashStr} onChange={setCashStr} />
                <div className="mt-3.5 p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-gray-500">Tendered</span>
                    <span className="font-bold">{fmtKES(cash)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Change</span>
                    <span className={`font-bold ${change > 0 ? 'text-green-600' : ''}`}>{fmtKES(change)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── M-Pesa ── */}
            {method === 'mpesa' && (
              <div>
                {hasManual && hasStk && (
                  <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
                    <button onClick={() => setMpesaMode('manual')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${mpesaMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Manual Entry</button>
                    <button onClick={() => setMpesaMode('stk')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${mpesaMode === 'stk' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>STK Push</button>
                  </div>
                )}

                {(mpesaMode === 'manual' || (!hasStk && hasManual)) && !showPicker && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-center gap-3.5">
                      <img src="/assets/safaricom/lipa-na-mpesa.png" alt="Lipa na M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa Manual</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(mpesaAmount)}</div>
                        {isSplit && <div className="text-xs text-green-700">+ {fmtKES(mpesaCash)} cash separately</div>}
                      </div>
                    </div>
                    <Label className="mb-1.5 block">M-Pesa Reference Code *</Label>
                    <Input value={mpesaRef} onChange={(e) => setMpesaRef(e.target.value.toUpperCase())} placeholder="e.g. QH12AB3CD4" className="font-mono tracking-widest mb-1" />
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-gray-400">Ask customer for the M-Pesa confirmation SMS code</p>
                      {hasDaraja && <button onClick={() => setShowPicker(true)} className="text-xs text-green-700 font-semibold hover:underline">Select incoming payment</button>}
                    </div>
                    <Label className="mb-1.5 block">Cash from customer <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Input type="number" value={mpesaCashStr} onChange={(e) => setMpesaCashStr(e.target.value)} placeholder="0" />
                    {mpesaCash > total && <div className="text-xs text-red-600 mt-1">Cash exceeds total</div>}
                  </div>
                )}

                {showPicker && <IncomingPaymentPicker amount={total} onSelect={handlePickerSelect} onClose={() => setShowPicker(false)} />}

                {(mpesaMode === 'stk' || (!hasManual && hasStk)) && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3.5 flex items-center gap-3.5">
                      <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa STK Push</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(mpesaAmount)}</div>
                        {!hasDaraja && <div className="text-xs text-amber-700 mt-1">Simulation — configure Daraja in Settings to go live</div>}
                      </div>
                    </div>
                    <Label className="mb-1.5 block">Cash from customer <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Input type="number" value={mpesaCashStr} onChange={(e) => setMpesaCashStr(e.target.value)} placeholder="0" />
                    {mpesaCash > total && <div className="text-xs text-red-600 mt-1">Cash exceeds total</div>}
                  </div>
                )}
              </div>
            )}

            {/* ── Card ── */}
            {method === 'card' && (
              <div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3.5">
                  <CreditCard size={32} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-blue-900">Card Payment</div>
                    <div className="text-xl font-extrabold text-blue-900">{fmtKES(total)}</div>
                    <div className="text-xs text-blue-700">Process on your POS terminal, then confirm here</div>
                  </div>
                </div>
                <Label className="mb-1.5 block">Approval Code <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value.toUpperCase())} placeholder="e.g. 123456" className="font-mono" />
                <p className="text-xs text-gray-400 mt-1">From the card terminal receipt</p>
              </div>
            )}

            {/* ── Airtel Money ── */}
            {method === 'airtel' && (
              <div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3.5">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                    <span className="text-white font-black text-xs">AIR</span>
                  </div>
                  <div>
                    <div className="font-bold text-red-900">Airtel Money</div>
                    <div className="text-xl font-extrabold text-red-900">{fmtKES(total)}</div>
                    <div className="text-xs text-red-700">Customer pays via Airtel Money</div>
                  </div>
                </div>
                <Label className="mb-1.5 block">Customer Phone *</Label>
                <Input value={airtelPhone} onChange={(e) => setAirtelPhone(e.target.value)} placeholder="e.g. 0733 123 456" className="mb-3" />
                <Label className="mb-1.5 block">Confirmation Code <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value.toUpperCase())} placeholder="From customer SMS" className="font-mono" />
              </div>
            )}

            {/* ── Bank Transfer ── */}
            {method === 'bank_transfer' && (
              <div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 flex items-center gap-3.5">
                  <Landmark size={32} className="text-indigo-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-indigo-900">Bank Transfer / EFT</div>
                    <div className="text-xl font-extrabold text-indigo-900">{fmtKES(total)}</div>
                    <div className="text-xs text-indigo-700">Confirm when transfer is received</div>
                  </div>
                </div>
                <Label className="mb-1.5 block">Bank Name <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. KCB, Equity, Cooperative" className="mb-3" />
                <Label className="mb-1.5 block">Transaction Reference *</Label>
                <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value.toUpperCase())} placeholder="e.g. FT2412345678" className="font-mono" />
              </div>
            )}

            {/* ── Cheque ── */}
            {method === 'cheque' && (
              <div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center gap-3.5">
                  <FileText size={32} className="text-amber-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-amber-900">Cheque Payment</div>
                    <div className="text-xl font-extrabold text-amber-900">{fmtKES(total)}</div>
                    <div className="text-xs text-amber-700">Verify cheque before completing sale</div>
                  </div>
                </div>
                <Label className="mb-1.5 block">Cheque Number *</Label>
                <Input value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="e.g. 000123" className="font-mono mb-3" />
                <Label className="mb-1.5 block">Bank Name <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Equity Bank" />
              </div>
            )}

            {/* ── Credit ── */}
            {method === 'credit' && (
              <div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 mb-4">
                  <div className="font-semibold text-gray-900 mb-0.5">Credit Sale</div>
                  <div className="text-sm text-gray-600">Record as debt — an invoice will be printed for the customer.</div>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <Label className="mb-1.5 block">Customer Name *</Label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        className="pl-9"
                        placeholder="Search existing or type a new name…"
                        value={creditName}
                        onChange={(e) => { setCreditName(e.target.value); setCustOpen(true) }}
                        onFocus={() => setCustOpen(true)}
                        onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                        autoComplete="off"
                      />
                      {custOpen && creditName.trim().length > 0 && custMatches.length > 0 && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                          {custMatches.slice(0, 6).map((c) => (
                            <button key={c.id} type="button"
                              onMouseDown={(e) => { e.preventDefault(); setCreditName(c.name); setCreditPhone(c.phone ?? ''); setCustOpen(false) }}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                                <div className="text-[11px] text-gray-400">{c.phone ?? 'No phone'}</div>
                              </div>
                              {c.credit_balance > 0 && (
                                <span className="text-[11px] font-semibold text-amber-600 whitespace-nowrap">owes {fmtKES(c.credit_balance)}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-1.5 block">Phone Number *</Label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input className="pl-9" placeholder="e.g. 0712 345 678" value={creditPhone} onChange={(e) => setCreditPhone(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!showPicker && (
              <div className="flex gap-2 mt-5">
                <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
                <Button className="flex-1 h-11" disabled={!canProceed()} onClick={handleCharge}>
                  {method === 'mpesa' && (mpesaMode === 'stk' || (!hasManual && hasStk)) ? 'Send STK Push' : 'Complete Sale'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
