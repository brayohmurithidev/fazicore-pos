import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isTauri, convertFileSrc } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useProducts } from '@/lib/queries'
import { useOfflineStore, type LocalProduct } from '@/stores/offline'
import type { ApiProduct } from '@/types/api'

function localToApi(p: LocalProduct): ApiProduct {
  const image_url = p.local_image_path
    ? convertFileSrc(p.local_image_path)
    : p.image_url
  return {
    id: p.id,
    name: p.name,
    description: null,
    sku: p.sku,
    barcode: p.barcode,
    price: p.price,
    cost: p.cost,
    category_id: p.category_id,
    category_name: p.category_name,
    image_url,
    unit: p.unit,
    vat_rate: p.vat_rate,
    expiry_date: null,
    min_stock: p.min_stock,
    is_active: p.is_active,
    track_inventory: p.track_inventory,
    stock_quantity: p.stock_quantity,
    parent_product_id: null,
    attributes: null,
    units: [],
    created_at: '',
  }
}

/**
 * Offline-aware product source for the POS screen.
 *
 * Tauri + online  → API products (same as web)
 * Tauri + offline → SQLite local cache
 * Web             → API products always
 *
 * When coming back online in Tauri, the API query refetches automatically
 * and the background sync worker keeps SQLite current for the next outage.
 */
export function usePOSProducts(branchId?: number) {
  const qc = useQueryClient()
  const { isOnline, getProducts } = useOfflineStore()
  const useOfflineSource = isTauri() && !isOnline

  // Standard API query — runs when online or not in Tauri
  const apiQuery = useProducts(undefined, undefined, branchId)

  // SQLite query — only active when offline in Tauri
  const sqliteQuery = useQuery<ApiProduct[]>({
    queryKey: ['offline-products-local'],
    queryFn: async () => {
      const products = await getProducts()
      return products.map(localToApi)
    },
    enabled: useOfflineSource,
    staleTime: Infinity,
  })

  // When reconnecting, invalidate the API query so it refetches fresh data
  useEffect(() => {
    if (isOnline && isTauri()) {
      qc.invalidateQueries({ queryKey: ['products'] })
    }
  }, [isOnline])

  // When a background sync completes, refresh the local SQLite query
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    listen('sync-complete', () => {
      qc.invalidateQueries({ queryKey: ['offline-products-local'] })
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  if (useOfflineSource) {
    return {
      data: sqliteQuery.data ?? [],
      isLoading: sqliteQuery.isLoading,
      isOfflineSource: true,
    }
  }

  return {
    data: apiQuery.data ?? [],
    isLoading: apiQuery.isLoading,
    isOfflineSource: false,
  }
}
