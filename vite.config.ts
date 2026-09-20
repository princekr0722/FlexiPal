import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: join(rootDir, 'client'),
  // UI is mounted under /ui so it never collides with /api. See server/index.ts.
  base: '/ui/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': join(rootDir, 'shared'),
      '@client': join(rootDir, 'client'),
    },
  },
  build: {
    outDir: join(rootDir, 'dist', 'client'),
    emptyOutDir: true,
  },
})
