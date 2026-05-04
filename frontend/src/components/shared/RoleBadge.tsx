import { Badge } from '@/components/ui/badge'
import type { Role } from '@/types'

const MAP: Record<Role, [string, string]> = {
  admin:   ['bg-blue-100 text-blue-800',   'Admin'],
  manager: ['bg-purple-100 text-purple-800','Manager'],
  cashier: ['bg-gray-100 text-gray-700',   'Cashier'],
  stock:   ['bg-green-100 text-green-800', 'Stock Clerk'],
}

export function RoleBadge({ role }: { role: Role }) {
  const [cls, label] = MAP[role] ?? ['bg-gray-100 text-gray-700', role]
  return <Badge className={cls}>{label}</Badge>
}
