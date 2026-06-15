import { useState } from 'react'
import { Truck, Plus, Search, Phone, Mail, MapPin, X, Loader2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { useSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFeature } from '@/hooks/useFeature'
import { UpgradeWall } from '@/components/shared/UpgradeWall'
import type { ApiSupplier } from '@/types/api'
import { cn } from '@/lib/utils'

// ── Supplier Form Modal ───────────────────────────────────────────────────────

function SupplierFormModal({ open, onClose, initial }: {
  open: boolean; onClose: () => void; initial: ApiSupplier | null
}) {
  const blank = { name: '', contact_name: '', phone: '', email: '', address: '', notes: '' }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const isPending = create.isPending || update.isPending

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleOpen = () => {
    setError(null)
    setForm(initial
      ? {
          name: initial.name,
          contact_name: initial.contact_name ?? '',
          phone: initial.phone ?? '',
          email: initial.email ?? '',
          address: initial.address ?? '',
          notes: initial.notes ?? '',
        }
      : blank)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setError(null)
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    }
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, data: payload })
        toast.success('Supplier updated')
      } else {
        await create.mutateAsync(payload)
        toast.success('Supplier added')
      }
      onClose()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to save supplier')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); else handleOpen() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>{initial ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 mt-1">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Business Name *</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Distributors Ltd" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Contact Person</Label>
            <Input value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Jane Wanjiku" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Phone</Label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254700000000" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Email</Label>
            <Input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="orders@supplier.co.ke" type="email" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Address</Label>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Industrial Area, Nairobi" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Notes</Label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Payment terms, lead time…" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-2 mt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Supplier Detail Panel ─────────────────────────────────────────────────────

function SupplierDetail({ supplier, onClose, onEdit }: {
  supplier: ApiSupplier; onClose: () => void; onEdit: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const del = useDeleteSupplier()

  const handleDelete = async () => {
    try {
      await del.mutateAsync(supplier.id)
      toast.success('Supplier removed')
      onClose()
    } catch {
      toast.error('Failed to remove supplier')
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-200">
        <div>
          <div className="text-lg font-bold text-gray-900">{supplier.name}</div>
          {supplier.contact_name && (
            <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
              <User size={12} />{supplier.contact_name}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
      </div>

      {/* Contact info */}
      <div className="p-5 space-y-3 border-b border-gray-100">
        {supplier.phone && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700">
            <Phone size={14} className="text-gray-400 shrink-0" />
            <a href={`tel:${supplier.phone}`} className="hover:text-blue-600">{supplier.phone}</a>
          </div>
        )}
        {supplier.email && (
          <div className="flex items-center gap-2.5 text-sm text-gray-700">
            <Mail size={14} className="text-gray-400 shrink-0" />
            <a href={`mailto:${supplier.email}`} className="hover:text-blue-600">{supplier.email}</a>
          </div>
        )}
        {supplier.address && (
          <div className="flex items-start gap-2.5 text-sm text-gray-700">
            <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
            <span>{supplier.address}</span>
          </div>
        )}
        {!supplier.phone && !supplier.email && !supplier.address && (
          <p className="text-xs text-gray-400">No contact details added</p>
        )}
      </div>

      {/* Notes */}
      {supplier.notes && (
        <div className="p-5 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</div>
          <p className="text-sm text-gray-700">{supplier.notes}</p>
        </div>
      )}

      {/* Actions */}
      <div className="p-5 mt-auto space-y-2">
        <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>Edit Supplier</Button>
        {!confirmDelete ? (
          <Button
            variant="outline" size="sm"
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
            onClick={() => setConfirmDelete(true)}
          >
            Remove Supplier
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              size="sm" className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete} disabled={del.isPending}
            >
              {del.isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}Confirm Remove
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function SuppliersPage() {
  const hasSuppliers = useFeature('supplier_management')
  const isMediumScreen = useMediaQuery('(min-width: 768px)')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<ApiSupplier | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ApiSupplier | null>(null)

  const { data: suppliers = [], isLoading } = useSuppliers()

  if (!hasSuppliers) {
    return (
      <UpgradeWall
        feature="Supplier Management"
        description="Track your suppliers, contact details, and link them to purchase orders. Upgrade your plan to manage suppliers."
      />
    )
  }

  const filtered = q
    ? suppliers.filter((s) =>
        s.name.toLowerCase().includes(q.toLowerCase()) ||
        s.contact_name?.toLowerCase().includes(q.toLowerCase()) ||
        s.phone?.includes(q) ||
        s.email?.toLowerCase().includes(q.toLowerCase())
      )
    : suppliers

  const openAdd = () => { setEditTarget(null); setFormOpen(true) }
  const openEdit = (s: ApiSupplier) => { setEditTarget(s); setFormOpen(true) }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left panel */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
            <p className="text-sm text-gray-500 mt-0.5">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={openAdd} size="sm" className="gap-1.5">
            <Plus size={14} />Add Supplier
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, contact, phone or email…"
            className="pl-8"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Truck size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{q ? 'No suppliers match your search' : 'No suppliers yet'}</p>
            </div>
          ) : filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={cn(
                'w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all',
                selected?.id === s.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
              )}
            >
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                selected?.id === s.id ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-700'
              )}>
                {s.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{s.name}</div>
                <div className={cn('text-xs truncate', selected?.id === s.id ? 'text-white/60' : 'text-gray-400')}>
                  {s.contact_name
                    ? `${s.contact_name}${s.phone ? ` · ${s.phone}` : ''}`
                    : s.phone || s.email || 'No contact info'}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: side panel on md+, Sheet on mobile */}
      {selected && (
        <>
          <div className="hidden md:flex w-[380px] border-l border-gray-200 bg-white flex-col overflow-hidden">
            <SupplierDetail
              supplier={selected}
              onClose={() => setSelected(null)}
              onEdit={() => openEdit(selected)}
            />
          </div>
          <Sheet open={!isMediumScreen && !!selected} onOpenChange={(v) => !v && setSelected(null)}>
            <SheetContent side="right" className="w-full max-w-sm p-0">
              <SupplierDetail
                supplier={selected}
                onClose={() => setSelected(null)}
                onEdit={() => openEdit(selected)}
              />
            </SheetContent>
          </Sheet>
        </>
      )}

      <SupplierFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null) }}
        initial={editTarget}
      />
    </div>
  )
}
