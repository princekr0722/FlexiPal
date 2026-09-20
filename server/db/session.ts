import { randomUUID } from 'node:crypto'
import type { Db } from './index.ts'
import type {
  Criteria, CriteriaChange, ObjectiveFilters, FitRubric, Profile, Relaxation, VerifiedScore,
} from '../../shared/schemas.ts'

export type Role = 'recruiter' | 'assistant' | 'system'
export type VerdictValue = 'match' | 'reject'

export interface SessionRow {
  id: string
  created_at: number
  original_query: string
  status: 'active' | 'frozen'
  round: number
  frozen_at: number | null
}

export interface MessageRow {
  id: number
  round: number
  role: Role
  content: string
  created_at: number
}

export interface VerdictRow {
  round: number
  profile_id: string
  verdict: VerdictValue
  note: string | null
  source: string
}

/** How many recent messages travel with every refinement call. */
export const MESSAGE_WINDOW = 40
/** Summary is rebuilt once this many messages have aged out since it was written. */
export const SUMMARY_LAG = 10
/** Hard ceiling on the rolling summary. */
export const SUMMARY_MAX_CHARS = 15_000

const now = () => Date.now()

export class SessionStore {
  constructor(private readonly db: Db) {}

  create(query: string): SessionRow {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO sessions (id, created_at, original_query, status, round) VALUES (?, ?, ?, ?, 0)')
      .run(id, now(), query, 'active')
    return this.get(id)!
  }

  get(id: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
  }

  bumpRound(id: string): number {
    this.db.prepare('UPDATE sessions SET round = round + 1 WHERE id = ?').run(id)
    return this.get(id)!.round
  }

  freeze(id: string): void {
    this.db.prepare("UPDATE sessions SET status = 'frozen', frozen_at = ? WHERE id = ?").run(now(), id)
  }

  /** Freezing is a decision, not a commitment — a recruiter can reopen it. */
  unfreeze(id: string): void {
    this.db.prepare("UPDATE sessions SET status = 'active', frozen_at = NULL WHERE id = ?").run(id)
  }

  /* ── messages ── */

  addMessage(sessionId: string, round: number, role: Role, content: string): number {
    const info = this.db
      .prepare('INSERT INTO messages (session_id, round, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(sessionId, round, role, content, now())
    return Number(info.lastInsertRowid)
  }

  /** The live window, oldest first. */
  recentMessages(sessionId: string, limit = MESSAGE_WINDOW): MessageRow[] {
    const rows = this.db
      .prepare('SELECT id, round, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?')
      .all(sessionId, limit) as MessageRow[]
    return rows.reverse()
  }

  messageCount(sessionId: string): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?').get(sessionId) as { n: number }
    return r.n
  }

  /** Messages that have fallen out of the window and are not yet summarised. */
  messagesToSummarize(sessionId: string, coversThrough: number): MessageRow[] {
    const total = this.messageCount(sessionId)
    if (total <= MESSAGE_WINDOW) return []
    const cutoff = this.db
      .prepare('SELECT id FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?')
      .get(sessionId, MESSAGE_WINDOW - 1) as { id: number } | undefined
    if (!cutoff) return []
    return this.db
      .prepare('SELECT id, round, role, content, created_at FROM messages WHERE session_id = ? AND id > ? AND id < ? ORDER BY id')
      .all(sessionId, coversThrough, cutoff.id) as MessageRow[]
  }

  /* ── criteria ── */

