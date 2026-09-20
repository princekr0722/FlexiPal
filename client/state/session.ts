import type { SseEvent, StageName, Bottleneck } from '../../shared/events.ts'
import type {
  CriteriaChange, FitRubric, ObjectiveFilters, Profile, Relaxation, VerifiedScore,
} from '../../shared/schemas.ts'

export type Phase = 'idle' | 'running' | 'results' | 'empty' | 'error' | 'frozen'

export interface ChatEntry {
  role: 'recruiter' | 'assistant'
  text: string
  changes?: CriteriaChange[]
}

export interface Warning {
  code: string
  message: string
}

export interface SessionState {
  phase: Phase
  sessionId: string | null
  round: number
  query: string
  filters: ObjectiveFilters | null
  rubric: FitRubric | null
  interpretation: string | null
  /** Stage → done, in arrival order. Drives the funnel. */
  stages: Array<{ name: StageName; status: 'start' | 'done'; detail?: string }>
  poolSize: number
  strictCount: number
  matchedCount: number
  relaxations: Relaxation[]
  bottleneck: Bottleneck | null
  profiles: Profile[]
  scores: Record<string, VerifiedScore>
  scoredChunks: { done: number; total: number }
  chat: ChatEntry[]
  verdicts: Record<string, 'match' | 'reject'>
  warnings: Warning[]
  error: { code: string; message: string; recoverable: boolean } | null
  /**
   * True from the moment a round starts until its new profile list arrives.
   * Without it the results column shows the *previous* round's cards with no
   * sign that anything is happening, which reads as "nothing changed".
   */
  resultsStale: boolean
}

export const initialState: SessionState = {
  phase: 'idle',
  sessionId: null,
  round: 0,
  query: '',
  filters: null,
  rubric: null,
  interpretation: null,
  stages: [],
  poolSize: 48,
  strictCount: 0,
  matchedCount: 0,
  relaxations: [],
  bottleneck: null,
  profiles: [],
  scores: {},
  scoredChunks: { done: 0, total: 0 },
  chat: [],
  verdicts: {},
  warnings: [],
  error: null,
  resultsStale: false,
}

/** Everything needed to reopen a past search, as /api/session/:id returns it. */
export interface ResumePayload {
  session: { id: string; query: string; status: 'active' | 'frozen'; round: number }
  criteria?: { filters: ObjectiveFilters; rubric: FitRubric }
  messages: Array<{ role: string; content: string }>
  verdicts: Array<{ profile_id: string; verdict: 'match' | 'reject' }>
  profiles: Profile[]
  scores: VerifiedScore[]
  relaxations: Relaxation[]
}

export type Action =
  | { kind: 'submit'; query: string }
  | { kind: 'resume'; payload: ResumePayload }
  | { kind: 'refine'; text: string }
  | { kind: 'verdict'; profileId: string; verdict: 'match' | 'reject' }
  | { kind: 'event'; event: SseEvent }
  | { kind: 'freeze' }
  | { kind: 'unfreeze' }
  | { kind: 'reset' }

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.kind) {
    case 'submit':
      return {
        ...initialState,
        phase: 'running',
        query: action.query,
        resultsStale: true,
        chat: [{ role: 'recruiter', text: action.query }],
      }

    case 'refine':
      return {
        ...state,
        phase: 'running',
        error: null,
        warnings: [],
        stages: [],
        scoredChunks: { done: 0, total: 0 },
        resultsStale: true,
        chat: [...state.chat, { role: 'recruiter', text: action.text }],
      }

    case 'verdict': {
      // Clicking the same verdict twice clears it — a misclick should be undoable.
      const next = { ...state.verdicts }
      if (next[action.profileId] === action.verdict) delete next[action.profileId]
      else next[action.profileId] = action.verdict
      return { ...state, verdicts: next }
    }

    case 'resume': {
      const p = action.payload
      return {
        ...initialState,
        phase: p.session.status === 'frozen' ? 'frozen' : p.profiles.length ? 'results' : 'empty',
        sessionId: p.session.id,
        round: p.session.round,
        query: p.session.query,
        filters: p.criteria?.filters ?? null,
        rubric: p.criteria?.rubric ?? null,
        profiles: p.profiles,
        scores: Object.fromEntries(p.scores.map((s) => [s.profile_id, s])),
        relaxations: p.relaxations,
        matchedCount: p.profiles.length,
        chat: p.messages
          .filter((m) => m.role === 'recruiter' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'recruiter' | 'assistant', text: m.content })),
        // Later verdicts on the same profile win, matching the server ledger.
        verdicts: p.verdicts.reduce<Record<string, 'match' | 'reject'>>((acc, v) => {
          acc[v.profile_id] = v.verdict
          return acc
        }, {}),
      }
    }

    case 'freeze':
      return { ...state, phase: 'frozen' }

    case 'unfreeze':
      return { ...state, phase: state.profiles.length === 0 ? 'empty' : 'results' }

    case 'reset':
      return initialState

    case 'event':
      return applyEvent(state, action.event)
  }
}

function applyEvent(s: SessionState, e: SseEvent): SessionState {
  switch (e.type) {
    case 'session':
      return { ...s, sessionId: e.id, round: e.round }

    case 'stage': {
      const stages = [...s.stages]
      const at = stages.findIndex((x) => x.name === e.name)
      if (at >= 0) stages[at] = { ...stages[at], status: e.status, detail: e.detail ?? stages[at].detail }
      else stages.push({ name: e.name, status: e.status, detail: e.detail })
      return { ...s, stages }
    }

    case 'criteria':
      return {
        ...s,
        filters: e.filters,
        rubric: e.rubric,
        interpretation: e.interpretation ?? s.interpretation,
        chat: e.changes?.length
          ? s.chat.map((c, i) => (i === s.chat.length - 1 && c.role === 'assistant' ? { ...c, changes: e.changes } : c))
          : s.chat,
      }

    case 'filtered':
      return {
        ...s,
        poolSize: e.pool,
        strictCount: e.strict,
        matchedCount: e.matched,
        relaxations: e.relaxations,
        bottleneck: e.bottleneck ?? null,
      }

    case 'profiles':
      // A new round replaces the visible set rather than appending to it.
      return { ...s, profiles: e.profiles, scores: {}, resultsStale: false }

    case 'scored_chunk': {
      const scores = { ...s.scores }
      for (const sc of e.scores) scores[sc.profile_id] = sc
      return { ...s, scores, scoredChunks: { done: e.chunk, total: e.chunks } }
    }

    case 'message':
      return { ...s, chat: [...s.chat, { role: 'assistant', text: e.text }] }

    case 'warning':
      // Same code twice in a row is noise; keep the latest wording.
      return {
        ...s,
        warnings: [...s.warnings.filter((w) => w.code !== e.code), { code: e.code, message: e.message }],
      }

    case 'done':
      // Freezing mid-stream must not be undone by the round completing.
      if (s.phase === 'frozen') return { ...s, round: e.round, resultsStale: false }
      return {
        ...s,
        round: e.round,
        resultsStale: false,
        phase: s.profiles.length === 0 ? 'empty' : 'results',
      }

    case 'error':
      return {
        ...s,
        phase: 'error',
        resultsStale: false,
        error: { code: e.code, message: e.message, recoverable: e.recoverable },
      }
  }
}

/** Profiles in display order: scored first by score, unscored after. */
export function rankedProfiles(s: SessionState): Array<{ profile: Profile; score?: VerifiedScore }> {
  return s.profiles
    .map((p) => ({ profile: p, score: s.scores[p.id] }))
    .sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1))
}
