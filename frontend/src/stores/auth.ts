import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  orgSlug: string
  lastLogin: Record<string, string>   // userId → ISO datetime
  attendanceId: number | null
  clockInTime: string | null          // ISO datetime
  login: (user: User, accessToken?: string, refreshToken?: string) => void
  logout: () => void
  setOrgSlug: (slug: string) => void
  setClockedIn: (id: number, isoTime: string) => void
  setClockOut: () => void
  updateUser: (patch: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      orgSlug: '',
      lastLogin: {},
      attendanceId: null,
      clockInTime: null,
      login: (user, accessToken, refreshToken) =>
        set((s) => ({
          user,
          accessToken: accessToken ?? null,
          refreshToken: refreshToken ?? null,
          lastLogin: { ...s.lastLogin, [String(user.id)]: new Date().toISOString() },
        })),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, attendanceId: null, clockInTime: null }),
      setOrgSlug: (slug) => set({ orgSlug: slug }),
      setClockedIn: (id, isoTime) => set({ attendanceId: id, clockInTime: isoTime }),
      setClockOut: () => set({ attendanceId: null, clockInTime: null }),
      updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
    }),
    { name: 'fazi-auth' }
  )
)
