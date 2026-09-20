import type { CompanyType, ObjectiveFilters, Profile, Relaxation } from '../../shared/schemas.ts'
import { matches, normalize, skillMatches } from './match.ts'

/** Company backgrounds that are near-neighbours when a search is too tight. */
const ADJACENT: Record<CompanyType, CompanyType[]> = {
  startup: ['scaleup'],
  scaleup: ['startup', 'enterprise'],
  enterprise: ['scaleup'],
  agency: ['scaleup'],
}

const REMOTE_FALLBACK = 'Remote - India'

export interface Rung {
  id: string
  /** Returns relaxed filters, or null when this rung does not apply. */
  apply: (f: ObjectiveFilters, pool: Profile[]) => { filters: ObjectiveFilters; detail: string } | null
  /** May fire more than once — e.g. demoting a second required skill. */
  repeatable?: boolean
  /** The filter field this rung loosens. Used to protect recruiter edits. */
  touches: keyof ObjectiveFilters
}

const clone = (f: ObjectiveFilters): ObjectiveFilters => structuredClone(f)

/**
 * Ordered least-destructive first. `exclude` is never relaxed: the recruiter
 * ruled those out explicitly, and quietly reintroducing them is the fastest way
 * to lose their trust in the whole list.
 */
export const LADDER: Rung[] = [
  {
    id: 'drop_title_keywords',
    touches: 'title_keywords',
    apply: (f) => {
      if (f.title_keywords.length === 0) return null
      const filters = clone(f)
      const dropped = filters.title_keywords
      filters.title_keywords = []
      return { filters, detail: `Stopped requiring the title to contain ${quoteList(dropped)}.` }
    },
  },
  {
    id: 'widen_years_1',
    touches: 'years_experience',
    apply: (f) => widenYears(f, 1),
  },
  {
    id: 'widen_years_2',
    touches: 'years_experience',
    apply: (f) => widenYears(f, 2),
  },
  {
    id: 'widen_company_types',
    touches: 'company_types',
    apply: (f) => {
      if (f.company_types.length === 0) return null
      const widened = new Set<CompanyType>(f.company_types)
      for (const t of f.company_types) for (const adj of ADJACENT[t]) widened.add(adj)
      if (widened.size === f.company_types.length) return null
      const filters = clone(f)
      const added = [...widened].filter((t) => !f.company_types.includes(t))
      filters.company_types = [...widened]
      return { filters, detail: `Also accepted ${quoteList(added)} backgrounds.` }
    },
  },
  {
    id: 'add_remote',
    touches: 'locations',
    apply: (f) => {
      if (f.locations.length === 0) return null
      if (f.locations.some((l) => normalize(l) === normalize(REMOTE_FALLBACK))) return null
      const filters = clone(f)
      filters.locations = [...f.locations, REMOTE_FALLBACK]
      return { filters, detail: `Included ${REMOTE_FALLBACK}.` }
    },
  },
  {
    id: 'drop_locations',
    touches: 'locations',
    apply: (f) => {
      if (f.locations.length === 0) return null
      const filters = clone(f)
      const dropped = filters.locations
      filters.locations = []
      return { filters, detail: `Opened the search beyond ${quoteList(dropped)}.` }
    },
  },
  {
    id: 'demote_rarest_skill',
    touches: 'required_skills',
    repeatable: true,
    apply: (f, pool) => {
      if (f.required_skills.length === 0) return null
      // Demote the skill that costs the most people first.
      const rarest = [...f.required_skills].sort(
        (a, b) => countWith(pool, a) - countWith(pool, b),
      )[0]
      const filters = clone(f)
      filters.required_skills = f.required_skills.filter((s) => s !== rarest)
      if (!filters.preferred_skills.includes(rarest)) filters.preferred_skills.push(rarest)
      const n = countWith(pool, rarest)
      return {
        filters,
        detail: `Made "${rarest}" preferred rather than required — only ${n} ${n === 1 ? 'person has' : 'people have'} it.`,
      }
    },
  },
]

function widenYears(f: ObjectiveFilters, by: number): { filters: ObjectiveFilters; detail: string } | null {
  const { min, max } = f.years_experience
  if (min === null && max === null) return null
  const filters = clone(f)
  const newMin = min === null ? null : Math.max(0, min - by)
  const newMax = max === null ? null : max + by
  if (newMin === min && newMax === max) return null
  filters.years_experience = { min: newMin, max: newMax }
  return { filters, detail: `Widened experience ${range(min, max)} to ${range(newMin, newMax)}.` }
}

function range(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}y`
  if (min !== null) return `${min}y+`
  if (max !== null) return `up to ${max}y`
  return 'any'
}

function countWith(pool: Profile[], skill: string): number {
  return pool.filter((p) => skillMatches(skill, p.skills)).length
}

function quoteList(items: string[]): string {
  if (items.length === 1) return `"${items[0]}"`
  if (items.length === 2) return `"${items[0]}" or "${items[1]}"`
  return items.map((i) => `"${i}"`).slice(0, -1).join(', ') + ` or "${items.at(-1)}"`
}

export interface RelaxOutcome {
  filters: ObjectiveFilters
  profiles: Profile[]
  relaxations: Relaxation[]
}

/**
 * Relaxes as little as possible, and discloses everything it does.
 *
 * Each pass takes the first rung (least destructive first) that actually
 * increases the number of matches, and stops the moment `minResults` is met.
 * Only when no single rung helps on its own does it take the least destructive
 * applicable rung anyway, to unlock a combination that does.
 *
 * Every rung taken is recorded, including those. An earlier version kept
 * rungs that bought nothing without reporting them, which meant a search could
 * silently drop the location constraint while still showing "Bangalore" in the
 * filter rail — the single most trust-destroying thing this code could do.
 */
export function relaxUntil(
  filters: ObjectiveFilters,
  pool: Profile[],
  minResults: number,
  /**
   * Filter fields the recruiter just changed. Never relaxed: widening the
   * experience floor straight back down after someone said "too junior" is
   * the loop arguing with them, and it is why they stop trusting it.
   */
  protect: ReadonlySet<keyof ObjectiveFilters> = new Set(),
): RelaxOutcome {
  let current = filters
  let found = pool.filter((p) => matches(p, current))
  const relaxations: Relaxation[] = []
  const spent = new Set<string>()

  const applicable = () => {
    const out: Array<{ rung: Rung; step: { filters: ObjectiveFilters; detail: string }; count: number }> = []
    for (const rung of LADDER) {
      if (!rung.repeatable && spent.has(rung.id)) continue
      if (protect.has(rung.touches)) continue
      const step = rung.apply(current, pool)
      if (!step) continue
      out.push({ rung, step, count: pool.filter((p) => matches(p, step.filters)).length })
    }
    return out
  }

  // Bounded purely as a termination guard; the ladder exhausts well before this.
  for (let guard = 0; guard < 16 && found.length < minResults; guard++) {
    const options = applicable()
    if (options.length === 0) break

    // Prefer a rung that helps; otherwise take the cheapest one to open a combination.
    const chosen = options.find((o) => o.count > found.length) ?? options[0]

    if (!chosen.rung.repeatable) spent.add(chosen.rung.id)
    current = chosen.step.filters
    found = pool.filter((p) => matches(p, current))
    relaxations.push({ rung: chosen.rung.id, field: chosen.rung.touches, detail: chosen.step.detail })
  }

  return { filters: current, profiles: found, relaxations }
}
