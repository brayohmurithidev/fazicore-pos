import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { RefreshCw } from 'lucide-react'
import {
  CheckCircle2, XCircle, Pencil, X, Check, Zap, Loader2, Lock, Star,
  Settings, CreditCard, Users, Shield, ClipboardList, Sparkles,
  Usb, Printer as PrinterIcon, Bluetooth, Circle, UserCircle, ChevronRight,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettingsStore } from '@/stores/settings'
import {
  connectPrinter, forgetPort, getPort, getTauriPort, getAvailablePorts, getSystemPrinters, testPrint,
  connectBluetooth, forgetBluetooth, getBluetoothDevice,
} from '@/lib/escpos'
import { isTauriPortOpen } from '@/lib/tauri-serial'
import { isTauri } from '@/hooks/useTauri'
import {
  useSubscription, usePermissions, useUpdatePermissions, FEATURE_CATALOG,
  useMpesaCredentials, useSaveMpesaCredentials, useDeleteMpesaCredentials,
  useSetLiveMpesaEnvironment, useRegisterC2bUrls, useSimulateC2b,
  useOrgInfo,
  type MpesaCredentialsOut,
} from '@/lib/queries'
import { useFeatureFlags } from '@/hooks/useFeature'
import { useAuthStore } from '@/stores/auth'
import { UsersPage } from '@/pages/users/UsersPage'
import { AuditPage } from '@/pages/audit/AuditPage'
import { cn } from '@/lib/utils'
import type { Settings as SettingsType } from '@/types'
import type { ApiPlanInfo } from '@/types/api'

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId = 'general' | 'payments' | 'users' | 'permissions' | 'audit' | 'plan'

// ── Shared primitives ─────────────────────────────────────────────────────────

