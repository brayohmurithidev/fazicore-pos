import { useState, useEffect } from 'react'
import { Phone, User, CheckCircle2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Numpad } from '@/components/shared/Numpad'
import { useFeatureFlags } from '@/hooks/useFeature'
import { fmtKES } from '@/lib/data'
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

function StkFlow({ amount, onConfirm, onCancel }: {
  amount: number
  onConfirm: (ref: string) => void
  onCancel: () => void
}) {
  const [stage, setStage] = useState<'input' | 'sending' | 'waiting' | 'success' | 'failed'>('input')
  const [phone, setPhone] = useState('0712 000 000')
  const [countdown, setCountdown] = useState(20)
  const ref = `QH${Math.random().toString(36).substr(2, 8).toUpperCase()}`

  useEffect(() => {
    if (stage === 'sending') {
      const t = setTimeout(() => setStage('waiting'), 1500)
      return () => clearTimeout(t)
    }
    if (stage === 'waiting') {
      setCountdown(20)
      const iv = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(iv); setStage('success'); return 0 }
          return c - 1
        })
      }, 400)
      return () => clearInterval(iv)
    }
  }, [stage])

  if (stage === 'input') return (
    <div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-3.5 mb-5 flex gap-2.5 items-center">
        <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
        <div>
          <div className="font-bold text-green-900">M-Pesa STK Push</div>
          <div className="text-xs text-green-700">Customer gets a prompt on their phone</div>
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
      <p className="text-xs text-gray-400 mb-4">Safaricom number registered for M-Pesa</p>
      <Button className="w-full bg-[#00A550] hover:bg-[#008f45] text-white h-11" onClick={() => setStage('sending')}>
        Send STK Push
      </Button>
    </div>
  )

  if (stage === 'sending') return (
    <div className="text-center py-10">
      <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-12 w-auto mx-auto mb-4" />
      <div className="font-bold text-base mb-2">Sending request...</div>
      <div className="text-sm text-gray-500">Connecting to M-Pesa</div>
    </div>
  )

  if (stage === 'waiting') return (
    <div className="text-center py-6">
      <div className="text-5xl mb-3">📱</div>
      <div className="font-bold text-base mb-1.5">Waiting for customer...</div>
      <div className="text-sm text-gray-500 mb-4">Prompt sent to <strong>{phone}</strong></div>
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4 text-xl font-bold">{countdown}</div>
      <div className="text-xs text-gray-400 mb-4">seconds remaining</div>
      <div className="flex gap-2 mt-3">
        <Button variant="outline" className="flex-1" onClick={() => setStage('failed')}>Cancel</Button>
        <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => setStage('success')}>Simulate Success</Button>
      </div>
    </div>
  )

  if (stage === 'success') return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={30} className="text-green-600" />
      </div>
      <div className="font-bold text-lg text-green-900 mb-1.5">Payment Confirmed!</div>
      <div className="text-base mb-1">{fmtKES(amount)} received</div>
      <div className="text-xs text-gray-400 mb-5">From {phone}</div>
      <Button className="w-full h-11 bg-green-600 hover:bg-green-700" onClick={() => onConfirm(ref)}>Complete Sale</Button>
    </div>
  )

  return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <XCircle size={30} className="text-red-600" />
      </div>
      <div className="font-bold text-lg text-red-900 mb-2">Payment Failed</div>
      <div className="text-sm text-gray-500 mb-5">Customer did not complete payment</div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setStage('input')}>Try Again</Button>
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
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cashStr, setCashStr] = useState('')
  const [mpesaCashStr, setMpesaCashStr] = useState('')
  const [mpesaRef, setMpesaRef] = useState('')
  const [mpesaMode, setMpesaMode] = useState<'stk' | 'manual'>('stk')
  const [creditName, setCreditName] = useState('')
  const [creditPhone, setCreditPhone] = useState('')
  const [stkOpen, setStkOpen] = useState(false)
  const flags = useFeatureFlags()

  // Derived feature availability
  const hasManual = settings.mpesa && flags.mpesa_manual !== false
  const hasStk    = settings.mpesa && flags.mpesa_stk    !== false
  const hasMpesa  = hasManual || hasStk

  useEffect(() => {
    if (open) {
      // Reset all state on open
      setCashStr(''); setMpesaCashStr(''); setMpesaRef('')
      setCreditName(''); setCreditPhone(''); setStkOpen(false)
      // Default method to first available
      setMethod('cash')
      // Default mpesa mode to whichever is available
      setMpesaMode(hasStk ? 'stk' : 'manual')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // When mpesa mode toggles, reset mpesa fields
  useEffect(() => {
    setMpesaCashStr(''); setMpesaRef('')
  }, [mpesaMode])

  const cash = parseFloat(cashStr) || 0
  const change = method === 'cash' ? Math.max(0, cash - total) : 0
  const mpesaCash = parseFloat(mpesaCashStr) || 0
  const mpesaAmount = Math.max(0, total - mpesaCash)
  const isSplit = method === 'mpesa' && mpesaCash > 0 && mpesaMode === 'stk'

  const canProceed = () => {
    if (method === 'cash') return cash >= total
    if (method === 'mpesa') {
      const useStk = mpesaMode === 'stk' || (!hasManual && hasStk)
      if (useStk) return mpesaCash <= total
      // manual: require a ref that looks like a valid M-Pesa code
      return mpesaRef.trim().length >= 6
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
      const useStk = mpesaMode === 'stk' || (!hasManual && hasStk)
      if (useStk) { setStkOpen(true); return }
      // Manual M-Pesa — complete immediately with the ref
      onComplete({
        method: 'mpesa',
        cashTendered: 0,
        cashAmount: 0,
        mpesaAmount: total,
        mpesaRef: mpesaRef.trim(),
      })
      return
    }
    onComplete({ method, cashTendered: cash, cashAmount: 0, mpesaAmount: 0, creditName, creditPhone })
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
            onConfirm={(ref) => {
              setStkOpen(false)
              onComplete({ method: isSplit ? 'split' : 'mpesa', cashTendered: mpesaCash, cashAmount: mpesaCash, mpesaAmount, mpesaRef: ref })
            }}
            onCancel={() => setStkOpen(false)}
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
                {/* Mode toggle — only shown when both modes available */}
                {hasManual && hasStk && (
                  <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
                    <button
                      onClick={() => setMpesaMode('manual')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        mpesaMode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Manual Entry
                    </button>
                    <button
                      onClick={() => setMpesaMode('stk')}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        mpesaMode === 'stk' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      STK Push
                    </button>
                  </div>
                )}

                {/* Manual M-Pesa */}
                {(mpesaMode === 'manual' || (!hasStk && hasManual)) && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-center gap-3.5">
                      <img src="/assets/safaricom/lipa-na-mpesa.png" alt="Lipa na M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa Manual</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(total)}</div>
                        <div className="text-xs text-green-700 mt-0.5">Customer sends to your till/paybill, then share the code</div>
                      </div>
                    </div>
                    <Label className="mb-1.5 block">M-Pesa Reference Code *</Label>
                    <Input
                      value={mpesaRef}
                      onChange={(e) => setMpesaRef(e.target.value.toUpperCase())}
                      placeholder="e.g. QH12AB3CD4"
                      className="font-mono tracking-widest"
                    />
                    <p className="text-xs text-gray-400 mt-1">Ask customer for the M-Pesa confirmation SMS code</p>
                  </div>
                )}

                {/* STK Push M-Pesa */}
                {(mpesaMode === 'stk' || (!hasManual && hasStk)) && (
                  <div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3.5 flex items-center gap-3.5">
                      <img src="/assets/safaricom/M-PESA-logo.png" alt="M-Pesa" className="h-10 w-auto flex-shrink-0" />
                      <div>
                        <div className="font-bold text-green-900">M-Pesa STK Push</div>
                        <div className="text-xl font-extrabold text-green-900">{fmtKES(mpesaAmount)}</div>
                        {isSplit && <div className="text-xs text-green-700">+ {fmtKES(mpesaCash)} cash collected separately</div>}
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
                    {mpesaCash > total && (
                      <div className="text-xs text-red-600 mt-1">Cash exceeds total</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Credit ── */}
            {method === 'credit' && (
              <div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3.5 mb-4">
                  <div className="font-semibold text-purple-900 mb-0.5">Credit Sale</div>
                  <div className="text-sm text-purple-700">Record as debt — an invoice will be printed for the customer.</div>
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

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1 h-11" disabled={!canProceed()} onClick={handleCharge}>
                {method === 'mpesa' && (mpesaMode === 'stk' || (!hasManual && hasStk))
                  ? 'Send STK Push'
                  : 'Complete Sale'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
