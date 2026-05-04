import { useOrgFeatures } from '@/lib/queries'

export function useFeature(key: string): boolean {
  const { data } = useOrgFeatures()
  if (!data) return true  // optimistic: don't gate while loading
  return data[key] === true
}

export function useFeatureFlags(): Record<string, boolean> {
  const { data } = useOrgFeatures()
  return data ?? {}
}
