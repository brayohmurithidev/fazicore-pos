import { Badge } from '@/components/ui/badge'
import type { PaymentMethod } from '@/types'

const MAP: Record<string, [string, string]> = {
  mpesa:  ['bg-emerald-50 text-emerald-700',  'M-Pesa'],
  cash:   ['bg-gray-100 text-gray-700',       'Cash'],
  split:  ['bg-amber-50 text-amber-700',      'M-Pesa & Cash'],
  credit: ['bg-gray-100 text-gray-700',       'Credit'],
  other:  ['bg-gray-100 text-gray-600',       'Other'],
}

export function PayBadge({ method }: { method: PaymentMethod }) {
  const [cls, label] = MAP[method] ?? ['bg-gray-100 text-gray-700', method]
  const isMpesa = method === 'mpesa' || method === 'mpesa_cash'
  return (
    <Badge className={`${cls} flex items-center gap-1`}>
      {isMpesa && (
        <img
          src="/assets/safaricom/M-PESA-logo.png"
          alt=""
          className="h-3 w-auto inline-block"
        />
      )}
      {label}
    </Badge>
  )
}
