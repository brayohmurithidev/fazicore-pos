import { Badge } from '@/components/ui/badge'
import type { Role } from '@/types'

const MAP: Record<Role, [string, string]> = {
  admin:   ['bg-amber-100 text-amber-800', 'Admin'],
  manager: ['bg-gray-100 text-gray-700',   'Manager'],
  cashier: ['bg-gray-100 text-gray-600',   'Cashier'],
  stock:   ['bg-gray-100 text-gray-600',   'Stock Clerk'],
}

export function RoleBadge({ role }: { role: Role }) {
  const [cls, label] = MAP[role] ?? ['bg-gray-100 text-gray-700', role]
  return <Badge className={cls}>{label}</Badge>
}
