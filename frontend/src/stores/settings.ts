import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_SETTINGS } from '@/lib/data'
import type { Settings } from '@/types'
import type { ApiOrgInfo } from '@/types/api'

interface SettingsState {
  settings: Settings
  seededOrgSlug: string | null   // tracks which org these settings were seeded for
  update: (patch: Partial<Settings>) => void
  seedFromOrg: (orgInfo: ApiOrgInfo) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      seededOrgSlug: null,
      update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      seedFromOrg: (orgInfo) => {
        if (get().seededOrgSlug === orgInfo.slug) return
        set({
          seededOrgSlug: orgInfo.slug,
          settings: {
            ...DEFAULT_SETTINGS,
            businessName: orgInfo.name,
            businessEmail: orgInfo.email ?? '',
            businessPhone: orgInfo.phone ?? '',
            country: orgInfo.country ?? DEFAULT_SETTINGS.country,
            currency: orgInfo.currency ?? DEFAULT_SETTINGS.currency,
          },
        })
      },
    }),
    { name: 'fazi-settings' }
  )
)
