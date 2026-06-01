import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Persisted copy of the org's feature flags so plan gating still applies
 * offline. Without this, offline the flags are missing and the UI would
 * optimistically unlock every feature (e.g. a basic-plan shop seeing Branches).
 * Updated whenever /org/features is fetched online.
 */
interface FeatureState {
  flags: Record<string, boolean>
  hasData: boolean
  setFlags: (flags: Record<string, boolean>) => void
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      flags: {},
      hasData: false,
      setFlags: (flags) => set({ flags, hasData: true }),
    }),
    { name: 'fazi-features' }
  )
)