function Toggle({ label, sub, value, onChange, locked }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; locked?: boolean
}) {
  return (
    <div className={`flex justify-between items-center py-3.5 border-b border-gray-100 last:border-0 ${locked ? 'opacity-60' : ''}`}>
      <div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-900">{label}</div>
          {locked && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
              <Lock size={9} /> Upgrade
            </span>
          )}
        </div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
      </div>
      <button
        onClick={() => !locked && onChange(!value)}
        disabled={locked}
        className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${locked ? 'cursor-not-allowed bg-gray-200' : value ? 'bg-gray-900' : 'bg-gray-300'}`}
      >
        <div className={`w-[18px] h-[18px] rounded-full bg-white absolute top-[3px] transition-all ${value && !locked ? 'left-[23px]' : 'left-[3px]'}`} />
      </button>
    </div>
  )
}

function Section({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
      <div className="flex items-center justify-between mb-1">
        <div className="font-bold text-sm text-gray-900">{title}</div>
        {action}
      </div>
      <Separator className="mb-3" />
      {children}
    </div>
  )
}

// ── Business Information ───────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  'Minimart / Supermarket', 'Bar / Restaurant', 'Pharmacy', 'Hardware Store',
  'Clothing & Fashion', 'Electronics', 'Bakery', 'Other',
]
const CURRENCIES = [
  'KES — Kenyan Shilling', 'UGX — Ugandan Shilling', 'TZS — Tanzanian Shilling',
  'USD — US Dollar', 'GBP — British Pound',
]

function BusinessInfoSection() {
  const { settings, update } = useSettingsStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<SettingsType>>({})

  const startEdit = () => {
    setDraft({
      businessName: settings.businessName, businessType: settings.businessType,
      country: settings.country, currency: settings.currency,
      kraPin: settings.kraPin, vatNumber: settings.vatNumber,
      businessEmail: settings.businessEmail, businessPhone: settings.businessPhone,
    })
    setEditing(true)
  }

  const f = (k: keyof SettingsType) => (editing ? (draft[k] as string ?? '') : (settings[k] as string ?? ''))
  const setF = (k: keyof SettingsType) => (v: string) => setDraft((d) => ({ ...d, [k]: v }))

  if (editing) {
    return (
      <Section
        title="Business Information"
        action={
          <div className="flex gap-1.5">
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors">
              <X size={12} /> Cancel
            </button>
            <button onClick={() => { update(draft); setEditing(false) }} className="flex items-center gap-1 text-xs text-white bg-gray-900 hover:bg-gray-700 px-2 py-1 rounded transition-colors">
              <Check size={12} /> Save
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
          <div className="col-span-1 sm:col-span-2">
            <Label className="text-xs text-gray-500 mb-1.5 block">Business Name</Label>
            <Input value={f('businessName')} onChange={(e) => setF('businessName')(e.target.value)} placeholder="Your business name" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Business Type</Label>
            {(() => {
              const knownType = BUSINESS_TYPES.includes(f('businessType')) ? f('businessType') : 'Other'
              return (
                <div className="flex flex-col gap-2">
                  <Select value={knownType} onValueChange={(v) => { if (v && v !== 'Other') setF('businessType')(v); else setF('businessType')('') }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {knownType === 'Other' && (
                    <Input value={f('businessType')} onChange={(e) => setF('businessType')(e.target.value)} placeholder="Describe your business type" autoFocus />
                  )}
                </div>
              )
            })()}
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Currency</Label>
            <Select value={f('currency')} onValueChange={(v) => setF('currency')(v ?? '')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">Country</Label><Input value={f('country')} onChange={(e) => setF('country')(e.target.value)} placeholder="e.g. Kenya" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">Phone</Label><Input value={f('businessPhone')} onChange={(e) => setF('businessPhone')(e.target.value)} placeholder="+254 712 000 001" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">Email</Label><Input value={f('businessEmail')} onChange={(e) => setF('businessEmail')(e.target.value)} placeholder="info@mybusiness.co.ke" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">KRA PIN</Label><Input value={f('kraPin')} onChange={(e) => setF('kraPin')(e.target.value)} placeholder="P051234567W" /></div>
          <div><Label className="text-xs text-gray-500 mb-1.5 block">VAT Number</Label><Input value={f('vatNumber')} onChange={(e) => setF('vatNumber')(e.target.value)} placeholder="VAT/2024/KE/001" /></div>
        </div>
      </Section>
    )
  }

  const rows: [string, string][] = [
    ['Business Name', settings.businessName], ['Business Type', settings.businessType],
    ['Country', settings.country], ['Currency', settings.currency],
    ...(settings.businessPhone ? [['Phone', settings.businessPhone] as [string, string]] : []),
    ...(settings.businessEmail ? [['Email', settings.businessEmail] as [string, string]] : []),
    ...(settings.kraPin ? [['KRA PIN', settings.kraPin] as [string, string]] : []),
    ...(settings.vatNumber ? [['VAT Number', settings.vatNumber] as [string, string]] : []),
  ]

  return (
    <Section title="Business Information" action={
      <button onClick={startEdit} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded border border-gray-200 hover:border-gray-400 transition-colors">
        <Pencil size={11} /> Edit
      </button>
    }>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between items-center py-2.5 border-b border-gray-100 last:border-0 text-sm">
          <span className="text-gray-500">{k}</span>
          <span className="font-medium text-right max-w-[60%] truncate">{v || <span className="text-gray-300">—</span>}</span>
        </div>
      ))}
    </Section>
  )
}

// ── Printer Setup ─────────────────────────────────────────────────────────────

type PrinterStatus = 'idle' | 'connecting' | 'connected' | 'testing' | 'error'
type CupsStatus    = 'idle' | 'testing' | 'ok' | 'error'

function PrinterSetupSection() {
  const { settings, update } = useSettingsStore()

  // Active mode: cups (macOS system printer) or serial (USB/raw)
  const printerMode = settings.printerMode ?? (isTauri ? 'cups' : 'serial')
  const isCupsMode  = isTauri && printerMode === 'cups'

  // ── CUPS state ──
  const [cupsPrinters, setCupsPrinters] = useState<string[]>([])
  const [cupsLoading,  setCupsLoading]  = useState(false)
  const [cupsStatus,   setCupsStatus]   = useState<CupsStatus>('idle')
  const [cupsMsg,      setCupsMsg]      = useState('')

  const loadCupsPrinters = async () => {
    setCupsLoading(true)
    try {
      const printers = await getSystemPrinters()
      setCupsPrinters(printers)
      if (printers.length > 0 && !settings.cupsName) update({ cupsName: printers[0] })
    } finally {
      setCupsLoading(false)
    }
  }

  // ── USB / Serial state ──
  const serialSupported = isTauri || ('serial' in navigator)
  const [usbStatus, setUsbStatus] = useState<PrinterStatus>(
    () => (isTauri ? isTauriPortOpen() : !!getPort()) ? 'connected' : 'idle'
  )
  const [usbMsg, setUsbMsg] = useState('')

  const [tauriPorts, setTauriPorts]     = useState<string[]>([])
  const [selectedPort, setSelectedPort] = useState(getTauriPort() ?? '')

  const loadTauriPorts = async () => {
    const ports = await getAvailablePorts()
    setTauriPorts(ports)
    if (ports.length > 0 && !selectedPort) setSelectedPort(ports[0])
  }

  useEffect(() => {
    if (isTauri) {
      loadCupsPrinters()
      loadTauriPorts()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Bluetooth state ──
  const bleSupported = !!navigator.bluetooth
  const [bleStatus, setBleStatus] = useState<PrinterStatus>(() => getBluetoothDevice() ? 'connected' : 'idle')
  const [bleMsg, setBleMsg]       = useState('')

  // ── Handlers ──
  async function handleUsbConnect() {
    setUsbStatus('connecting'); setUsbMsg('')
    const ok = await connectPrinter(isTauri ? selectedPort : undefined, settings.printerBaudRate ?? 9600)
    if (ok) { setUsbStatus('connected'); setUsbMsg(isTauri ? `Connected to ${selectedPort}.` : 'USB printer connected.') }
    else    { setUsbStatus('error');     setUsbMsg('Could not connect. Make sure the printer is plugged in.') }
  }

  async function handleBleConnect() {
    setBleStatus('connecting'); setBleMsg('')
    const ok = await connectBluetooth()
    if (ok) { setBleStatus('connected'); setBleMsg(`Connected to "${getBluetoothDevice()?.name ?? 'BLE printer'}".`) }
    else    { setBleStatus('error');     setBleMsg('Could not connect. Ensure the printer is powered on and paired.') }
  }

  async function handleTest() {
    if (isCupsMode) {
      setCupsStatus('testing'); setCupsMsg('')
      const ok = await testPrint(settings)
      if (ok) { setCupsStatus('ok');    setCupsMsg('Test print sent!') }
      else    { setCupsStatus('error'); setCupsMsg('Print failed. Is the printer online?') }
      return
    }
    const active = bleStatus === 'connected' ? 'ble' : 'usb'
    if (active === 'ble') { setBleStatus('testing'); setBleMsg('') }
    else                  { setUsbStatus('testing'); setUsbMsg('') }
    const ok = await testPrint(settings)
    if (active === 'ble') {
      if (ok) { setBleStatus('connected'); setBleMsg('Test print sent!') }
      else    { setBleStatus('error');     setBleMsg('Print failed. Try reconnecting.') }
    } else {
      if (ok) { setUsbStatus('connected'); setUsbMsg('Test print sent!') }
      else    { setUsbStatus('error');     setUsbMsg('Print failed. Try disconnecting and reconnecting.') }
    }
  }

  const cupsReady    = isCupsMode && !!settings.cupsName
  const usbConnected = usbStatus === 'connected'
  const bleConnected = bleStatus === 'connected'
  const anyConnected = cupsReady || usbConnected || bleConnected
  const cupsBusy     = cupsStatus === 'testing'
  const usbBusy      = usbStatus === 'connecting' || usbStatus === 'testing'
  const bleBusy      = bleStatus === 'connecting' || bleStatus === 'testing'
  const anyBusy      = cupsBusy || usbBusy || bleBusy

  return (
    <Section title="Thermal Printer">

      {/* Tauri: printer mode selector */}
      {isTauri && (
        <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
          <div>
            <div className="text-sm font-medium text-gray-900">Connection Mode</div>
            <div className="text-xs text-gray-400 mt-0.5">How the app talks to the printer</div>
          </div>
          <select
            value={printerMode}
            onChange={(e) => update({ printerMode: e.target.value as 'cups' | 'serial' })}
            className="text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="cups">CUPS System Printer</option>
            <option value="serial">USB / Serial (raw)</option>
          </select>
        </div>
      )}

      {/* ── CUPS mode ── */}
      {isCupsMode && (
        <>
          <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <PrinterIcon size={13} className="text-gray-400" /> System Printer
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Printers registered in macOS Printers &amp; Scanners
              </div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cupsReady ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {cupsReady ? 'Ready' : 'Not selected'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2 mb-1">
            <select
              value={settings.cupsName ?? ''}
              onChange={(e) => update({ cupsName: e.target.value })}
              className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              {cupsPrinters.length === 0
                ? <option value="">No system printers found</option>
                : cupsPrinters.map((p) => <option key={p} value={p}>{p}</option>)
              }
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={loadCupsPrinters}
              disabled={cupsLoading}
              title="Refresh printer list"
              className="px-2"
            >
              {cupsLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </Button>
          </div>
          {cupsMsg && (
            <p className={`text-xs mt-1 px-0.5 ${cupsStatus === 'error' ? 'text-red-500' : 'text-green-600'}`}>{cupsMsg}</p>
          )}
        </>
      )}

      {/* ── Serial mode (Tauri serial) or browser serial ── */}
      {(!isTauri || printerMode === 'serial') && (
        <>
          <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <Usb size={13} className="text-gray-400" /> USB / Serial
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {isTauri ? 'ESC/POS via USB cable — native desktop serial' : 'ESC/POS via USB cable (Chrome / Edge only)'}
              </div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${usbConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {usbConnected ? (isTauri ? selectedPort : 'Connected') : 'Not connected'}
            </span>
          </div>

          {isTauri && (
            <div className="mt-2 mb-1">
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={selectedPort}
                  onChange={(e) => { setSelectedPort(e.target.value); setUsbStatus('idle'); setUsbMsg('') }}
                  disabled={usbConnected || usbBusy}
                  className="flex-1 text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                >
                  {tauriPorts.length === 0
                    ? <option value="">No serial ports found</option>
                    : tauriPorts.map((p) => <option key={p} value={p}>{p}</option>)
                  }
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadTauriPorts}
                  disabled={usbBusy}
                  title="Refresh port list"
                  className="px-2"
                >
                  <RefreshCw size={13} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {!usbConnected ? (
                  <Button
                    size="sm"
                    onClick={handleUsbConnect}
                    disabled={usbBusy || bleConnected || !selectedPort}
                    className="flex items-center gap-1.5"
                  >
                    {usbBusy ? <Loader2 size={13} className="animate-spin" /> : <Usb size={13} />}
                    {usbStatus === 'connecting' ? 'Connecting…' : 'Connect'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { forgetPort(); setUsbStatus('idle'); setUsbMsg('') }} disabled={anyBusy}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isTauri && !serialSupported && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
              Web Serial requires Chrome or Edge.
            </p>
          )}
          {!isTauri && serialSupported && (
            <div className="flex flex-wrap gap-2 mt-2 mb-1">
              {!usbConnected ? (
                <Button size="sm" onClick={handleUsbConnect} disabled={usbBusy || bleConnected} className="flex items-center gap-1.5">
                  {usbBusy ? <Loader2 size={13} className="animate-spin" /> : <Usb size={13} />}
                  {usbStatus === 'connecting' ? 'Connecting…' : 'Connect USB'}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { forgetPort(); setUsbStatus('idle'); setUsbMsg('') }} disabled={anyBusy}>
                  Disconnect
                </Button>
              )}
            </div>
          )}

          {usbMsg && (
            <p className={`text-xs mt-1 px-0.5 ${usbStatus === 'error' ? 'text-red-500' : 'text-green-600'}`}>{usbMsg}</p>
          )}

          {/* Baud rate */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <div className="text-sm font-medium text-gray-900">Baud Rate</div>
              <div className="text-xs text-gray-400 mt-0.5">Must match your printer's setting (9600 is default)</div>
            </div>
            <select
              value={settings.printerBaudRate ?? 9600}
              onChange={(e) => update({ printerBaudRate: Number(e.target.value) as SettingsType['printerBaudRate'] })}
              className="text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value={9600}>9600</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400</option>
              <option value={57600}>57600</option>
              <option value={115200}>115200</option>
            </select>
          </div>
        </>
      )}

      {/* Bluetooth — only shown in browser */}
      {!isTauri && (
        <>
          <div className="flex items-center justify-between py-2.5 border-b border-gray-100 mt-2">
            <div>
              <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <Bluetooth size={13} className="text-gray-400" /> Bluetooth (BLE)
              </div>
              <div className="text-xs text-gray-400 mt-0.5">Wireless ESC/POS — P58E and similar BLE printers</div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bleConnected ? 'bg-gray-100 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
              {bleConnected ? (getBluetoothDevice()?.name ?? 'Connected') : 'Not connected'}
            </span>
          </div>
          {!bleSupported && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
              Web Bluetooth requires Chrome on Android, or Chrome with the Experimental Web Platform features flag enabled.
            </p>
          )}
          {bleMsg && (
            <p className={`text-xs mt-1.5 px-0.5 ${bleStatus === 'error' ? 'text-red-500' : 'text-green-600'}`}>{bleMsg}</p>
          )}
          {bleSupported && (
            <div className="flex flex-wrap gap-2 mt-2">
              {!bleConnected ? (
                <Button size="sm" onClick={handleBleConnect} disabled={bleBusy || usbConnected} className="flex items-center gap-1.5">
                  {bleBusy ? <Loader2 size={13} className="animate-spin" /> : <Bluetooth size={13} />}
                  {bleStatus === 'connecting' ? 'Connecting…' : 'Connect Bluetooth'}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { forgetBluetooth(); setBleStatus('idle'); setBleMsg('') }} disabled={anyBusy}>
                  Disconnect
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Shared test button */}
      {anyConnected && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <Button size="sm" onClick={handleTest} disabled={anyBusy} className="flex items-center gap-1.5">
            {anyBusy ? <Loader2 size={13} className="animate-spin" /> : <PrinterIcon size={13} />}
            {anyBusy ? 'Printing…' : 'Test Print'}
          </Button>
        </div>
      )}
    </Section>
  )
}

// ── General tab ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const { settings, update } = useSettingsStore()
  const flags = useFeatureFlags()
  const patch = <K extends keyof SettingsType>(k: K, v: SettingsType[K]) => update({ [k]: v })

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <BusinessInfoSection />
      <Section title="POS Behaviour">
        <Toggle label="Require Cashier PIN" sub="Cashier must enter PIN to start a shift" value={settings.requirePin} onChange={(v) => patch('requirePin', v)} />
        <Toggle label="Print Receipt by Default" sub="Auto-open receipt after every sale" value={settings.autoPrint} onChange={(v) => patch('autoPrint', v)} />
        <Toggle label="Low Stock Alerts" sub="Show warnings when stock is below minimum" value={settings.lowStockAlerts} onChange={(v) => patch('lowStockAlerts', v)} />
        <Toggle label="Expiry Date Tracking" sub="Alert when products near expiry" value={settings.expiryTracking} onChange={(v) => patch('expiryTracking', v)} />
        <Toggle label="Barcode Scanner Mode" sub="Enable barcode input field on POS screen" value={settings.barcodeMode} onChange={(v) => patch('barcodeMode', v)} locked={flags.barcode_mode === false} />
      </Section>
      <Section title="Receipt Settings">
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-gray-900">Receipt Paper</div>
            <div className="text-xs text-gray-400 mt-0.5">Match your printer's paper size</div>
          </div>
          <select
            value={settings.receiptPaper ?? '80mm'}
            onChange={(e) => patch('receiptPaper', e.target.value as SettingsType['receiptPaper'])}
            className="text-sm border border-gray-200 rounded-md px-2.5 py-1.5 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="58mm">58mm Thermal</option>
            <option value="80mm">80mm Thermal</option>
            <option value="a4">A4 / Letter</option>
          </select>
        </div>
        <Toggle label="Show VAT Breakdown" sub="Print VAT amounts on receipt" value={settings.showVat} onChange={(v) => patch('showVat', v)} />
        <Toggle label="Show Business Logo" sub="Include logo on printed receipts" value={settings.showLogo} onChange={(v) => patch('showLogo', v)} />
        <Toggle label="Digital Receipt (SMS)" sub="Send receipt via SMS to customer" value={settings.smsReceipt} onChange={(v) => patch('smsReceipt', v)} locked={flags.sms_receipts === false} />
      </Section>
      {(isTauri || flags.thermal_printing !== false) && <PrinterSetupSection />}
      <Section title="Branches">
        <Toggle label="Branch-level Inventory" sub="Each branch tracks its own stock separately" value={settings.branchInventory} onChange={(v) => patch('branchInventory', v)} locked={flags.multi_branch === false} />
        <Toggle label="Consolidated Reports" sub="Combined reports across all branches" value={settings.consolidatedReports} onChange={(v) => patch('consolidatedReports', v)} locked={flags.multi_branch === false} />
        <Toggle label="Inter-branch Stock Transfer" sub="Allow moving stock between branches" value={settings.stockTransfer} onChange={(v) => patch('stockTransfer', v)} locked={flags.multi_branch === false} />
      </Section>
    </div>
  )
}

// ── M-Pesa Daraja credentials section ─────────────────────────────────────────

function EnvCredPanel({ env, existing, orgSlug }: {
  env: 'sandbox' | 'production'
  existing: MpesaCredentialsOut | undefined
  orgSlug: string
}) {
  const save        = useSaveMpesaCredentials()
  const remove      = useDeleteMpesaCredentials()
  const setLive     = useSetLiveMpesaEnvironment()
  const registerC2b = useRegisterC2bUrls()
  const simulate    = useSimulateC2b()

  const [simPhone,  setSimPhone]  = useState('254708374149')
  const [simAmount, setSimAmount] = useState('100')
  const [simRef,    setSimRef]    = useState('TestPayment')

  const apiBase    = `${window.location.origin}/api/v1/mpesa/callback`
  const autoStkUrl = `${apiBase}/${orgSlug}/stk`
  const autoC2bUrl = `${apiBase}/${orgSlug}/c2b`

  const [shortcode, setShortcode]   = useState('')
  const [consumerKey, setKey]       = useState('')
  const [consumerSecret, setSecret] = useState('')
  const [passkey, setPasskey]       = useState('')
  const [callbackUrl, setCallback]  = useState('')
  const [editing, setEditing]       = useState(false)
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (existing && !editing) {
      setShortcode(existing.shortcode)
      setCallback(existing.callback_url_override ?? '')
      setKey(''); setSecret(''); setPasskey('')
    }
  }, [existing, editing])

  const handleSave = async () => {
    if (!shortcode) { setMsg({ ok: false, text: 'Business Shortcode is required.' }); return }
    if (!existing && (!consumerKey || !consumerSecret || !passkey)) {
      setMsg({ ok: false, text: 'All credential fields are required for first setup.' }); return
    }
    try {
      await save.mutateAsync({ environment: env, shortcode, consumer_key: consumerKey, consumer_secret: consumerSecret, passkey, callback_url_override: callbackUrl || undefined })
      setMsg({ ok: true, text: 'Credentials saved.' })
      setEditing(false)
    } catch { setMsg({ ok: false, text: 'Failed to save.' }) }
  }

  const isSandbox = env === 'sandbox'
  const bannerCls = isSandbox
    ? 'bg-gray-50 border-gray-200 text-gray-700'
    : 'bg-amber-50 border-amber-200 text-amber-800'

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${existing?.is_live ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'}`}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSandbox ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
            {isSandbox ? 'Sandbox' : 'Production'}
          </span>
          {existing?.is_live && (
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <Circle size={7} className="fill-current" /> Live
            </span>
          )}
          {existing && !existing.is_live && (
            <button
              onClick={async () => { await setLive.mutateAsync(env); setMsg(null) }}
              disabled={setLive.isPending}
              className="text-xs text-gray-500 hover:text-green-700 underline"
            >
              Set as live
            </button>
          )}
        </div>
        {existing && !editing && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => { setEditing(true); setMsg(null) }}>Edit</Button>
            <Button
              size="sm" variant="outline"
              disabled={registerC2b.isPending}
              onClick={async () => {
                try {
                  await registerC2b.mutateAsync(env)
                  setMsg({ ok: true, text: 'C2B URLs registered with Safaricom.' })
                } catch (err: unknown) {
                  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                  setMsg({ ok: false, text: detail ?? 'C2B registration failed.' })
                }
              }}
            >
              {registerC2b.isPending && <Loader2 size={11} className="animate-spin mr-1" />}Register C2B
            </Button>
            <Button size="sm" variant="destructive" onClick={async () => { if (!confirm(`Remove ${env} credentials?`)) return; await remove.mutateAsync(env); setEditing(false); setMsg(null) }} disabled={remove.isPending}>Remove</Button>
          </div>
        )}
      </div>

      <div className={`text-xs px-3 py-2 rounded border ${bannerCls}`}>
        {isSandbox ? 'Test only — no real money charged. Use test credentials from developer.safaricom.co.ke.' : 'Live payments — real money. Ensure your production app is approved.'}
      </div>

      {/* Saved summary */}
      {existing && !editing && (
        <div className="space-y-2">
          <div className="text-xs text-gray-600">Shortcode: <span className="font-semibold text-gray-900">{existing.shortcode}</span></div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mt-1">Callback URLs</div>
          {[
            { label: 'STK',      url: existing.stk_callback_url },
            { label: 'C2B Confirm', url: existing.c2b_confirmation_url },
            { label: 'C2B Validate', url: existing.c2b_validation_url },
          ].map(({ label, url }) => (
            <div key={label} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5">
              <span className="text-[10px] font-bold text-gray-400 w-6 shrink-0">{label}</span>
              <code className="text-[11px] text-gray-700 flex-1 break-all font-mono">{url}</code>
              <button onClick={() => navigator.clipboard.writeText(url)} className="text-[10px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">Copy</button>
            </div>
          ))}
        </div>
      )}

      {/* Simulate C2B — sandbox only, only when saved and not editing */}
      {isSandbox && existing && !editing && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Simulate C2B Payment</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Phone</Label>
              <Input value={simPhone} onChange={(e) => setSimPhone(e.target.value)} placeholder="254708374149" className="text-xs h-8" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Amount (KES)</Label>
              <Input value={simAmount} onChange={(e) => setSimAmount(e.target.value)} placeholder="100" className="text-xs h-8" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Bill Ref</Label>
              <Input value={simRef} onChange={(e) => setSimRef(e.target.value)} placeholder="TestPayment" className="text-xs h-8" />
            </div>
          </div>
          <Button
            size="sm" variant="outline"
            disabled={simulate.isPending}
            onClick={async () => {
              try {
                await simulate.mutateAsync({ phone: simPhone, amount: Number(simAmount), bill_ref: simRef })
                setMsg({ ok: true, text: 'Simulated — check Incoming Payments in POS.' })
              } catch (err: unknown) {
                const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                setMsg({ ok: false, text: detail ?? 'Simulation failed.' })
              }
            }}
          >
            {simulate.isPending && <Loader2 size={11} className="animate-spin mr-1" />}
            Send Test Payment
          </Button>
        </div>
      )}

      {/* Form */}
      {(!existing || editing) && (
        <div className="space-y-2.5">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Business Shortcode *</Label>
            <Input value={shortcode} onChange={(e) => setShortcode(e.target.value)} placeholder={isSandbox ? '174379' : 'Your paybill/till'} />
          </div>
          {[
            { label: 'Consumer Key', val: consumerKey, set: setKey, masked: existing?.consumer_key_masked },
            { label: 'Consumer Secret', val: consumerSecret, set: setSecret, masked: existing?.consumer_secret_masked },
            { label: 'Lipa na M-Pesa Passkey', val: passkey, set: setPasskey, masked: existing?.passkey_masked },
          ].map(({ label, val, set, masked }) => (
            <div key={label}>
              <Label className="text-xs text-gray-500 mb-1 block">{label} *{existing && <span className="text-gray-400 font-normal"> (blank = keep current)</span>}</Label>
              <Input type="password" value={val} onChange={(e) => set(e.target.value)} placeholder={masked ?? 'Paste from Daraja portal'} autoComplete="off" />
            </div>
          ))}
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Callback URL override <span className="text-gray-400 font-normal">(optional — for ngrok / custom domain)</span></Label>
            <Input value={callbackUrl} onChange={(e) => setCallback(e.target.value)} placeholder={autoStkUrl} />
          </div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Auto-generated callback URLs</div>
          {[
            { label: 'STK',          url: (callbackUrl || autoStkUrl).replace('/stk', '/stk') },
            { label: 'C2B Confirm',  url: autoC2bUrl + '/confirm' },
            { label: 'C2B Validate', url: autoC2bUrl + '/validate' },
          ].map(({ label, url }) => (
            <div key={label} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1.5">
              <span className="text-[10px] font-bold text-gray-400 w-6 shrink-0">{label}</span>
              <code className="text-[11px] text-gray-700 flex-1 break-all font-mono">{url}</code>
              <button onClick={() => navigator.clipboard.writeText(url)} className="text-[10px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 shrink-0">Copy</button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            {existing && <Button size="sm" variant="outline" onClick={() => { setEditing(false); setMsg(null) }}>Cancel</Button>}
            <Button size="sm" onClick={handleSave} disabled={save.isPending} className="flex items-center gap-1.5">
              {save.isPending && <Loader2 size={12} className="animate-spin" />}
              {existing ? 'Update' : 'Save Credentials'}
            </Button>
          </div>
        </div>
      )}

      {msg && <p className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-500'}`}>{msg.text}</p>}
    </div>
  )
}

function MpesaCredentialsSection() {
  const { data: allCreds = [], isLoading } = useMpesaCredentials()
  const { data: orgInfo } = useOrgInfo()
  const orgSlug = orgInfo?.slug ?? 'your-org'

  if (isLoading) return null

  const sandbox    = allCreds.find((c) => c.environment === 'sandbox')
  const production = allCreds.find((c) => c.environment === 'production')

  return (
    <Section title="M-Pesa Daraja API">
      <p className="text-xs text-gray-400 -mt-1 mb-3">
        Both environments are stored independently. Toggle which one is <strong>Live</strong> to switch between testing and real payments.
      </p>
      <div className="space-y-4">
        <EnvCredPanel env="sandbox"    existing={sandbox}    orgSlug={orgSlug} />
        <EnvCredPanel env="production" existing={production} orgSlug={orgSlug} />
      </div>
    </Section>
  )
}

// ── Payments tab ──────────────────────────────────────────────────────────────

function PaymentsTab() {
  const { settings, update } = useSettingsStore()
  const flags = useFeatureFlags()
  const { user } = useAuthStore()
  const patch = (k: keyof SettingsType, v: boolean) => update({ [k]: v })

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Section title="Payment Methods">
        <Toggle label="Cash" sub="Accept cash payments" value={settings.cash} onChange={(v) => patch('cash', v)} />
        <Toggle label="M-Pesa Manual" sub="Customer sends M-Pesa, cashier enters the reference code" value={settings.mpesaManual} onChange={(v) => { patch('mpesaManual', v); patch('mpesa', v || settings.mpesaStk) }} locked={flags.mpesa_manual === false} />
        <Toggle label="M-Pesa STK Push" sub="Trigger a payment prompt on the customer's phone" value={settings.mpesaStk} onChange={(v) => { patch('mpesaStk', v); patch('mpesa', v || settings.mpesaManual) }} locked={flags.mpesa_stk === false} />
        <Toggle label="Credit Sales" sub="Allow sales on credit with debt tracking" value={settings.credit} onChange={(v) => patch('credit', v)} locked={flags.credit_system === false} />
        <Toggle label="Other Methods" sub="Bank transfer, card, etc." value={settings.other} onChange={(v) => patch('other', v)} />
        <Toggle label="Split Payments" sub="Allow part-cash, part-M-Pesa" value={(settings.mpesaManual || settings.mpesaStk) && settings.cash} onChange={() => {}} />
      </Section>
      {user?.role === 'admin' && (settings.mpesaManual || settings.mpesaStk) && <MpesaCredentialsSection />}
    </div>
  )
}

// ── Permissions tab ───────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  edit_prices:       { label: 'Edit Prices',        desc: 'Change product selling price' },
  view_reports:      { label: 'View Reports',        desc: 'Access sales & inventory reports' },
  delete_sales:      { label: 'Delete Sales',        desc: 'Void or delete orders' },
  manage_users:      { label: 'Manage Users',        desc: 'Create, edit and deactivate users' },
  apply_discounts:   { label: 'Apply Discounts',     desc: 'Give item or cart discounts at POS' },
  manage_inventory:  { label: 'Manage Inventory',    desc: 'Adjust stock levels & receive orders' },
  process_sales:     { label: 'Process Sales',       desc: 'Create and complete sales transactions' },
}
const ROLE_LABELS: Record<string, string> = { cashier: 'Cashier', manager: 'Manager', stock: 'Stock' }

