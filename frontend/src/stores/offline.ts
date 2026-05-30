import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { create } from 'zustand'

export interface LocalProduct {
  id: number
  name: string
  price: number
  cost: number | null
  sku: string | null
  barcode: string | null
  unit: string
  category_id: number | null
  category_name: string | null
  stock_quantity: number
  min_stock: number
  image_url: string | null
  local_image_path: string | null
  vat_rate: number
  is_active: boolean
  track_inventory: boolean
}

export interface LocalCustomer {
  id: number
  name: string
  phone: string | null
  email: string | null
  credit_balance: number
}

export interface SyncStatus {
  pending_count: number
  failed_count: number
  products_last_sync: string | null
  customers_last_sync: string | null
}

export interface SyncResult {
  pushed: number
  push_failed: number
  products_pulled: number
  customers_pulled: number
  errors: string[]
}

interface OfflineState {
  isOnline: boolean
  isTauriApp: boolean
  syncStatus: SyncStatus | null
  isSyncing: boolean
  posBranchOverride: number | null

  setOnline: (v: boolean) => void
  setPosBranchOverride: (id: number | null) => void
  refreshSyncStatus: () => Promise<void>
  syncNow: () => Promise<SyncResult | null>

  getProducts: () => Promise<LocalProduct[]>
  getCustomers: () => Promise<LocalCustomer[]>
  createOfflineOrder: (payload: string, branchId: number | null, items: [number, number][]) => Promise<string>

  setSyncConfig: (baseUrl: string, token: string, orgSlug: string, branchId: number | null, minioPublicUrl: string) => Promise<void>
  clearSyncConfig: () => Promise<void>

  // Call once on app mount to wire online/offline events + sync-complete listener
  init: () => Promise<() => void>
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  isOnline: navigator.onLine,
  isTauriApp: isTauri(),
  syncStatus: null,
  isSyncing: false,
  posBranchOverride: null,

  setOnline: (v) => set({ isOnline: v }),
  setPosBranchOverride: (id) => set({ posBranchOverride: id }),

  refreshSyncStatus: async () => {
    if (!isTauri()) return
    try {
      const status = await invoke<SyncStatus>('db_get_sync_status')
      set({ syncStatus: status })
    } catch (e) {
      console.warn('[offline] refreshSyncStatus:', e)
    }
  },

  syncNow: async () => {
    if (!isTauri()) return null
    set({ isSyncing: true })
    try {
      const result = await invoke<SyncResult>('sync_now')
      await get().refreshSyncStatus()
      return result
    } catch (e) {
      console.warn('[offline] syncNow:', e)
      return null
    } finally {
      set({ isSyncing: false })
    }
  },

  getProducts: async () => {
    if (!isTauri()) return []
    return invoke<LocalProduct[]>('db_get_products')
  },

  getCustomers: async () => {
    if (!isTauri()) return []
    return invoke<LocalCustomer[]>('db_get_customers')
  },

  createOfflineOrder: async (payload, branchId, items) => {
    return invoke<string>('db_create_offline_order', { payload, branchId, items })
  },

  setSyncConfig: async (baseUrl, token, orgSlug, branchId, minioPublicUrl) => {
    if (!isTauri()) return
    await invoke('set_sync_config', { baseUrl, token, orgSlug, branchId, minioPublicUrl })
    // Trigger an immediate sync now that we have credentials
    get().syncNow()
  },

  clearSyncConfig: async () => {
    if (!isTauri()) return
    await invoke('clear_sync_config')
  },

  init: async () => {
    const store = get()

    const handleOnline = () => {
      set({ isOnline: true })
      // Attempt sync immediately when we come back online
      if (isTauri()) store.syncNow()
    }
    const handleOffline = () => set({ isOnline: false })

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Listen for sync-complete events from the Rust background worker
    let unlisten: (() => void) | undefined
    let unlistenExpired: (() => void) | undefined
    if (isTauri()) {
      unlisten = await listen<SyncResult>('sync-complete', () => {
        get().refreshSyncStatus()
      })
      unlistenExpired = await listen('sync-token-expired', async () => {
        // Background sync got a 401 — attempt a silent token refresh.
        // Only logout on a real auth rejection (401/403); a network error
        // means we're offline and the cashier should keep working locally.
        const { default: axios } = await import('axios')
        const raw = localStorage.getItem('fazi-auth')
        if (!raw) return
        const state = JSON.parse(raw)?.state
        if (!state?.refreshToken) {
          // No refresh token at all — session is unrecoverable.
          const { useAuthStore } = await import('@/stores/auth')
          useAuthStore.getState().logout()
          window.location.href = '/login'
          return
        }
        try {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_URL ?? ''}/api/v1/auth/refresh`,
            { refresh_token: state.refreshToken },
          )
          const { useAuthStore } = await import('@/stores/auth')
          useAuthStore.getState().setTokens(data.access_token, data.refresh_token ?? null)
        } catch (err: any) {
          const isAuthError = err?.response?.status === 401 || err?.response?.status === 403
          if (isAuthError) {
            // Refresh token itself is expired — logout is correct.
            const { useAuthStore } = await import('@/stores/auth')
            useAuthStore.getState().logout()
            window.location.href = '/login'
          }
          // Network error: we're offline. Sync config already cleared by Rust.
          // App keeps running with local SQLite data; sync resumes on reconnect.
        }
      })
      // Load initial sync status
      await store.refreshSyncStatus()
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unlisten?.()
      unlistenExpired?.()
    }
  },
}))
