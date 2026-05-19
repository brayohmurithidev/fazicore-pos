import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Maximize2, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TitleBar() {
  // Defer construction to render time — module-level call would throw in browser
  const win = useMemo(() => getCurrentWindow(), [])
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    win.isMaximized().then(setMaximized)

    let cleanup: (() => void) | null = null
    win.onResized(async () => {
      setMaximized(await win.isMaximized())
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => { cleanup?.() }
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="h-9 flex items-center flex-shrink-0 bg-gradient-to-r from-amber-50 to-white border-b border-amber-100 select-none z-50"
    >
      {/* Brand */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 pointer-events-none"
      >
        <img src="/assets/fazistore-logo-full.svg" alt="Fazi POS" className="h-5 w-auto" />
      </div>

      {/* Drag region */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Window controls */}
      <div className="flex items-center h-full">
        <button
          onClick={() => win.minimize()}
          title="Minimize"
          className={cn(
            'w-10 h-full flex items-center justify-center',
            'text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors'
          )}
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          title={maximized ? 'Restore' : 'Maximize'}
          className={cn(
            'w-10 h-full flex items-center justify-center',
            'text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors'
          )}
        >
          {maximized ? <Square size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={() => win.close()}
          title="Close"
          className={cn(
            'w-10 h-full flex items-center justify-center',
            'text-gray-400 hover:text-white hover:bg-red-500 transition-colors'
          )}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
