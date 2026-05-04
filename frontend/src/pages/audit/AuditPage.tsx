import { useState } from 'react'
import { Shield, Search, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuditLogs } from '@/lib/queries'
import { useFeature } from '@/hooks/useFeature'
import { UpgradeWall } from '@/components/shared/UpgradeWall'
import type { ApiAuditLog } from '@/types/api'
import { cn } from '@/lib/utils'

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  login: 'bg-purple-100 text-purple-800',
  payment: 'bg-amber-100 text-amber-800',
  adjust: 'bg-orange-100 text-orange-800',
}

function actionColor(action: string) {
  const prefix = Object.keys(ACTION_COLORS).find(k => action.startsWith(k))
  return ACTION_COLORS[prefix ?? ''] ?? 'bg-gray-100 text-gray-700'
}

function LogRow({ log }: { log: ApiAuditLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = log.details && Object.keys(log.details).length > 0

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => hasDetails && setExpanded(e => !e)}
        className={cn('w-full text-left flex items-start gap-3 px-4 py-3', hasDetails && 'hover:bg-gray-50 cursor-pointer')}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', actionColor(log.action))}>
              {log.action.replace(/_/g, ' ')}
            </span>
            {log.entity_type && (
              <span className="text-xs text-gray-500">{log.entity_type}{log.entity_name ? `: ${log.entity_name}` : log.entity_id ? ` #${log.entity_id}` : ''}</span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {log.user_name || 'System'} · {new Date(log.created_at).toLocaleString('en-KE')}
          </div>
        </div>
        {hasDetails && (
          <div className="text-gray-400 shrink-0 mt-0.5">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="px-4 pb-3 border-t border-gray-100 bg-gray-50">
          <pre className="text-xs text-gray-600 mt-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export function AuditPage() {
  const hasAuditLogs = useFeature('audit_logs')
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  const { data: logs = [], isLoading } = useAuditLogs({
    action: actionFilter || undefined,
    entity_type: entityFilter || undefined,
  })

  if (!hasAuditLogs) {
    return <UpgradeWall feature="Audit Logs" description="Audit logs track every action taken by your team — create, update, delete, and payment events. Available on higher-tier plans." />
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={20} />Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">All user actions across the system</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} placeholder="Filter by action…" className="pl-8 h-8 text-sm" />
        </div>
        <Select value={entityFilter} onValueChange={(v) => setEntityFilter(v ?? '')}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All entities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All entities</SelectItem>
            <SelectItem value="product">Product</SelectItem>
            <SelectItem value="order">Order</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="inventory">Inventory</SelectItem>
            <SelectItem value="customer">Customer</SelectItem>
            <SelectItem value="branch">Branch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Shield size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No audit logs found</p>
          </div>
        ) : logs.map((log) => <LogRow key={log.id} log={log} />)}
      </div>
    </div>
  )
}
