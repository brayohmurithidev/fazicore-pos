import { useState } from 'react'
import { Plus, Pencil, Trash2, Settings, Monitor, Package, Building2, Users, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { LimitReachedDialog, parseLimitError, type LimitError } from '@/components/shared/LimitReachedDialog'
import { useUsers, useCreateUser, useDeleteUser, useUpdateUserById, useBranches, useOrgInfo } from '@/lib/queries'
import { toast } from '@/lib/toast'
import type { ApiUser, ApiBranch, ApiRole } from '@/types/api'

const ROLES: { id: ApiRole; label: string; desc: string }[] = [
  { id: 'admin',   label: 'Admin',       desc: 'Full access to all features and settings' },
  { id: 'manager', label: 'Manager',     desc: 'Branch management, reports, inventory' },
  { id: 'cashier', label: 'Cashier',     desc: 'POS screen only — can sell and print receipts' },
  { id: 'stock',   label: 'Stock Clerk', desc: 'Inventory management, no POS access' },
]

const ROLE_SCREENS: Record<ApiRole, string[]> = {
  admin:   ['Dashboard', 'POS', 'Inventory', 'Branches', 'Settings', 'Users'],
  manager: ['Dashboard', 'POS', 'Inventory', 'Branches'],
  cashier: ['POS'],
  stock:   ['Inventory'],
}

function StatCard({ label, value, icon: Icon, accent = '#111827' }: { label: string; value: number; icon: React.ElementType; accent?: string }) {
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

export function UsersPage() {
  const { data: users = [], isLoading } = useUsers()
  const { data: branches = [] } = useBranches()
  const { data: orgInfo } = useOrgInfo()
  const createUser = useCreateUser()
  const deleteUser = useDeleteUser()
  const updateUser = useUpdateUserById()

  const [addOpen, setAddOpen] = useState(false)
  const [editUser, setEditUser] = useState<ApiUser | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ApiUser | null>(null)
  const [limitError, setLimitError] = useState<LimitError | null>(null)

  const activeUsers = users.filter((u) => u.is_active)
  const atLimit = orgInfo ? (orgInfo.max_users !== null && activeUsers.length >= orgInfo.max_users) : false

  const roleCount = (r: ApiRole) => users.filter((u) => u.role === r).length

  const handleSave = async (data: Record<string, unknown>) => {
    try {
      if (editUser) {
        await updateUser.mutateAsync({ id: editUser.id, data })
        toast.success('User updated')
      } else {
        await createUser.mutateAsync(data)
        toast.success('User created')
      }
      setAddOpen(false)
      setEditUser(null)
    } catch (err) {
      const limit = parseLimitError(err)
      if (limit) { setAddOpen(false); setLimitError(limit) }
      else { toast.error('Failed to save user'); throw err }
    }
  }

  const isPending = createUser.isPending || updateUser.isPending

  return (
    <div className="p-4 sm:p-6 overflow-y-auto h-full">
      <div className="flex justify-between items-center mb-5 sm:mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Create and manage staff accounts across all branches</p>
        </div>
        <div className="flex items-center gap-3">
          {orgInfo && (
            <span className={`text-xs font-medium ${atLimit ? 'text-amber-600' : 'text-gray-400'}`}>
              {activeUsers.length}/{orgInfo.max_users === null ? '∞' : orgInfo.max_users} users
              {atLimit && ' — limit reached'}
            </span>
          )}
          <Button
            size="sm"
            disabled={atLimit}
            title={atLimit ? 'User limit reached — contact your admin to upgrade' : undefined}
            onClick={() => { setEditUser(null); setAddOpen(true) }}
          >
            <Plus size={14} className="mr-1.5" />Add User
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 mb-6 sm:mb-7">
        <StatCard label="Total Users"  value={users.length}           icon={Users}    accent="#3B82F6" />
        <StatCard label="Admins"       value={roleCount('admin')}     icon={Settings} accent="#EF4444" />
        <StatCard label="Managers"     value={roleCount('manager')}   icon={Building2} accent="#8B5CF6" />
        <StatCard label="Cashiers"     value={roleCount('cashier')}   icon={Monitor}  accent="#059669" />
        <StatCard label="Stock Clerks" value={roleCount('stock')}     icon={Package}  accent="#F59E0B" />
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Access</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-gray-400">No users yet</TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-bold">
                          {u.avatar ?? u.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold text-gray-900">{u.name}</div>
                        <div className="text-[11px] text-gray-400">{u.email ?? `ID: ${u.id}`}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><RoleBadge role={u.role} /></TableCell>
                  <TableCell>
                    {u.branch_name
                      ? <div className="font-medium text-sm">{u.branch_name}</div>
                      : <span className="text-gray-400 text-xs">—</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(ROLE_SCREENS[u.role] ?? []).map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => { setEditUser(u); setAddOpen(true) }}>
                        <Pencil size={12} className="mr-1" />Edit
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 border-red-100 hover:bg-red-50" onClick={() => setDeleteConfirm(u)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add/Edit modal */}
      <Dialog open={addOpen} onOpenChange={(v) => !v && setAddOpen(false)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editUser ? `Edit — ${editUser.name}` : 'Create New User'}</DialogTitle>
          </DialogHeader>
          <UserForm
            initial={editUser}
            branches={branches}
            isPending={isPending}
            onClose={() => setAddOpen(false)}
            onSave={handleSave}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => !v && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader><DialogTitle>Remove User</DialogTitle></DialogHeader>
          {deleteConfirm && (
            <div>
              <div className="flex items-center gap-3.5 p-4 bg-red-50 rounded-lg mb-5">
                <div className="w-11 h-11 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div>
                  <div className="font-bold text-red-900">Remove {deleteConfirm.name}?</div>
                  <div className="text-sm text-red-700 mt-0.5">This will revoke all their access immediately.</div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deleteUser.isPending}
                  onClick={() => deleteUser.mutate(deleteConfirm.id, { onSuccess: () => setDeleteConfirm(null) })}
                >
                  {deleteUser.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                  Yes, Remove
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <LimitReachedDialog limit={limitError} onClose={() => setLimitError(null)} />
    </div>
  )
}

function UserForm({ initial, branches, isPending, onClose, onSave }: {
  initial: ApiUser | null
  branches: ApiBranch[]
  isPending: boolean
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<void>
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    role: (initial?.role ?? 'cashier') as ApiRole,
    branch_id: String(initial?.branch_id ?? (branches[0]?.id ?? '')),
    pin: '',
    pinConfirm: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!initial) {
      if (!form.pin || form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) e.pin = 'PIN must be exactly 4 digits'
      if (form.pin !== form.pinConfirm) e.pinConfirm = 'PINs do not match'
    } else if (form.pin && (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin))) {
      e.pin = 'PIN must be exactly 4 digits'
    }
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.values(e).some(Boolean)) { setErrors(e); return }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      role: form.role,
      branch_id: form.branch_id ? Number(form.branch_id) : null,
    }
    if (form.pin) payload.pin = form.pin
    await onSave(payload)
  }

  return (
    <div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Full Name *</Label>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Jane Wanjiku" className={errors.name ? 'border-red-500' : ''} />
        {errors.name && <div className="text-xs text-red-600 mt-1">{errors.name}</div>}
      </div>

      <div className="mb-3.5">
        <Label className="mb-2 block">Role *</Label>
        <div className="flex flex-col gap-2">
          {ROLES.map((r) => (
            <label key={r.id} onClick={() => set('role', r.id)}
              className={`flex items-center gap-3 p-2.5 border-2 rounded-lg cursor-pointer transition-colors ${form.role === r.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${form.role === r.id ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}`}>
                {form.role === r.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">{r.label}</div>
                <div className="text-xs text-gray-400">{r.desc}</div>
              </div>
              <RoleBadge role={r.id} />
            </label>
          ))}
        </div>
      </div>

      {branches.length > 1 ? (
        <div className="mb-3.5">
          <Label className="mb-1.5 block">Assigned Branch</Label>
          <Select value={form.branch_id} onValueChange={(v) => set('branch_id', v ?? '')}>
            <SelectTrigger>
              <span className={form.branch_id ? undefined : 'text-muted-foreground'}>
                {form.branch_id
                  ? (() => { const b = branches.find((b) => String(b.id) === form.branch_id); return b ? `${b.name}${b.location ? ` — ${b.location}` : ''}` : form.branch_id })()
                  : '— No branch —'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">— No branch —</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}{b.location ? ` — ${b.location}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div>
          <Label className="mb-1.5 block">{initial ? 'New PIN (leave blank to keep)' : 'PIN *'}</Label>
          <Input type="password" maxLength={4} value={form.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))}
            placeholder="••••" className={`text-lg tracking-[6px] ${errors.pin ? 'border-red-500' : ''}`} />
          {errors.pin && <div className="text-xs text-red-600 mt-1">{errors.pin}</div>}
        </div>
        <div>
          <Label className="mb-1.5 block">Confirm PIN</Label>
          <Input type="password" maxLength={4} value={form.pinConfirm} onChange={(e) => set('pinConfirm', e.target.value.replace(/\D/g, ''))}
            placeholder="••••" className={`text-lg tracking-[6px] ${errors.pinConfirm ? 'border-red-500' : ''}`} />
          {errors.pinConfirm && <div className="text-xs text-red-600 mt-1">{errors.pinConfirm}</div>}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
          {initial ? 'Save Changes' : 'Create User'}
        </Button>
      </div>
    </div>
  )
}
