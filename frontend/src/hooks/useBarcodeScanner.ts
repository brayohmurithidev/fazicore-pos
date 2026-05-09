import { useEffect, useRef } from 'react'

interface Options {
  onScan: (code: string) => void
  minLength?: number
  maxGap?: number   // max ms between chars to treat as scanner (default 50ms)
  enabled?: boolean
}

export function useBarcodeScanner({
  onScan,
  minLength = 3,
  maxGap = 50,
  enabled = true,
}: Options) {
  const buffer = useRef<{ char: string; t: number }[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const onScanRef = useRef(onScan)
  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Don't intercept inside dialogs/modals
      if ((e.target as HTMLElement)?.closest('[role="dialog"]')) return

      if (e.key === 'Enter') {
        clearTimeout(timer.current)
        const entries = buffer.current
        buffer.current = []

        if (entries.length < minLength) return

        // All inter-character gaps must be within scanner speed
        const isScanner = entries.every(
          (entry, i) => i === 0 || entry.t - entries[i - 1].t <= maxGap
        )
        if (!isScanner) return

        // Intercept — prevent Enter reaching any focused input
        e.preventDefault()
        e.stopImmediatePropagation()
        onScanRef.current(entries.map((x) => x.char).join(''))
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer.current.push({ char: e.key, t: Date.now() })
        clearTimeout(timer.current)
        // Auto-clear buffer if Enter never arrives
        timer.current = setTimeout(() => { buffer.current = [] }, 200)
      }
    }

    window.addEventListener('keydown', handler, true) // capture phase — fires before React handlers
    return () => {
      window.removeEventListener('keydown', handler, true)
      clearTimeout(timer.current)
    }
  }, [enabled, minLength, maxGap])
}
