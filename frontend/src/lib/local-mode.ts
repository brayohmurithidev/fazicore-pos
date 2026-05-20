import { isTauri } from '@/hooks/useTauri'

/**
 * True when the app should run fully from local SQLite with no backend.
 * Triggered by: no VITE_API_URL set, OR VITE_LOCAL_MODE=true in env.
 */
export const isLocalMode: boolean =
  isTauri &&
  (import.meta.env.VITE_LOCAL_MODE === 'true' || !import.meta.env.VITE_API_URL)
