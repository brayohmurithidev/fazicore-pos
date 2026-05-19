import { useState, useMemo } from 'react'
import { Plus, Building2, Receipt, CheckCircle2, Search, UserPlus, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LimitReachedDialog, parseLimitError, type LimitError } from '@/components/shared/LimitReachedDialog'
import { useBranches, useCreateBranch, useCreateUser, useUpdateUserById, useUsers, useOrgInfo } from '@/lib/queries'
import { toast } from '@/lib/toast'
import type { ApiBranch, ApiUser } from '@/types/api'

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
              <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => setSelected(null)}>Close</Button>
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
            onDone={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <LimitReachedDialog limit={limitError} onClose={() => setLimitError(null)} />
    </div>
  )
}

type ManagerMode = 'none' | 'existing' | 'new'

function AddBranchForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', location: '', phone: '' })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  // Manager picker state
  const [managerMode, setManagerMode] = useState<ManagerMode>('none')
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null)
  const [newUser, setNewUser] = useState({ name: '', pin: '', role: 'manager' as string })
  const [pickerOpen, setPickerOpen] = useState(false)

  const { data: allUsers = [] } = useUsers()
  const createBranch = useCreateBranch()
  const createUser = useCreateUser()
  const updateUserById = useUpdateUserById()

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return allUsers.filter((u) => u.is_active && (!q || u.name.toLowerCase().includes(q) || u.role.includes(q)))
  }, [allUsers, userSearch])

  const managerName = managerMode === 'existing' ? (selectedUser?.name ?? '') : managerMode === 'new' ? newUser.name : ''
  const canSubmit = !!form.name && (
    managerMode === 'none' ||
    (managerMode === 'existing' && !!selectedUser) ||
    (managerMode === 'new' && !!newUser.name && newUser.pin.length >= 4)
  )

  const handleSubmit = async () => {
    try {
      const branch: ApiBranch = await createBranch.mutateAsync({
        name: form.name,
        location: form.location || undefined,
        phone: form.phone || undefined,
        manager_name: managerName || undefined,
      })

      if (managerMode === 'existing' && selectedUser) {
        await updateUserById.mutateAsync({ id: selectedUser.id, data: { branch_id: branch.id } })
      } else if (managerMode === 'new' && newUser.name) {
        await createUser.mutateAsync({
          name: newUser.name,
          pin: newUser.pin,
          role: newUser.role,
          branch_id: branch.id,
        })
      }

      toast.success('Branch created')
      onDone()
    } catch (err: unknown) {
      const limit = parseLimitError(err as Error)
      if (limit) { onClose(); throw err }
      toast.error('Failed to create branch')
    }
  }

  const busy = createBranch.isPending || createUser.isPending || updateUserById.isPending

  return (
    <div className="space-y-3.5">
      {/* Branch details */}
      <div className="col-span-2">
        <Label className="mb-1.5 block text-xs text-gray-500">Branch Name *</Label>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ngong Road Branch" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-1.5 block text-xs text-gray-500">Location</Label>
          <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Nairobi, Ngong Road" />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-gray-500">Phone</Label>
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254 7XX XXX XXX" />
        </div>
      </div>

      {/* Manager picker */}
      <div>
        <Label className="mb-1.5 block text-xs text-gray-500">Manager</Label>

        {managerMode === 'none' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setManagerMode('existing'); setPickerOpen(true) }}
              className="flex-1 flex items-center gap-2 border border-dashed border-gray-300 rounded-md px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              <Search size={13} />
              Select existing user
            </button>
            <button
              type="button"
              onClick={() => setManagerMode('new')}
              className="flex-1 flex items-center gap-2 border border-dashed border-gray-300 rounded-md px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
            >
              <UserPlus size={13} />
              Create new user
            </button>
          </div>
        )}

        {managerMode === 'existing' && (
          <div className="space-y-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPickerOpen(!pickerOpen)}
                className="w-full flex items-center justify-between border border-gray-200 rounded-md px-3 py-2 text-sm bg-white hover:border-gray-300 transition-colors"
              >
                <span className={selectedUser ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedUser ? `${selectedUser.name} (${selectedUser.role})` : 'Search users…'}
                </span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>

              {pickerOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        autoFocus
                        className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                        placeholder="Search by name or role…"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">No users found</div>
                    ) : filteredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setSelectedUser(u); setPickerOpen(false); setUserSearch('') }}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium text-gray-900">{u.name}</span>
                        <span className="text-xs capitalize text-right">
                          <span className="text-gray-400">{u.role}</span>
                          {u.branch_name && (
                            <span className="ml-1.5 text-amber-600 font-medium">· {u.branch_name}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedUser?.branch_name && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5">
                <strong>{selectedUser.name}</strong> is currently at <strong>{selectedUser.branch_name}</strong>. Saving will move them to this new branch.
              </p>
            )}
            <button type="button" onClick={() => { setManagerMode('none'); setSelectedUser(null) }} className="text-xs text-gray-400 hover:text-gray-600">
              ← Remove manager
            </button>
          </div>
        )}

        {managerMode === 'new' && (
          <div className="border border-gray-200 rounded-lg p-3 space-y-2.5 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">New user details</span>
              <button type="button" onClick={() => { setManagerMode('none'); setNewUser({ name: '', pin: '', role: 'manager' }) }} className="text-xs text-gray-400 hover:text-gray-600">Remove</button>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-gray-500">Full Name *</Label>
              <Input className="bg-white" value={newUser.name} onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))} placeholder="e.g. Jane Wanjiku" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="mb-1 block text-xs text-gray-500">PIN * (min 4 digits)</Label>
                <Input className="bg-white" type="password" inputMode="numeric" value={newUser.pin} onChange={(e) => setNewUser((u) => ({ ...u, pin: e.target.value }))} placeholder="••••" maxLength={8} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-gray-500">Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser((u) => ({ ...u, role: v }))}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="stock">Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button size="sm" className="flex-1" disabled={!canSubmit || busy} onClick={handleSubmit}>
          {busy ? 'Creating…' : 'Add Branch'}
        </Button>
      </div>
    </div>
  )
}
