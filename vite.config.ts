import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteFastify } from '@fastify/vite/plugin'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: join(rootDir, 'client'),
  // UI is mounted under /ui so it never collides with /api. See server/index.ts.
  base: '/ui/',
  // viteFastify writes a cached copy of this config into the build output.
  // Without it the production server cannot resolve the bundle and refuses to
  // boot — which only shows up once you actually run a built image.
  plugins: [viteFastify({ spa: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': join(rootDir, 'shared'),
      '@client': join(rootDir, 'client'),
    },
  },
  build: {
    // viteFastify appends the root's basename, so this lands at dist/client.
    outDir: join(rootDir, 'dist'),
    emptyOutDir: true,
  },
})
