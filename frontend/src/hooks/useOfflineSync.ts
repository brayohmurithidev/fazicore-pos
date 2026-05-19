import { useEffect, useRef } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/auth'
import { useOfflineStore } from '@/stores/offline'

/**
 * Mount once at the app root (AppShell or equivalent).
 * - Wires browser online/offline events
 * - Keeps sync config in sync with auth state
 * - Starts the background event listener for sync-complete
 */
export function useOfflineSync() {
  const { user, accessToken, orgSlug } = useAuthStore()
  const { setSyncConfig, clearSyncConfig, init } = useOfflineStore()
  const cleanupRef = useRef<(() => void) | null>(null)

  // Wire events on mount
  useEffect(() => {
    init().then((cleanup) => { cleanupRef.current = cleanup })
    return () => { cleanupRef.current?.() }
  }, [])

  // Push auth changes into the Rust sync worker
  useEffect(() => {
    if (!isTauri()) return

    if (accessToken && orgSlug) {
      const baseUrl = import.meta.env.VITE_API_URL ?? ''
      const branchId = user?.branch ? Number(user.branch) : null
      setSyncConfig(baseUrl, accessToken, orgSlug, branchId)
    } else {
      clearSyncConfig()
    }
  }, [accessToken, orgSlug, user?.branch])
}
