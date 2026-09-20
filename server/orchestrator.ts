import {
  CriteriaExtraction, ScoreBatch,
  type Criteria, type ObjectiveFilters, type Profile, type VerifiedScore,
} from '../shared/schemas.ts'
import type { Bottleneck, SseEvent } from '../shared/events.ts'
import { callStructured, type Warning } from './llm/call.ts'
import { renderPrompt } from './llm/prompts.ts'
import { LlmError, userFacing } from './llm/errors.ts'
import type { FaultKind } from './llm/faults.ts'
import type { JsonTalentPool } from './talent/JsonTalentPool.ts'
import { verifyScore } from './talent/evidence.ts'
import { sanitizeFilters } from './talent/sanitize.ts'

const CHUNK_SIZE = 8
const TOP_N = 5

export interface RunContext {
  pool: JsonTalentPool
  emit: (e: SseEvent) => void
  fault?: FaultKind
  signal?: AbortSignal
}

/* ─────────────── step 1: free text → criteria ─────────────── */

export async function extractCriteria(
  ctx: RunContext,
  query: string,
): Promise<CriteriaExtraction> {
  const v = ctx.pool.vocabulary()
  ctx.emit({ type: 'stage', name: 'extracting', status: 'start' })

  const { data } = await callStructured({
    name: 'extract-criteria',
    schema: CriteriaExtraction,
    system: renderPrompt('extract-criteria', {}),
    user: renderPrompt('extract-criteria-user', {
      query,
      skills: v.skills.join(', '),
      skill_count: v.skills.length,
      locations: v.locations.join(', '),
      company_types: v.companyTypes.join(', '),
      pool_size: v.size,
    }),
    fault: ctx.fault,
    signal: ctx.signal,
    onWarning: (w) => ctx.emit(toWarning(w)),
  })

  ctx.emit({ type: 'stage', name: 'extracting', status: 'done' })
  return data
}

/**
 * Drops filter values the pool does not contain, and tells the recruiter.
 * Runs between every criteria change and the search that follows it.
 */
export function sanitize(ctx: RunContext, filters: ObjectiveFilters): ObjectiveFilters {
  const { filters: clean, droppedSkills, droppedLocations } = sanitizeFilters(
    filters,
    ctx.pool.vocabulary(),
  )
  const dropped = [...droppedSkills, ...droppedLocations]
  if (dropped.length > 0) {
    ctx.emit({
      type: 'warning',
      code: 'unverified',
      message:
        `${dropped.map((d) => `"${d}"`).join(', ')} ${dropped.length === 1 ? 'is not something' : 'are not things'} ` +
        `the talent pool records, so ${dropped.length === 1 ? 'it was' : 'they were'} left out of the filters. ` +
        `Judgement like that belongs in the rubric.`,
    })
  }
  return clean
}

/* ─────────────── step 2: apply filters ─────────────── */

const BOTTLENECK_COPY: Record<string, string> = {
  required_skills: 'nobody in the pool has every required skill',
  years_experience: 'the experience range is too narrow',
  location: 'no one is in those locations',
  company_type: 'no one has that company background',
  title: 'no one has a matching job title',
  excluded_skill: 'everyone left was excluded by a skill you ruled out',
  excluded_company_type: 'everyone left was excluded by a company type you ruled out',
}

export function runFilters(
  ctx: RunContext,
  filters: ObjectiveFilters,
  protect?: ReadonlySet<keyof ObjectiveFilters>,
) {
  ctx.emit({ type: 'stage', name: 'filtering', status: 'start' })
  let result = ctx.pool.query(filters, { minResults: TOP_N, protect })

  // Protecting what the recruiter just asked for is the right default, but an
  // empty list helps nobody. If honouring it leaves nothing at all, loosen it
  // anyway and say plainly that we went against the instruction.
  let overrode = false
  if (result.profiles.length === 0 && protect && protect.size > 0) {
    const fallback = ctx.pool.query(filters, { minResults: TOP_N })
    if (fallback.profiles.length > 0) {
      result = fallback
      overrode = true
    }
  }
  if (overrode) {
    ctx.emit({
      type: 'warning',
      code: 'degraded',
      message:
        'Nothing matched once your latest change was applied strictly, so it had to be loosened again — ' +
        'see what changed below. Tighten it by hand if you would rather see fewer people.',
    })
  }

  let bottleneck: Bottleneck | undefined
  if (result.profiles.length === 0) {
    const b = ctx.pool.bottleneck(result.effectiveFilters)
    if (b) {
      bottleneck = {
        reason: b.reason,
        count: b.count,
        humanized: BOTTLENECK_COPY[b.reason] ?? 'the filters are too tight',
      }
    }
  }

  ctx.emit({
    type: 'filtered',
    pool: ctx.pool.vocabulary().size,
    strict: result.strictCount,
    matched: result.profiles.length,
    relaxations: result.relaxations,
    bottleneck,
  })
  ctx.emit({ type: 'stage', name: 'filtering', status: 'done' })
  return result
}

