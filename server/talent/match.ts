import type { CompanyType, ObjectiveFilters, Profile } from '../../shared/schemas.ts'

/** "Node.js" and "nodejs" and "Node JS" are the same skill to a recruiter. */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * A profile skill satisfies a filter when it *contains* it, one direction only.
 * "RDS" is satisfied by "AWS RDS"; "Postgres" by "PostgreSQL". The reverse must
 * not hold: requiring "AWS RDS" is not satisfied by someone who merely lists
 * "AWS", and treating it as satisfied quietly inflates every result set.
 */
export function skillMatches(filterSkill: string, profileSkills: string[]): boolean {
  const f = normalize(filterSkill)
  if (f.length < 2) return false
  return profileSkills.some((ps) => normalize(ps).includes(f))
}

export function companyTypesOf(profile: Profile): CompanyType[] {
  return [profile.current_company_type, ...profile.past_companies.map((c) => c.company_type)]
}

export function locationMatches(filterLocations: string[], profileLocation: string): boolean {
  if (filterLocations.length === 0) return true
  const p = normalize(profileLocation)
  return filterLocations.some((fl) => {
    const f = normalize(fl)
    return p === f || p.includes(f) || f.includes(p)
  })
}

export function titleMatches(keywords: string[], title: string): boolean {
  if (keywords.length === 0) return true
  const t = normalize(title)
  return keywords.some((k) => t.includes(normalize(k)))
}

/** Why a profile was excluded. Powers the empty state's "what eliminated everyone". */
export type RejectReason =
  | 'required_skills'
  | 'years_experience'
  | 'location'
  | 'company_type'
  | 'title'
  | 'excluded_skill'
  | 'excluded_company_type'

export function rejectReason(profile: Profile, f: ObjectiveFilters): RejectReason | null {
  for (const skill of f.required_skills) {
    if (!skillMatches(skill, profile.skills)) return 'required_skills'
  }
  for (const skill of f.exclude.skills) {
    if (skillMatches(skill, profile.skills)) return 'excluded_skill'
  }
  const { min, max } = f.years_experience
  if (min !== null && profile.years_experience < min) return 'years_experience'
  if (max !== null && profile.years_experience > max) return 'years_experience'

  if (!locationMatches(f.locations, profile.location)) return 'location'

  const types = companyTypesOf(profile)
  if (f.company_types.length > 0 && !types.some((t) => f.company_types.includes(t))) {
    return 'company_type'
  }
  if (f.exclude.company_types.includes(profile.current_company_type)) {
    return 'excluded_company_type'
  }
  if (!titleMatches(f.title_keywords, profile.current_title)) return 'title'

  return null
}

export function matches(profile: Profile, f: ObjectiveFilters): boolean {
  return rejectReason(profile, f) === null
}

/** Ranking nudge from preferred_skills — never excludes, only orders. */
export function preferredHits(profile: Profile, f: ObjectiveFilters): number {
  return f.preferred_skills.filter((s) => skillMatches(s, profile.skills)).length
}

/**
 * How close a profile is to what the recruiter ORIGINALLY asked for, ignoring
 * whatever the ladder had to loosen. Used to keep the best of a relaxed set:
 * once a rung demotes a rare required skill the match count can jump from one
 * person to the whole pool, and "47 candidates" for a tight search is noise.
 */
export function closeness(profile: Profile, requested: ObjectiveFilters): number {
  let score = 0
  for (const s of requested.required_skills) {
    if (skillMatches(s, profile.skills)) score += 10
  }
  score += preferredHits(profile, requested) * 2

  const { min, max } = requested.years_experience
  const withinMin = min === null || profile.years_experience >= min
  const withinMax = max === null || profile.years_experience <= max
  if (withinMin && withinMax) score += 6
  else {
    // Near misses beat distant ones.
    const off = min !== null && !withinMin ? min - profile.years_experience
      : max !== null && !withinMax ? profile.years_experience - max : 0
    score += Math.max(0, 4 - off)
  }

  if (locationMatches(requested.locations, profile.location)) score += 5
  if (
    requested.company_types.length === 0 ||
    companyTypesOf(profile).some((t) => requested.company_types.includes(t))
  ) score += 4
  if (titleMatches(requested.title_keywords, profile.current_title)) score += 3

  return score
}
