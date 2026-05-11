import { useState, useEffect } from 'react'
import { Phone, User, CheckCircle2, XCircle, RefreshCw, Wifi } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Numpad } from '@/components/shared/Numpad'
import { useFeatureFlags } from '@/hooks/useFeature'
import { fmtKES } from '@/lib/data'
import {
  useInitiateStkPush, useStkStatus, useMpesaCredentials,
  useMpesaTransactions, type MpesaTransactionItem,
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

  // Watch for callback result
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
      // Simulate for orgs without Daraja configured
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
    } catch (e: any) {
      setErrMsg(e?.response?.data?.detail ?? 'Could not initiate STK push. Check M-Pesa settings.')
    }
  }

  if (stage === 'input') return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-3.5 mb-5 flex gap-2.5 items-center">
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
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="e.g. 0712 345 678"
        className="mb-1"
      />
      {errMsg && <p className="text-xs text-red-500 mt-1">{errMsg}</p>}
      <p className="text-xs text-gray-400 mb-4">Safaricom number registered for M-Pesa</p>
      <Button
        className="w-full bg-[#00A550] hover:bg-[#008f45] text-white h-11"
        onClick={handleSend}
        disabled={initStk.isPending}
      >
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

function IncomingPaymentPicker({
  amount,
  onSelect,
  onClose,
}: {
  amount: number
  onSelect: (tx: MpesaTransactionItem) => void
  onClose: () => void
}) {
  const { data: txs = [], isLoading, refetch } = useMpesaTransactions(true)

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-900">Incoming M-Pesa Payments</div>
          <div className="text-xs text-gray-400">Select a payment that matches {fmtKES(amount)}</div>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="px-2">
          <RefreshCw size={13} />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-xs text-gray-400 text-center py-6">Loading...</div>
      ) : txs.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          No unattached incoming payments found.<br />
          <span className="text-xs">Payments appear here when customers pay via paybill/till directly.</span>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {txs.map((tx) => {
            const matches = Math.abs(tx.amount - amount) < 1
            return (
              <button
                key={tx.id}
                onClick={() => onSelect(tx)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  matches
                    ? 'border-green-300 bg-green-50 hover:bg-green-100'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{fmtKES(tx.amount)}</div>
                    {tx.sender_name && (
                      <div className="text-xs font-medium text-gray-700 truncate">{tx.sender_name}</div>
                    )}
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

      <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onClose}>
        Back to manual entry
      </Button>
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
  const [method, setMethod]           = useState<PaymentMethod>('cash')
  const [cashStr, setCashStr]         = useState('')
  const [mpesaCashStr, setMpesaCashStr] = useState('')
  const [mpesaRef, setMpesaRef]       = useState('')
  const [mpesaMode, setMpesaMode]     = useState<'stk' | 'manual'>('stk')
  const [creditName, setCreditName]   = useState('')
  const [creditPhone, setCreditPhone] = useState('')
  const [stkOpen, setStkOpen]         = useState(false)
  const [showPicker, setShowPicker]   = useState(false)
  const flags = useFeatureFlags()
  const { data: darajaConfigs = [] }   = useMpesaCredentials()
  const darajaConfig = darajaConfigs.find((c) => c.is_live && c.is_active) ?? null
  const hasDaraja = !!darajaConfig

  const hasManual = settings.mpesaManual && flags.mpesa_manual !== false
  const hasStk    = settings.mpesaStk    && flags.mpesa_stk    !== false
  const hasMpesa  = hasManual || hasStk

  useEffect(() => {
    if (open) {
      setCashStr(''); setMpesaCashStr(''); setMpesaRef('')
      setCreditName(''); setCreditPhone('')
      setStkOpen(false); setShowPicker(false)
      setMethod('cash')
      setMpesaMode(hasStk ? 'stk' : 'manual')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setMpesaCashStr(''); setMpesaRef('')
  }, [mpesaMode])

  const cash        = parseFloat(cashStr) || 0
  const change      = method === 'cash' ? Math.max(0, cash - total) : 0
  const mpesaCash   = parseFloat(mpesaCashStr) || 0
  const mpesaAmount = Math.max(0, total - mpesaCash)
  const isSplit     = method === 'mpesa' && mpesaCash > 0

  const canProceed = () => {
    if (method === 'cash')   return cash >= total
    if (method === 'mpesa') {
      if (mpesaMode === 'stk') return mpesaCash <= total
      return mpesaRef.trim().length >= 6 && mpesaCash <= total
    }
    if (method === 'credit') return creditName.trim().length > 0 && creditPhone.trim().length > 0
    return true
  }

  const methods = [
    { id: 'cash'   as PaymentMethod, label: 'Cash',   enabled: settings.cash },
    { id: 'mpesa'  as PaymentMethod, label: 'M-Pesa', enabled: hasMpesa },
    { id: 'credit' as PaymentMethod, label: 'Credit', enabled: settings.credit && flags.credit_system !== false },
    { id: 'other'  as PaymentMethod, label: 'Other',  enabled: settings.other },
  ].filter((m) => m.enabled)

  const handleCharge = () => {
    if (method === 'mpesa') {
      if (mpesaMode === 'stk' || (!hasManual && hasStk)) { setStkOpen(true); return }
      onComplete({
        method: mpesaCash > 0 ? 'split' : 'mpesa',
        cashTendered: mpesaCash,
        cashAmount: mpesaCash,
        mpesaAmount,
        mpesaRef: mpesaRef.trim(),
      })
      return
    }
    onComplete({ method, cashTendered: cash, cashAmount: 0, mpesaAmount: 0, creditName, creditPhone })
  }

  const handleStkConfirm = (ref: string, receiptNumber: string) => {
    setStkOpen(false)
    onComplete({
      method: isSplit ? 'split' : 'mpesa',
      cashTendered: mpesaCash,
      cashAmount: mpesaCash,
      mpesaAmount,
      mpesaRef: receiptNumber || ref,
    })
  }

  const handlePickerSelect = (tx: MpesaTransactionItem) => {
    setMpesaRef(tx.mpesa_receipt_number ?? '')
    if (tx.amount !== total) setMpesaCashStr(String(total - tx.amount))
    setShowPicker(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Charge Customer</DialogTitle>
        </DialogHeader>

        {stkOpen ? (
          <StkFlow
            amount={mpesaAmount}
            orderRef={`POS-${Date.now()}`}
            onConfirm={handleStkConfirm}
            onCancel={() => setStkOpen(false)}
            hasDaraja={hasDaraja}
          />
        ) : (
          <>
            <div className="mb-5">
              <div className="text-xs text-gray-500 mb-0.5">Total Due</div>
              <div className="text-4xl font-extrabold text-gray-900">{fmtKES(total)}</div>
            </div>

            {/* Method selector */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors border ${
                    method === m.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* ── Cash ── */}
            {method === 'cash' && (
              <div>
                <Numpad value={cashStr} onChange={setCashStr} />
                <div className="mt-3.5 p-3 bg-gray-50 rounded-md">
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
                    <button
                      onClick={() => setMpesaMode('manual')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${mpesaMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Manual Entry
                    </button>
                    <button
                      onClick={() => setMpesaMode('stk')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${mpesaMode === 'stk' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      STK Push
                    </button>
                  </div>
                )}

                {/* Manual M-Pesa */}
                {(mpesaMode === 'manual' || (!hasStk && hasManual)) && !showPicker && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-center gap-3.5">
                      <img src="/assets/safaricom/lipa-na-mpesa.png" alt="Lipa na M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa Manual</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(mpesaAmount)}</div>
                        {isSplit && <div className="text-xs text-green-700">+ {fmtKES(mpesaCash)} cash collected separately</div>}
                        <div className="text-xs text-green-700 mt-0.5">Customer sends to your till/paybill, then share the code</div>
                      </div>
                    </div>

                    <Label className="mb-1.5 block">M-Pesa Reference Code *</Label>
                    <Input
                      value={mpesaRef}
                      onChange={(e) => setMpesaRef(e.target.value.toUpperCase())}
                      placeholder="e.g. QH12AB3CD4"
                      className="font-mono tracking-widest mb-1"
                    />
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-gray-400">Ask customer for the M-Pesa confirmation SMS code</p>
                      {hasDaraja && (
                        <button
                          onClick={() => setShowPicker(true)}
                          className="text-xs text-green-700 font-semibold hover:underline"
                        >
                          Select incoming payment
                        </button>
                      )}
                    </div>

                    <Label className="mb-1.5 block">
                      Cash collected from customer{' '}
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </Label>
                    <Input
                      type="number"
                      value={mpesaCashStr}
                      onChange={(e) => setMpesaCashStr(e.target.value)}
                      placeholder="0"
                    />
                    {mpesaCash > total && (
                      <div className="text-xs text-red-600 mt-1">Cash exceeds total</div>
                    )}
                  </div>
                )}

                {/* Incoming C2B picker */}
                {showPicker && (
                  <IncomingPaymentPicker
                    amount={total}
                    onSelect={handlePickerSelect}
                    onClose={() => setShowPicker(false)}
                  />
                )}

                {/* STK Push */}
                {(mpesaMode === 'stk' || (!hasManual && hasStk)) && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3.5 flex items-center gap-3.5">
                      <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa STK Push</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(mpesaAmount)}</div>
                        {isSplit && <div className="text-xs text-green-700">+ {fmtKES(mpesaCash)} cash collected separately</div>}
                        {!hasDaraja && <div className="text-xs text-amber-700 mt-1">Simulation — configure Daraja in Settings to go live</div>}
                      </div>
                    </div>
                    <Label className="mb-1.5 block">
                      Cash collected from customer{' '}
                      <span className="text-gray-400 font-normal">(optional — leave blank for full M-Pesa)</span>
                    </Label>
                    <Input
                      type="number"
                      value={mpesaCashStr}
                      onChange={(e) => setMpesaCashStr(e.target.value)}
                      placeholder="0"
                    />
                    {mpesaCash > total && <div className="text-xs text-red-600 mt-1">Cash exceeds total</div>}
                  </div>
                )}
              </div>
            )}

            {/* ── Credit ── */}
            {method === 'credit' && (
              <div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 mb-4">
                  <div className="font-semibold text-gray-900 mb-0.5">Credit Sale</div>
                  <div className="text-sm text-gray-600">Record as debt — an invoice will be printed for the customer.</div>
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <Label className="mb-1.5 block">Customer Name *</Label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input className="pl-9" placeholder="e.g. John Kamau" value={creditName} onChange={(e) => setCreditName(e.target.value)} />
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

            {/* ── Other ── */}
            {method === 'other' && (
              <div className="bg-gray-50 rounded-lg p-5 text-center">
                <div className="font-semibold mb-1">Other Payment Method</div>
                <div className="text-sm text-gray-500">Confirm {fmtKES(total)} received externally</div>
              </div>
            )}

            {!showPicker && (
              <div className="flex gap-2 mt-5">
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button
                  className="flex-1 h-11"
                  disabled={!canProceed()}
                  onClick={handleCharge}
                >
                  {method === 'mpesa' && (mpesaMode === 'stk' || (!hasManual && hasStk))
                    ? 'Send STK Push'
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
