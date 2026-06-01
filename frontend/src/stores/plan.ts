import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApiOrgInfo } from '@/types/api'

/**
 * Persisted copy of the org's plan limits so they can still be enforced when
 * the app is offline (the live /org/info call is unavailable, but the limits
 * don't change often). Updated whenever org info is fetched while online.
 *
 * A limit value of `null` means unlimited; `hasData` is false until we've
 * synced at least once.
 */
interface PlanState {
  maxBranches: number | null
  maxUsers: number | null
  maxProducts: number | null
  hasData: boolean
  setFromOrg: (o: ApiOrgInfo) => void
}

export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      maxBranches: null,
      maxUsers: null,
      maxProducts: null,
      hasData: false,
      setFromOrg: (o) =>
        set({
          maxBranches: o.max_branches,
          maxUsers: o.max_users,
          maxProducts: o.max_products,
          hasData: true,
        }),
    }),
    { name: 'fazi-plan-limits' }
  )
)
