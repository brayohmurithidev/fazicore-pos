import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, Building2, Lock, AlertCircle, Loader2, Delete, HardDrive } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RoleBadge } from '@/components/shared/RoleBadge'
import { useAuthStore } from '@/stores/auth'
import { useOrgUsers, usePinLogin, useClockIn } from '@/lib/queries'
import { isLocalMode } from '@/lib/local-mode'
import { localCountUsers, localGetUsers, localVerifyPin, localCreateUser } from '@/lib/local-commands'
import type { LocalUser } from '@/lib/local-commands'
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

function PageLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const iconH = size === 'lg' ? 'h-20' : size === 'sm' ? 'h-14' : 'h-16'
  const nameSize = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-xl' : 'text-2xl'
  const tagSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]'
  return (
    <div className="flex flex-col items-center gap-2">
      <img src="/assets/fazistore-icon.svg" alt="Fazi POS" className={`${iconH} w-auto`} />
      <div className="text-center leading-none">
        <div className={`${nameSize} font-extrabold tracking-tight`}>
          <span className="text-gray-900">fazi</span><span className="text-amber-500">store</span>
        </div>
        <div className={`${tagSize} font-semibold tracking-[0.18em] text-gray-400 uppercase mt-1`}>
          Point of Sale &amp; Inventory
        </div>
      </div>
    </div>
  )
}

// ── Local (standalone) login ───────────────────────────────────────────────────

function LocalSetupScreen({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) { setErr('Enter your name'); return }
    if (pin.length < 4) { setErr('PIN must be at least 4 digits'); return }
    if (pin !== confirm) { setErr('PINs do not match'); return }
    setBusy(true)
    try {
      await localCreateUser(name.trim(), pin, 'admin')
      onDone()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-sm overflow-hidden">
        <div className="flex justify-center px-8 py-7 border-b border-gray-100">
          <PageLogo size="md" />
        </div>
        <div className="p-8">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive size={16} className="text-amber-500" />
            <h2 className="font-bold text-lg text-gray-900">First-time Setup</h2>
          </div>
          <p className="text-sm text-gray-400 mb-5">Create your admin account to get started in offline mode.</p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Your Name</label>
              <input
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 transition-colors"
                placeholder="e.g. Jane Wanjiku"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">PIN (4–8 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                className="w-full text-sm border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 transition-colors"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                className="w-full text-sm border border-gray-200 rounded-lg px-3.5 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 transition-colors"
                placeholder="••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            {err && <p className="text-xs text-red-500">{err}</p>}
            <button
              onClick={handleCreate}
              disabled={busy}
              className="w-full text-sm font-semibold px-4 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 active:bg-amber-700 transition-colors disabled:opacity-50 mt-1"
            >
              {busy ? 'Creating…' : 'Create Account & Start'}
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-300 mt-8">Standalone mode · No internet required</p>
    </div>
  )
}

