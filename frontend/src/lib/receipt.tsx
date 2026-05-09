import { Printer, Text, Row, Line, Cut, Br, render } from 'react-thermal-printer'
import type { SaleInfo, Settings } from '@/types'

const W = 32 // character columns for 58mm paper

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 3) + '...' : s
}

function fmt(n: number, cur: string) {
  return `${cur} ${Math.round(n).toLocaleString()}`
}

export async function renderReceipt(sale: SaleInfo, settings: Settings): Promise<Uint8Array> {
  const cur = settings.currency?.split('—')[0]?.trim() || 'KES'
  const f   = (n: number) => fmt(n, cur)

  const now  = new Date()
  const date = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  const vatTotal = sale.items.reduce(
    (s, i) => s + (i.vatRate > 0 ? (i.price * i.qty * i.vatRate) / (1 + i.vatRate) : 0), 0,
  )
  const showVat     = settings.showVat && vatTotal > 0.5
  const discountAmt = Math.max(0, Math.round(sale.subtotal - sale.total))
  const tendered    = sale.cashTendered ?? sale.cashAmount ?? sale.total

  // Build VAT label: "VAT (16%)" if all taxed items share one rate, otherwise "VAT (incl.)"
  const vatRates = [...new Set(sale.items.filter(i => i.vatRate > 0).map(i => Math.round(i.vatRate * 100)))]
  const vatLabel = vatRates.length === 1 ? `VAT (${vatRates[0]}%)` : 'VAT (incl.)'

  return render(
    <Printer type="epson" width={W}>
      {/* ── Header ── */}
      <Text align="center" bold size={{ width: 2, height: 2 }}>
        {settings.businessName.toUpperCase()}
      </Text>
      {sale.branchName     && <Text align="center" bold>{clip(sale.branchName, W)}</Text>}
      {sale.branchLocation && <Text align="center">{clip(sale.branchLocation, W)}</Text>}
      {settings.businessPhone && <Text align="center">{clip(settings.businessPhone, W)}</Text>}
      {settings.businessEmail && <Text align="center">{clip(settings.businessEmail, W)}</Text>}
      {settings.kraPin    && <Text align="center">KRA PIN: {settings.kraPin}</Text>}
      {settings.vatNumber && <Text align="center">VAT: {settings.vatNumber}</Text>}

      {/* ── Meta ── */}
      <Line />
      {sale.payment === 'credit' && <Text bold>INVOICE</Text>}
      <Text>Receipt: #{sale.id}</Text>
      <Text>Date:    {date}  {time}</Text>
      <Text>Cashier: {sale.cashier}</Text>

      {sale.payment === 'credit' && sale.creditName && (
        <>
          <Line />
          <Text bold>Bill To:</Text>
          <Text>{sale.creditName}</Text>
          {sale.creditPhone && <Text>{sale.creditPhone}</Text>}
        </>
      )}

      {/* ── Items ── */}
      <Line />
      {sale.items.map((item, i) => (
        <span key={i}>
          <Text bold>{clip(item.name, W)}</Text>
          <Row
            left={`  ${item.qty} x ${cur} ${item.price.toLocaleString()}`}
            right={f(item.price * item.qty)}
          />
        </span>
      ))}

      {/* ── Totals ── */}
      <Line />
      <Row left="Subtotal" right={f(sale.subtotal)} />
      {discountAmt > 0 && <Row left="Discount" right={`-${f(discountAmt)}`} />}
      {showVat       && <Row left={vatLabel} right={f(Math.round(vatTotal))} />}
      <Line />
      {/* Double-width TOTAL — width halves to 16 effective cols */}
      <Row
        left={<Text bold size={{ width: 2, height: 1 }}>TOTAL</Text>}
        right={<Text bold size={{ width: 2, height: 1 }}>{f(sale.total)}</Text>}
      />
      <Line />

      {/* ── Payment ── */}
      {sale.payment === 'cash' && (
        <>
          <Row left="Cash" right={f(tendered)} />
          {tendered > sale.total && (
            <Row left={<Text bold>Change</Text>} right={<Text bold>{f(tendered - sale.total)}</Text>} />
          )}
        </>
      )}
      {sale.payment === 'mpesa' && (
        <>
          <Row left="M-Pesa" right={f(sale.total)} />
          {sale.mpesaRef && <Text>Ref: {sale.mpesaRef}</Text>}
        </>
      )}
      {sale.payment === 'split' && (
        <>
          {sale.cashAmount  && <Row left="Cash"   right={f(sale.cashAmount)} />}
          {sale.mpesaAmount && <Row left="M-Pesa" right={f(sale.mpesaAmount)} />}
          {sale.mpesaRef    && <Text>Ref: {sale.mpesaRef}</Text>}
        </>
      )}
      {sale.payment === 'credit' && (
        <Text bold>Amount Due: {f(sale.total)}</Text>
      )}

      {/* ── Notes ── */}
      {sale.notes && (
        <>
          <Line />
          <Text>{clip(`Note: ${sale.notes}`, W)}</Text>
        </>
      )}

      {/* ── Footer ── */}
      <Line />
      <Text align="center">Thank you for shopping with us!</Text>
      <Text align="center">Powered by Fazi POS</Text>
      {/* <Br />
      <Br />
      <Br /> */}
      <Cut />
    </Printer>,
  )
}

export async function renderTestReceipt(settings: Settings): Promise<Uint8Array> {
  const now  = new Date()
  const date = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  return render(
    <Printer type="epson" width={W}>
      <Text align="center" bold size={{ width: 2, height: 1 }}>TEST PRINT</Text>
      <Br />
      <Text align="center" bold>{clip(settings.businessName.toUpperCase(), W)}</Text>
      <Line />
      <Text>Date: {date}  {time}</Text>
      <Line />
      <Text align="center">Printer is working correctly!</Text>
      <Text align="center">Powered by Fazi POS</Text>
      <Br />
      <Br />
      <Br />
      <Cut />
    </Printer>,
  )
}
