import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Single source of truth for the version shown in the UI.
 * `backend/config.py` also drives the macOS bundle and the API `/api/health`,
 * so the SPA and the server can no longer disagree (the old hard-coded 1.16.0
 * caused a spurious reload on every fresh session against a 1.17.0 server).
 */
function appVersion(): string {
  try {
    const source = readFileSync(resolve(process.cwd(), '../backend/config.py'), 'utf-8')
    return source.match(/^APP_VERSION\s*=\s*"([^"]+)"/m)?.[1] ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const version = appVersion()

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5180,
    strictPort: false,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8765', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8765', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
  },
})
