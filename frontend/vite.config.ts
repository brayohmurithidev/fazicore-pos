import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const isTauriDev = process.env.TAURI_ENV_DEBUG !== undefined

// ── oklch() → hex fallback ──────────────────────────────────────────────────
// Tailwind v4 emits all colors as oklch(), which older WebView2 / Chromium <111
// can't parse → everything renders white. We rewrite every oklch() in the final
// CSS to a hex value so the app renders correctly on any engine.
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  // OKLab → linear sRGB (Björn Ottosson)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin.map((x) => {
    const c = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(c * 255)))
  }) as [number, number, number]
}

// ── translate: → transform: translate() ─────────────────────────────────────
// Tailwind v4 emits the standalone `translate:` CSS property (and `scale:` /
// `rotate:`), which only works on Chromium ≥104. Old WebView2 ignores it, so
// translate-based centering (modals, sidebar slide, icon alignment) collapses
// to the element's top-left corner. We rewrite `translate:` into the legacy
// `transform: translate()` form, which works on every engine. We only touch
// translate (positioning); scale/rotate are animation-only and cosmetic.
function splitTopLevel(value: string): string[] {
  const parts: string[] = []
  let depth = 0, cur = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ' ' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function translateValueToTransform(rawValue: string): string {
  const value = rawValue.trim()
  if (value === 'none') return 'none'
  // Give bare custom props a 0 fallback — old engines lack @property defaults,
  // so an unset axis would otherwise invalidate the whole declaration.
  const parts = splitTopLevel(value).map((p) =>
    p.replace(/var\(\s*(--[\w-]+)\s*\)/g, 'var($1,0)')
  )
  const fn = parts.length >= 3 ? 'translate3d' : 'translate'
  return `${fn}(${parts.join(',')})`
}

function legacyWebviewCssPlugin(): Plugin {
  const num = (s: string) => (s.trim().endsWith('%') ? parseFloat(s) / 100 : parseFloat(s))
  const oklchRe = /oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)/gi
  const translateRe = /([{;])translate:\s*([^;}]+)/g
  return {
    name: 'legacy-webview-css',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue
        let css = typeof file.source === 'string' ? file.source : file.source.toString()

        // oklch() → hex / rgba
        css = css.replace(oklchRe, (_m, lRaw, cRaw, hRaw, aRaw) => {
          const L = num(lRaw)
          const C = cRaw.trim().endsWith('%') ? (parseFloat(cRaw) / 100) * 0.4 : parseFloat(cRaw)
          const H = parseFloat(hRaw)
          const [r, g, b] = oklchToRgb(L, C, H)
          if (aRaw !== undefined) {
            const alpha = aRaw.trim().endsWith('%') ? parseFloat(aRaw) / 100 : parseFloat(aRaw)
            return `rgba(${r}, ${g}, ${b}, ${alpha})`
          }
          const hex = (n: number) => n.toString(16).padStart(2, '0')
          return `#${hex(r)}${hex(g)}${hex(b)}`
        })

        // standalone translate: → transform: translate()
        css = css.replace(translateRe, (_m, sep, val) => `${sep}transform:${translateValueToTransform(val)}`)

        file.source = css
      }
    },
  }
}

export default defineConfig({
  // Vite output is consumed by Tauri — keep it quiet
  clearScreen: false,

  plugins: [react(), tailwindcss(), legacyWebviewCssPlugin()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer/',
    },
  },

  optimizeDeps: {
    include: ['buffer'],
  },

  define: {
    global: 'globalThis',
  },

  server: {
    port: 5173,
    // Tauri expects a fixed port; fail fast if it's taken
    strictPort: isTauriDev,
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_'],

  build: {
    // Tauri supports es2021
    target: isTauriDev ? 'chrome105' : ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    // Don't minify for debug Tauri builds
    minify: !isTauriDev ? 'esbuild' : false,
    sourcemap: !!isTauriDev,
  },
})
