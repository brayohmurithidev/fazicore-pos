import { useEffect } from 'react'
import { useOrgInfo } from '@/lib/queries'
import { usePlanStore } from '@/stores/plan'

/**
 * Effective plan limits that work online AND offline.
 * Prefers the live /org/info response; falls back to the persisted copy when
 * offline. Each value is: a number (finite limit), `null` (unlimited), or
 * `undefined` (never synced — unknown).
 */
export function usePlanLimits() {
  const { data: orgInfo } = useOrgInfo()
  const setFromOrg = usePlanStore((s) => s.setFromOrg)
  const hasData = usePlanStore((s) => s.hasData)
  const cachedBranches = usePlanStore((s) => s.maxBranches)
  const cachedUsers = usePlanStore((s) => s.maxUsers)
  const cachedProducts = usePlanStore((s) => s.maxProducts)

  // Keep the persisted copy fresh whenever we have a live response.
  useEffect(() => {
    if (orgInfo) setFromOrg(orgInfo)
  }, [orgInfo, setFromOrg])

  if (orgInfo) {
    return {
      maxBranches: orgInfo.max_branches,
      maxUsers: orgInfo.max_users,
      maxProducts: orgInfo.max_products,
    }
  }
  if (hasData) {
    return { maxBranches: cachedBranches, maxUsers: cachedUsers, maxProducts: cachedProducts }
  }
  return {
    maxBranches: undefined as number | null | undefined,
    maxUsers: undefined as number | null | undefined,
    maxProducts: undefined as number | null | undefined,
  }
}

/** A finite limit that's been reached. null (unlimited) / undefined (unknown) → false. */
export function atPlanLimit(max: number | null | undefined, count: number): boolean {
  return typeof max === 'number' && count >= max
}
