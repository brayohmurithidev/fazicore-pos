import type { SaleInfo, Settings } from '@/types'

export function printReceipt(sale: SaleInfo, settings: Settings) {
  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!win) { window.print(); return }

  const paper = settings.receiptPaper ?? '80mm'
  const isA4 = paper === 'a4'
  const paperWidth = paper === '58mm' ? '58mm' : paper === '80mm' ? '80mm' : '210mm'
  const contentWidth = paper === '58mm' ? '52mm' : paper === '80mm' ? '74mm' : '340px'

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  const cur = settings.currency?.split('—')[0]?.trim() || 'KES'
  const fmt = (n: number) => `${cur} ${Math.round(n).toLocaleString()}`

  const vatTotal = sale.items.reduce(
    (s, i) => s + (i.vatRate > 0 ? (i.price * i.qty * i.vatRate) / (1 + i.vatRate) : 0), 0
  )
  const showVat = settings.showVat && vatTotal > 0.5
  const discountAmt = Math.round(sale.subtotal - sale.total)

  const isCredit = sale.payment === 'credit'
  const isSplit = sale.payment === 'split'
  const isMpesa = sale.payment === 'mpesa'
  const isCash = sale.payment === 'cash'

  // ── Styles ────────────────────────────────────────────────────────────────
  const baseFont = isA4 ? '11pt' : '8.5pt'
  const smallFont = isA4 ? '9.5pt' : '7.5pt'
  const titleFont = isA4 ? '15pt' : '11pt'
  const totalFont = isA4 ? '13pt' : '10pt'

  const css = `
    @page {
      size: ${isA4 ? 'A4' : `${paperWidth} auto`};
      margin: ${isA4 ? '12mm 15mm' : '2mm 3mm'};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${baseFont};
      line-height: 1.4;
    }
    .receipt {
      width: 100%;
      max-width: ${contentWidth};
      ${isA4 ? 'margin: 0 auto;' : ''}
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: 700; }
    .title  { font-size: ${titleFont}; font-weight: 700; letter-spacing: 1px; }
    .small  { font-size: ${smallFont}; }
    .divider {
      border: none;
      border-top: 1px dashed #555;
      margin: 4px 0;
    }
    .divider-solid {
      border: none;
      border-top: 2px solid #000;
      margin: 4px 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
    }
    .row .label { flex: 1; }
    .row .value { flex-shrink: 0; white-space: nowrap; }
    .item-name { font-weight: 600; }
    .item-detail { font-size: ${smallFont}; color: #333; padding-left: 4px; }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: ${totalFont};
      font-weight: 700;
      margin: 2px 0;
    }
    .footer { text-align: center; font-size: ${smallFont}; color: #555; margin-top: 6px; }
  `

  // ── Receipt content ───────────────────────────────────────────────────────
  const header = `
    <div class="center" style="margin-bottom:6px">
      <div class="title">${esc(settings.businessName.toUpperCase())}</div>
      ${sale.branchName ? `<div class="bold small">${esc(sale.branchName)}</div>` : ''}
      ${sale.branchLocation ? `<div class="small">${esc(sale.branchLocation)}</div>` : ''}
      ${settings.businessPhone ? `<div class="small">${esc(settings.businessPhone)}</div>` : ''}
      ${settings.businessEmail ? `<div class="small">${esc(settings.businessEmail)}</div>` : ''}
      ${settings.kraPin ? `<div class="small">KRA PIN: ${esc(settings.kraPin)}</div>` : ''}
      ${settings.vatNumber ? `<div class="small">VAT No: ${esc(settings.vatNumber)}</div>` : ''}
    </div>
  `

  const meta = `
    <hr class="divider">
    <div class="small" style="margin-bottom:4px">
      ${isCredit ? '<div class="bold" style="margin-bottom:2px">INVOICE</div>' : ''}
      <div class="row"><span>Receipt:</span><span>#${esc(sale.id)}</span></div>
      <div class="row"><span>Date:</span><span>${dateStr} ${timeStr}</span></div>
      <div class="row"><span>Cashier:</span><span>${esc(sale.cashier)}</span></div>
    </div>
    ${isCredit && sale.creditName ? `
      <hr class="divider">
      <div class="small" style="margin-bottom:4px">
        <div class="bold">Bill To:</div>
        <div>${esc(sale.creditName)}</div>
        ${sale.creditPhone ? `<div>${esc(sale.creditPhone)}</div>` : ''}
      </div>
    ` : ''}
  `

  const items = `
    <hr class="divider">
    ${sale.items.map((item) => `
      <div style="margin-bottom:3px">
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-detail row">
          <span>${item.qty} × ${cur} ${item.price.toLocaleString()}</span>
          <span class="bold">${fmt(item.price * item.qty)}</span>
        </div>
      </div>
    `).join('')}
  `

  const totals = `
    <hr class="divider">
    <div class="small" style="margin-bottom:2px">
      <div class="row"><span class="label">Subtotal</span><span class="value">${fmt(sale.subtotal)}</span></div>
      ${discountAmt > 0 ? `<div class="row"><span class="label">Discount</span><span class="value">-${fmt(discountAmt)}</span></div>` : ''}
      ${showVat ? `<div class="row"><span class="label">VAT (incl.)</span><span class="value">${fmt(Math.round(vatTotal))}</span></div>` : ''}
    </div>
    <hr class="divider-solid">
    <div class="total-row">
      <span>TOTAL</span><span>${fmt(sale.total)}</span>
    </div>
    <hr class="divider">
  `

  const payment = `
    <div class="small" style="margin-bottom:4px">
      ${isCash ? `
        <div class="row"><span class="label">Cash paid</span><span class="value">${fmt(sale.cashTendered ?? sale.cashAmount ?? sale.total)}</span></div>
        ${(sale.cashTendered ?? 0) > sale.total ? `<div class="row"><span class="label">Change</span><span class="value">${fmt((sale.cashTendered ?? 0) - sale.total)}</span></div>` : ''}
      ` : ''}
      ${isMpesa ? `
        <div class="row"><span class="label">M-Pesa</span><span class="value">${fmt(sale.total)}</span></div>
        ${sale.mpesaRef ? `<div class="row"><span class="label">Ref</span><span class="value">${esc(sale.mpesaRef)}</span></div>` : ''}
      ` : ''}
      ${isSplit ? `
        ${sale.cashAmount ? `<div class="row"><span class="label">Cash</span><span class="value">${fmt(sale.cashAmount)}</span></div>` : ''}
        ${sale.mpesaAmount ? `<div class="row"><span class="label">M-Pesa</span><span class="value">${fmt(sale.mpesaAmount)}</span></div>` : ''}
        ${sale.mpesaRef ? `<div class="row"><span class="label">M-Pesa Ref</span><span class="value">${esc(sale.mpesaRef)}</span></div>` : ''}
      ` : ''}
      ${isCredit ? `<div class="bold">CREDIT — Amount Due: ${fmt(sale.total)}</div>` : ''}
    </div>
  `

  const notes = sale.notes ? `
    <hr class="divider">
    <div class="small" style="font-style:italic;color:#555">Note: ${esc(sale.notes)}</div>
  ` : ''

  const footer = `
    <hr class="divider">
    <div class="footer">
      <div>Thank you for your purchase!</div>
      <div style="margin-top:2px">Powered by Fazi POS</div>
    </div>
  `

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>${css}</style>
</head>
<body>
<div class="receipt">
  ${header}${meta}${items}${totals}${payment}${notes}${footer}
</div>
</body>
</html>`

  win.document.write(html)
  win.document.close()
  setTimeout(() => {
    win.focus()
    win.print()
    win.onafterprint = () => win.close()
  }, 250)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
