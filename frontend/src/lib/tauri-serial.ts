import { SerialPort } from 'tauri-plugin-serialplugin-api'
import { isTauri } from '@/hooks/useTauri'

let _port: SerialPort | null = null
let _portName: string | null = null

export async function listTauriPorts(): Promise<string[]> {
  if (!isTauri) return []
  const ports = await SerialPort.available_ports()
  return Object.keys(ports)
}

export async function connectTauriPort(portName: string, baudRate: number): Promise<void> {
  if (_port?.isOpen) {
    try { await _port.close() } catch { /* ignore — port may already be gone */ }
  }
  _port = null
  _portName = null

  const port = new SerialPort({ path: portName, baudRate })
  await port.open()
  _port = port
  _portName = portName
}

export async function writeTauriPort(data: Uint8Array): Promise<void> {
  if (!_port?.isOpen) throw new Error('No serial port connected')
  await _port.writeBinary(data)
}

export async function disconnectTauriPort(): Promise<void> {
  if (_port?.isOpen) {
    try { await _port.close() } catch { /* ignore */ }
  }
  _port = null
  _portName = null
}

export function getTauriPortName(): string | null {
  return _portName
}

export function isTauriPortOpen(): boolean {
  return _port?.isOpen === true
}
