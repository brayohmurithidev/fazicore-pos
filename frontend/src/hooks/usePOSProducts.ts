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
    is_variant: false,
    variant_count: p.variant_count ?? 0,
    variants: p.variants_json ? JSON.parse(p.variants_json) : [],
    units: [],
    created_at: '',
  }
}

/**
 * Local-first product source for the POS screen.
 *
 * In Tauri, the local SQLite cache is the PRIMARY source — it's instant and
 * never blocks on the network (critical where internet is unreliable). We show
 * SQLite as soon as it has data; the background sync worker keeps it current and
 * fires `sync-complete` to refresh it. The API query still runs online to keep
 * React Query warm and to serve the very first run before SQLite is populated.
 *
 * Tauri, SQLite has data → SQLite (online or offline)
 * Tauri, SQLite empty     → API (first run) / empty when offline
 * Web                     → API always
 */
export function usePOSProducts(branchId?: number) {
  const qc = useQueryClient()
  const { isOnline, getProducts } = useOfflineStore()
  const inTauri = isTauri()

  // API query — runs online (and on web). In Tauri it's background revalidation.
  const apiQuery = useProducts(undefined, undefined, branchId)

  // SQLite query — always active in Tauri so it's ready as the primary source.
  const sqliteQuery = useQuery<ApiProduct[]>({
    queryKey: ['offline-products-local'],
    queryFn: async () => {
      const products = await getProducts()
      return products.map(localToApi)
    },
    enabled: inTauri,
    staleTime: Infinity,
  })

  const sqliteHasData = (sqliteQuery.data?.length ?? 0) > 0
  // Prefer SQLite whenever it has data (instant, no network wait), or whenever
  // we're offline. Fall back to the API only before the first sync populates
  // SQLite, or on the web.
  const useLocal = inTauri && (sqliteHasData || !isOnline)

  // When reconnecting, refetch the API query so the background sync/refresh runs.
  useEffect(() => {
    if (isOnline && inTauri) {
      qc.invalidateQueries({ queryKey: ['products'] })
    }
  }, [isOnline])

  // When a background sync completes, refresh the local SQLite query.
  useEffect(() => {
    if (!inTauri) return
    let unlisten: (() => void) | undefined
    listen('sync-complete', () => {
      qc.invalidateQueries({ queryKey: ['offline-products-local'] })
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  if (useLocal) {
    return {
      data: sqliteQuery.data ?? [],
      isLoading: sqliteQuery.isLoading && !sqliteHasData,
      isOfflineSource: true,
    }
  }

  return {
    data: apiQuery.data ?? [],
    isLoading: apiQuery.isLoading,
    isOfflineSource: false,
  }
}
