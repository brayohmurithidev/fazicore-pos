import { useEffect, useState, useRef } from 'react'
import { isTauri } from '@/hooks/useTauri'

export interface UpdaterState {
  available: boolean
  version: string
  notes: string
  downloading: boolean
  progress: number      // 0–100, -1 = indeterminate
  installed: boolean
  error: string | null
  dismiss: () => void
  install: () => Promise<void>
  restart: () => Promise<void>
}

export function useAppUpdater(): UpdaterState {
  const [available, setAvailable]   = useState(false)
  const [version, setVersion]       = useState('')
  const [notes, setNotes]           = useState('')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [installed, setInstalled]   = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // Keep a ref to the Update object so install() can use it without re-checking
  const updateRef = useRef<import('@tauri-apps/plugin-updater').Update | null>(null)

  useEffect(() => {
    if (!isTauri) return
    // Delay check so the app finishes loading before making network requests
    const t = setTimeout(async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (update?.available) {
          updateRef.current = update
          setVersion(update.version)
          setNotes(update.body ?? '')
          setAvailable(true)
        }
      } catch {
        // Updater is best-effort; swallow errors silently
      }
    }, 6000)
    return () => clearTimeout(t)
  }, [])

  const install = async () => {
    const update = updateRef.current
    if (!update) return
    setDownloading(true)
    setError(null)
    try {
      let downloaded = 0
      let total = 0
      await update.downloadAndInstall((ev) => {
        if (ev.event === 'Started') {
          total = ev.data.contentLength ?? 0
          setProgress(total > 0 ? 0 : -1)
        } else if (ev.event === 'Progress') {
          downloaded += ev.data.chunkLength
          setProgress(total > 0 ? Math.round((downloaded / total) * 100) : -1)
        } else if (ev.event === 'Finished') {
          setProgress(100)
        }
      })
      setInstalled(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloading(false)
    }
  }

  const restart = async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    } catch {/* ignore */}
  }

  const dismiss = () => setAvailable(false)

  return { available, version, notes, downloading, progress, installed, error, dismiss, install, restart }
}
