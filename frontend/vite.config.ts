import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const isTauriDev = process.env.TAURI_ENV_DEBUG !== undefined

export default defineConfig({
  // Vite output is consumed by Tauri — keep it quiet
  clearScreen: false,

  plugins: [react(), tailwindcss()],

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
    target: isTauriDev ? 'chrome105' : 'modules',
    // Don't minify for debug Tauri builds
    minify: !isTauriDev ? 'esbuild' : false,
    sourcemap: !!isTauriDev,
  },
})
