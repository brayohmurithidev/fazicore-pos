import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/hooks/useTauri'

export async function listSystemPrinters(): Promise<string[]> {
  if (!isTauri) return []
  return invoke<string[]>('list_system_printers')
}

export async function printRawCups(printer: string, data: Uint8Array): Promise<void> {
  return invoke('print_raw_cups', { printer, data: Array.from(data) })
}
