import type { FastifyInstance } from 'fastify'
import type { Services } from '../services.ts'
import { searchRoutes } from './search.ts'
import { refineRoutes } from './refine.ts'
import { FAULT_KINDS, faultsEnabled } from '../llm/faults.ts'

/** Everything under /api. Registered with a prefix, so paths here are relative. */
export function apiRoutes(services: Services) {
  return async function (app: FastifyInstance) {
    app.get('/health', async () => ({
      ok: true,
      service: 'flexipal',
      model: services.meta.model,
      apiKey: services.meta.hasApiKey ? 'present' : 'MISSING',
      pool: services.meta.poolSize,
      faults: faultsEnabled() ? FAULT_KINDS : [],
    }))

    /** The pool's real vocabulary, so the search box can react as you type. */
    app.get('/vocabulary', async () => {
      const v = services.pool.vocabulary()
      return { skills: v.skills, locations: v.locations, companyTypes: v.companyTypes, size: v.size }
    })

    await app.register(searchRoutes(services))
    await app.register(refineRoutes(services))
  }
}
