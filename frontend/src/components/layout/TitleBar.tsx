import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Monitor, Minus, Maximize2, Square, X } from 'lucide-react'
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
      className="h-9 flex items-center flex-shrink-0 bg-gray-900 select-none z-50"
    >
      {/* Brand */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 pointer-events-none"
      >
        <div className="w-5 h-5 bg-white rounded flex items-center justify-center flex-shrink-0">
          <Monitor size={11} className="text-gray-900" />
        </div>
        <span className="text-white/60 text-[11px] font-semibold tracking-wide">
          Fazi POS
        </span>
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
            'text-white/40 hover:text-white hover:bg-white/10 transition-colors'
          )}
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          title={maximized ? 'Restore' : 'Maximize'}
          className={cn(
            'w-10 h-full flex items-center justify-center',
            'text-white/40 hover:text-white hover:bg-white/10 transition-colors'
          )}
        >
          {maximized ? <Square size={12} /> : <Maximize2 size={12} />}
        </button>
        <button
          onClick={() => win.close()}
          title="Close"
          className={cn(
            'w-10 h-full flex items-center justify-center',
            'text-white/40 hover:text-white hover:bg-red-600 transition-colors'
          )}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  )
}
