export interface Vocabulary {
  skills: string[]
  locations: string[]
  companyTypes: string[]
  size: number
}

export interface Detected {
  skills: string[]
  locations: string[]
  companyTypes: string[]
  experience: string | null
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * A cheap, instant preview of what the pool recognises in the query — no LLM,
 * purely local string matching against the real vocabulary. It is deliberately
 * not the extraction: the server still does that properly. The point is to show
 * the recruiter, while they type, that these words mean something here.
 */
export function detect(text: string, vocab: Vocabulary | null): Detected {
  const empty: Detected = { skills: [], locations: [], companyTypes: [], experience: null }
  if (!vocab || text.trim().length < 3) return empty

  const hay = norm(text)
  const raw = text.toLowerCase()

  const skills = vocab.skills.filter((s) => {
    const n = norm(s)
    return n.length >= 3 && hay.includes(n)
  })

  const locations = vocab.locations.filter((l) => {
    const n = norm(l.split('-')[0])
    return n.length >= 3 && hay.includes(n)
  })

  const companyTypes = vocab.companyTypes.filter((t) => raw.includes(t))

  return { skills, locations, companyTypes, experience: detectExperience(raw) }
}

function detectExperience(raw: string): string | null {
  const range = /(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?|y)\b/.exec(raw)
  if (range) return `${range[1]}–${range[2]}y`

  const atLeast = /(\d{1,2})\s*\+\s*(?:years?|yrs?|y)?\b/.exec(raw)
    ?? /(?:at least|min(?:imum)?|over|more than)\s*(\d{1,2})\s*(?:years?|yrs?|y)\b/.exec(raw)
  if (atLeast) return `${atLeast[1]}y+`

  const exact = /(\d{1,2})\s*(?:years?|yrs?)\b/.exec(raw)
  return exact ? `${exact[1]}y` : null
}

export function detectedCount(d: Detected): number {
  return d.skills.length + d.locations.length + d.companyTypes.length + (d.experience ? 1 : 0)
}
