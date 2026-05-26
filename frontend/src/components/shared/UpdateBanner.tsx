import { Download, RefreshCw, X, Sparkles } from 'lucide-react'
import { useAppUpdater } from '@/hooks/useAppUpdater'

export function UpdateBanner() {
  const { available, version, downloading, progress, installed, error, dismiss, install, restart } = useAppUpdater()

  if (!available && !installed) return null

  // ── Restart prompt after install ──────────────────────────────────────────
  if (installed) return (
    <div className="fixed bottom-4 right-4 z-[9998] flex items-center gap-3 bg-green-900 text-white px-4 py-3 rounded-xl shadow-2xl max-w-sm">
      <RefreshCw size={16} className="shrink-0 text-green-300" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">FaziPOS {version} installed</div>
        <div className="text-xs text-green-300">Restart to apply the update</div>
      </div>
      <button
        onClick={restart}
        className="shrink-0 px-3 py-1.5 text-xs font-bold bg-green-600 hover:bg-green-500 rounded-lg transition-colors"
      >
        Restart
      </button>
    </div>
  )

  // ── Download in progress ──────────────────────────────────────────────────
  if (downloading) return (
    <div className="fixed bottom-4 right-4 z-[9998] bg-zinc-900 text-white px-4 py-3 rounded-xl shadow-2xl w-72">
      <div className="flex items-center gap-2 mb-2">
        <Download size={14} className="shrink-0 text-zinc-300 animate-bounce" />
        <span className="text-sm font-semibold">Downloading FaziPOS {version}</span>
      </div>
      <div className="w-full bg-zinc-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full bg-amber-400 transition-all duration-200 ${progress < 0 ? 'animate-pulse w-1/2' : ''}`}
          style={progress >= 0 ? { width: `${progress}%` } : undefined}
        />
      </div>
      {progress >= 0 && (
        <div className="text-xs text-zinc-400 mt-1 text-right">{progress}%</div>
      )}
    </div>
  )

  // ── Update available ──────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex items-start gap-3 bg-zinc-900 text-white px-4 py-3 rounded-xl shadow-2xl max-w-sm">
      <Sparkles size={16} className="shrink-0 text-amber-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">FaziPOS {version} available</div>
        <div className="text-xs text-zinc-400 mt-0.5">A new version is ready to install</div>
        {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={install}
            className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg transition-colors"
          >
            Update now
          </button>
          <button
            onClick={dismiss}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
          >
            Later
          </button>
        </div>
      </div>
      <button onClick={dismiss} className="shrink-0 text-zinc-500 hover:text-white transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}
