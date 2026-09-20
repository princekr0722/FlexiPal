import { openDb } from './db/index.ts'
import { SessionStore } from './db/session.ts'
import { JsonTalentPool } from './talent/JsonTalentPool.ts'
import { listPrompts } from './llm/prompts.ts'
import { hasApiKey, modelName } from './llm/gemini.ts'

/** Built once at boot so a bad profiles.json or missing prompt fails loudly and immediately. */
export function buildServices() {
  const pool = new JsonTalentPool()
  const store = new SessionStore(openDb())

  const required = [
    'extract-criteria', 'extract-criteria-user',
    'score-profiles', 'score-profiles-user',
    'refine-criteria', 'refine-criteria-user',
    'summarize-session', 'summarize-session-user',
    'repair', 'repair-user',
  ]
  const present = new Set(listPrompts())
  const missing = required.filter((p) => !present.has(p))
  if (missing.length) throw new Error(`Missing prompt files: ${missing.join(', ')}`)

  return { pool, store, meta: { model: modelName, hasApiKey: hasApiKey(), poolSize: pool.vocabulary().size } }
}

export type Services = ReturnType<typeof buildServices>
