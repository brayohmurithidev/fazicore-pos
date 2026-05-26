import { create } from 'zustand'

interface PrintPreviewState {
  html: string | null
  filename: string
  show: (html: string, filename?: string) => void
  close: () => void
}

export const usePrintPreviewStore = create<PrintPreviewState>((set) => ({
  html: null,
  filename: 'document',
  show: (html, filename = 'document') => set({ html, filename }),
  close: () => set({ html: null }),
}))
