import type { ObjectiveFilters, Profile, Relaxation } from '../../shared/schemas.ts'

export interface PoolVocabulary {
  skills: string[]
  locations: string[]
  companyTypes: string[]
  size: number
}

export interface QueryResult {
  profiles: Profile[]
  /** Rungs of the relaxation ladder that were taken, in order. Shown to the recruiter. */
  relaxations: Relaxation[]
  /** Filters actually applied, after any relaxation. */
  effectiveFilters: ObjectiveFilters
  /** How many matched before any relaxation. */
  strictCount: number
}

/**
 * The talent pool behind an interface on purpose. The assignment ships a JSON
 * file standing in for a 98M-row store; everything above this line is written
 * as if the real thing were behind it, so swapping in a database implementation
 * touches one file and no callers.
 */
export interface TalentPool {
  all(): Profile[]
  byIds(ids: string[]): Profile[]
  vocabulary(): PoolVocabulary
  query(filters: ObjectiveFilters, opts?: { minResults?: number; protect?: ReadonlySet<keyof ObjectiveFilters> }): QueryResult
}
