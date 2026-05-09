import type { SaleInfo, Settings } from '@/types'
import { isTauri } from '@/hooks/useTauri'
import {
  listTauriPorts,
  connectTauriPort,
  writeTauriPort,
  disconnectTauriPort,
  getTauriPortName,
  isTauriPortOpen,
} from '@/lib/tauri-serial'
import { listSystemPrinters, printRawCups } from '@/lib/tauri-cups'
import { renderReceipt, renderTestReceipt } from '@/lib/receipt'

// ── BLE: known service/characteristic pairs for common thermal printers ───────
const BLE_PROFILES = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', char: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', char: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', char: '49535343-1e4d-4bd9-ba61-23c647249616' },
]
const BLE_CHUNK = 200

// ── BLE state ─────────────────────────────────────────────────────────────────
let _bleDevice: BluetoothDevice | null = null
let _bleChar: BluetoothRemoteGATTCharacteristic | null = null

export function forgetBluetooth() {
  try { _bleDevice?.gatt?.disconnect() } catch { /* ignore */ }
  _bleDevice = null
  _bleChar = null
}
export function getBluetoothDevice() { return _bleDevice }

export async function connectBluetooth(): Promise<boolean> {
  if (!navigator.bluetooth) return false
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PROFILES.map((p) => p.service),
    })
    const server = await device.gatt!.connect()
    let char: BluetoothRemoteGATTCharacteristic | null = null
    for (const { service: svcId, char: charId } of BLE_PROFILES) {
      try {
        const svc = await server.getPrimaryService(svcId)
        char = await svc.getCharacteristic(charId)
        break
      } catch { /* try next profile */ }
    }
    if (!char) { server.disconnect(); return false }
    _bleDevice = device
    _bleChar = char
    device.addEventListener('gattserverdisconnected', () => { _bleDevice = null; _bleChar = null })
    return true
  } catch {
    _bleDevice = null; _bleChar = null
    return false
  }
}

async function sendViaBluetooth(data: Uint8Array): Promise<boolean> {
  if (!_bleChar) return false
  if (_bleDevice && !_bleDevice.gatt?.connected) {
    try { await _bleDevice.gatt!.connect() } catch { forgetBluetooth(); return false }
  }
  try {
    for (let i = 0; i < data.length; i += BLE_CHUNK) {
      await _bleChar.writeValueWithoutResponse(data.slice(i, i + BLE_CHUNK))
      await new Promise((r) => setTimeout(r, 20))
    }
    return true
  } catch { forgetBluetooth(); return false }
}

// ── Serial (USB/wired) state ──────────────────────────────────────────────────
let _port: SerialPort | null = null

export function forgetPort() {
  _port = null
  if (isTauri) disconnectTauriPort().catch(() => {/* ignore */})
}
export function getPort()      { return _port }
export function getTauriPort() { return getTauriPortName() }

export async function getAvailablePorts(): Promise<string[]> { return listTauriPorts() }
export async function getSystemPrinters(): Promise<string[]> { return listSystemPrinters() }

async function sendViaCups(data: Uint8Array, printerName: string): Promise<boolean> {
  try {
    await printRawCups(printerName, data)
    return true
  } catch { return false }
}

async function sendViaTauriSerial(data: Uint8Array, baudRate: number): Promise<boolean> {
  try {
    if (!isTauriPortOpen()) {
      const ports = await listTauriPorts()
      if (ports.length === 0) return false
      await connectTauriPort(ports[0], baudRate)
    }
    await writeTauriPort(data)
    return true
  } catch { return false }
}

async function sendToSerial(data: Uint8Array, baudRate = 9600): Promise<boolean> {
  if (isTauri) return sendViaTauriSerial(data, baudRate)
  if (!('serial' in navigator)) return false

  // Use only a previously granted port — never prompt during a print job
  if (!_port) {
    const saved = await navigator.serial.getPorts()
    _port = saved[0] ?? null
    if (!_port) return false
  }

  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  try {
    if (!_port.writable) {
      await _port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none' })
    }
    writer = _port.writable!.getWriter()
    await writer.write(data)
    writer.releaseLock()
    writer = null
    await new Promise((r) => setTimeout(r, 300))
    await _port.close()
    _port = null  // reset so next print re-opens cleanly
    return true
  } catch {
    if (writer) { try { writer.releaseLock() } catch { /* ignore */ } }
    try { await _port?.close() } catch { /* ignore */ }
    _port = null
    return false
  }
}

// ── Route to the active transport ─────────────────────────────────────────────
async function send(data: Uint8Array, settings: Settings): Promise<boolean> {
  if (_bleChar) return sendViaBluetooth(data)
  if (isTauri && settings.printerMode === 'cups' && settings.cupsName) {
    return sendViaCups(data, settings.cupsName)
  }
  return sendToSerial(data, settings.printerBaudRate ?? 9600)
}

// ── Connect USB/Serial printer ────────────────────────────────────────────────
export async function connectPrinter(portName?: string, baudRate = 9600): Promise<boolean> {
  if (isTauri) {
    const target = portName ?? (await listTauriPorts())[0]
    if (!target) return false
    try { await connectTauriPort(target, baudRate); return true }
    catch { return false }
  }
  if (!('serial' in navigator)) return false
  try { _port = await navigator.serial.requestPort(); return true }
  catch { _port = null; return false }
}

// ── Test print ────────────────────────────────────────────────────────────────
export async function testPrint(settings: Settings): Promise<boolean> {
  const data = await renderTestReceipt(settings)
  return send(data, settings)
}

// ── Main print function ───────────────────────────────────────────────────────
export async function printESCPOS(sale: SaleInfo, settings: Settings): Promise<boolean> {
  const data = await renderReceipt(sale, settings)
  return send(data, settings)
}
