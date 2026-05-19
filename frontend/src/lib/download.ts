import { isTauri } from '@/hooks/useTauri'
import { toast } from '@/lib/toast'

function browserDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}

export async function downloadTextFile(filename: string, content: string) {
  if (isTauri) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')
      const ext = filename.split('.').pop() ?? 'csv'
      const path = await save({
        defaultPath: filename,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      })
      if (path) {
        await invoke('save_text_file', { path, content })
        toast.success('File saved')
      }
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    browserDownload(filename, new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  }
}

export function buildCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
}

export async function openPrintHtml(html: string) {
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_html_preview', { html })
    } catch (e) {
      toast.error(`Print failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=1000,height=700')
    if (!win) toast.error('Pop-up blocked — allow pop-ups and try again')
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

export async function downloadXlsx(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  try {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')

    if (isTauri) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await save({
        defaultPath: filename,
        filters: [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }],
      })
      if (path) {
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array
        await invoke('save_binary_file', { path, data: Array.from(buf) })
        toast.success('File saved')
      }
    } else {
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array<ArrayBuffer>
      browserDownload(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    }
  } catch (e) {
    toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}
