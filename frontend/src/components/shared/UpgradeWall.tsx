import { Lock, ArrowUpCircle } from 'lucide-react'

interface Props {
  feature: string
  description?: string
}

export function UpgradeWall({ feature, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-10 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center mb-5">
        <Lock size={26} className="text-amber-500" />
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-1.5">{feature} not available on your plan</h2>
      <p className="text-sm text-gray-500 mb-6 max-w-sm">
        {description ?? 'This feature is not included in your current subscription.'}
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 max-w-sm text-left flex gap-3">
        <ArrowUpCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-amber-900 mb-0.5">Upgrade your plan</div>
          <div className="text-xs text-amber-700">
            Contact your platform administrator to upgrade your subscription and unlock this feature.
          </div>
        </div>
      </div>
    </div>
  )
}
