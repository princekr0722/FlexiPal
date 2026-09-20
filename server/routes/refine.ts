import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Criteria, CriteriaUpdate, SessionSummary, type ObjectiveFilters } from '../../shared/schemas.ts'
import type { Services } from '../services.ts'
import { openSse } from '../sse.ts'
import { parseFault } from '../llm/faults.ts'
import { callStructured } from '../llm/call.ts'
import { renderPrompt } from '../llm/prompts.ts'
import { buildRefineContext } from '../context.ts'
import { MESSAGE_WINDOW, SUMMARY_LAG } from '../db/session.ts'
import { runFilters, scoreProfiles, rankTop, toErrorEvent, sanitize, TOP_N } from '../orchestrator.ts'

/** Hand-edited criteria are applied exactly as written. */
const ALL_FILTER_FIELDS: ReadonlySet<keyof ObjectiveFilters> = new Set<keyof ObjectiveFilters>([
  'required_skills', 'preferred_skills', 'years_experience',
  'locations', 'company_types', 'title_keywords', 'exclude',
])

const RefineBody = z.object({
  sessionId: z.string(),
  message: z.string().min(1).max(2000),
  verdicts: z.array(z.object({
    profileId: z.string(),
    verdict: z.enum(['match', 'reject']),
  })).default([]),
  shownIds: z.array(z.string()).default([]),
  fault: z.string().optional(),
})

const EditBody = z.object({
  sessionId: z.string(),
  filters: Criteria.shape.filters,
  rubric: Criteria.shape.rubric,
  fault: z.string().optional(),
})

export function refineRoutes(services: Services) {
  return async function (app: FastifyInstance) {
    /** A refinement round: feedback in, adjusted criteria and a fresh ranking out. */
    app.post('/refine', async (req, reply) => {
      const parsed = RefineBody.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid refinement request.' })
      const { sessionId, message, verdicts, shownIds, fault } = parsed.data

      const session = services.store.get(sessionId)
      if (!session) return reply.code(404).send({ error: 'No such session.' })
      if (session.status === 'frozen') {
        return reply.code(409).send({ error: 'This search is frozen. Start a new one to keep refining.' })
      }
      const current = services.store.currentCriteria(sessionId)
      if (!current) return reply.code(409).send({ error: 'This session has no criteria yet.' })

      const sse = openSse(reply)
      const ctx = { pool: services.pool, emit: sse.send, fault: parseFault(fault), signal: sse.signal }
      const round = services.store.bumpRound(sessionId)

      // Button verdicts are recorded before the model sees anything, so the
      // ledger and the chat message describe the same moment.
      for (const v of verdicts) {
        services.store.addVerdict(sessionId, round, v.profileId, v.verdict, 'button')
      }
      services.store.addMessage(sessionId, round, 'recruiter', message)
      sse.send({ type: 'session', id: sessionId, round })

      try {
        sse.send({ type: 'stage', name: 'refining', status: 'start' })
        const shown = services.pool.byIds(shownIds)
        const history = buildRefineContext(services.store, sessionId, shown)
        const v = services.pool.vocabulary()

        const { data: update } = await callStructured({
          name: 'refine-criteria',
          schema: CriteriaUpdate,
          system: renderPrompt('refine-criteria', {}),
          user: renderPrompt('refine-criteria-user', {
            filters: JSON.stringify(current.filters, null, 2),
            rubric: JSON.stringify(current.rubric, null, 2),
            summary: history.summary,
            verdicts: history.verdicts,
            messages: history.messages,
            shown: history.shown,
            feedback: message,
            skills: v.skills.join(', '),
            locations: v.locations.join(', '),
          }),
          fault: ctx.fault,
          signal: sse.signal,
          onWarning: (w) => sse.send({ type: 'warning', code: w.code, message: w.message }),
        })
        sse.send({ type: 'stage', name: 'refining', status: 'done' })

        const criteria = { filters: sanitize(ctx, update.filters), rubric: update.rubric }
        services.store.saveCriteria(sessionId, round, criteria, 'refined', update.changes)
        services.store.addMessage(sessionId, round, 'assistant', update.reply)

        // Reply first, then criteria: the recruiter reads why before seeing what.
        sse.send({ type: 'message', role: 'assistant', text: update.reply })
        sse.send({ type: 'criteria', ...criteria, changes: update.changes })

        // Anything the recruiter just moved is off limits to the ladder.
        const protectedFields = new Set<keyof ObjectiveFilters>(
          update.changes
            .filter((c) => c.target === 'filters')
            .map((c) => c.path.split('.')[0] as keyof ObjectiveFilters),
        )
        // See search.ts: the loosened filters are never written back.
        const filtered = runFilters(ctx, criteria.filters, protectedFields)
        services.store.saveResults(sessionId, round, filtered.profiles, filtered.relaxations)
        sse.send({ type: 'profiles', profiles: filtered.profiles })

        if (filtered.profiles.length > 0) {
          const { scores } = await scoreProfiles(ctx, criteria, filtered.profiles)
          services.store.saveScores(sessionId, round, scores)
          rankTop(scores, TOP_N)
        }

        await maybeSummarize(services, sessionId, sse.send)
        sse.send({ type: 'done', round })
      } catch (err) {
        req.log.error({ err }, 'refine failed')
        // The criteria on screen are still the last good ones — nothing was saved.
        sse.send(toErrorEvent(err))
      } finally {
        sse.close()
      }
    })

    /** Direct edits to the criteria panel. No LLM call — re-runs the search as given. */
    app.post('/criteria', async (req, reply) => {
      const parsed = EditBody.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid criteria.' })
      const { sessionId, filters, rubric } = parsed.data

      const session = services.store.get(sessionId)
      if (!session) return reply.code(404).send({ error: 'No such session.' })
      if (session.status === 'frozen') return reply.code(409).send({ error: 'This search is frozen.' })

      const sse = openSse(reply)
      const ctx = { pool: services.pool, emit: sse.send, fault: parseFault(parsed.data.fault), signal: sse.signal }
      const round = services.store.bumpRound(sessionId)
      const criteria = { filters: sanitize(ctx, filters), rubric }

      try {
        services.store.saveCriteria(sessionId, round, criteria, 'edited')
        services.store.addMessage(sessionId, round, 'recruiter', 'Edited the criteria directly.')
        sse.send({ type: 'session', id: sessionId, round })
        sse.send({ type: 'criteria', ...criteria })

        // A hand edit is the strongest signal of intent: relax nothing.
        const filtered = runFilters(ctx, criteria.filters, ALL_FILTER_FIELDS)
        services.store.saveResults(sessionId, round, filtered.profiles, filtered.relaxations)
        sse.send({ type: 'profiles', profiles: filtered.profiles })
        if (filtered.profiles.length > 0) {
          const { scores } = await scoreProfiles(ctx, criteria, filtered.profiles)
          services.store.saveScores(sessionId, round, scores)
        }
        sse.send({ type: 'done', round })
      } catch (err) {
        req.log.error({ err }, 'criteria edit failed')
        sse.send(toErrorEvent(err))
      } finally {
        sse.close()
      }
    })

    /** Reopens a frozen search so refinement can continue where it left off. */
    app.post('/unfreeze', async (req, reply) => {
      const { sessionId } = (req.body ?? {}) as { sessionId?: string }
      if (!sessionId) return reply.code(400).send({ error: 'sessionId is required.' })
      const session = services.store.get(sessionId)
      if (!session) return reply.code(404).send({ error: 'No such session.' })

      services.store.unfreeze(sessionId)
      return { session: services.store.get(sessionId) }
    })

    /** Freeze: the session becomes read-only and returns its final state. */
    app.post('/freeze', async (req, reply) => {
      const { sessionId } = (req.body ?? {}) as { sessionId?: string }
      if (!sessionId) return reply.code(400).send({ error: 'sessionId is required.' })
      const session = services.store.get(sessionId)
      if (!session) return reply.code(404).send({ error: 'No such session.' })

      services.store.freeze(sessionId)
      const criteria = services.store.currentCriteria(sessionId)
      return {
        session: services.store.get(sessionId),
        criteria,
        verdicts: services.store.verdicts(sessionId),
        history: services.store.criteriaHistory(sessionId).map((h) => ({
          round: h.round,
          source: h.source,
          changes: JSON.parse(h.changes_json) as unknown[],
        })),
      }
    })
  }
}

