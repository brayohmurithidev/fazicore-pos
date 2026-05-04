import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useToastStore } from '@/lib/toast'

const ICONS = {
  success: <CheckCircle2 size={17} className="text-green-400 flex-shrink-0" />,
  error:   <AlertCircle  size={17} className="text-red-400   flex-shrink-0" />,
  info:    <Info         size={17} className="text-blue-400  flex-shrink-0" />,
}

export function Toaster() {
  const { toasts, remove } = useToastStore()
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3.5 bg-gray-900 text-white rounded-2xl shadow-2xl text-sm font-medium min-w-[240px] max-w-sm"
        >
          {ICONS[t.type]}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            className="ml-1 text-white/40 hover:text-white/80 transition-colors flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
