import type { SaleInfo, Settings } from '@/types'
import { isTauri } from '@/hooks/useTauri'
import { openPrintHtml } from '@/lib/download'

export function printReceipt(sale: SaleInfo, settings: Settings) {
  void _printReceipt(sale, settings)
}

async function _printReceipt(sale: SaleInfo, settings: Settings) {
  const win = isTauri ? null : window.open('', '_blank', 'width=420,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!isTauri && !win) { window.print(); return }

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

  const receiptHtml = `<!DOCTYPE html>
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

  // Auto: a credit sale is an INVOICE → A4 letterhead layout; everything else is
  // a receipt → thermal. (An explicit A4 paper setting still forces A4 receipts.)
  const useInvoiceLayout = isCredit || isA4
  const html = useInvoiceLayout
    ? buildA4Invoice(sale, settings, { dateStr, timeStr, cur, fmt, vatTotal, showVat, discountAmt, isCredit, isCash, isMpesa, isSplit })
    : receiptHtml

  if (isTauri) {
    const label = isCredit ? `Invoice-${sale.id}` : `Receipt-${sale.id}`
    await openPrintHtml(html, label)
  } else {
    win!.document.write(html)
    win!.document.close()
    setTimeout(() => {
      win!.focus()
      win!.print()
      win!.onafterprint = () => win!.close()
    }, 250)
  }
}

interface A4Ctx {
  dateStr: string; timeStr: string; cur: string; fmt: (n: number) => string
  vatTotal: number; showVat: boolean; discountAmt: number
  isCredit: boolean; isCash: boolean; isMpesa: boolean; isSplit: boolean
}

// ── Clean A4 letterhead invoice (used when receiptPaper === 'a4') ────────────
function buildA4Invoice(sale: SaleInfo, settings: Settings, ctx: A4Ctx): string {
  const { dateStr, timeStr, cur, fmt, vatTotal, showVat, discountAmt, isCredit, isCash, isMpesa, isSplit } = ctx
  const docTitle = isCredit ? 'INVOICE' : 'SALES RECEIPT'

  const contactLines = [
    sale.branchName ? esc(sale.branchName) + (sale.branchLocation ? ` — ${esc(sale.branchLocation)}` : '') : (sale.branchLocation ? esc(sale.branchLocation) : ''),
    settings.country ? esc(settings.country) : '',
    settings.businessPhone ? `Tel: ${esc(settings.businessPhone)}` : '',
    settings.businessEmail ? esc(settings.businessEmail) : '',
  ].filter(Boolean).map((l) => `<div>${l}</div>`).join('')

  const fiscal = [
    settings.kraPin ? `PIN: <strong>${esc(settings.kraPin)}</strong>` : '',
    settings.vatNumber ? `VAT: <strong>${esc(settings.vatNumber)}</strong>` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;')

  const billTo = isCredit && sale.creditName
    ? `<div class="party-name">${esc(sale.creditName)}</div>${sale.creditPhone ? `<div class="party-line">${esc(sale.creditPhone)}</div>` : ''}`
    : `<div class="party-name">Walk-in customer</div><div class="party-line">Cash sale</div>`

  const rows = sale.items.map((it) => `
    <tr>
      <td class="num">${it.qty}</td>
      <td><span class="item-name">${esc(it.name)}</span></td>
      <td class="num">${cur} ${it.price.toLocaleString()}</td>
      <td class="num">${fmt(it.price * it.qty)}</td>
    </tr>`).join('')

  const payDetail = isCash
    ? `Cash${(sale.cashTendered ?? 0) > sale.total ? ` · Tendered ${fmt(sale.cashTendered!)} · Change ${fmt((sale.cashTendered ?? 0) - sale.total)}` : ''}`
    : isMpesa ? `M-Pesa${sale.mpesaRef ? ` · Ref ${esc(sale.mpesaRef)}` : ''}`
    : isSplit ? `Split${sale.cashAmount ? ` · Cash ${fmt(sale.cashAmount)}` : ''}${sale.mpesaAmount ? ` · M-Pesa ${fmt(sale.mpesaAmount)}` : ''}`
    : isCredit ? `Credit — amount due ${fmt(sale.total)}` : 'Other'

  const css = `
    @page { size: A4; margin: 16mm 16mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.5; }
    .num { text-align: right; white-space: nowrap; }
    .letterhead { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid #1e293b; }
    .brand-name { font-size: 22px; font-weight: 800; color: #1e293b; line-height: 1; }
    .brand-tag { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #f5a020; font-weight: 700; margin-top: 4px; }
    .brand-lines { font-size: 10px; color: #6b7280; margin-top: 8px; }
    .head-right { text-align: right; min-width: 180px; }
    .doc-title { font-size: 19px; font-weight: 800; letter-spacing: 3px; color: #1e293b; }
    .doc-no { font-size: 12px; font-weight: 700; color: #f5a020; margin-top: 2px; }
    .fiscal { font-size: 9.5px; color: #6b7280; margin-top: 8px; }
    .midrow { display: flex; justify-content: space-between; gap: 32px; margin-top: 20px; }
    .block-label { font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin-bottom: 5px; }
    .party-name { font-size: 13px; font-weight: 700; color: #111827; }
    .party-line { font-size: 10.5px; color: #4b5563; }
    .meta-row { display: flex; justify-content: space-between; gap: 24px; font-size: 10.5px; padding: 3px 0; }
    .meta-row .k { color: #9ca3af; }
    .meta-row .v { color: #111827; font-weight: 600; }
    table.items { width: 100%; border-collapse: collapse; margin-top: 24px; }
    table.items thead th { font-size: 8.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #fff; background: #1e293b; padding: 8px 10px; text-align: left; }
    table.items thead th.num { text-align: right; }
    table.items tbody td { font-size: 11px; color: #374151; padding: 9px 10px; border-bottom: 1px solid #eef0f2; vertical-align: top; }
    table.items tbody tr:nth-child(even) td { background: #fafbfc; }
    .item-name { color: #111827; font-weight: 500; }
    .totals { display: flex; justify-content: flex-end; margin-top: 16px; }
    .totals-box { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; font-size: 11px; color: #4b5563; padding: 4px 0; }
    .totals-row.total { border-top: 2px solid #1e293b; margin-top: 4px; padding-top: 8px; font-size: 14px; font-weight: 800; color: #1e293b; }
    .panel { margin-top: 20px; padding: 11px 13px; background: #f8fafc; border: 1px solid #eef0f2; border-radius: 6px; font-size: 10.5px; }
    .section-label { font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #9ca3af; margin-bottom: 5px; }
    .signoff { margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
    .sign-line { width: 200px; border-top: 1px solid #cbd5e1; padding-top: 5px; font-size: 9.5px; color: #9ca3af; }
    .terms { font-size: 9.5px; color: #6b7280; max-width: 280px; }
    .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #eef0f2; text-align: center; font-size: 9px; color: #9ca3af; }
  `

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${docTitle}</title><style>${css}</style></head>
<body>
  <div class="letterhead">
    <div>
      <div class="brand-name">${esc(settings.businessName)}</div>
      ${settings.businessType ? `<div class="brand-tag">${esc(settings.businessType)}</div>` : ''}
      <div class="brand-lines">${contactLines}</div>
    </div>
    <div class="head-right">
      <div class="doc-title">${docTitle}</div>
      <div class="doc-no">#${esc(sale.id)}</div>
      ${fiscal ? `<div class="fiscal">${fiscal}</div>` : ''}
    </div>
  </div>

  <div class="midrow">
    <div style="flex:1;">
      <div class="block-label">Billed To</div>
      ${billTo}
    </div>
    <div style="min-width:200px;">
      <div class="meta-row"><span class="k">Date</span><span class="v">${dateStr}</span></div>
      <div class="meta-row"><span class="k">Time</span><span class="v">${timeStr}</span></div>
      <div class="meta-row"><span class="k">Served by</span><span class="v">${esc(sale.cashier)}</span></div>
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th class="num" style="width:42px;">Qty</th>
      <th>Particulars</th>
      <th class="num" style="width:110px;">Unit Price</th>
      <th class="num" style="width:120px;">Amount</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals"><div class="totals-box">
    <div class="totals-row"><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
    ${discountAmt > 0 ? `<div class="totals-row"><span>Discount</span><span>−${fmt(discountAmt)}</span></div>` : ''}
    ${showVat ? `<div class="totals-row"><span>VAT (incl.)</span><span>${fmt(Math.round(vatTotal))}</span></div>` : ''}
    <div class="totals-row total"><span>Total</span><span>${fmt(sale.total)}</span></div>
  </div></div>

  <div class="panel">
    <div class="section-label">Payment</div>
    ${payDetail}
  </div>

  ${sale.notes ? `<div class="panel"><div class="section-label">Notes</div>${esc(sale.notes)}</div>` : ''}

  <div class="signoff">
    <div class="terms">${isCredit ? 'Accounts are due on demand. E.&amp;O.E.' : 'Thank you for your business. E.&amp;O.E.'}</div>
    <div class="sign-line">${isCredit ? 'Received by (sign &amp; date)' : 'Authorised signature'}</div>
  </div>

  <div class="footer">${esc(settings.businessName)}${settings.businessPhone ? ` · ${esc(settings.businessPhone)}` : ''}</div>
</body></html>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