/* ─────────────── step 3: score in parallel chunks ─────────────── */

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Only the fields the model is allowed to reason about. Keeps the prompt tight. */
function forPrompt(p: Profile) {
  return {
    id: p.id,
    current_title: p.current_title,
    years_experience: p.years_experience,
    location: p.location,
    current_company: p.current_company,
    current_company_type: p.current_company_type,
    skills: p.skills,
    past_companies: p.past_companies,
    education: p.education,
    summary: p.summary,
  }
}

/**
 * Scores in parallel batches of 8. Chunking buys two things: a single bad batch
 * cannot sink the round, and each batch that lands is emitted immediately so
 * cards fill in progressively instead of after one long silence.
 */
export async function scoreProfiles(
  ctx: RunContext,
  criteria: Criteria,
  profiles: Profile[],
): Promise<{ scores: VerifiedScore[]; failedChunks: number; unscored: Profile[] }> {
  if (profiles.length === 0) return { scores: [], failedChunks: 0, unscored: [] }

  ctx.emit({ type: 'stage', name: 'scoring', status: 'start', detail: `${profiles.length} candidates` })
  const batches = chunk(profiles, CHUNK_SIZE)
  const rubricText = JSON.stringify(criteria.rubric, null, 2)
  const byId = new Map(profiles.map((p) => [p.id, p]))

  const settled = await Promise.allSettled(
    batches.map(async (batch, i) => {
      const { data } = await callStructured({
        name: `score-profiles[${i + 1}/${batches.length}]`,
        schema: ScoreBatch,
        system: renderPrompt('score-profiles', {}),
        user: renderPrompt('score-profiles-user', {
          rubric: rubricText,
          count: batch.length,
          profiles: JSON.stringify(batch.map(forPrompt), null, 2),
        }),
        fault: i === 0 ? ctx.fault : undefined,
        signal: ctx.signal,
        onWarning: (w) => ctx.emit(toWarning(w)),
      })

      // Verify citations against the real record before anything is shown.
      const verified = data.scores
        .filter((s) => byId.has(s.profile_id))
        .map((s) => verifyScore(byId.get(s.profile_id)!, s))

      ctx.emit({ type: 'scored_chunk', scores: verified, chunk: i + 1, chunks: batches.length })
      return verified
    }),
  )

  const scores: VerifiedScore[] = []
  let failedChunks = 0
  settled.forEach((r) => {
    if (r.status === 'fulfilled') scores.push(...r.value)
    else failedChunks++
  })

  const scoredIds = new Set(scores.map((s) => s.profile_id))
  const unscored = profiles.filter((p) => !scoredIds.has(p.id))

  // A chunk can also come back schema-valid but empty — a repair that salvaged
  // nothing looks like success to the caller. Report on what is missing from
  // the results, not on whether a call threw.
  if (unscored.length > 0) {
    ctx.emit({
      type: 'warning',
      code: 'degraded',
      message:
        `Scored ${scores.length} of ${profiles.length}. ` +
        `${unscored.length} could not be scored and ${unscored.length === 1 ? 'is' : 'are'} shown unranked, ` +
        `with ${unscored.length === 1 ? 'its' : 'their'} profile summary instead.`,
    })
  }
  const unverified = scores.reduce((n, s) => n + s.unverified_evidence, 0)
  if (unverified > 0) {
    ctx.emit({
      type: 'warning',
      code: 'unverified',
      message: `Discarded ${unverified} ${unverified === 1 ? 'claim' : 'claims'} that did not match the profile data.`,
    })
  }

  ctx.emit({ type: 'stage', name: 'scoring', status: 'done' })
  return { scores, failedChunks, unscored }
}

export function rankTop(scores: VerifiedScore[], n = TOP_N): VerifiedScore[] {
  return [...scores].sort((a, b) => b.score - a.score).slice(0, n)
}

function toWarning(w: Warning): SseEvent {
  return { type: 'warning', code: w.code, message: w.message }
}

export function toErrorEvent(err: unknown): SseEvent {
  if (err instanceof LlmError) {
    return { type: 'error', code: err.code, message: userFacing(err.code), recoverable: err.recoverable }
  }
  return {
    type: 'error',
    code: 'unknown',
    message: (err as Error)?.message ?? 'Something went wrong.',
    recoverable: true,
  }
}

export { TOP_N, CHUNK_SIZE }
