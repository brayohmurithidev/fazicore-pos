import { useEffect, useRef, useState } from 'react'
import { X, Printer, Download, FileText, Loader2 } from 'lucide-react'
import { isTauri } from '@/hooks/useTauri'
import { usePrintPreviewStore } from '@/stores/printPreview'
import { toast } from '@/lib/toast'

const PX_PER_MM = 96 / 25.4   // 1 mm = 3.7795 CSS px

/** Pull the <title> text out of an HTML string. */
function parseTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? ''
}

interface PageMetrics {
  wMm: number       // full page width
  hMm: number       // full page height (0 = auto/receipt)
  mTopMm: number    // top & bottom margin
  mSideMm: number   // left & right margin
}

/** Parse @page { size: ...; margin: ... } from the HTML. */
function detectPageMetrics(html: string): PageMetrics {
  const block = html.match(/@page\s*\{([^}]+)\}/i)?.[1] ?? ''

  const s = (block.match(/size:\s*([^;}\n]+)/i)?.[1] ?? '').trim().toLowerCase()
  let wMm = 210, hMm = 297
  if (s.includes('58mm')) { wMm = 58;  hMm = 0 }
  else if (s.includes('80mm')) { wMm = 80;  hMm = 0 }
  else if (s.includes('a5'))   { wMm = 148; hMm = 210 }

  // margin: "12mm 15mm" → top=12 side=15  |  "2mm 3mm" → top=2 side=3
  const parts = (block.match(/margin:\s*([^;}\n]+)/i)?.[1] ?? '')
    .match(/[\d.]+/g)?.map(Number) ?? []
  const isReceipt = wMm < 150
  const mTopMm  = parts[0] ?? (isReceipt ? 2  : 12)
  const mSideMm = parts[1] ?? parts[0] ?? (isReceipt ? 3  : 15)

  return { wMm, hMm, mTopMm, mSideMm }
}

/** Render html in a hidden same-width iframe and return an html2canvas Canvas. */
async function renderToCanvas(html: string, widthPx: number, scale: number) {
  const { default: html2canvas } = await import('html2canvas')

  const frame = document.createElement('iframe')
  frame.style.cssText =
    `position:fixed;top:-99999px;left:-99999px;width:${widthPx}px;` +
    `height:1px;border:0;visibility:hidden;`
  document.body.appendChild(frame)

  try {
    const doc = frame.contentDocument!
    doc.open()
    doc.write(html)
    doc.close()
    // Let fonts / images settle
    await new Promise<void>((r) => { frame.onload = () => r(); setTimeout(r, 400) })

    return await html2canvas(doc.body, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: widthPx,
      windowWidth: widthPx,
    })
  } finally {
    document.body.removeChild(frame)
  }
}

export function PrintPreviewModal() {
  const { html, filename, close } = usePrintPreviewStore()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    if (iframeRef.current) iframeRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [html])

  useEffect(() => {
    if (!html) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [html, close])

  if (!html) return null

  // Derive a human-readable filename: prefer <title>, then store filename, then 'Document'
  const docTitle = parseTitle(html) || filename || 'Document'
  // Sanitise for file system
  const safeBase = docTitle.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()

  const handlePrint = () => iframeRef.current?.contentWindow?.print()

  const handleDownloadPdf = async () => {
    setSaving(true)
    try {
      const { default: jsPDF } = await import('jspdf')

      const SCALE = 2
      const { wMm: pageWmm, hMm: pageHmm, mTopMm, mSideMm } = detectPageMetrics(html)
      const isReceipt = pageWmm < 150

      // Render at content width (page minus side margins) so html2canvas
      // captures exactly what fits between the margins — no @page margin support.
      const contentWmm   = pageWmm - mSideMm * 2
      const contentWpx   = Math.round(contentWmm * PX_PER_MM)
      const canvas       = await renderToCanvas(html, contentWpx, SCALE)

      // Pixel → mm conversion (canvas is at SCALE×)
      const scaledPxPerMm = PX_PER_MM * SCALE
      const imgWmm = canvas.width  / scaledPxPerMm   // ≈ contentWmm
      const imgHmm = canvas.height / scaledPxPerMm

      if (isReceipt) {
        // Single tall page: content height + top + bottom margins
        const pgH = imgHmm + mTopMm * 2
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageWmm, pgH] })
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', mSideMm, mTopMm, imgWmm, imgHmm)
        await savePdf(pdf, `${safeBase}.pdf`)
      } else {
        // A4 (or A5): break content into pages, offset image by margins
        const pgH = pageHmm > 0 ? pageHmm : 297
        const contentHmm    = pgH - mTopMm * 2
        const contentHpx    = contentHmm * scaledPxPerMm
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageWmm, pgH] })
        let yPx = 0, pageIdx = 0

        while (yPx < canvas.height) {
          if (pageIdx > 0) pdf.addPage([pageWmm, pgH])
          const sliceHpx    = Math.min(contentHpx, canvas.height - yPx)
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width  = canvas.width
          sliceCanvas.height = Math.ceil(sliceHpx)
          sliceCanvas.getContext('2d')!.drawImage(canvas, 0, -yPx)
          const sliceHmm = sliceHpx / scaledPxPerMm
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', mSideMm, mTopMm, imgWmm, sliceHmm)
          yPx += contentHpx
          pageIdx++
        }
        await savePdf(pdf, `${safeBase}.pdf`)
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
        <span className="text-sm font-medium text-white flex-1 truncate">{docTitle}</span>

        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-zinc-900 rounded-md hover:bg-zinc-100 transition-colors shrink-0"
        >
          <Printer size={13} /> Print
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-700 text-white rounded-md hover:bg-zinc-600 transition-colors shrink-0 disabled:opacity-60"
        >
          {saving
            ? <><Loader2 size={13} className="animate-spin" /> Generating…</>
            : <><Download size={13} /> Download PDF</>}
        </button>

        <button onClick={close} aria-label="Close"
          className="ml-1 p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors shrink-0">
          <X size={16} />
        </button>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto bg-zinc-800 p-6">
        <div className="mx-auto bg-white shadow-2xl rounded-sm overflow-hidden"
          style={{ maxWidth: '860px', minHeight: '600px' }}>
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

      {/* Hint */}
      <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-700 text-xs text-zinc-500 text-center shrink-0">
        <span className="text-zinc-300 font-medium">Print</span> — system dialog ·{' '}
        <span className="text-zinc-300 font-medium">Download PDF</span> — saves file ·{' '}
        <span className="text-zinc-300 font-medium">Esc</span> — close
      </div>
    </div>
  )
}

async function savePdf(pdf: import('jspdf').jsPDF, filename: string) {
  const blob = pdf.output('blob')
  if (isTauri) {
    const { save }   = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    })
    if (path) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      await invoke('save_binary_file', { path, data: Array.from(bytes) })
      toast.success('PDF saved')
    }
  } else {
    const url = URL.createObjectURL(blob)
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 200)
  }
}
