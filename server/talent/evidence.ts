import type { Evidence, Profile, ScoredProfile, VerifiedScore } from '../../shared/schemas.ts'
import { normalize } from './match.ts'

/**
 * The assignment requires that an explanation cite real fields of the profile.
 * A prompt alone cannot guarantee that, so every citation is checked against
 * the source record here. Unverifiable evidence is dropped rather than shown,
 * and the count of dropped items travels with the score so the UI can be honest
 * about it. A confident explanation of a detail the candidate does not have is
 * the single fastest way to lose a recruiter's trust in the whole list.
 */
export function verifyEvidence(profile: Profile, evidence: Evidence[]): {
  kept: Evidence[]
  dropped: Evidence[]
} {
  const kept: Evidence[] = []
  const dropped: Evidence[] = []
  for (const e of evidence) {
    ;(citationHolds(profile, e) ? kept : dropped).push(e)
  }
  return { kept, dropped }
}

function citationHolds(profile: Profile, e: Evidence): boolean {
  const claimed = normalize(e.value)
  if (!claimed) return false

  switch (e.field) {
    case 'skills':
      return profile.skills.some((s) => {
        const n = normalize(s)
        return n.includes(claimed) || claimed.includes(n)
      })

    case 'past_companies':
      return profile.past_companies.some((c) => {
        const hay = normalize(`${c.company} ${c.title} ${c.company_type} ${c.years}`)
        return hay.includes(claimed) || claimed.includes(normalize(c.company))
      })

    case 'years_experience': {
      // Accept "6", "6 years", "6y" — but the number has to be the real one.
      const nums = e.value.match(/\d+(?:\.\d+)?/g)
      return nums ? nums.some((n) => Number(n) === profile.years_experience) : false
    }

    case 'current_company_type':
      return normalize(profile.current_company_type) === claimed

    default: {
      const actual = normalize(String(profile[e.field]))
      return actual.includes(claimed) || claimed.includes(actual)
    }
  }
}

/** Applies verification to a whole scored profile. */
export function verifyScore(profile: Profile, score: ScoredProfile): VerifiedScore {
  const { kept, dropped } = verifyEvidence(profile, score.evidence)
  return { ...score, evidence: kept, unverified_evidence: dropped.length }
}
