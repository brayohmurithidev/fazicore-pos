import { AlertTriangle, ArrowUpCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface LimitError {
  resource: string
  current: number
  max: number
}

export function parseLimitError(err: unknown): LimitError | null {
  type ErrShape = { response?: { status?: number; data?: { detail?: { code?: string; resource?: string; current?: number; max?: number } } } }
  const res = (err as ErrShape)?.response
  if (res?.status === 402 && res?.data?.detail?.code === 'limit_exceeded') {
    const d = res.data.detail!
    return { resource: d.resource ?? 'items', current: d.current ?? 0, max: d.max ?? 0 }
  }
  return null
}

const RESOURCE_LABEL: Record<string, string> = {
  branches: 'branches',
  users: 'users',
  products: 'products',
}

export function LimitReachedDialog({ limit, onClose }: { limit: LimitError | null; onClose: () => void }) {
  const label = limit ? (RESOURCE_LABEL[limit.resource] ?? limit.resource) : ''

  return (
    <Dialog open={!!limit} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Plan Limit Reached</DialogTitle>
        </DialogHeader>
        {limit && (
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <AlertTriangle size={26} className="text-amber-600" />
            </div>
            <p className="font-semibold text-gray-900 mb-1.5">
              {limit.max} {label} limit reached
            </p>
            <p className="text-sm text-gray-500 mb-4">
              You're at {limit.current}/{limit.max} {label}. Your current plan doesn't allow adding more.
            </p>
            <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2.5 mb-4 text-left">
              <ArrowUpCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
              <span>Contact your platform admin to upgrade your plan and unlock more {label}.</span>
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Got it</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
