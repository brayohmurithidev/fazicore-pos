import { useEffect, useRef } from 'react'
import { X, Printer, Download, FileText } from 'lucide-react'
import { isTauri } from '@/hooks/useTauri'
import { usePrintPreviewStore } from '@/stores/printPreview'
import { toast } from '@/lib/toast'

export function PrintPreviewModal() {
  const { html, filename, close } = usePrintPreviewStore()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    blobUrlRef.current = url
    if (iframeRef.current) iframeRef.current.src = url
    return () => {
      URL.revokeObjectURL(url)
      blobUrlRef.current = null
    }
  }, [html])

  // Close on Escape
  useEffect(() => {
    if (!html) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [html, close])

  if (!html) return null

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print()
  }

  const handleDownload = async () => {
    const htmlFilename = filename.endsWith('.html') ? filename : `${filename}.html`
    if (isTauri) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await save({
          defaultPath: htmlFilename,
          filters: [{ name: 'HTML Document', extensions: ['html'] }],
        })
        if (path) {
          await invoke('save_text_file', { path, content: html })
          toast.success('Document saved')
        }
      } catch (e) {
        toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = htmlFilename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 200)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#18181b' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <FileText size={15} className="text-zinc-400 shrink-0" />
        <span className="text-sm font-medium text-white flex-1 truncate">{filename}</span>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-zinc-900 rounded-md hover:bg-zinc-100 transition-colors shrink-0"
        >
          <Printer size={13} />
          Print / Save as PDF
        </button>

        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors shrink-0"
        >
          <Download size={13} />
          Download
        </button>

        <button
          onClick={close}
          aria-label="Close preview"
          className="ml-1 p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Preview area */}
      <div className="flex-1 overflow-auto bg-zinc-800 p-6">
        <div
          className="mx-auto bg-white shadow-2xl rounded-sm overflow-hidden"
          style={{ maxWidth: '860px', minHeight: '600px' }}
        >
          <iframe
            ref={iframeRef}
            title="Document Preview"
            className="w-full border-0"
            style={{ minHeight: '600px', height: '100%', display: 'block' }}
            // Let the iframe size to its content via the onLoad handler below
            onLoad={() => {
              try {
                const doc = iframeRef.current?.contentDocument
                if (doc) {
                  const h = doc.documentElement.scrollHeight
                  if (iframeRef.current && h > 0) {
                    iframeRef.current.style.height = `${h}px`
                  }
                }
              } catch {
                // cross-origin guard — no-op
              }
            }}
          />
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-700 text-xs text-zinc-500 text-center shrink-0">
        Use <span className="text-zinc-300 font-medium">Print / Save as PDF</span> to export as PDF, or{' '}
        <span className="text-zinc-300 font-medium">Download</span> to save the HTML file.
        Press <span className="text-zinc-300 font-medium">Esc</span> to close.
      </div>
    </div>
  )
}
