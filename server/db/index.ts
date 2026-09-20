import Database from 'better-sqlite3'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')

/**
 * Session state lives in SQLite on the machine running the app: the message
 * window, every criteria version, the verdict ledger and the rolling summary.
 * The talent pool deliberately does NOT live here — it stays behind the
 * TalentPool interface so profiles.json can be swapped for a real database
 * without touching session handling.
 */
export function openDb(path = process.env.FLEXIPAL_DB ?? resolve(repoRoot, 'data', 'flexipal.db')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'))
  return db
}

export type Db = ReturnType<typeof openDb>