/**
 * Rebuilds the rolling summary only once enough messages have aged out of the
 * live window — a summarisation call on every round would double the latency of
 * the loop for no benefit while the window still holds the whole conversation.
 */
async function maybeSummarize(
  services: Services,
  sessionId: string,
  emit: (e: import('../../shared/events.ts').SseEvent) => void,
): Promise<void> {
  const total = services.store.messageCount(sessionId)
  if (total <= MESSAGE_WINDOW + SUMMARY_LAG) return

  const existing = services.store.summary(sessionId)
  const pending = services.store.messagesToSummarize(sessionId, existing?.covers_through_msg_id ?? 0)
  if (pending.length < SUMMARY_LAG) return

  try {
    emit({ type: 'stage', name: 'summarizing', status: 'start' })
    const changes = services.store
      .criteriaHistory(sessionId)
      .flatMap((h) => JSON.parse(h.changes_json) as Array<{ path: string; from: string; to: string; reason: string }>)
      .map((c) => `${c.path}: ${c.from} → ${c.to} (${c.reason})`)
      .join('\n')

    const { data } = await callStructured({
      name: 'summarize-session',
      schema: SessionSummary,
      system: renderPrompt('summarize-session', {}),
      user: renderPrompt('summarize-session-user', {
        previous: existing?.text ?? '(none)',
        messages: pending.map((m) => `${m.role}: ${m.content}`).join('\n'),
        changes: changes || '(none)',
      }),
    })
    services.store.saveSummary(sessionId, data.summary, pending.at(-1)!.id)
    emit({ type: 'stage', name: 'summarizing', status: 'done' })
  } catch {
    // Losing a summary refresh degrades memory slightly; it must never fail the round.
    emit({ type: 'stage', name: 'summarizing', status: 'done' })
  }
}
