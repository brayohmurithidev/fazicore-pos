import { useState } from 'react'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { useAuthStore } from '@/stores/auth'
import { useOrgUsers, useVerifyPin } from '@/lib/queries'
import type { ApiUser } from '@/types/api'
import type { User } from '@/types'

const MAX_ATTEMPTS = 3

interface Props {
  open: boolean
  onClose: () => void
  onApprove: () => void
  title?: string
  description?: string
}

export function ManagerApprovalModal({
  open,
  onClose,
  onApprove,
  title = 'Manager Approval Required',
  description,
}: Props) {
  const { orgSlug } = useAuthStore()
  const [step, setStep] = useState<'select' | 'pin'>('select')
  const [selectedUser, setSelectedUser] = useState<ApiUser | null>(null)
  const [pin, setPin] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [error, setError] = useState('')

  const { data: allUsers = [] } = useOrgUsers(orgSlug)
  const verifyPin = useVerifyPin()

  const approvers = allUsers.filter((u) => u.role === 'admin' || u.role === 'manager')

  const reset = () => {
    setStep('select')
    setSelectedUser(null)
    setPin('')
    setAttempts(0)
    setError('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSelect = (u: ApiUser) => {
    setSelectedUser(u)
    setPin('')
    setAttempts(0)
    setError('')
    setStep('pin')
  }

  const handleBack = () => {
    setStep('select')
    setSelectedUser(null)
    setPin('')
    setAttempts(0)
    setError('')
  }

  const handlePinKey = (k: string) => {
    if (verifyPin.isPending) return
    if (k === 'del') { setPin((p) => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length < 4) return

    verifyPin.mutate(
      { org_slug: orgSlug, user_id: selectedUser!.id, pin: next },
      {
        onSuccess: (data) => {
          if (data.valid) {
            onApprove()
            reset()
            onClose()
          } else {
            setTimeout(() => {
              setPin('')
              const a = attempts + 1
              setAttempts(a)
              setShakeKey((k) => k + 1)
              if (a >= MAX_ATTEMPTS) {
                handleBack()
              } else {
                const rem = MAX_ATTEMPTS - a
                setError(`Incorrect PIN · ${rem} attempt${rem === 1 ? '' : 's'} left`)
              }
            }, 300)
          }
        },
        onError: () => {
          setTimeout(() => {
            setPin('')
            setShakeKey((k) => k + 1)
            setError('Verification failed, try again')
          }, 300)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-xs sm:max-w-sm p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={15} className="text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold">{title}</DialogTitle>
              {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
            </div>
          </div>
        </DialogHeader>

        {step === 'select' ? (
          <div className="px-6 py-5">
            <p className="text-xs text-gray-400 mb-3">Select an admin or manager to approve</p>
            <div className="flex flex-col gap-2">
              {approvers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelect(u)}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 text-left hover:border-gray-900 hover:bg-white transition-colors"
                >
                  <Avatar className="w-9 h-9 flex-shrink-0">
                    <AvatarFallback className="bg-gray-200 text-gray-700 text-sm font-bold">
                      {u.avatar ?? u.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                  </div>
                  <RoleBadge role={u.role as User['role']} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-xs text-gray-500 mb-4 hover:text-gray-900"
            >
              <ChevronLeft size={14} /> Back
            </button>

            <div className="text-center mb-5">
              <Avatar className="w-12 h-12 mx-auto mb-2">
                <AvatarFallback className="bg-gray-200 text-gray-700 text-base font-bold">
                  {selectedUser?.avatar ?? selectedUser?.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="font-semibold text-sm">{selectedUser?.name}</div>
            </div>

            <div className="text-xs font-semibold text-gray-700 text-center mb-3">Enter PIN</div>

            <div key={shakeKey} className={`flex justify-center gap-2.5 mb-1 ${shakeKey > 0 ? 'animate-shake' : ''}`}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full transition-colors ${pin.length > i ? 'bg-gray-900' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            <div className="h-5 flex items-center justify-center mb-3">
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) =>
                k === '' ? <div key={i} /> : (
                  <button
                    key={i}
                    onClick={() => handlePinKey(k)}
                    disabled={verifyPin.isPending}
                    className={`py-3.5 text-lg font-semibold rounded-md border transition-colors disabled:opacity-50 ${
                      k === 'del'
                        ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                        : 'bg-gray-50 text-gray-900 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {k === 'del' ? '⌫' : k}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
