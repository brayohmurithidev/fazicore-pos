import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, MessageSquare, Loader2 } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings'
import { printReceipt } from '@/lib/print'
import { printESCPOS } from '@/lib/escpos'
import { isTauri } from '@/hooks/useTauri'
import { toast } from '@/lib/toast'
import type { SaleInfo } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  sale: SaleInfo | null
}

export function ReceiptModal({ open, onClose, sale }: Props) {
  const { settings } = useSettingsStore()
  const [printing, setPrinting] = useState(false)

  async function handlePrint() {
    if (!sale) return
    setPrinting(true)
    try {
      if (isTauri) {
        if (sale.payment === 'credit') {
          // Invoice: show preview modal so user can download PDF
          printReceipt(sale, settings)
          printESCPOS(sale, settings).catch(() => {})
        } else {
          // Receipt: ESC/POS only — no preview modal needed
          const ok = await printESCPOS(sale, settings)
          if (!ok) toast.error('No printer connected. Check Settings → Printer.')
        }
      } else {
        const ok = await printESCPOS(sale, settings)
        if (!ok) printReceipt(sale, settings)
      }
    } catch {
      if (sale.payment === 'credit' || !isTauri) printReceipt(sale, settings)
    } finally {
      setPrinting(false)
    }
  }
  if (!sale) return null

  const biz = {
    name: settings.businessName || 'My Business',
    type: settings.businessType || '',
    email: settings.businessEmail || '',
    phone: settings.businessPhone || '',
    pin: settings.kraPin || '',
    vatNo: settings.vatNumber || '',
  }

  const isCredit = sale.payment === 'credit'
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
  const vatTotal = sale.items.reduce((s, i) => s + (i.vatRate > 0 ? i.price * i.qty * i.vatRate / (1 + i.vatRate) : 0), 0)
  const vatRates = [...new Set(sale.items.filter(i => i.vatRate > 0).map(i => Math.round(i.vatRate * 100)))]
  const vatLabel = vatRates.length === 1 ? `VAT (${vatRates[0]}%)` : 'VAT (incl.)'
  const showVat = settings.showVat && vatTotal > 0
  const showLogo = settings.showLogo
  const showSms = settings.smsReceipt

  if (isCredit) return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
        <div className="border border-gray-200 rounded-lg p-7 mb-4 bg-white receipt-print">
          <div className="flex justify-between items-start mb-5">
            <div>
              {showLogo && (
                <div className="w-14 h-14 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center mb-2 text-[10px] font-bold text-gray-400 tracking-widest">LOGO</div>
              )}
              <div className="font-extrabold text-lg text-gray-900 mb-0.5 leading-tight">{biz.name}</div>
              {sale.branchName && <div className="text-sm font-semibold text-gray-700">{sale.branchName}</div>}
              {sale.branchLocation && <div className="text-xs text-gray-500">{sale.branchLocation}</div>}
              {(biz.phone || biz.email) && (
                <div className="text-xs text-gray-500">
                  {[biz.phone, biz.email].filter(Boolean).join(' | ')}
                </div>
              )}
              {biz.pin && <div className="text-xs text-gray-500">KRA PIN: {biz.pin}</div>}
              {biz.vatNo && <div className="text-xs text-gray-500">VAT: {biz.vatNo}</div>}
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-gray-900 tracking-tight">INVOICE</div>
              <div className="text-xs text-gray-500 mt-1">#{sale.id}</div>
              <div className="text-xs text-gray-500">{dateStr} · {timeStr}</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-md px-3.5 py-2.5 mb-5">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Bill To</div>
            <div className="font-bold text-sm text-gray-900">{sale.creditName}</div>
            <div className="text-sm text-gray-500">{sale.creditPhone}</div>
          </div>
          <table className="w-full text-sm mb-4 border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-1.5 font-bold">Item</th>
                <th className="text-right py-1.5 font-bold">Qty</th>
                <th className="text-right py-1.5 font-bold">Unit</th>
                <th className="text-right py-1.5 font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">{item.name}</td>
                  <td className="py-2 text-right text-gray-700">{item.qty}</td>
                  <td className="py-2 text-right text-gray-700">KES {item.price.toLocaleString()}</td>
                  <td className="py-2 text-right font-semibold">KES {(item.price * item.qty).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <div className="w-56 text-sm">
              <div className="flex justify-between mb-0.5">
                <span>Subtotal</span><span>KES {sale.subtotal.toLocaleString()}</span>
              </div>
              {showVat && (
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>{vatLabel}</span><span>KES {Math.round(vatTotal).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-base border-t-2 border-gray-900 mt-2 pt-2">
                <span>Total Due</span><span>KES {sale.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
          {sale.notes && (
            <div className="mt-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
              <span className="font-semibold text-gray-700">Note: </span>{sale.notes}
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between text-[11px] text-gray-400">
            <span>Cashier: {sale.cashier}</span>
            <span>Powered by Fazi POS</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handlePrint} disabled={printing}>
            {printing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Printer size={14} className="mr-2" />} Print Invoice
          </Button>
          {showSms && (
            <Button variant="outline" className="flex-1" onClick={() => alert('SMS receipt feature coming soon')}>
              <MessageSquare size={14} className="mr-2" /> Send SMS
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>New Sale</Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  const rc = { fontFamily: "'Courier New', monospace", fontSize: 12 }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Receipt Preview</DialogTitle></DialogHeader>
        <div className="flex justify-center mb-4">
          <div style={{ ...rc, background: '#fff', border: '1px solid #ddd', padding: '20px 24px', width: 280, boxShadow: '2px 2px 8px rgba(0,0,0,0.08)' }} className="receipt-print">
            <div className="text-center mb-2.5" style={rc}>
              {showLogo && (
                <div style={{ width: 48, height: 48, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: 9, fontWeight: 700, color: '#9ca3af', letterSpacing: 2 }}>LOGO</div>
              )}
              <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: 1 }}>{biz.name.toUpperCase()}</div>
              {sale.branchName && <div style={{ fontSize: 12, fontWeight: 600 }}>{sale.branchName}</div>}
              {sale.branchLocation && <div style={{ fontSize: 11 }}>{sale.branchLocation}</div>}
              {(biz.phone || biz.email) && (
                <div style={{ fontSize: 11 }}>{[biz.phone, biz.email].filter(Boolean).join(' | ')}</div>
              )}
              {biz.pin && <div style={{ fontSize: 11 }}>KRA PIN: {biz.pin}</div>}
              {biz.vatNo && <div style={{ fontSize: 11 }}>VAT: {biz.vatNo}</div>}
            </div>
            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            <div style={{ fontSize: 11, marginBottom: 6 }}>
              <div>Receipt: #{sale.id}</div>
              <div>Date: {dateStr} {timeStr}</div>
              <div>Cashier: {sale.cashier}</div>
              {sale.branchName && <div>Branch: {sale.branchName}</div>}
            </div>
            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            {sale.items.map((item, i) => (
              <div key={i} style={{ marginBottom: 3 }}>
                <div style={{ fontWeight: 600 }}>{item.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span>{item.qty} x KES {item.price.toLocaleString()}</span>
                  <span>KES {(item.qty * item.price).toLocaleString()}</span>
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Subtotal</span><span>KES {sale.subtotal.toLocaleString()}</span></div>
            {showVat && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{vatLabel}</span><span>KES {Math.round(vatTotal).toLocaleString()}</span></div>}
            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
              <span>TOTAL</span><span>KES {sale.total.toLocaleString()}</span>
            </div>
            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            {sale.payment === 'split' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Cash</span><span>KES {(sale.cashAmount || 0).toLocaleString()}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>M-Pesa</span><span>KES {(sale.mpesaAmount || 0).toLocaleString()}</span></div>
                {sale.mpesaRef && <div style={{ fontSize: 10 }}>Ref: {sale.mpesaRef}</div>}
              </>
            )}
            {sale.payment === 'mpesa' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>M-Pesa</span><span>KES {sale.total.toLocaleString()}</span></div>
                {sale.mpesaRef && <div style={{ fontSize: 10 }}>Ref: {sale.mpesaRef}</div>}
              </>
            )}
            {sale.payment === 'cash' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Cash</span><span>KES {(sale.cashTendered || sale.total).toLocaleString()}</span></div>
                {(sale.cashTendered || 0) > sale.total && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>Change</span><span>KES {((sale.cashTendered || 0) - sale.total).toLocaleString()}</span></div>
                )}
              </>
            )}
            {sale.notes && (
              <>
                <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
                <div style={{ fontSize: 11, fontStyle: 'italic', color: '#555' }}>Note: {sale.notes}</div>
              </>
            )}
            <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
            <div style={{ textAlign: 'center', fontSize: 11, marginTop: 6 }}>
              <div>Thank you for shopping with us!</div>
              <div style={{ marginTop: 4 }}>Powered by Fazi POS</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handlePrint} disabled={printing}>
            {printing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Printer size={14} className="mr-2" />} Print Receipt
          </Button>
          {showSms && (
            <Button variant="outline" className="flex-1" onClick={() => alert('SMS receipt feature coming soon')}>
              <MessageSquare size={14} className="mr-2" /> Send SMS
            </Button>
          )}
          <Button className="flex-1" onClick={onClose}>New Sale</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