function LocalLoginPage() {
  const [users, setUsers] = useState<LocalUser[]>([])
  const [selectedUser, setSelectedUser] = useState<LocalUser | null>(null)
  const [pin, setPin] = useState('')
  const [pinAttempts, setPinAttempts] = useState(0)
  const [pinLocked, setPinLocked] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [error, setError] = useState('')
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const load = async () => {
    const count = await localCountUsers()
    if (count === 0) { setNeedsSetup(true); return }
    setNeedsSetup(false)
    setUsers(await localGetUsers())
  }

  useEffect(() => { load() }, [])

  const roleHome = (role: string) =>
    role === 'cashier' ? '/pos' : role === 'stock' ? '/inventory' : '/dashboard'

  const handlePinKey = async (k: string) => {
    if (pinLocked || !selectedUser) return
    if (k === 'del') { setPin((p) => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 8) return
    const next = pin + k
    setPin(next)
    if (next.length < 4) return

    const verified = await localVerifyPin(selectedUser.id, next)
    if (verified) {
      const user: User = {
        id: String(verified.id),
        name: verified.name,
        role: verified.role as User['role'],
        branch: '',
        avatar: getInitials(verified.name),
        pin: '',
      }
      setTimeout(() => {
        login(user, 'local', 'local')
        navigate(roleHome(user.role))
      }, 200)
    } else if (next.length >= 4) {
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
    }
  }

  useEffect(() => {
    if (!selectedUser || pinLocked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handlePinKey(e.key)
      else if (e.key === 'Backspace') handlePinKey('del')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, pinLocked, pin, pinAttempts])

  if (needsSetup === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={26} className="animate-spin text-amber-500" />
      </div>
    )
  }

  if (needsSetup) {
    return <LocalSetupScreen onDone={load} />
  }

  const pageBase = 'min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6'

  // PIN screen
  if (selectedUser) {
    return (
      <div className={pageBase}>
        <div className="bg-white border border-gray-200 rounded-2xl w-full sm:max-w-sm shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button onClick={() => { setSelectedUser(null); setPin(''); setError('') }} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={15} /> Back
            </button>
            <PageLogo size="sm" />
            <div className="w-14" />
          </div>
          <div className="px-8 py-7">
            {pinLocked ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
                  <Lock size={24} className="text-red-500" />
                </div>
                <div className="font-bold text-lg text-gray-900 mb-2">Account Locked</div>
                <div className="text-sm text-gray-500 mb-7">Too many failed attempts. Try again.</div>
                <button onClick={() => { setPinAttempts(0); setPinLocked(false); setSelectedUser(null) }} className="w-full py-3 px-4 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors">
                  Back to users
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <Avatar className="w-16 h-16 mx-auto mb-3">
                    <AvatarFallback className="bg-amber-100 text-amber-700 text-xl font-bold">
                      {getInitials(selectedUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="font-bold text-xl text-gray-900">{selectedUser.name}</div>
                  <div className="mt-2"><RoleBadge role={selectedUser.role as User['role']} /></div>
                </div>
                <div className="text-[13px] font-semibold text-gray-500 text-center mb-4 uppercase tracking-widest">Enter PIN</div>
                <div key={shakeKey} className={`flex justify-center gap-4 mb-1 ${shakeKey > 0 ? 'animate-shake' : ''}`}>
                  {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                    <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${pin.length > i ? 'bg-amber-500 scale-110' : 'bg-gray-200'}`} />
                  ))}
                </div>
                <div className="h-7 flex items-center justify-center mb-3">
                  {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}
                </div>
                <div className="grid grid-cols-3 gap-2.5 md:hidden">
                  {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) =>
                    k === '' ? <div key={i} /> : (
                      <button key={i} onClick={() => handlePinKey(k)}
                        className={`py-4 text-xl font-semibold rounded-xl border transition-colors active:scale-95 ${k === 'del' ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100' : 'bg-gray-50 text-gray-900 border-gray-100 hover:bg-gray-100'}`}>
                        {k === 'del' ? <Delete size={18} /> : k}
                      </button>
                    )
                  )}
                </div>
                <p className="hidden md:block text-[12px] text-gray-400 text-center mt-3">Type your PIN using the keyboard</p>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-300 mt-8">Standalone mode · No internet required</p>
      </div>
    )
  }

  // User selection
  return (
    <div className={pageBase}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg sm:max-w-xl shadow-sm overflow-hidden">
        <div className="flex justify-center px-8 py-6 border-b border-gray-100">
          <PageLogo size="sm" />
        </div>
        <div className="p-8">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive size={15} className="text-amber-500" />
            <h2 className="font-bold text-xl text-gray-900">Who's working today?</h2>
          </div>
          <p className="text-sm text-gray-400 mb-6">Select your profile to sign in</p>
          <div className="flex flex-col gap-2">
            {users.filter((u) => u.is_active).map((u) => (
              <button key={u.id} onClick={() => { setSelectedUser(u); setPin(''); setPinAttempts(0); setPinLocked(false); setError('') }}
                className="group flex items-center gap-4 p-4 border border-gray-200 rounded-xl bg-gray-50 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors">
                <Avatar className="w-12 h-12 flex-shrink-0">
                  <AvatarFallback className="bg-gray-100 group-hover:bg-amber-100 text-gray-700 group-hover:text-amber-700 text-base font-bold transition-colors">
                    {getInitials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-[15px]">{u.name}</div>
                </div>
                <RoleBadge role={u.role as User['role']} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-300 mt-8">Standalone mode · No internet required</p>
    </div>
  )
}

// ── Online login ───────────────────────────────────────────────────────────────

export function LoginPage() {
  return isLocalMode ? <LocalLoginPage /> : <OnlineLoginPage />
}

function OnlineLoginPage() {

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
            photo_url: data.user.photo_url ?? undefined,
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

  useEffect(() => {
    if (!selectedUser || pinLocked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handlePinKey(e.key)
      else if (e.key === 'Backspace') handlePinKey('del')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, pinLocked, pin, pinAttempts, pinLogin.isPending])

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
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
          placeholder="your-business-slug"
          value={slugInput}
          onChange={(e) => setSlugInput(e.target.value)}
        />
        <button type="submit" className="text-sm font-semibold px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors">Go</button>
        <button type="button" onClick={() => setEditingSlug(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
      </form>
    ) : (
      <button
        onClick={() => { setEditingSlug(true); setSlugInput(orgSlug) }}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors"
      >
        <Building2 size={13} />
        <span className="font-medium text-gray-600">{orgSlug}</span>
        <span>· Switch</span>
      </button>
    )

  const pageBase = 'min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6'

  // ── No slug yet ────────────────────────────────────────────────────────
  if (!orgSlug || editingSlug) {
    return (
      <div className={pageBase}>
        <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-sm overflow-hidden">
          <div className="flex justify-center px-8 py-7 border-b border-gray-100">
            <PageLogo size="md" />
          </div>
          <div className="p-8">
            <h2 className="font-bold text-lg text-gray-900 mb-1">Welcome</h2>
            <p className="text-sm text-gray-400 mb-5">Enter your business slug to get started</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const s = slugInput.trim()
                if (s) { setOrgSlug(s); setEditingSlug(false); setSlugInput('') }
              }}
            >
              <input
                autoFocus
                className="w-full text-sm border border-gray-200 rounded-lg px-3.5 py-3 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 mb-3 transition-colors"
                placeholder="your-business-slug"
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value)}
              />
              <button
                type="submit"
                className="w-full text-sm font-semibold px-4 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 active:bg-amber-700 transition-colors"
              >
                Continue
              </button>
            </form>
          </div>
        </div>

        <p className="text-xs text-gray-300 mt-8">Fazilabs Business Solutions</p>
      </div>
    )
  }

  // ── PIN screen ─────────────────────────────────────────────────────────
  if (selectedUser) {
    return (
      <div className={pageBase}>
        <div className="bg-white border border-gray-200 rounded-2xl w-full sm:max-w-sm shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft size={15} /> Back
            </button>
            <PageLogo size="sm" />
            <div className="w-14" />
          </div>

          <div className="px-8 py-7">
          {pinLocked ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 mx-auto mb-4 bg-red-50 rounded-full flex items-center justify-center">
                <Lock size={24} className="text-red-500" />
              </div>
              <div className="font-bold text-lg text-gray-900 mb-2">Account Locked</div>
              <div className="text-sm text-gray-500 mb-7">
                Too many failed attempts. Ask an admin to assist.
              </div>
              <button
                onClick={() => {
                  setPinAttempts(0)
                  setPinLocked(false)
                  setSelectedUser(null)
                  setOverrideMode(true)
                }}
                className="w-full py-3 px-4 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors"
              >
                Admin Override
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <Avatar className="w-16 h-16 mx-auto mb-3">
                  <AvatarFallback className="bg-amber-100 text-amber-700 text-xl font-bold">
                    {selectedUser.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="font-bold text-xl text-gray-900">{selectedUser.name}</div>
                <div className="mt-2"><RoleBadge role={selectedUser.role} /></div>
              </div>

              <div className="text-[13px] font-semibold text-gray-500 text-center mb-4 uppercase tracking-widest">Enter PIN</div>

              <div key={shakeKey} className={`flex justify-center gap-4 mb-1 ${shakeKey > 0 ? 'animate-shake' : ''}`}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${pin.length > i ? 'bg-amber-500 scale-110' : 'bg-gray-200'}`}
                  />
                ))}
              </div>

              <div className="h-7 flex items-center justify-center mb-3">
                {error && <p className="text-xs text-red-500 text-center font-medium">{error}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2.5 md:hidden">
                {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) =>
                  k === '' ? <div key={i} /> : (
                    <button
                      key={i}
                      onClick={() => handlePinKey(k)}
                      disabled={pinLogin.isPending}
                      className={`py-4 text-xl font-semibold rounded-xl border transition-colors disabled:opacity-50 active:scale-95 ${
                        k === 'del'
                          ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
                          : 'bg-gray-50 text-gray-900 border-gray-100 hover:bg-gray-100'
                      }`}
                    >
                      {k === 'del' ? <Delete size={18} /> : k}
                    </button>
                  )
                )}
              </div>

              <p className="hidden md:block text-[12px] text-gray-400 text-center mt-3">
                Type your PIN using the keyboard
              </p>

              {pinAttempts > 0 && (
                <div className="text-center text-[11px] text-gray-400 mt-3">
                  Attempt {pinAttempts} of {MAX_ATTEMPTS}
                </div>
              )}
            </>
          )}
          </div>
        </div>

        <p className="text-xs text-gray-300 mt-8">Fazilabs Business Solutions</p>
      </div>
    )
  }

  // ── Branch or User selection ───────────────────────────────────────────

  const showBranchScreen = isMultiBranch && !selectedBranch && !overrideMode

  return (
    <div className={pageBase}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg sm:max-w-xl shadow-sm overflow-hidden">
        <div className="flex justify-center px-8 py-6 border-b border-gray-100">
          <PageLogo size="sm" />
        </div>
        <div className="p-8">
        {(selectedBranch || overrideMode) && (
          <button onClick={handleBack} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors">
            <ChevronLeft size={15} />
            {overrideMode ? 'Cancel' : selectedBranch?.name}
          </button>
        )}

        {!selectedBranch && !overrideMode && <SlugSwitcher />}

        {usersLoading && (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <Loader2 size={26} className="animate-spin mb-3 text-amber-500" />
            <span className="text-sm">Connecting to {orgSlug}…</span>
          </div>
        )}

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
              className="text-sm font-semibold px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              Change Slug
            </button>
          </div>
        )}

        {!usersLoading && !usersError && apiUsers && (
          showBranchScreen ? (
            <>
              <h2 className="font-bold text-xl text-gray-900 mb-1">Select your branch</h2>
              <p className="text-sm text-gray-400 mb-6">Choose the location you're working at today</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBranch(b)}
                    className="group flex flex-col items-center gap-3 p-5 border border-gray-200 rounded-xl bg-gray-50 hover:border-amber-300 hover:bg-amber-50 transition-colors text-center"
                  >
                    <div className="w-11 h-11 bg-gray-100 group-hover:bg-amber-100 rounded-xl flex items-center justify-center transition-colors">
                      <Building2 size={18} className="text-gray-500 group-hover:text-amber-600 transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 leading-snug">{b.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-bold text-xl text-gray-900 mb-1">
                {overrideMode ? 'Admin Override' : "Who's working today?"}
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                {overrideMode
                  ? 'Select an admin or manager to continue'
                  : 'Select your profile to sign in'}
              </p>

              <div className="flex flex-col gap-2">
                {visibleUsers.map((u) => {
                  const lastSeen = formatLastLogin(lastLogin[String(u.id)])
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className="group flex items-center gap-4 p-4 border border-gray-200 rounded-xl bg-gray-50 text-left hover:border-amber-300 hover:bg-amber-50 transition-colors"
                    >
                      <Avatar className="w-12 h-12 flex-shrink-0">
                        <AvatarFallback className="bg-gray-100 group-hover:bg-amber-100 text-gray-700 group-hover:text-amber-700 text-base font-bold transition-colors">
                          {u.avatar}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 text-[15px]">{u.name}</div>
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

      <p className="text-xs text-gray-300 mt-8">Fazilabs Business Solutions</p>
    </div>
  )
}
