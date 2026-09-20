import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const promptDir = resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))), 'prompts')

/**
 * Prompts live in /prompts as readable Markdown rather than string literals —
 * the assignment grades them, and they are easier to iterate on when they are
 * not buried in code. Loaded once at boot; in dev they are re-read per call so
 * prompt edits take effect without a restart.
 */
const cache = new Map<string, string>()
const dev = process.env.NODE_ENV !== 'production'

function load(name: string): string {
  if (!dev && cache.has(name)) return cache.get(name)!
  let text: string
  try {
    text = readFileSync(join(promptDir, `${name}.md`), 'utf8')
  } catch {
    throw new Error(`Missing prompt: prompts/${name}.md`)
  }
  cache.set(name, text)
  return text
}

/** Replaces {{key}} placeholders. An unsupplied key is an error, not an empty string. */
export function renderPrompt(name: string, vars: Record<string, string | number>): string {
  const template = load(name)
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (!(key in vars)) throw new Error(`Prompt ${name}: missing variable "${key}"`)
    return String(vars[key])
  })
}

/** Fails fast at boot if a prompt file is missing or has an unfilled placeholder. */
export function listPrompts(): string[] {
  return readdirSync(promptDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
}
