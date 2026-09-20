import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Services } from '../services.ts'
import { openSse } from '../sse.ts'
import { parseFault } from '../llm/faults.ts'
import {
  extractCriteria, runFilters, scoreProfiles, rankTop, toErrorEvent, sanitize, TOP_N,
} from '../orchestrator.ts'

const SearchBody = z.object({
  query: z.string().min(3).max(1000),
  fault: z.string().optional(),
})

export function searchRoutes(services: Services) {
  return async function (app: FastifyInstance) {
    /**
     * Round 0. SSE over POST (not EventSource) because the query is a body,
     * and the client reads it with fetch + a stream reader.
     */
    app.post('/search', async (req, reply) => {
      const parsed = SearchBody.safeParse(req.body)
      if (!parsed.success) {
        return reply.code(400).send({ error: 'A search needs a query of at least 3 characters.' })
      }
      const { query, fault } = parsed.data

      const session = services.store.create(query)
      const sse = openSse(reply)
      const ctx = { pool: services.pool, emit: sse.send, fault: parseFault(fault), signal: sse.signal }

      sse.send({ type: 'session', id: session.id, round: 0 })
      services.store.addMessage(session.id, 0, 'recruiter', query)

      try {
        const extraction = await extractCriteria(ctx, query)
        const criteria = { filters: sanitize(ctx, extraction.filters), rubric: extraction.rubric }
        services.store.saveCriteria(session.id, 0, criteria, 'extracted')
        sse.send({ type: 'criteria', ...criteria, interpretation: extraction.interpretation })
        services.store.addMessage(session.id, 0, 'assistant', extraction.interpretation)

        // Relaxation is a per-run fallback to fill the page, NOT an edit to the
        // search. Persisting the loosened filters made every later round build
        // on them, so one wide round permanently destroyed the recruiter's
        // intent. The stored criteria stay exactly as asked; what was loosened
        // travels with the results instead.
        const filtered = runFilters(ctx, criteria.filters)
        services.store.saveResults(session.id, 0, filtered.profiles, filtered.relaxations)
        sse.send({ type: 'profiles', profiles: filtered.profiles })

        if (filtered.profiles.length === 0) {
          sse.send({ type: 'done', round: 0 })
          return
        }

        const { scores } = await scoreProfiles(ctx, criteria, filtered.profiles)
        services.store.saveScores(session.id, 0, scores)
        const top = rankTop(scores, TOP_N)
        sse.send({
          type: 'message',
          role: 'assistant',
          text: summarise(top.length, filtered.profiles.length, extraction.interpretation),
        })
        sse.send({ type: 'done', round: 0 })
      } catch (err) {
        req.log.error({ err }, 'search failed')
        sse.send(toErrorEvent(err))
      } finally {
        sse.close()
      }
    })

    /** History sidebar: every past search, newest first. */
    app.get('/sessions', async () => ({
      sessions: services.store.list().map((s) => ({
        id: s.id,
        query: s.original_query,
        status: s.status,
        round: s.round,
        createdAt: s.created_at,
        lastActivity: s.last_activity,
        resultCount: s.result_count,
        messageCount: s.message_count,
      })),
    }))

    /**
     * Everything needed to reopen a past search. Results come from SQLite
     * rather than being recomputed, so resuming costs no LLM calls at all.
     */
    app.get('/session/:id', async (req, reply) => {
      const { id } = req.params as { id: string }
      const session = services.store.get(id)
      if (!session) return reply.code(404).send({ error: 'No such session.' })

      const { profileIds, scores, relaxations } = services.store.latestResults(id)
      return {
        session: {
          id: session.id,
          query: session.original_query,
          status: session.status,
          round: session.round,
        },
        criteria: services.store.currentCriteria(id),
        messages: services.store.recentMessages(id).map((m) => ({ role: m.role, content: m.content })),
        verdicts: services.store.verdicts(id),
        profiles: services.pool.byIds(profileIds),
        scores,
        relaxations,
      }
    })

    app.delete('/session/:id', async (req, reply) => {
      const { id } = req.params as { id: string }
      if (!services.store.get(id)) return reply.code(404).send({ error: 'No such session.' })
      services.store.delete(id)
      return { deleted: id }
    })
  }
}

function summarise(shown: number, matched: number, interpretation: string): string {
  const of = matched > shown ? ` of ${matched} who matched` : ''
  return `Here ${shown === 1 ? 'is' : 'are'} the top ${shown}${of}. ${interpretation} Tell me which ones are wrong and I will adjust.`
}
