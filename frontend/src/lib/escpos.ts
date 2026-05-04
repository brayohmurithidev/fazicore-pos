import type { SaleInfo, Settings } from '@/types'

// ── ESC/POS command bytes ─────────────────────────────────────────────────────
const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

// ── Receipt builder ───────────────────────────────────────────────────────────
class Receipt {
  private buf: number[] = []

  init()               { return this.cmd(ESC, 0x40) }
  cut()                { return this.cmd(GS, 0x56, 0x42, 0x00) }
  feed(n = 3)          { return this.cmd(ESC, 0x64, n) }
  align(a: 'L'|'C'|'R') { return this.cmd(ESC, 0x61, a==='L'?0:a==='C'?1:2) }
  bold(on: boolean)    { return this.cmd(ESC, 0x45, on?1:0) }
  // h/w: 1=normal, 2=double
  size(h: 1|2, w: 1|2) { return this.cmd(GS, 0x21, ((h-1)<<4)|(w-1)) }

  text(s: string) {
    new TextEncoder().encode(s).forEach((b) => this.buf.push(b))
    return this
  }
  line(s = '')            { return this.text(s + '\n') }
  divider(w = 32)         { return this.line('-'.repeat(w)) }

  row(left: string, right: string, w = 32) {
    const gap = w - left.length - right.length
    return this.line(left + (gap > 0 ? ' '.repeat(gap) : ' ') + right)
  }

  private cmd(...bytes: number[]) { bytes.forEach((b) => this.buf.push(b)); return this }
  build() { return new Uint8Array(this.buf) }
}

// ── Port persistence across prints within the same session ───────────────────
let _port: SerialPort | null = null

export function forgetPort() { _port = null }

// ── Main ESC/POS print function ───────────────────────────────────────────────
export async function printESCPOS(sale: SaleInfo, settings: Settings): Promise<boolean> {
  if (!('serial' in navigator)) return false

  try {
    // Reuse previous port if still valid, otherwise ask the user to select
    if (!_port) {
      const saved = await navigator.serial.getPorts()
      _port = saved[0] ?? (await navigator.serial.requestPort())
    }

    if (!_port.readable) await _port.open({ baudRate: 9600 })

    const data = buildReceipt(sale, settings)
    const writer = _port.writable!.getWriter()
    await writer.write(data)
    writer.releaseLock()

    await new Promise((r) => setTimeout(r, 300))
    await _port.close()
    return true
  } catch {
    _port = null
    return false
  }
}

// ── Build ESC/POS byte sequence ───────────────────────────────────────────────
function buildReceipt(sale: SaleInfo, settings: Settings): Uint8Array {
  const W = 32 // normal-size columns on 58/80mm paper
  const cur = settings.currency?.split('—')[0]?.trim() || 'KES'
  const fmt = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`

  const now    = new Date()
  const date   = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const time   = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  const vatTotal = sale.items.reduce(
    (s, i) => s + (i.vatRate > 0 ? (i.price * i.qty * i.vatRate) / (1 + i.vatRate) : 0), 0
  )
  const showVat    = settings.showVat && vatTotal > 0.5
  const discountAmt = Math.max(0, Math.round(sale.subtotal - sale.total))

  const r = new Receipt()
  r.init()

  // ── Header ────────────────────────────────────────────────────────────────
  r.align('C')
  r.bold(true).size(2, 2).line(clip(settings.businessName.toUpperCase(), 16)).size(1, 1).bold(false)
  if (sale.branchName)      r.bold(true).line(clip(sale.branchName, W)).bold(false)
  if (sale.branchLocation)  r.line(clip(sale.branchLocation, W))
  if (settings.businessPhone) r.line(clip(settings.businessPhone, W))
  if (settings.businessEmail) r.line(clip(settings.businessEmail, W))
  if (settings.kraPin)      r.line(`KRA PIN: ${settings.kraPin}`)
  if (settings.vatNumber)   r.line(`VAT: ${settings.vatNumber}`)

  // ── Meta ──────────────────────────────────────────────────────────────────
  r.align('L').divider(W)
  if (sale.payment === 'credit') r.bold(true).line('INVOICE').bold(false)
  r.line(`Receipt: #${sale.id}`)
  r.line(`Date:    ${date}  ${time}`)
  r.line(`Cashier: ${sale.cashier}`)

  if (sale.payment === 'credit' && sale.creditName) {
    r.divider(W)
    r.bold(true).line('Bill To:').bold(false)
    r.line(sale.creditName)
    if (sale.creditPhone) r.line(sale.creditPhone)
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  r.divider(W)
  for (const item of sale.items) {
    r.bold(true).line(clip(item.name, W)).bold(false)
    r.row(`  ${item.qty} \xd7 ${cur} ${item.price.toLocaleString()}`, fmt(item.price * item.qty), W)
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  r.divider(W)
  r.row('Subtotal', fmt(sale.subtotal), W)
  if (discountAmt > 0)   r.row('Discount', `-${fmt(discountAmt)}`, W)
  if (showVat)           r.row('VAT (incl.)', fmt(Math.round(vatTotal)), W)
  r.divider(W)
  // TOTAL in double-width — W halves to 16 effective columns
  r.bold(true).size(1, 2).row('TOTAL', fmt(sale.total), 16).size(1, 1).bold(false)
  r.divider(W)

  // ── Payment ───────────────────────────────────────────────────────────────
  if (sale.payment === 'cash') {
    const tendered = sale.cashTendered ?? sale.cashAmount ?? sale.total
    r.row('Cash paid', fmt(tendered), W)
    if (tendered > sale.total) r.bold(true).row('Change', fmt(tendered - sale.total), W).bold(false)
  } else if (sale.payment === 'mpesa') {
    r.row('M-Pesa', fmt(sale.total), W)
    if (sale.mpesaRef) r.line(`Ref: ${sale.mpesaRef}`)
  } else if (sale.payment === 'split') {
    if (sale.cashAmount)  r.row('Cash', fmt(sale.cashAmount), W)
    if (sale.mpesaAmount) r.row('M-Pesa', fmt(sale.mpesaAmount), W)
    if (sale.mpesaRef)    r.line(`Ref: ${sale.mpesaRef}`)
  } else if (sale.payment === 'credit') {
    r.bold(true).line(`Amount Due: ${fmt(sale.total)}`).bold(false)
  }

  if (sale.notes) {
    r.divider(W)
    r.line(clip(`Note: ${sale.notes}`, W))
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  r.divider(W)
  r.align('C')
  r.line('Thank you for your purchase!')
  r.line('Powered by Fazi POS')
  r.feed(4).cut()

  return r.build()
}

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
