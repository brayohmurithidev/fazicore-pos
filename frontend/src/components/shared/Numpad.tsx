import { Button } from '@/components/ui/button'

interface NumpadProps {
  value: string
  onChange: (v: string) => void
}

const KEYS = ['7','8','9','4','5','6','1','2','3','.','0','del']

export function Numpad({ value, onChange }: NumpadProps) {
  const press = (k: string) => {
    if (k === 'del') { onChange(value.slice(0, -1)); return }
    if (value.includes('.') && k === '.') return
    if (value === '0' && k !== '.') { onChange(k); return }
    onChange(value + k)
  }

  return (
    <div>
      <div className="text-3xl font-bold text-center py-3.5 bg-gray-50 rounded-md mb-2.5 tracking-widest tabular-nums">
        {value || '0'}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <Button
            key={k}
            variant="outline"
            onClick={() => press(k)}
            className={`py-3.5 text-lg font-semibold h-auto ${k === 'del' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'}`}
          >
            {k === 'del' ? '⌫' : k}
          </Button>
        ))}
      </div>
    </div>
  )
}
