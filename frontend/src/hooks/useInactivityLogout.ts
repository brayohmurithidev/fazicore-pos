import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'

const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const

export function useInactivityLogout(timeoutMs = 15 * 60 * 1000) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!user) return

    const reset = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        logout()
        navigate('/login')
      }, timeoutMs)
    }

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [user, logout, navigate, timeoutMs])
}
