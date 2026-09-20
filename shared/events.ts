import type {
  CriteriaChange, FitRubric, ObjectiveFilters, Profile, Relaxation, VerifiedScore,
} from './schemas.ts'

export type StageName = 'extracting' | 'filtering' | 'scoring' | 'refining' | 'summarizing'

/** Why a search came back empty, in terms the recruiter can act on. */
export interface Bottleneck {
  reason: string
  count: number
  humanized: string
}

/**
 * Structured progress events, deliberately not token streaming. Every payload
 * that the UI renders or applies is a whole, already-validated object — there
 * is never a half-parsed filter object on screen.
 */
export type SseEvent =
  | { type: 'session'; id: string; round: number }
  | { type: 'stage'; name: StageName; status: 'start' | 'done'; detail?: string }
  | { type: 'criteria'; filters: ObjectiveFilters; rubric: FitRubric; interpretation?: string; changes?: CriteriaChange[] }
  | { type: 'filtered'; pool: number; strict: number; matched: number; relaxations: Relaxation[]; bottleneck?: Bottleneck }
  | { type: 'profiles'; profiles: Profile[] }
  | { type: 'scored_chunk'; scores: VerifiedScore[]; chunk: number; chunks: number }
  | { type: 'message'; role: 'assistant'; text: string }
  | { type: 'warning'; code: 'rate_limit' | 'retrying' | 'repaired' | 'degraded' | 'unverified'; message: string }
  | { type: 'done'; round: number }
  | { type: 'error'; code: string; message: string; recoverable: boolean }

export const SSE_RETRY_MS = 3000