  saveCriteria(
    sessionId: string,
    round: number,
    criteria: Criteria,
    source: 'extracted' | 'refined' | 'edited',
    changes: CriteriaChange[] = [],
  ): void {
    this.db
      .prepare(
        'INSERT INTO criteria_versions (session_id, round, filters_json, rubric_json, changes_json, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(sessionId, round, JSON.stringify(criteria.filters), JSON.stringify(criteria.rubric), JSON.stringify(changes), source, now())
  }

  currentCriteria(sessionId: string): Criteria | undefined {
    const row = this.db
      .prepare('SELECT filters_json, rubric_json FROM criteria_versions WHERE session_id = ? ORDER BY id DESC LIMIT 1')
      .get(sessionId) as { filters_json: string; rubric_json: string } | undefined
    if (!row) return undefined
    return {
      filters: JSON.parse(row.filters_json) as ObjectiveFilters,
      rubric: JSON.parse(row.rubric_json) as FitRubric,
    }
  }

  criteriaHistory(sessionId: string) {
    return this.db
      .prepare('SELECT round, changes_json, source, created_at FROM criteria_versions WHERE session_id = ? ORDER BY id')
      .all(sessionId) as Array<{ round: number; changes_json: string; source: string; created_at: number }>
  }

  /* ── verdicts ── */

  addVerdict(sessionId: string, round: number, profileId: string, verdict: VerdictValue, source: 'chat' | 'button', note?: string): void {
    this.db
      .prepare('INSERT INTO verdicts (session_id, round, profile_id, verdict, note, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(sessionId, round, profileId, verdict, note ?? null, source, now())
  }

  verdicts(sessionId: string): VerdictRow[] {
    return this.db
      .prepare('SELECT round, profile_id, verdict, note, source FROM verdicts WHERE session_id = ? ORDER BY id')
      .all(sessionId) as VerdictRow[]
  }

  /* ── results ── */

  /** Replaces the round's result set. Called when the profile list is emitted. */
  saveResults(sessionId: string, round: number, profiles: Profile[], relaxations: Relaxation[]): void {
    const del = this.db.prepare('DELETE FROM results WHERE session_id = ? AND round = ?')
    const ins = this.db.prepare(
      'INSERT INTO results (session_id, round, profile_id, position, relaxations_json) VALUES (?, ?, ?, ?, ?)',
    )
    const rel = JSON.stringify(relaxations)
    this.db.transaction(() => {
      del.run(sessionId, round)
      profiles.forEach((p, i) => ins.run(sessionId, round, p.id, i, rel))
    })()
  }

  /** Fills in scores as each parallel batch lands. */
  saveScores(sessionId: string, round: number, scores: VerifiedScore[]): void {
    const up = this.db.prepare(
      'UPDATE results SET score = ?, verdict = ?, rationale = ?, evidence_json = ?, concerns_json = ?, unverified = ? ' +
        'WHERE session_id = ? AND round = ? AND profile_id = ?',
    )
    this.db.transaction(() => {
      for (const s of scores) {
        up.run(
          s.score, s.verdict, s.rationale,
          JSON.stringify(s.evidence), JSON.stringify(s.concerns), s.unverified_evidence,
          sessionId, round, s.profile_id,
        )
      }
    })()
  }

  /** The most recent round that actually produced results. */
  latestResults(sessionId: string): { profileIds: string[]; scores: VerifiedScore[]; relaxations: Relaxation[] } {
    const row = this.db
      .prepare('SELECT MAX(round) AS r FROM results WHERE session_id = ?')
      .get(sessionId) as { r: number | null }
    if (row?.r === null || row?.r === undefined) return { profileIds: [], scores: [], relaxations: [] }

    const rows = this.db
      .prepare('SELECT * FROM results WHERE session_id = ? AND round = ? ORDER BY position')
      .all(sessionId, row.r) as Array<{
        profile_id: string; score: number | null; verdict: string | null; rationale: string | null
        evidence_json: string | null; concerns_json: string | null; unverified: number; relaxations_json: string
      }>

    return {
      profileIds: rows.map((r) => r.profile_id),
      relaxations: rows.length ? (JSON.parse(rows[0].relaxations_json) as Relaxation[]) : [],
      scores: rows
        .filter((r) => r.score !== null)
        .map((r) => ({
          profile_id: r.profile_id,
          score: r.score!,
          verdict: r.verdict as VerifiedScore['verdict'],
          rationale: r.rationale ?? '',
          evidence: JSON.parse(r.evidence_json ?? '[]'),
          concerns: JSON.parse(r.concerns_json ?? '[]'),
          unverified_evidence: r.unverified,
        })),
    }
  }

  /* ── listing ── */

  /** Newest first, for the history sidebar. */
  list(limit = 50): Array<SessionRow & { message_count: number; result_count: number; last_activity: number }> {
    return this.db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count,
                (SELECT COUNT(*) FROM results r WHERE r.session_id = s.id AND r.round = (
                   SELECT MAX(round) FROM results WHERE session_id = s.id)) AS result_count,
                COALESCE((SELECT MAX(created_at) FROM messages m WHERE m.session_id = s.id), s.created_at) AS last_activity
         FROM sessions s
         ORDER BY last_activity DESC
         LIMIT ?`,
      )
      .all(limit) as Array<SessionRow & { message_count: number; result_count: number; last_activity: number }>
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  }

  /* ── summary ── */

  summary(sessionId: string): { text: string; covers_through_msg_id: number } | undefined {
    return this.db
      .prepare('SELECT text, covers_through_msg_id FROM summaries WHERE session_id = ?')
      .get(sessionId) as { text: string; covers_through_msg_id: number } | undefined
  }

  saveSummary(sessionId: string, text: string, coversThrough: number): void {
    this.db
      .prepare(
        'INSERT INTO summaries (session_id, text, covers_through_msg_id, updated_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(session_id) DO UPDATE SET text = excluded.text, covers_through_msg_id = excluded.covers_through_msg_id, updated_at = excluded.updated_at',
      )
      .run(sessionId, text.slice(0, SUMMARY_MAX_CHARS), coversThrough, now())
  }
}
