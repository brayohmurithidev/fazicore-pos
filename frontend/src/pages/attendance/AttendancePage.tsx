import { useState } from 'react'
import { Clock, Loader2, LogIn, LogOut, CalendarDays, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAttendanceList } from '@/lib/queries'
import type { ApiAttendance } from '@/types/api'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtKES = (n: number) => `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
}

function shiftDuration(clockIn: string, clockOut: string | null): string {
  if (!clockOut) return 'Active'
  const mins = Math.round((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── Shift card ────────────────────────────────────────────────────────────────

function ShiftCard({ record }: { record: ApiAttendance }) {
  const active = !record.clock_out
  const duration = shiftDuration(record.clock_in, record.clock_out)

  return (
    <div className={cn(
      'bg-white border rounded-xl p-4 transition-colors',
      active ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'
    )}>
      <div className="flex items-start justify-between gap-3">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
            active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          )}>
            {record.user_name ? record.user_name.charAt(0).toUpperCase() : <User size={16} />}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-gray-900 truncate">
              {record.user_name ?? `User #${record.user_id}`}
            </div>
            {active && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Clocked In
              </span>
            )}
          </div>
        </div>

        {/* Duration */}
        <div className="text-right shrink-0">
          <div className={cn('text-lg font-bold', active ? 'text-green-700' : 'text-gray-900')}>
            {duration}
          </div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Duration</div>
        </div>
      </div>

      {/* Times */}
      <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <LogIn size={13} className="text-gray-400 shrink-0" />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Clock In</div>
            <div className="text-sm font-semibold text-gray-900">{fmtTime(record.clock_in)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LogOut size={13} className="text-gray-400 shrink-0" />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Clock Out</div>
            <div className="text-sm font-semibold text-gray-900">
              {record.clock_out ? fmtTime(record.clock_out) : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Float / Cash / Notes */}
      {(record.opening_float != null || record.closing_cash != null || record.shift_notes) && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
          {record.opening_float != null && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Opening Float</span>
              <span className="font-medium text-gray-700">{fmtKES(record.opening_float)}</span>
            </div>
          )}
          {record.closing_cash != null && (
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Closing Cash</span>
              <span className="font-medium text-gray-700">{fmtKES(record.closing_cash)}</span>
            </div>
          )}
          {record.shift_notes && (
            <div className="text-xs text-gray-500 italic mt-1">"{record.shift_notes}"</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ records }: { records: ApiAttendance[] }) {
  const active = records.filter((r) => !r.clock_out).length
  const completed = records.filter((r) => r.clock_out).length

  const totalMins = records
    .filter((r) => r.clock_out)
    .reduce((s, r) => {
      const mins = (new Date(r.clock_out!).getTime() - new Date(r.clock_in).getTime()) / 60000
      return s + mins
    }, 0)
  const avgHrs = completed > 0 ? (totalMins / completed / 60).toFixed(1) : '—'

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Total Shifts', value: String(records.length) },
        { label: 'Active Now', value: String(active), highlight: active > 0 },
        { label: 'Avg Duration', value: avgHrs !== '—' ? `${avgHrs}h` : '—' },
      ].map(({ label, value, highlight }) => (
        <div key={label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center">
          <div className={cn('text-2xl font-bold', highlight ? 'text-green-700' : 'text-gray-900')}>{value}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AttendancePage() {
  const [date, setDate] = useState(toDateStr(new Date()))

  const { data: records = [], isLoading } = useAttendanceList(date)

  const stepDate = (delta: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + delta)
    setDate(toDateStr(d))
  }

  const isToday = date === toDateStr(new Date())
  const displayDate = new Date(date + 'T00:00:00').toLocaleDateString('en-KE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const active = records.filter((r) => !r.clock_out)
  const completed = records.filter((r) => r.clock_out)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Attendance</h1>
            <p className="text-sm text-gray-500 mt-0.5">Staff shift records</p>
          </div>
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => stepDate(-1)}>
            <ChevronLeft size={15} />
          </Button>
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <CalendarDays size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">{displayDate}</span>
              {isToday && (
                <span className="text-[10px] font-bold text-white bg-gray-900 px-1.5 py-0.5 rounded-full">TODAY</span>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => stepDate(1)} disabled={isToday}>
            <ChevronRight size={15} />
          </Button>
          <input
            type="date"
            value={date}
            max={toDateStr(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="sr-only"
            id="date-pick"
          />
          <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => document.getElementById('date-pick')?.click()}>
            Jump
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">
            <Clock size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No shifts recorded for this date</p>
          </div>
        ) : (
          <>
            <SummaryBar records={records} />

            {/* Active shifts first */}
            {active.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Currently Clocked In ({active.length})
                </div>
                <div className="space-y-2">
                  {active.map((r) => <ShiftCard key={r.id} record={r} />)}
                </div>
              </div>
            )}

            {/* Completed shifts */}
            {completed.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Completed Shifts ({completed.length})
                </div>
                <div className="space-y-2">
                  {completed.map((r) => <ShiftCard key={r.id} record={r} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
