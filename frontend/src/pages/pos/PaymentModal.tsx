import { useState, useEffect, useRef } from 'react'

declare global {
  interface Window {
    PaystackPop: {
      setup(opts: {
        key: string; email: string; amount: number; currency: string
        ref?: string; access_code?: string
        onSuccess: (tx: { reference: string }) => void
        onCancel: () => void
      }): { openIframe(): void }
    }
  }
}
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
  usePaystackPublicKey, useInitializePaystackTransaction,
  useVerifyPaystackTransaction, usePaystackMobileMoney, usePaystackMobileMoneyStatus,
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

// ── Method chip (horizontal bar) ─────────────────────────────────────────────

function MethodChip({
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
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full border-2 whitespace-nowrap transition-all shrink-0
        ${selected
          ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
        }`}
    >
      <span className="flex items-center">{children}</span>
      <span className="text-[12px] font-semibold">{label}</span>
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

// ── Paystack card checkout (Popup) ────────────────────────────────────────────

function PaystackCardFlow({
  amount, publicKey, onSuccess, onCancel,
}: {
  amount: number
  publicKey: string
  onSuccess: (reference: string) => void
  onCancel: () => void
}) {
  const [email, setEmail]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')
  const initialize          = useInitializePaystackTransaction()
  const verify              = useVerifyPaystackTransaction()

  const launch = async () => {
    if (!email.trim().includes('@')) { setError('Enter a valid email'); return }
    setBusy(true); setError('')
    try {
      const { access_code, reference } = await initialize.mutateAsync({ amount, email: email.trim() })

      // Dynamically load Paystack inline.js if not already loaded
      await new Promise<void>((resolve, reject) => {
        if (window.PaystackPop) { resolve(); return }
        const s = document.createElement('script')
        s.src = 'https://js.paystack.co/v1/inline.js'
        s.onload = () => resolve()
        s.onerror = reject
        document.head.appendChild(s)
      })

      window.PaystackPop.setup({
        key: publicKey,
        email: email.trim(),
        amount: amount * 100,
        currency: 'KES',
        ref: reference,
        access_code,
        onSuccess: async (tx: { reference: string }) => {
          try {
            const result = await verify.mutateAsync(tx.reference)
            if (result.status === 'success') onSuccess(tx.reference)
            else setError(`Payment status: ${result.status}. Please retry.`)
          } catch {
            onSuccess(tx.reference) // accept even if verify fails — Paystack webhook will reconcile
          }
        },
        onCancel: () => { setBusy(false); onCancel() },
      }).openIframe()
    } catch {
      setBusy(false)
      setError('Could not launch Paystack. Check your Paystack credentials in Settings.')
    }
  }

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center gap-3.5">
        <CreditCard size={32} className="text-blue-600 flex-shrink-0" />
        <div>
          <div className="font-bold text-blue-900">Pay by Card via Paystack</div>
          <div className="text-xl font-extrabold text-blue-900">{fmtKES(amount)}</div>
          <div className="text-xs text-blue-700">Visa · Mastercard · Verve</div>
        </div>
      </div>
      <Label className="mb-1.5 block">Customer Email *</Label>
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="customer@email.com"
        className="mb-1"
        disabled={busy}
      />
      {error && <p className="text-xs text-red-500 mt-1 mb-3">{error}</p>}
      <p className="text-xs text-gray-400 mb-4">Required by Paystack — used for the payment receipt</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button className="flex-1 bg-[#00C3F7] hover:bg-[#00aad8] text-white" onClick={launch} disabled={busy || initialize.isPending}>
          {busy ? 'Opening...' : 'Open Paystack'}
        </Button>
      </div>
    </div>
  )
}

// ── Paystack M-Pesa STK flow ──────────────────────────────────────────────────

function PaystackStkFlow({
  amount, onConfirm, onCancel,
}: {
  amount: number
  onConfirm: (reference: string) => void
  onCancel: () => void
}) {
  const [phone, setPhone]     = useState('')
  const [email, setEmail]     = useState('')
  const [ref, setRef]         = useState<string | null>(null)
  const [stage, setStage]     = useState<'input' | 'waiting' | 'success' | 'failed'>('input')
  const [errMsg, setErrMsg]   = useState('')

  const charge = usePaystackMobileMoney()
  const { data: statusData } = usePaystackMobileMoneyStatus(ref, stage === 'waiting')

  useEffect(() => {
    if (!statusData || stage !== 'waiting') return
    if (statusData.status === 'success') {
      setStage('success')
      onConfirm(statusData.reference)
    } else if (['failed', 'abandoned'].includes(statusData.status)) {
      setStage('failed')
      setErrMsg('Payment failed or was cancelled by the customer')
    }
  }, [statusData, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!phone.replace(/\s/g, '').match(/^(07|01|2547|2541)\d{8}$/)) {
      setErrMsg('Enter a valid Safaricom number'); return
    }
    if (!email.trim().includes('@')) {
      setErrMsg('Enter a valid email'); return
    }
    setErrMsg('')
    try {
      const data = await charge.mutateAsync({ phone, amount, email: email.trim() })
      setRef(data.reference)
      setStage('waiting')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setErrMsg(err?.response?.data?.detail ?? 'Could not initiate payment. Check Paystack credentials.')
    }
  }

  if (stage === 'input') return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-xl p-3.5 mb-4 flex gap-2.5 items-center">
        <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
        <div>
          <div className="font-bold text-green-900">M-Pesa via Paystack</div>
          <div className="text-xs text-green-700">Paystack triggers a payment prompt on the customer's phone</div>
        </div>
      </div>
      <div className="text-3xl font-extrabold text-center mb-4">{fmtKES(amount)}</div>
      <Label className="mb-1.5 block">Customer Phone *</Label>
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0712 345 678" className="mb-3" />
      <Label className="mb-1.5 block">Customer Email *</Label>
      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@email.com" className="mb-1" />
      <p className="text-xs text-gray-400 mb-4">Required by Paystack for the payment record</p>
      {errMsg && <p className="text-xs text-red-500 mb-3">{errMsg}</p>}
      <Button className="w-full bg-[#00A550] hover:bg-[#008f45] text-white h-11" onClick={handleSend} disabled={charge.isPending}>
        {charge.isPending ? 'Sending...' : 'Send STK Push via Paystack'}
      </Button>
    </div>
  )

  if (stage === 'waiting') return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <Wifi size={28} className="text-green-600 animate-pulse" />
      </div>
      <div className="font-bold text-base mb-1.5">Waiting for customer...</div>
      <div className="text-sm text-gray-500 mb-2">Prompt sent to <strong>{phone}</strong></div>
      <div className="text-xs text-gray-400 mb-5">This page updates automatically when payment is received</div>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
    </div>
  )

  if (stage === 'success') return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={30} className="text-green-600" />
      </div>
      <div className="font-bold text-lg text-green-900 mb-1.5">Payment Confirmed!</div>
      <div className="text-base mb-1">{fmtKES(amount)} received via M-Pesa</div>
      {ref && <div className="text-xs text-gray-400">Ref: {ref}</div>}
    </div>
  )

  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <XCircle size={30} className="text-red-600" />
      </div>
      <div className="font-bold text-lg text-red-900 mb-2">Payment Failed</div>
      <div className="text-sm text-gray-500 mb-5">{errMsg}</div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => { setStage('input'); setErrMsg('') }}>Try Again</Button>
        <Button variant="destructive" className="flex-1" onClick={onCancel}>Cancel</Button>
      </div>
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

  const [paystackStkOpen, setPaystackStkOpen]     = useState(false)
  const [mpesaProvider, setMpesaProvider]         = useState<'daraja' | 'paystack'>('daraja')

  const flags = useFeatureFlags()
  const { data: custMatches = [] } = useCustomers(
    method === 'credit' && creditName.trim().length > 0 ? creditName.trim() : undefined
  )
  const { data: darajaConfigs = [] } = useMpesaCredentials()
  const hasDaraja = !!(darajaConfigs.find((c) => c.is_live && c.is_active))
  const { data: paystackKey } = usePaystackPublicKey()
  const hasPaystack = !!paystackKey?.public_key

  const hasManual = settings.mpesaManual && flags.mpesa_manual !== false
  const hasStk    = settings.mpesaStk    && flags.mpesa_stk    !== false
  const hasMpesa  = hasManual || hasStk

  useEffect(() => {
    if (open) {
      setCashStr(''); setMpesaCashStr(''); setMpesaRef('')
      setCreditName(''); setCreditPhone(''); setExternalRef('')
      setAirtelPhone(''); setBankName(''); setChequeNo('')
      setCustOpen(false); setStkOpen(false); setShowPicker(false)
      setPaystackStkOpen(false)
      setMethod('cash')
      setMpesaMode(hasStk ? 'stk' : 'manual')
      setMpesaProvider('daraja')
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
    if (method === 'card')          return hasPaystack ? !!externalRef.trim() : true   // Paystack sets ref on success; manual terminal code is optional
    if (method === 'bank_transfer') return externalRef.trim().length > 0
    if (method === 'cheque')        return chequeNo.trim().length > 0
    return true
  }

  // Build list of enabled method tiles
  const methodTiles: { id: PaymentMethod; label: string; tile: React.ReactNode }[] = [
    {
      id: 'cash', label: 'Cash',
      tile: <Banknote size={16} className={method === 'cash' ? 'text-white' : 'text-emerald-600'} />,
    },
    ...(hasMpesa ? [{
      id: 'mpesa' as PaymentMethod, label: 'M-Pesa',
      tile: <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-4 w-auto" style={method === 'mpesa' ? { filter: 'brightness(0) invert(1)' } : undefined} />,
    }] : []),
    {
      id: 'card', label: 'Card',
      tile: <CreditCard size={16} className={method === 'card' ? 'text-white' : 'text-blue-600'} />,
    },
    {
      id: 'airtel', label: 'Airtel Money',
      tile: (
        <div className={`flex items-center justify-center w-5 h-5 rounded-full ${method === 'airtel' ? 'bg-white/20' : 'bg-red-600'}`}>
          <span className="text-white font-black text-[8px] leading-none">AIR</span>
        </div>
      ),
    },
    {
      id: 'bank_transfer', label: 'Bank Transfer',
      tile: <Landmark size={16} className={method === 'bank_transfer' ? 'text-white' : 'text-indigo-600'} />,
    },
    {
      id: 'cheque', label: 'Cheque',
      tile: <FileText size={16} className={method === 'cheque' ? 'text-white' : 'text-amber-600'} />,
    },
    ...(settings.credit && flags.credit_system !== false ? [{
      id: 'credit' as PaymentMethod, label: 'Credit',
      tile: <Phone size={16} className={method === 'credit' ? 'text-white' : 'text-slate-500'} />,
    }] : []),
  ]

  const handleCharge = () => {
    if (method === 'mpesa') {
      const stkMode = mpesaMode === 'stk' || (!hasManual && hasStk)
      if (stkMode && mpesaProvider === 'paystack' && hasPaystack) { setPaystackStkOpen(true); return }
      if (stkMode) { setStkOpen(true); return }
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
      <DialogContent className="sm:max-w-[480px] flex flex-col max-h-[92vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Charge Customer</DialogTitle>
        </DialogHeader>

        {stkOpen ? (
          <div className="overflow-y-auto flex-1 px-0.5">
            <StkFlow amount={mpesaAmount} orderRef={`POS-${Date.now()}`} onConfirm={handleStkConfirm} onCancel={() => setStkOpen(false)} hasDaraja={hasDaraja} />
          </div>
        ) : paystackStkOpen ? (
          <div className="overflow-y-auto flex-1 px-0.5">
            <PaystackStkFlow
              amount={mpesaAmount}
              onConfirm={(ref) => { setPaystackStkOpen(false); onComplete({ method: isSplit ? 'split' : 'mpesa', cashTendered: mpesaCash, cashAmount: mpesaCash, mpesaAmount, mpesaRef: ref }) }}
              onCancel={() => setPaystackStkOpen(false)}
            />
          </div>
        ) : (
          <>
            {/* Total + method chips — always visible, never scrolls */}
            <div className="shrink-0">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="text-xs text-gray-500 mb-0.5">Total Due</div>
                  <div className="text-4xl font-extrabold text-gray-900">{fmtKES(total)}</div>
                </div>
              </div>

              {/* ── Method chips ── */}
              <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none -mx-1 px-1">
                {methodTiles.map((m) => (
                  <MethodChip key={m.id} selected={method === m.id} onClick={() => setMethod(m.id)} label={m.label}>
                    {m.tile}
                  </MethodChip>
                ))}
              </div>
            </div>

            {/* Scrollable method-specific body */}
            <div className="overflow-y-auto flex-1 -mx-1 px-1">

            {/* ── Cash ── */}
            {method === 'cash' && (
              <div>
                {/* Quick amounts */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {[
                    { label: 'Exact', value: total },
                    ...([
                      Math.ceil(total / 100) * 100,
                      Math.ceil(total / 500) * 500,
                      Math.ceil(total / 1000) * 1000,
                      Math.ceil(total / 5000) * 5000,
                    ]
                      .filter((v, i, arr) => v > total && arr.indexOf(v) === i)
                      .slice(0, 3)
                      .map((v) => ({ label: fmtKES(v), value: v }))
                    ),
                  ].map(({ label, value: v }) => (
                    <button
                      key={label}
                      onClick={() => setCashStr(String(v))}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        cash === v
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Numpad value={cashStr} onChange={setCashStr} />
                {/* Tendered / Change summary */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Tendered</div>
                    <div className="text-base font-bold text-gray-900">{fmtKES(cash)}</div>
                  </div>
                  <div className={`rounded-lg px-3 py-2.5 ${change > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">Change</div>
                    <div className={`text-base font-bold ${change > 0 ? 'text-green-700' : 'text-gray-900'}`}>{fmtKES(change)}</div>
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
                    {/* Provider selector — show only if both Daraja and Paystack configured */}
                    {hasDaraja && hasPaystack && (
                      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-3">
                        <button onClick={() => setMpesaProvider('daraja')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${mpesaProvider === 'daraja' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Via Daraja</button>
                        <button onClick={() => setMpesaProvider('paystack')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${mpesaProvider === 'paystack' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Via Paystack</button>
                      </div>
                    )}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3.5 flex items-center gap-3.5">
                      <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa STK Push {hasPaystack && !hasDaraja ? '(Paystack)' : hasDaraja && hasPaystack && mpesaProvider === 'paystack' ? '(Paystack)' : ''}</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(mpesaAmount)}</div>
                        {!hasDaraja && !hasPaystack && <div className="text-xs text-amber-700 mt-1">Simulation — configure Daraja or Paystack in Settings to go live</div>}
                        {!hasDaraja && hasPaystack && <div className="text-xs text-green-700 mt-1">Powered by Paystack</div>}
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
            {method === 'card' && !hasPaystack && (
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
            {method === 'card' && hasPaystack && !externalRef && (
              <PaystackCardFlow
                amount={total}
                publicKey={paystackKey!.public_key}
                onSuccess={(ref) => setExternalRef(ref)}
                onCancel={() => {}}
              />
            )}
            {method === 'card' && hasPaystack && externalRef && (
              <div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3.5">
                  <CheckCircle2 size={32} className="text-blue-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-blue-900">Card Authorised</div>
                    <div className="text-xl font-extrabold text-blue-900">{fmtKES(total)}</div>
                    <div className="text-xs text-blue-700 font-mono mt-0.5">Ref: {externalRef}</div>
                  </div>
                </div>
                <button onClick={() => setExternalRef('')} className="text-xs text-gray-400 hover:text-gray-600 mt-2">Try a different card</button>
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

            </div>{/* end scrollable body */}

            {/* Pinned action buttons */}
            {!showPicker && !(method === 'card' && hasPaystack && !externalRef) && (
              <div className="flex gap-2 pt-3 shrink-0 border-t border-gray-100 mt-2">
                <Button variant="outline" className="flex-1 h-11" onClick={onClose}>Cancel</Button>
                <Button className="flex-1 h-11" disabled={!canProceed()} onClick={handleCharge}>
                  {method === 'mpesa' && (mpesaMode === 'stk' || (!hasManual && hasStk))
                    ? (mpesaProvider === 'paystack' && hasPaystack ? 'Send STK via Paystack' : 'Send STK Push')
                    : 'Complete Sale'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
