import type { SaleInfo, Settings } from '@/types'

// Pad a string to width: left-align text, right-align value
function row(label: string, value: string, width = 32): string {
  const gap = width - label.length - value.length
  return gap > 0 ? label + ' '.repeat(gap) + value : label.slice(0, width - value.length - 1) + ' ' + value
}

function center(text: string, width = 32): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(pad) + text
}

const DIV = '-'.repeat(32)

export function printReceipt(sale: SaleInfo, settings: Settings) {
  const win = window.open('', '_blank', 'width=300,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!win) { window.print(); return }

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  const cur = settings.currency || 'KES'
  const fmt = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`

  const vatTotal = sale.items.reduce(
    (s, i) => s + (i.vatRate > 0 ? (i.price * i.qty * i.vatRate) / (1 + i.vatRate) : 0), 0
  )
  const showVat = settings.showVat && vatTotal > 0.5
  const cartDiscount = sale.subtotal - sale.total + (showVat ? Math.round(vatTotal) : 0)

  const isCredit = sale.payment === 'credit'
  const isSplit = sale.payment === 'split'
  const isMpesa = sale.payment === 'mpesa'
  const isCash = sale.payment === 'cash'

  // ── Build lines ──────────────────────────────────────────────────────────
  const lines: string[] = []

  // Header
  lines.push(center(settings.businessName.toUpperCase()))
  if (sale.branchName) lines.push(center(sale.branchName))
  if (sale.branchLocation) lines.push(center(sale.branchLocation))
  const contact = [settings.businessPhone, settings.businessEmail].filter(Boolean).join(' | ')
  if (contact) lines.push(center(contact))
  if (settings.kraPin) lines.push(center(`KRA PIN: ${settings.kraPin}`))
  if (settings.vatNumber) lines.push(center(`VAT No: ${settings.vatNumber}`))

  lines.push(DIV)

  // Meta
  if (isCredit) lines.push('INVOICE')
  lines.push(`Receipt: #${sale.id}`)
  lines.push(`Date:    ${dateStr}  ${timeStr}`)
  lines.push(`Cashier: ${sale.cashier}`)
  if (sale.branchName && !sale.branchLocation) lines.push(`Branch:  ${sale.branchName}`)
  if (isCredit && sale.creditName) {
    lines.push(DIV)
    lines.push(`Bill To: ${sale.creditName}`)
    if (sale.creditPhone) lines.push(`         ${sale.creditPhone}`)
  }

  lines.push(DIV)

  // Items
  for (const item of sale.items) {
    lines.push(item.name)
    const qtyPrice = `  ${item.qty} x ${cur} ${item.price.toLocaleString()}`
    const lineTotal = fmt(item.price * item.qty)
    lines.push(row(qtyPrice, lineTotal))
  }

  lines.push(DIV)

  // Totals
  lines.push(row('Subtotal', fmt(sale.subtotal)))
  if (cartDiscount > 0.5) lines.push(row('Discount', `-${fmt(cartDiscount)}`))
  if (showVat) lines.push(row(`VAT (${Math.round((sale.items[0]?.vatRate ?? 0.16) * 100)}%)`, fmt(Math.round(vatTotal))))
  lines.push(DIV)
  lines.push(row('TOTAL', fmt(sale.total)))
  lines.push(DIV)

  // Payment
  if (isCash) {
    const tendered = sale.cashTendered ?? sale.cashAmount ?? sale.total
    lines.push(row('Cash', fmt(tendered)))
    if (tendered > sale.total) lines.push(row('Change', fmt(tendered - sale.total)))
  } else if (isMpesa) {
    lines.push(row('M-Pesa', fmt(sale.total)))
    if (sale.mpesaRef) lines.push(`Ref: ${sale.mpesaRef}`)
  } else if (isSplit) {
    if (sale.cashAmount) lines.push(row('Cash', fmt(sale.cashAmount)))
    if (sale.mpesaAmount) lines.push(row('M-Pesa', fmt(sale.mpesaAmount)))
    if (sale.mpesaRef) lines.push(`Ref: ${sale.mpesaRef}`)
  } else if (isCredit) {
    lines.push(row('Payment', 'CREDIT'))
  } else {
    lines.push(row('Payment', sale.payment.toUpperCase()))
  }

  if (sale.notes) {
    lines.push(DIV)
    lines.push(`Note: ${sale.notes}`)
  }

  lines.push(DIV)
  lines.push(center('Thank you for your purchase!'))
  lines.push(center('Powered by Fazi POS'))
  lines.push('')

  // ── Build HTML ────────────────────────────────────────────────────────────
  const body = lines.map((l) => `<div>${l.replace(/ /g, '&nbsp;')}</div>`).join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page { size: 58mm auto; margin: 2mm 3mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    line-height: 1.35;
    color: #000;
    background: #fff;
    width: 52mm;
  }
</style>
</head>
<body>${body}</body>
</html>`

  win.document.write(html)
  win.document.close()
  win.onload = () => { win.focus(); win.print(); win.close() }
}