function PermissionsTab() {
  const { user } = useAuthStore()
  const { data, isLoading } = usePermissions()
  const updatePerms = useUpdatePermissions()
  const [local, setLocal] = useState<Record<string, Record<string, boolean>> | null>(null)
  const [saved, setSaved] = useState(false)

  if (user?.role !== 'admin') {
    return (
      <div className="p-6 text-sm text-gray-400 text-center mt-10">
        Only admins can manage role permissions.
      </div>
    )
  }

  const perms = local ?? data?.permissions ?? {}

  const toggle = (role: string, perm: string) => {
    const base = local ?? data?.permissions ?? {}
    setLocal({ ...base, [role]: { ...(base[role] ?? {}), [perm]: !(base[role]?.[perm] ?? false) } })
    setSaved(false)
  }

  const handleSave = async () => {
    if (!local) return
    await updatePerms.mutateAsync(local)
    setLocal(null); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveAction = local ? (
    <Button size="sm" onClick={handleSave} disabled={updatePerms.isPending}>
      {updatePerms.isPending && <Loader2 size={11} className="animate-spin mr-1" />}Save
    </Button>
  ) : saved ? (
    <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12} />Saved</span>
  ) : null

  const setPosPerm = (perm: string, value: boolean) => {
    const base = local ?? data?.permissions ?? {}
    setLocal({ ...base, pos: { ...(base.pos ?? {}), [perm]: value } })
    setSaved(false)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Section title="Role Permissions" action={saveAction}>
        {isLoading ? <Loader2 size={14} className="animate-spin text-gray-400" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr>
                  <th className="text-left text-xs text-gray-500 pb-3 pr-4 font-semibold">Permission</th>
                  {Object.keys(ROLE_LABELS).map(role => (
                    <th key={role} className="text-center text-xs text-gray-500 pb-3 px-4 font-semibold">{ROLE_LABELS[role]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(PERMISSION_LABELS).map(([perm, { label, desc }]) => (
                  <tr key={perm} className="border-t border-gray-100">
                    <td className="py-3 pr-4">
                      <div className="text-sm font-medium text-gray-900">{label}</div>
                      <div className="text-xs text-gray-400">{desc}</div>
                    </td>
                    {Object.keys(ROLE_LABELS).map(role => {
                      const enabled = perms[role]?.[perm] ?? false
                      return (
                        <td key={role} className="py-3 px-4 text-center">
                          <button
                            onClick={() => toggle(role, perm)}
                            className={`rounded-full relative transition-colors inline-block ${enabled ? 'bg-gray-900' : 'bg-gray-200'}`}
                            style={{ width: 40, height: 22 }}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white absolute top-[3px] transition-all ${enabled ? 'left-[21px]' : 'left-[3px]'}`} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-3">Admins always have all permissions regardless of these settings.</p>
          </div>
        )}
      </Section>

      <Section title="Discount Controls" action={saveAction}>
        <Toggle
          label="Allow cashier discount"
          sub="Cashiers can apply discounts at the POS"
          value={perms?.pos?.allow_cashier_discount !== false}
          onChange={(v) => setPosPerm('allow_cashier_discount', v)}
        />
        <Toggle
          label="Require manager PIN for large discounts"
          sub="Discounts above 10% require manager or admin approval"
          value={perms?.pos?.require_manager_pin !== false}
          onChange={(v) => setPosPerm('require_manager_pin', v)}
        />
      </Section>
    </div>
  )
}

// ── Plan tab ──────────────────────────────────────────────────────────────────

function UsageBar({ label, current, max }: { label: string; current: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((current / max) * 100))
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-gray-900'
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{max < 0 ? `${current} / Unlimited` : `${current} / ${max}`}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${max < 0 ? 20 : pct}%` }} />
      </div>
    </div>
  )
}

const PLAN_ORDER = ['free', 'starter', 'growth', 'business', 'enterprise']

function PlanCollapsible({ title, defaultOpen = true, children }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-bold text-sm text-gray-900">{title}</span>
        <ChevronRight size={15} className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  )
}

function PlanCard({ plan, isCurrent }: { plan: ApiPlanInfo; isCurrent: boolean }) {
  const isEnterprise = plan.slug === 'enterprise'
  const isRecommended = plan.is_recommended && !isCurrent
  return (
    <div className={cn(
      'rounded-xl border-2 p-4 flex flex-col gap-3 transition-all',
      isCurrent     ? 'border-gray-900 bg-gray-50'
      : isRecommended ? 'border-amber-400 bg-amber-50'
      : 'border-gray-200 bg-white hover:border-gray-300'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-gray-900">{plan.name}</span>
          {isRecommended && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              <Star size={9} className="fill-amber-500" /> Recommended
            </span>
          )}
        </div>
        {isCurrent && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">Current</span>
        )}
      </div>

      <div>
        {isEnterprise ? (
          <span className="text-base font-bold text-gray-900">Custom pricing</span>
        ) : plan.price_monthly === 0 ? (
          <span className="text-base font-bold text-gray-900">Free</span>
        ) : (
          <>
            <div className="flex items-baseline gap-0.5">
              <span className="text-xl font-extrabold text-gray-900">KES {plan.price_monthly.toLocaleString()}</span>
              <span className="text-xs text-gray-400">/mo</span>
            </div>
            {plan.price_annual > 0 && (
              <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                KES {plan.price_annual.toLocaleString()}/yr · save {Math.round(100 - (plan.price_annual / (plan.price_monthly * 12)) * 100)}%
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 py-2.5 border-y border-gray-100">
        {[{ label: 'Branches', value: plan.max_branches }, { label: 'Users', value: plan.max_users }, { label: 'Products', value: plan.max_products }].map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-sm font-bold text-gray-900">
              {label === 'Branches' && value === 1 ? 'Single' : value < 0 ? '∞' : value.toLocaleString()}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {plan.features.length > 0 && (
        <ul className="space-y-1.5">
          {plan.features.map((feat) => (
            <li key={feat} className="flex items-center gap-1.5 text-xs text-gray-600">
              <CheckCircle2 size={11} className="text-amber-500 shrink-0" />{feat}
            </li>
          ))}
        </ul>
      )}

      {!isCurrent && (
        <button
          onClick={() => alert(`Contact sales@fazilabs.com to upgrade to ${plan.name}.`)}
          className={cn(
            'mt-auto w-full py-2 rounded-lg text-xs font-bold text-white transition-colors',
            isRecommended ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-900 hover:bg-gray-700'
          )}
        >
          {isEnterprise ? 'Contact Sales' : `Upgrade to ${plan.name}`}
        </button>
      )}
    </div>
  )
}

function PlanTab() {
  const { data: sub, isLoading } = useSubscription()
  const flags = useFeatureFlags()
  const featureGroups = [...new Set(FEATURE_CATALOG.map((f) => f.group))]

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-400">
        <Loader2 size={15} className="animate-spin" /> Loading plan info…
      </div>
    )
  }
  if (!sub) return null

  const statusLabel: Record<string, string> = { trial: 'Free Trial', active: 'Active', suspended: 'Suspended', cancelled: 'Cancelled' }
  const statusColor: Record<string, string> = {
    trial: 'bg-amber-100 text-amber-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
  }
  const trialEnd = sub.trial_ends_at
    ? new Date(sub.trial_ends_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const sortedPlans = [...sub.available_plans].sort(
    (a, b) => PLAN_ORDER.indexOf(a.slug) - PLAN_ORDER.indexOf(b.slug)
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      {/* Current plan */}
      <PlanCollapsible title="Current Plan">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-gray-900">{sub.plan_name} Plan</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor[sub.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {statusLabel[sub.status] ?? sub.status}
              </span>
            </div>
            {trialEnd && sub.status === 'trial' && (
              <div className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
                <Zap size={11} /> Trial ends {trialEnd} — upgrade to keep full access
              </div>
            )}
          </div>
        </div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Usage</div>
        {sub.max_branches === 1
          ? <div className="mb-3 flex justify-between text-xs"><span className="text-gray-500">Branches</span><span className="font-medium">Single business</span></div>
          : <UsageBar label="Branches" current={sub.branch_count} max={sub.max_branches} />
        }
        <UsageBar label="Users" current={sub.user_count} max={sub.max_users} />
        <UsageBar label="Products" current={sub.active_product_count} max={sub.max_products} />
      </PlanCollapsible>

      {/* Included features */}
      <PlanCollapsible title="Included Features">
        {featureGroups.map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">{group}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {FEATURE_CATALOG.filter((f) => f.group === group).map((feat) => {
                const enabled = flags[feat.key] === true
                return (
                  <div key={feat.key} className={`flex items-center gap-2 text-xs py-1 ${enabled ? 'text-gray-700' : 'text-gray-400'}`}>
                    {enabled
                      ? <CheckCircle2 size={12} className="text-amber-500 shrink-0" />
                      : <XCircle    size={12} className="text-gray-300 shrink-0" />
                    }
                    {feat.label}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </PlanCollapsible>

      {/* Available plans */}
      <PlanCollapsible title="Available Plans" defaultOpen={false}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedPlans.map((plan) => (
            <PlanCard key={plan.slug} plan={plan} isCurrent={plan.is_current} />
          ))}
        </div>
      </PlanCollapsible>
    </div>
  )
}

// ── Page shell ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuthStore()
  const flags = useFeatureFlags()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('general')

  const isAdmin = user?.role === 'admin'

  const TABS = ([
    { id: 'general',     label: 'General',      icon: Settings },
    { id: 'payments',    label: 'Payments',     icon: CreditCard },
    { id: 'users',       label: 'Users',        icon: Users,        adminOnly: true },
    { id: 'permissions', label: 'Permissions',  icon: Shield,       adminOnly: true, hidden: flags.permissions_mgmt === false },
    { id: 'audit',       label: 'Audit Log',    icon: ClipboardList, adminOnly: true, hidden: flags.audit_logs === false },
    { id: 'plan',        label: 'Plan & Billing', icon: Sparkles },
  ] as { id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean; hidden?: boolean }[]).filter((t) => !t.hidden && (!t.adminOnly || isAdmin))

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile: horizontal tab bar */}
      <div className="md:hidden flex overflow-x-auto border-b border-gray-200 bg-white shrink-0">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0',
                tab === t.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon size={13} />{t.label}
            </button>
          )
        })}
      </div>

      {/* Desktop: side nav + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="hidden md:flex flex-col w-48 shrink-0 border-r border-gray-200 bg-white py-4 px-2 gap-0.5 overflow-y-auto">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 pb-2">Settings</div>
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  tab === t.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon size={15} className="shrink-0" />
                {t.label}
              </button>
            )
          })}

          <div className="mt-auto pt-4 border-t border-gray-100">
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              <UserCircle size={15} className="shrink-0" />
              My Profile
            </button>
          </div>
        </nav>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'general'     && <GeneralTab />}
          {tab === 'payments'    && <PaymentsTab />}
          {tab === 'users'       && <UsersPage />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'audit'       && <AuditPage />}
          {tab === 'plan'        && <PlanTab />}
        </div>
      </div>
    </div>
  )
}
