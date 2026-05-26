import { useEffect, useRef, useState } from 'react'
import { X, Printer, Download, FileText, Loader2 } from 'lucide-react'
import { isTauri } from '@/hooks/useTauri'
import { usePrintPreviewStore } from '@/stores/printPreview'
import { toast } from '@/lib/toast'

// Parse @page { size: ... } from the HTML to determine paper dimensions (mm).
function detectPageSize(html: string): [number, number] {
  const m = html.match(/@page\s*\{[^}]*size:\s*([^;}\n]+)/i)
  const s = m?.[1]?.trim().toLowerCase() ?? ''
  if (s.includes('58mm')) return [58, 0]   // 0 = auto height
  if (s.includes('80mm')) return [80, 0]
  if (s.includes('a5'))   return [148, 210]
  return [210, 297]                         // A4 default
}

export function PrintPreviewModal() {
  const { html, filename, close } = usePrintPreviewStore()
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    if (iframeRef.current) iframeRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [html])

  useEffect(() => {
    if (!html) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [html, close])

  if (!html) return null

  const handlePrint = () => iframeRef.current?.contentWindow?.print()

  const handleDownloadPdf = async () => {
    const iframeDoc = iframeRef.current?.contentDocument
    if (!iframeDoc) return
    setSaving(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const [pageW, pageH] = detectPageSize(html ?? '')
      const isReceipt = pageW < 150     // narrow thermal paper

      const body    = iframeDoc.body
      const canvas  = await html2canvas(body, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        // For narrow receipts render at natural receipt width; A4 at full width
        width: isReceipt ? body.scrollWidth : body.offsetWidth,
      })

      // Calculate PDF page height to fit entire content on one page (receipts)
      // or use standard A4 with page breaks for reports.
      const pxPerMm = canvas.width / (pageW * 2)  // scale=2 so px per real mm × 2
      const contentHeightMm = canvas.height / pxPerMm

      const pdfW = pageW
      const pdfH = isReceipt ? contentHeightMm : (pageH > 0 ? pageH : contentHeightMm)

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfW, Math.max(pdfH, pdfW)],   // square minimum so jsPDF doesn't complain
      })

      const imgData = canvas.toDataURL('image/png')

      if (isReceipt) {
        // Single page, no splitting
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, contentHeightMm)
      } else {
        // Multi-page: slice canvas into A4-height chunks
        const pageHeightPx = pageH * pxPerMm
        let yOffset = 0
        let pageIndex = 0
        while (yOffset < canvas.height) {
          if (pageIndex > 0) pdf.addPage([pdfW, pdfH])
          // Create a slice canvas for this page
          const sliceH = Math.min(pageHeightPx, canvas.height - yOffset)
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width  = canvas.width
          sliceCanvas.height = sliceH
          sliceCanvas.getContext('2d')?.drawImage(canvas, 0, -yOffset)
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, sliceH / pxPerMm)
          yOffset += pageHeightPx
          pageIndex++
        }
      }

      const pdfBlob    = pdf.output('blob')
      const pdfFilename = filename.replace(/\.(html?|pdf)$/i, '') + '.pdf'

      if (isTauri) {
        const { save }   = await import('@tauri-apps/plugin-dialog')
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await save({
          defaultPath: pdfFilename,
          filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
        })
        if (path) {
          const bytes = new Uint8Array(await pdfBlob.arrayBuffer())
          await invoke('save_binary_file', { path, data: Array.from(bytes) })
          toast.success('PDF saved')
        }
      } else {
        const url = URL.createObjectURL(pdfBlob)
        const a   = document.createElement('a')
        a.href     = url
        a.download = pdfFilename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 200)
      }
    } catch (e) {
      toast.error(`PDF failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
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
          Print
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors shrink-0 disabled:opacity-60"
        >
          {saving
            ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
            : <><Download size={13} /> Download PDF</>
          }
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
            onLoad={() => {
              try {
                const doc = iframeRef.current?.contentDocument
                if (doc) {
                  const h = doc.documentElement.scrollHeight
                  if (iframeRef.current && h > 0) iframeRef.current.style.height = `${h}px`
                }
              } catch { /* cross-origin guard */ }
            }}
          />
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-700 text-xs text-zinc-500 text-center shrink-0">
        <span className="text-zinc-300 font-medium">Print</span> opens the system print dialog ·{' '}
        <span className="text-zinc-300 font-medium">Download PDF</span> saves directly ·{' '}
        <span className="text-zinc-300 font-medium">Esc</span> to close
      </div>
    </div>
  )
}
