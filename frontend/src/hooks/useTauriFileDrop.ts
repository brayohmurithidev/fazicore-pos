import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@/hooks/useTauri'

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)$/i

/**
 * Listens to Tauri's OS-level drag-drop events (files dragged from Finder /
 * Explorer) and converts the dropped path into a browser File object.
 *
 * Falls back silently when running in the browser (non-Tauri) — the caller
 * should keep HTML5 onDrop handlers in place for that case.
 *
 * @param enabled  Register the listener only when the drop zone is visible.
 * @param onFile   Called with the first image File that was dropped.
 */
export function useTauriFileDrop(
  enabled: boolean,
  onFile: (file: File) => void,
): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false)
  // Stable ref so the effect doesn't re-run when the callback identity changes
  const onFileRef = useRef(onFile)
  onFileRef.current = onFile

  useEffect(() => {
    if (!enabled || !isTauri) return

    let unlisten: (() => void) | undefined
    let cancelled = false

    const setup = async () => {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const { convertFileSrc } = await import('@tauri-apps/api/core')

      if (cancelled) return

      const webview = getCurrentWebviewWindow()
      unlisten = await webview.onDragDropEvent(async (event) => {
        const { type } = event.payload

        if (type === 'enter' || type === 'over') {
          setIsDragging(true)
        } else if (type === 'leave') {
          setIsDragging(false)
        } else if (type === 'drop') {
          setIsDragging(false)
          const paths: string[] = (event.payload as { paths: string[] }).paths ?? []
          const imagePath = paths.find((p) => IMAGE_EXTENSIONS.test(p))
          if (!imagePath) return

          try {
            const url = convertFileSrc(imagePath)
            const res = await fetch(url)
            const blob = await res.blob()
            const filename = imagePath.replace(/\\/g, '/').split('/').pop() ?? 'image'
            const mimeType = blob.type || guessMime(filename)
            const file = new File([blob], filename, { type: mimeType })
            onFileRef.current(file)
          } catch (err) {
            console.error('[TauriFileDrop] Failed to read dropped file:', err)
          }
        }
      })
    }

    setup()

    return () => {
      cancelled = true
      unlisten?.()
      setIsDragging(false)
    }
  }, [enabled])

  return { isDragging }
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  return (
    { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }[ext ?? ''] ??
    'image/jpeg'
  )
}
