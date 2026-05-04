import { useState, useRef, useEffect } from 'react'
import { Bell, Package, AlertTriangle, X, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useNotifications } from '@/lib/queries'
import { useSettingsStore } from '@/stores/settings'
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const { data } = useNotifications({ enabled: settings.lowStockAlerts !== false })

  const lowCount = data?.low_stock_count ?? 0
  const outCount = data?.out_of_stock_count ?? 0
  const total = lowCount + outCount

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
      >
        <Bell size={16} className="text-gray-600" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-bold text-gray-900">Notifications</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {total === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">All clear — no alerts</div>
            ) : (
              <>
                {outCount > 0 && (
                  <div className="px-4 py-2.5 border-b border-gray-50">
                    <div className="flex items-center gap-2 text-red-700 font-semibold text-xs mb-1.5">
                      <AlertTriangle size={12} />OUT OF STOCK ({outCount})
                    </div>
                    {(data?.out_of_stock ?? []).slice(0, 5).map((item) => (
                      <div key={`${item.product_id}-${item.branch_id}`} className="flex items-center gap-2 py-1">
                        <Package size={12} className="text-red-400 shrink-0" />
                        <span className="text-xs text-gray-700 flex-1 truncate">{item.product_name}</span>
                        <span className="text-xs font-bold text-red-600">0 left</span>
                      </div>
                    ))}
                    {outCount > 5 && <div className="text-xs text-gray-400 mt-1">+{outCount - 5} more</div>}
                  </div>
                )}
                {lowCount > 0 && (
                  <div className="px-4 py-2.5">
                    <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs mb-1.5">
                      <Package size={12} />LOW STOCK ({lowCount})
                    </div>
                    {(data?.low_stock ?? []).slice(0, 5).map((item) => (
                      <div key={`${item.product_id}-${item.branch_id}`} className="flex items-center gap-2 py-1">
                        <Package size={12} className="text-amber-400 shrink-0" />
                        <span className="text-xs text-gray-700 flex-1 truncate">{item.product_name}</span>
                        <span className="text-xs font-semibold text-amber-600">{item.current_stock} / {item.min_stock}</span>
                      </div>
                    ))}
                    {lowCount > 5 && <div className="text-xs text-gray-400 mt-1">+{lowCount - 5} more</div>}
                  </div>
                )}
              </>
            )}
          </div>

          {total > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <button
                onClick={() => { navigate('/inventory'); setOpen(false) }}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors"
              >
                View all in Inventory<ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
