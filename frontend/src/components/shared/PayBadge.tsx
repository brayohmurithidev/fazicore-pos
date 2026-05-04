import { Badge } from '@/components/ui/badge'
import type { PaymentMethod } from '@/types'

const MAP: Record<string, [string, string]> = {
  mpesa:  ['bg-green-100 text-green-800',  'M-Pesa'],
  cash:   ['bg-gray-100 text-gray-700',    'Cash'],
  split:  ['bg-yellow-100 text-yellow-800','Split'],
  credit: ['bg-purple-100 text-purple-800','Credit'],
  other:  ['bg-blue-100 text-blue-800',    'Other'],
}

export function PayBadge({ method }: { method: PaymentMethod }) {
  const [cls, label] = MAP[method] ?? ['bg-gray-100 text-gray-700', method]
  const isMpesa = method === 'mpesa' || method === 'split'
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
