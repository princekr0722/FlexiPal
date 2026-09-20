import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import FastifyVite from '@fastify/vite'
import { apiRoutes } from './routes/index.ts'
import { buildServices } from './services.ts'

/**
 * Configuration comes from flags first, then the environment, then .env.
 *
 * Flags exist because `FOO=bar npm run x` is a POSIX shell idiom that does not
 * work in cmd.exe or PowerShell. `--key=` and `--port=` behave identically on
 * macOS, Linux and Windows.
 */
const flag = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

const keyArg = flag('key')
if (keyArg) process.env.GEMINI_API_KEY = keyArg

// `--dev` is the signal, not NODE_ENV, so `npm start` needs no env prefix.
const isDev = process.argv.includes('--dev')
process.env.NODE_ENV = isDev ? (process.env.NODE_ENV ?? 'development') : 'production'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const dev = isDev
// 3539 = FLEX on a phone keypad. Deliberately off the common 3000/5173/8080 lanes.
const port = Number(flag('port') ?? process.env.PORT ?? 3539)

const app = Fastify({ logger: { level: dev ? 'warn' : 'info' } })

// Fails fast: bad profiles.json or a missing prompt should not reach a request.
const services = buildServices()

// ── /api ──────────────────────────────────────────────────────────────
await app.register(apiRoutes(services), { prefix: '/api' })

// ── /ui ───────────────────────────────────────────────────────────────
// Vite's base is '/ui/', so its dev middleware and built assets both live
// under that prefix. The two surfaces never overlap.
await app.register(FastifyVite, { root: rootDir, dev, spa: true })
await app.vite.ready()

app.get('/', (_req, reply) => reply.redirect('/ui'))
app.get('/ui', (_req, reply) => reply.html())
app.get('/ui/*', (_req, reply) => reply.html())

await app.listen({ port, host: '0.0.0.0' })
console.log(
  [
    '',
    '  FlexiPal',
    `  UI    → http://localhost:${port}/ui`,
    `  API   → http://localhost:${port}/api`,
    `  model → ${services.meta.model}`,
    `  key   → ${services.meta.hasApiKey ? 'present' : 'MISSING — pass --key=… or set GEMINI_API_KEY'}`,
    `  pool  → ${services.meta.poolSize} profiles`,
    '',
  ].join('\n'),
)
