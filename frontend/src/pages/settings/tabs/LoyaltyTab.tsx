import { useState, useEffect } from 'react'
import { Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLoyaltySettings, useUpdateLoyaltySettings } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

// Moved here from the standalone /loyalty page — content unchanged, just
// dropped the page-level header since the Settings tab nav already labels it.

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0',
        value ? 'bg-amber-500' : 'bg-gray-300'
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
        value ? 'translate-x-6' : 'translate-x-1'
      )} />
    </button>
  )
}

export function LoyaltyTab() {
  const { data: settings, isLoading } = useLoyaltySettings()
  const update = useUpdateLoyaltySettings()

  const [enabled, setEnabled]               = useState(false)
  const [pointsPerKes, setPointsPerKes]     = useState('1')
  const [kesPerPoint, setKesPerPoint]       = useState('1')
  const [minRedeemPoints, setMinRedeemPoints] = useState('100')
  const [dirty, setDirty]                   = useState(false)

  useEffect(() => {
    if (!settings) return
    setEnabled(settings.enabled)
    setPointsPerKes(String(settings.points_per_kes))
    setKesPerPoint(String(settings.kes_per_point))
    setMinRedeemPoints(String(settings.min_redeem_points))
    setDirty(false)
  }, [settings])

  const mark = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true) }

  const handleSave = async () => {
    const pke = parseFloat(pointsPerKes)
    const kpp = parseFloat(kesPerPoint)
    const mrp = parseInt(minRedeemPoints)
    if (!pke || pke <= 0 || !kpp || kpp <= 0 || !mrp || mrp < 1) {
      toast.error('All rates must be positive numbers')
      return
    }
    try {
      await update.mutateAsync({ enabled, points_per_kes: pke, kes_per_point: kpp, min_redeem_points: mrp })
      toast.success('Loyalty settings saved')
      setDirty(false)
    } catch {
      toast.error('Failed to save settings')
    }
  }

  // Preview calculations
  const pke = parseFloat(pointsPerKes) || 1
  const kpp = parseFloat(kesPerPoint) || 1
  const mrp = parseInt(minRedeemPoints) || 100
  const exampleSpend = 1000
  const earnedPoints = Math.floor(exampleSpend * pke)
  const redeemValue = mrp * kpp

  if (isLoading) return (
    <div className="flex items-center justify-center h-32">
      <Loader2 size={20} className="animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl">
      {dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={update.isPending} className="gap-1.5 bg-amber-500 hover:bg-amber-600">
            {update.isPending && <Loader2 size={13} className="animate-spin" />}Save Changes
          </Button>
        </div>
      )}

      {/* Enable / disable */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', enabled ? 'bg-amber-100' : 'bg-gray-100')}>
              <Star size={20} className={enabled ? 'text-amber-600' : 'text-gray-400'} />
            </div>
            <div>
              <div className="font-semibold text-gray-900">Loyalty Points</div>
              <div className="text-xs text-gray-500 mt-0.5">{enabled ? 'Customers earn and redeem points at checkout' : 'Disabled — no points earned or redeemed'}</div>
            </div>
          </div>
          <Toggle value={enabled} onChange={mark(setEnabled)} />
        </div>
      </div>

      {/* Rates */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <div className="text-sm font-bold text-gray-900">Earn & Redeem Rates</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Points earned per KES spent</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={pointsPerKes}
                onChange={(e) => { setPointsPerKes(e.target.value); setDirty(true) }}
                className="w-28"
              />
              <span className="text-sm text-gray-500">pts / KES 1</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">e.g. 1 = one point per shilling spent</p>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">KES value per point redeemed</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={kesPerPoint}
                onChange={(e) => { setKesPerPoint(e.target.value); setDirty(true) }}
                className="w-28"
              />
              <span className="text-sm text-gray-500">KES / pt</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">e.g. 0.50 = 50 cents per point</p>
          </div>
        </div>

        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Minimum points to redeem</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              step="1"
              value={minRedeemPoints}
              onChange={(e) => { setMinRedeemPoints(e.target.value); setDirty(true) }}
              className="w-28"
            />
            <span className="text-sm text-gray-500">points</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Customer needs at least this many points to redeem at checkout</p>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-1.5">
        <div className="text-sm font-semibold text-gray-900 mb-1">Example</div>
        <div>Spend <strong className="text-gray-900">KES {exampleSpend.toLocaleString()}</strong> → earn <strong className="text-gray-900">{earnedPoints.toLocaleString()} pts</strong></div>
        <div>Redeem <strong className="text-gray-900">{mrp.toLocaleString()} pts</strong> → save <strong className="text-gray-900">KES {redeemValue.toLocaleString()}</strong></div>
        <div>Minimum to redeem: <strong className="text-gray-900">{mrp.toLocaleString()} points</strong></div>
      </div>

      <p className="text-xs text-gray-400 pb-4">
        Points balances per customer are tracked in the Customers page. Points are earned automatically at checkout when the loyalty program is active.
      </p>
    </div>
  )
}
