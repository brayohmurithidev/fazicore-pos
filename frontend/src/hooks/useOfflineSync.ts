import { useEffect, useRef } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { useAuthStore } from '@/stores/auth'
import { useOfflineStore } from '@/stores/offline'
import { isLocalMode } from '@/lib/local-mode'

/**
 * Mount once at the app root (AppShell or equivalent).
 * - Wires browser online/offline events
 * - Keeps sync config in sync with auth state
 * - Re-syncs when admin picks a different branch at POS
 */
export function useOfflineSync() {
  const { user, accessToken, orgSlug } = useAuthStore()
  const { setSyncConfig, clearSyncConfig, init, posBranchOverride } = useOfflineStore()
  const cleanupRef = useRef<(() => void) | null>(null)

  // Wire events on mount
  useEffect(() => {
    init().then((cleanup) => { cleanupRef.current = cleanup })
    return () => { cleanupRef.current?.() }
  }, [])

  // Push auth + branch changes into the Rust sync worker.
  // For admins: use the branch they selected at POS (posBranchOverride).
  // For everyone else: use their assigned branch from the user profile.
  useEffect(() => {
    if (!isTauri() || isLocalMode) return

    if (accessToken && orgSlug) {
      const baseUrl = import.meta.env.VITE_API_URL ?? ''
      const minioPublicUrl = import.meta.env.VITE_MINIO_PUBLIC_URL ?? `${baseUrl}/`
      const isAdmin = user?.role === 'admin'
      const branchId = isAdmin
        ? posBranchOverride
        : (user?.branch ? Number(user.branch) : null)
      setSyncConfig(baseUrl, accessToken, orgSlug, branchId, minioPublicUrl)
    } else {
      clearSyncConfig()
    }
  }, [accessToken, orgSlug, user?.branch, user?.role, posBranchOverride])
}
