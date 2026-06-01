import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Lets staff log in when there's no internet — but only as a FALLBACK to the
 * normal online login, so it can never make online auth worse.
 *
 * - `roster`: the org's user list, cached whenever it's fetched online, so the
 *   offline login screen can still show who can sign in.
 * - `creds`: per user, set on a successful ONLINE login — a SHA-256 of their PIN
 *   plus the tokens issued. Offline we verify the entered PIN against the hash
 *   and reuse those tokens for the session. A user must therefore have logged in
 *   online at least once on this device before they can log in offline.
 */
export interface CachedRosterUser {
  id: number
  name: string
  role: string
  branch_id: number | null
  branch_name: string | null
  avatar: string | null
  photo_url: string | null
}

interface CachedCred {
  pinHash: string
  accessToken: string
  refreshToken: string
}

interface OfflineAuthState {
  roster: Record<string, CachedRosterUser[]>
  creds: Record<string, Record<number, CachedCred>>
  setRoster: (slug: string, users: CachedRosterUser[]) => void
  rememberCred: (
    slug: string,
    userId: number,
    pinHash: string,
    accessToken: string,
    refreshToken: string,
  ) => void
}

export const useOfflineAuthStore = create<OfflineAuthState>()(
  persist(
    (set) => ({
      roster: {},
      creds: {},
      setRoster: (slug, users) =>
        set((s) => ({ roster: { ...s.roster, [slug]: users } })),
      rememberCred: (slug, userId, pinHash, accessToken, refreshToken) =>
        set((s) => ({
          creds: {
            ...s.creds,
            [slug]: { ...(s.creds[slug] ?? {}), [userId]: { pinHash, accessToken, refreshToken } },
          },
        })),
    }),
    { name: 'fazi-offline-auth' }
  )
)
