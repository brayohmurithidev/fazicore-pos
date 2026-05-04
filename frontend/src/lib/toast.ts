import { create } from 'zustand'

type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: Toast[]
  add: (message: string, type: ToastType) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, type) => {
    const id = Math.random().toString(36).slice(2, 9)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (message: string) => useToastStore.getState().add(message, 'success'),
  error: (message: string) => useToastStore.getState().add(message, 'error'),
  info: (message: string) => useToastStore.getState().add(message, 'info'),
}
