import { useEffect } from 'react'
import { useOrgFeatures } from '@/lib/queries'
import { useFeatureStore } from '@/stores/features'

/**
 * Effective feature flags — works online and offline.
 * Prefers the live /org/features response; persists it; falls back to the
 * persisted copy when offline so plan gating still applies.
 */
export function useFeatureFlags(): Record<string, boolean> {
  const { data } = useOrgFeatures()
  const cached = useFeatureStore((s) => s.flags)
  const setFlags = useFeatureStore((s) => s.setFlags)

  useEffect(() => {
    if (data) setFlags(data)
  }, [data, setFlags])

  return data ?? cached
}

export function useFeature(key: string): boolean {
  const flags = useFeatureFlags()
  // Stay optimistic only when we've never synced flags at all (first run before
  // any online session). Once we have a cached set, gate strictly — even offline.
  if (Object.keys(flags).length === 0) return true
  return flags[key] === true
}
