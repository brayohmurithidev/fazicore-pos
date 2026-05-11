import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Camera, KeyRound, CheckCircle2, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { useAuthStore } from '@/stores/auth'
import { useUpdateMe, useUploadAvatar } from '@/lib/queries'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  )
}

export function ProfilePage() {
  const { user, updateUser } = useAuthStore()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadAvatar = useUploadAvatar()
  const updateMe = useUpdateMe()

  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinSaved, setPinSaved] = useState(false)

  if (!user) return null

  const handlePhotoClick = () => fileInputRef.current?.click()

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadAvatar.mutate(file, {
      onSuccess: (data) => updateUser({ photo_url: data.url }),
    })
    e.target.value = ''
  }

  const handleChangePin = () => {
    setPinError('')
    if (newPin.length !== 4) { setPinError('PIN must be exactly 4 digits'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match'); return }
    updateMe.mutate({ pin: newPin }, {
      onSuccess: () => {
        setNewPin('')
        setConfirmPin('')
        setPinSaved(true)
        setTimeout(() => setPinSaved(false), 4000)
      },
    })
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 max-w-2xl">
        {/* Page header */}
        <div className="mb-7">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 mb-3 transition-colors"
          >
            <ArrowLeft size={12} /> Back
          </button>
          <h1 className="text-lg font-bold text-gray-900">My Profile</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage your photo and PIN</p>
        </div>

        {/* Identity card with photo upload */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4 flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <button
              onClick={handlePhotoClick}
              disabled={uploadAvatar.isPending}
              className="group relative w-16 h-16 rounded-full overflow-hidden focus:outline-none"
              title="Change photo"
            >
              {user.photo_url ? (
                <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-amber-100 flex items-center justify-center text-amber-700 text-xl font-bold select-none">
                  {user.avatar}
                </div>
              )}
              {/* Hover overlay — desktop only */}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full hidden sm:flex" />
            </button>
            {/* Camera badge — always visible, works on mobile tap */}
            <button
              onClick={handlePhotoClick}
              disabled={uploadAvatar.isPending}
              className="absolute bottom-0 right-0 w-6 h-6 bg-amber-500 hover:bg-amber-600 rounded-full flex items-center justify-center border-2 border-white transition-colors disabled:opacity-50"
              title="Change photo"
            >
              {uploadAvatar.isPending
                ? <Loader2 size={11} className="text-white animate-spin" />
                : <Camera size={11} className="text-white" />
              }
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold text-gray-900 truncate">{user.name}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <RoleBadge role={user.role} />
              {user.branch_name && (
                <span className="text-xs text-gray-400">{user.branch_name}</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">Tap the camera icon to update your photo</p>
          </div>
        </div>

        {/* Account info */}
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 mb-4">
          <InfoRow label="Name" value={user.name} />
          <InfoRow label="Role" value={user.role.charAt(0).toUpperCase() + user.role.slice(1)} />
          {user.branch_name && <InfoRow label="Branch" value={user.branch_name} />}
        </div>

        {/* Change PIN */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={14} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-900">Change PIN</span>
          </div>
          <p className="text-xs text-gray-400 mb-5">Your 4-digit PIN is used to log in to this terminal.</p>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">New PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); setPinSaved(false) }}
                placeholder="••••"
                className="max-w-[120px] tracking-widest text-center text-lg"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1.5 block">Confirm new PIN</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(''); setPinSaved(false) }}
                placeholder="••••"
                className="max-w-[120px] tracking-widest text-center text-lg"
                onKeyDown={(e) => { if (e.key === 'Enter') handleChangePin() }}
              />
            </div>

            {pinError && <p className="text-xs text-red-500 font-medium">{pinError}</p>}
            {pinSaved && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <CheckCircle2 size={13} /> PIN updated successfully
              </div>
            )}

            <Button
              onClick={handleChangePin}
              disabled={updateMe.isPending || newPin.length !== 4 || confirmPin.length !== 4}
            >
              Update PIN
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
