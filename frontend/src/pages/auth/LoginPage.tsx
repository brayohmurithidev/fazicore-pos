import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Monitor, ChevronLeft, Building2, Lock, AlertCircle, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { useAuthStore } from '@/stores/auth'
import { useOrgUsers, usePinLogin, useClockIn } from '@/lib/queries'
import type { ApiUser } from '@/types/api'
import type { User } from '@/types'

const MAX_ATTEMPTS = 5

type SelectableUser = {
  id: string | number
  name: string
  role: User['role']
  branch_id: number | null
  branch_name: string | null
  avatar: string
  _api: ApiUser
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatLastLogin(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `Today ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`
}

export function LoginPage() {
  const [selectedBranch, setSelectedBranch] = useState<{ id: string | number; name: string } | null>(null)
  const [selectedUser, setSelectedUser] = useState<SelectableUser | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [pin, setPin] = useState('')
  const [pinAttempts, setPinAttempts] = useState(0)
  const [pinLocked, setPinLocked] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [error, setError] = useState('')
  const [editingSlug, setEditingSlug] = useState(false)
  const [slugInput, setSlugInput] = useState('')

  const { login, orgSlug, setOrgSlug, lastLogin, setClockedIn } = useAuthStore()
  const navigate = useNavigate()

  const { data: apiUsers, isError: usersError, isLoading: usersLoading } = useOrgUsers(orgSlug)
  const pinLogin = usePinLogin()
  const clockIn = useClockIn()

  const allUsers: SelectableUser[] = apiUsers
    ? apiUsers.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role as User['role'],
        branch_id: u.branch_id,
        branch_name: u.branch_name,
        avatar: u.avatar ?? getInitials(u.name),
        _api: u,
      }))
    : []

  const branches: { id: string | number; name: string }[] = apiUsers
    ? [
        ...new Map(
          apiUsers
            .filter((u) => u.branch_id != null)
            .map((u) => [u.branch_id, { id: u.branch_id!, name: u.branch_name ?? `Branch ${u.branch_id}` }])
        ).values(),
      ]
    : []

  const isMultiBranch = branches.length > 1

  const visibleUsers = (() => {
    if (overrideMode) return allUsers.filter((u) => u.role === 'admin' || u.role === 'manager')
    if (selectedBranch)
      return allUsers.filter(
        (u) => u.branch_id === selectedBranch.id || u.role === 'admin' || u.branch_id === null
      )
    return allUsers
  })()

  const handleSelectUser = (u: SelectableUser) => {
    setSelectedUser(u)
    setOverrideMode(false)
    setPin('')
    setPinAttempts(0)
    setPinLocked(false)
    setError('')
  }

  const handleBack = () => {
    if (selectedUser) {
      setSelectedUser(null)
      setPin('')
      setError('')
    } else if (overrideMode) {
      setOverrideMode(false)
      setSelectedUser(null)
    } else if (selectedBranch) {
      setSelectedBranch(null)
    }
  }

  const roleHome = (role: string) =>
    role === 'cashier' ? '/pos' : role === 'stock' ? '/inventory' : '/dashboard'

  const doSuccessLogin = (user: User, accessToken: string, refreshToken: string) => {
    login(user, accessToken, refreshToken)
    clockIn.mutate(undefined, {
      onSuccess: (att) => setClockedIn(att.id, att.clock_in),
      onSettled: () => navigate(roleHome(user.role)),
    })
  }

  const handlePinKey = (k: string) => {
    if (pinLocked || !selectedUser) return
    if (k === 'del') { setPin((p) => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length < 4) return

    pinLogin.mutate(
      { org_slug: orgSlug, user_id: Number(selectedUser.id), pin: next },
      {
        onSuccess: (data) => {
          const user: User = {
            id: String(data.user.id),
            name: data.user.name,
            role: data.user.role as User['role'],
            branch: String(data.user.branch_id ?? ''),
            branch_name: data.user.branch_name ?? undefined,
            avatar: data.user.avatar ?? getInitials(data.user.name),
            pin: '',
          }
          setTimeout(() => doSuccessLogin(user, data.access_token, data.refresh_token), 200)
        },
        onError: () => {
          setTimeout(() => {
            setPin('')
            const attempts = pinAttempts + 1
            setPinAttempts(attempts)
            setShakeKey((k) => k + 1)
            if (attempts >= MAX_ATTEMPTS) {
              setPinLocked(true)
              setError('')
            } else {
              const rem = MAX_ATTEMPTS - attempts
              setError(`Incorrect PIN · ${rem} attempt${rem === 1 ? '' : 's'} remaining`)
            }
          }, 300)
        },
      }
    )
  }

  // ── Shared elements ────────────────────────────────────────────────────

  const Logo = () => (
    <div className="mb-10 text-center">
      <div className="flex items-center gap-3 justify-center mb-2">
        <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center">
          <Monitor size={22} className="text-white" />
        </div>
        <div className="text-2xl font-extrabold text-gray-900 tracking-tight">Fazi POS</div>
      </div>
      <div className="text-sm text-gray-400">by Fazilabs Business Solutions</div>
    </div>
  )

  const SlugSwitcher = () =>
    editingSlug ? (
      <form
        className="flex gap-2 mb-6"
        onSubmit={(e) => {
          e.preventDefault()
          const s = slugInput.trim()
          if (s) { setOrgSlug(s); setSelectedBranch(null); setSelectedUser(null) }
          setEditingSlug(false)
          setSlugInput('')
        }}
      >
        <input
          autoFocus
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-gray-900"
          placeholder="your-business-slug"
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
        />
        <button type="submit" className="text-sm font-semibold px-4 py-2 bg-gray-900 text-white rounded-lg">Go</button>
        <button type="button" onClick={() => setEditingSlug(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg">Cancel</button>
      </form>
    ) : (
      <button
        onClick={() => { setEditingSlug(true); setSlugInput(orgSlug) }}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <Building2 size={13} />
        <span className="font-medium">{orgSlug}</span>
        <span className="text-gray-400">· Switch Business</span>
      </button>
    )

  // ── No slug yet ────────────────────────────────────────────────────────
  if (!orgSlug || editingSlug) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Logo />
        <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-sm shadow-sm">
          <h2 className="font-bold text-lg mb-1">Welcome to Fazi POS</h2>
          <p className="text-sm text-gray-400 mb-5">Enter your business slug to continue</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const s = slugInput.trim()
              if (s) { setOrgSlug(s); setEditingSlug(false); setSlugInput('') }
            }}
          >
            <input
              autoFocus
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 outline-none focus:border-gray-900 mb-3"
              placeholder="your-business-slug"
              value={slugInput}
              onChange={(e) => setSlugInput(e.target.value)}
            />
            <button
              type="submit"
              className="w-full text-sm font-semibold px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── PIN screen ─────────────────────────────────────────────────────────
  if (selectedUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <Logo />
        <div className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-10 w-full max-w-xs sm:max-w-sm shadow-sm">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-gray-500 mb-6 hover:text-gray-900"
          >
            <ChevronLeft size={15} /> Back
          </button>

          {pinLocked ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-5 bg-red-50 rounded-full flex items-center justify-center">
                <Lock size={28} className="text-red-500" />
              </div>
              <div className="font-bold text-lg text-gray-900 mb-2">Account Locked</div>
              <div className="text-sm text-gray-500 mb-8">
                Too many failed attempts. Ask an admin to assist.
              </div>
              <button
                onClick={() => {
                  setPinAttempts(0)
                  setPinLocked(false)
                  setSelectedUser(null)
                  setOverrideMode(true)
                }}
                className="w-full py-3 px-4 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors"
              >
                Admin Override
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <Avatar className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3">
                  <AvatarFallback className="bg-gray-200 text-gray-700 text-xl sm:text-2xl font-bold">
                    {selectedUser.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="font-bold text-lg sm:text-xl">{selectedUser.name}</div>
                <div className="mt-1.5"><RoleBadge role={selectedUser.role} /></div>
              </div>

              <div className="text-sm font-semibold text-gray-700 text-center mb-4">Enter PIN</div>

              <div key={shakeKey} className={`flex justify-center gap-3 mb-2 ${shakeKey > 0 ? 'animate-shake' : ''}`}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full transition-colors ${pin.length > i ? 'bg-gray-900' : 'bg-gray-200'}`}
                  />
                ))}
              </div>

              <div className="h-6 flex items-center justify-center mb-3">
                {error && <p className="text-xs text-red-600 text-center">{error}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) =>
                  k === '' ? <div key={i} /> : (
                    <button
                      key={i}
                      onClick={() => handlePinKey(k)}
                      disabled={pinLogin.isPending}
                      className={`py-4 sm:py-5 text-xl sm:text-2xl font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
                        k === 'del'
                          ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                          : 'bg-gray-50 text-gray-900 border-gray-200 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                    >
                      {k === 'del' ? '⌫' : k}
                    </button>
                  )
                )}
              </div>

              {pinAttempts > 0 && (
                <div className="text-center text-xs text-gray-400 mt-4">
                  Attempt {pinAttempts} of {MAX_ATTEMPTS}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Branch or User selection ───────────────────────────────────────────

  const showBranchScreen = isMultiBranch && !selectedBranch && !overrideMode

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <Logo />

      <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-lg sm:max-w-xl shadow-sm">
        {/* Back navigation */}
        {(selectedBranch || overrideMode) && (
          <button onClick={handleBack} className="flex items-center gap-1 text-sm text-gray-500 mb-5 hover:text-gray-900">
            <ChevronLeft size={15} />
            {overrideMode ? 'Cancel' : selectedBranch?.name}
          </button>
        )}

        {/* Slug switcher */}
        {!selectedBranch && !overrideMode && <SlugSwitcher />}

        {/* Loading state */}
        {usersLoading && (
          <div className="flex flex-col items-center py-10 text-gray-400">
            <Loader2 size={28} className="animate-spin mb-3" />
            <span className="text-sm">Connecting to {orgSlug}…</span>
          </div>
        )}

        {/* Error state */}
        {!usersLoading && usersError && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-3">
              <AlertCircle size={22} className="text-red-500" />
            </div>
            <div className="font-semibold text-gray-900 mb-1">Can't reach "{orgSlug}"</div>
            <div className="text-sm text-gray-500 mb-5">
              Check the business slug or try again.
            </div>
            <button
              onClick={() => { setEditingSlug(true); setSlugInput(orgSlug) }}
              className="text-sm font-semibold px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Change Slug
            </button>
          </div>
        )}

        {/* Branch / user grid */}
        {!usersLoading && !usersError && apiUsers && (
          showBranchScreen ? (
            <>
              <h2 className="font-bold text-lg mb-1">Select your branch</h2>
              <p className="text-sm text-gray-400 mb-5">Choose the location you're working at</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBranch(b)}
                    className="flex flex-col items-center gap-3 p-5 border border-gray-200 rounded-xl bg-gray-50 hover:border-gray-900 hover:bg-white transition-colors text-center"
                  >
                    <div className="w-11 h-11 bg-gray-200 rounded-xl flex items-center justify-center">
                      <Building2 size={18} className="text-gray-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 leading-snug">{b.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-bold text-lg mb-1">
                {overrideMode ? 'Admin Override' : "Who's working today?"}
              </h2>
              <p className="text-sm text-gray-400 mb-5">
                {overrideMode
                  ? 'Select an admin or manager to continue'
                  : 'Select your profile to continue'}
              </p>

              <div className="flex flex-col gap-2">
                {visibleUsers.map((u) => {
                  const lastSeen = formatLastLogin(lastLogin[String(u.id)])
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl bg-gray-50 text-left hover:border-gray-900 hover:bg-white transition-colors"
                    >
                      <Avatar className="w-12 h-12 flex-shrink-0">
                        <AvatarFallback className="bg-gray-200 text-gray-700 text-base font-bold">
                          {u.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-sm">{u.name}</div>
                        {lastSeen && (
                          <div className="text-xs text-gray-400 mt-0.5">{lastSeen}</div>
                        )}
                      </div>
                      <RoleBadge role={u.role} />
                    </button>
                  )
                })}
              </div>
            </>
          )
        )}
      </div>
    </div>
  )
}
