import type { ObjectiveFilters } from '../../shared/schemas.ts'
import type { PoolVocabulary } from './TalentPool.ts'
import { normalize } from './match.ts'

export interface Sanitized {
  filters: ObjectiveFilters
  droppedSkills: string[]
  droppedLocations: string[]
}

/**
 * Filters may only reference values the talent pool actually stores.
 *
 * The model reliably reaches for concepts like "Leadership" or "Payments" when
 * a recruiter asks for them, but those are not skills in this dataset — they
 * are judgements, and they belong in the rubric. Left in `required_skills` they
 * match nobody, which silently empties the result set and then triggers the
 * relaxation ladder to undo them, so the recruiter sees a filter chip that is
 * doing the opposite of what it claims.
 *
 * Dropping them here keeps the filters honest. The concept is not lost: the
 * same refinement round puts it in the rubric, where it gets judged instead of
 * matched.
 */
export function sanitizeFilters(filters: ObjectiveFilters, vocab: PoolVocabulary): Sanitized {
  const skillExists = (s: string) => {
    const n = normalize(s)
    return n.length >= 2 && vocab.skills.some((v) => normalize(v).includes(n))
  }
  const locationExists = (l: string) => {
    const n = normalize(l)
    return n.length >= 2 && vocab.locations.some((v) => {
      const vn = normalize(v)
      return vn.includes(n) || n.includes(vn)
    })
  }

  const droppedSkills: string[] = []
  const droppedLocations: string[] = []

  const keepSkills = (list: string[]) =>
    list.filter((s) => {
      if (skillExists(s)) return true
      droppedSkills.push(s)
      return false
    })

  const next: ObjectiveFilters = {
    ...filters,
    required_skills: keepSkills(filters.required_skills),
    preferred_skills: keepSkills(filters.preferred_skills),
    locations: filters.locations.filter((l) => {
      if (locationExists(l)) return true
      droppedLocations.push(l)
      return false
    }),
    exclude: {
      // An exclusion for something nobody has is harmless, so it is left alone.
      skills: filters.exclude.skills,
      company_types: filters.exclude.company_types,
    },
  }

  return { filters: next, droppedSkills, droppedLocations }
}
