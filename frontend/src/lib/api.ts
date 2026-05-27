import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const MINIO_INTERNAL = 'http://minio:9000/'
const MINIO_PUBLIC = import.meta.env.VITE_MINIO_PUBLIC_URL ?? 'http://localhost:9002/'

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith(MINIO_INTERNAL)) return url.replace(MINIO_INTERNAL, MINIO_PUBLIC)
  return url
}

export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('fazi-auth')
  if (raw) {
    const state = JSON.parse(raw)?.state
    if (state?.accessToken && state.accessToken !== 'local') {
      config.headers.Authorization = `Bearer ${state.accessToken}`
    }
    if (state?.orgSlug) {
      config.headers['X-Org-Slug'] = state.orgSlug
    }
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const raw = localStorage.getItem('fazi-auth')
      if (raw) {
        const state = JSON.parse(raw)?.state
        if (state?.refreshToken) {
          try {
            const { data } = await axios.post(
              `${import.meta.env.VITE_API_URL ?? ''}/api/v1/auth/refresh`,
              { refresh_token: state.refreshToken },
            )
            // Update Zustand store so useOfflineSync re-pushes the fresh token to the Rust sync worker
            useAuthStore.getState().setTokens(data.access_token, data.refresh_token ?? null)
            original.headers.Authorization = `Bearer ${data.access_token}`
            return api(original)
          } catch {
            useAuthStore.getState().logout()
            window.location.href = '/login'
          }
        }
      }
    }
    return Promise.reject(error)
  }
)
