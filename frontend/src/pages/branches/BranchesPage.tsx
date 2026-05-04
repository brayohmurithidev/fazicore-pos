import { useState } from 'react'
import { Plus, Building2, Receipt, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LimitReachedDialog, parseLimitError, type LimitError } from '@/components/shared/LimitReachedDialog'
import { useBranches, useCreateBranch, useOrgInfo } from '@/lib/queries'
import type { ApiBranch } from '@/types/api'

function StatCard({ label, value, icon: Icon, accent = '#111827' }: { label: string; value: string | number; icon: React.ElementType; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-[18px_20px]">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[11px] text-gray-500 font-semibold mb-1.5 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
          </div>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: accent + '18' }}>
            <Icon size={18} style={{ color: accent }} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BranchesPage() {
  const { data: apiBranches } = useBranches()
  const { data: orgInfo } = useOrgInfo()
  const createBranch = useCreateBranch()
  const [selected, setSelected] = useState<ApiBranch | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [limitError, setLimitError] = useState<LimitError | null>(null)

  const branches: ApiBranch[] = apiBranches ?? []
  const atLimit = orgInfo ? branches.filter((b) => b.is_active).length >= orgInfo.max_branches : false

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="flex justify-between items-center mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Branch Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Oversee all business locations</p>
        </div>
        <div className="flex items-center gap-3">
          {orgInfo && (
            <span className={`text-xs font-medium ${atLimit ? 'text-amber-600' : 'text-gray-400'}`}>
              {orgInfo.max_branches === 1
                ? `Single business${atLimit ? ' — limit reached' : ''}`
                : `${branches.filter((b) => b.is_active).length}/${orgInfo.max_branches} branches${atLimit ? ' — limit reached' : ''}`
              }
            </span>
          )}
          <Button
            size="sm"
            disabled={atLimit}
            title={atLimit ? 'Branch limit reached — contact your admin to upgrade' : undefined}
            onClick={() => setAddOpen(true)}
          >
            <Plus size={14} className="mr-1.5" />Add Branch
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 mb-6 sm:mb-7">
        <StatCard label="Branches" value={branches.length} icon={Building2} accent="#3B82F6" />
        <StatCard label="Active" value={branches.filter((b) => b.is_active).length} icon={CheckCircle2} accent="#059669" />
        <StatCard label="Month Revenue" value="—" icon={Receipt} accent="#8B5CF6" />
        <StatCard label="Today (All)" value="—" icon={Receipt} accent="#F59E0B" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {branches.map((b) => (
            <Card key={b.id} className="p-0 overflow-hidden">
              <div className="px-[18px] py-4 border-b border-gray-100 flex justify-between items-start">
                <div>
                  <div className="font-bold text-[15px] mb-0.5">{b.name}</div>
                  <div className="text-xs text-gray-400">{b.location}</div>
                </div>
                <Badge className={b.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>{b.status}</Badge>
              </div>
              <CardContent className="p-[14px_18px]">
                <div className="text-xs text-gray-500 mb-3.5">
                  {b.manager_name && <div>Manager: <strong>{b.manager_name}</strong></div>}
                  {b.phone && <div>{b.phone}</div>}
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSelected(b)}>View Details</Button>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Branch detail modal */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
          {selected && (
            <>
              <div className="mb-4">
                {([['Location', selected.location], ['Phone', selected.phone], ['Manager', selected.manager_name]] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2.5 border-b border-gray-100 text-sm">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-medium">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2.5 text-sm">
                  <span className="text-gray-500">Status</span>
                  <Badge className={selected.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}>{selected.status}</Badge>
                </div>
              </div>
              <Button variant="outline" className="w-full mt-4" onClick={() => setSelected(null)}>Close</Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add branch modal */}
      <Dialog open={addOpen} onOpenChange={(v) => !v && setAddOpen(false)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader><DialogTitle>Add New Branch</DialogTitle></DialogHeader>
          <AddBranchForm
            onClose={() => setAddOpen(false)}
            onSave={(data) => {
              createBranch.mutate(data, {
                onSuccess: () => setAddOpen(false),
                onError: (err) => {
                  const limit = parseLimitError(err)
                  if (limit) { setAddOpen(false); setLimitError(limit) }
                },
              })
            }}
          />
        </DialogContent>
      </Dialog>

      <LimitReachedDialog limit={limitError} onClose={() => setLimitError(null)} />
    </div>
  )
}

function AddBranchForm({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: Record<string, string>) => void
}) {
  const [form, setForm] = useState({ name: '', location: '', phone: '', manager_name: '' })
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {([['Branch Name *', 'name', 'e.g. Ngong Road Branch', true], ['Location', 'location', 'e.g. Nairobi, Ngong Road', false], ['Phone', 'phone', '+254 7XX XXX XXX', false], ['Manager', 'manager_name', 'Full name', false]] as const).map(([label, key, ph, full]) => (
          <div key={key} className={full ? 'col-span-2' : ''}>
            <Label className="mb-1.5 block">{label}</Label>
            <Input value={form[key as keyof typeof form]} onChange={(e) => set(key, e.target.value)} placeholder={ph} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" disabled={!form.name} onClick={() => onSave(form)}>
          Add Branch
        </Button>
      </div>
    </div>
  )
}
