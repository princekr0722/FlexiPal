import { z } from 'zod'

/* ─────────────── talent pool ─────────────── */

export const CompanyType = z.enum(['startup', 'scaleup', 'enterprise', 'agency'])
export type CompanyType = z.infer<typeof CompanyType>

export const PastCompany = z.object({
  company: z.string(),
  company_type: CompanyType,
  title: z.string(),
  years: z.number(),
})

export const Profile = z.object({
  id: z.string(),
  name: z.string(),
  current_title: z.string(),
  years_experience: z.number(),
  location: z.string(),
  current_company: z.string(),
  current_company_type: CompanyType,
  skills: z.array(z.string()),
  past_companies: z.array(PastCompany),
  education: z.string(),
  summary: z.string(),
})
export type Profile = z.infer<typeof Profile>

/** Fields an explanation is allowed to cite. Enforced against the real profile. */
export const CITABLE_FIELDS = [
  'current_title',
  'years_experience',
  'location',
  'current_company',
  'current_company_type',
  'skills',
  'past_companies',
  'education',
  'summary',
] as const
export const CitableField = z.enum(CITABLE_FIELDS)
export type CitableField = z.infer<typeof CitableField>

/* ─────────────── objective filters ─────────────── */

export const ObjectiveFilters = z.object({
  required_skills: z.array(z.string())
    .describe('Skills a candidate MUST have. ANDed. Keep tight — each one excludes people.'),
  preferred_skills: z.array(z.string())
    .describe('Nice-to-have skills. Never exclude anyone; they lift ranking only.'),
  years_experience: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
  }),
  locations: z.array(z.string())
    .describe('Acceptable locations, ORed. Empty means anywhere.'),
  company_types: z.array(CompanyType)
    .describe('Acceptable company backgrounds, matched against current OR past employers.'),
  title_keywords: z.array(z.string())
    .describe('Substrings matched against current_title, ORed.'),
  exclude: z.object({
    skills: z.array(z.string()),
    company_types: z.array(CompanyType),
  }),
})
export type ObjectiveFilters = z.infer<typeof ObjectiveFilters>

export const EMPTY_FILTERS: ObjectiveFilters = {
  required_skills: [],
  preferred_skills: [],
  years_experience: { min: null, max: null },
  locations: [],
  company_types: [],
  title_keywords: [],
  exclude: { skills: [], company_types: [] },
}

/* ─────────────── fit rubric ─────────────── */

export const RubricCriterion = z.object({
  id: z.string(),
  label: z.string().describe('Three to five words.'),
  description: z.string().describe('One sentence on what good looks like here.'),
  weight: z.number().min(1).max(5),
  signals_of_strength: z.array(z.string()),
  signals_of_weakness: z.array(z.string()),
})
export type RubricCriterion = z.infer<typeof RubricCriterion>

export const FitRubric = z.object({
  role_summary: z.string().describe('One sentence describing the role in the recruiter\'s own terms.'),
  criteria: z.array(RubricCriterion).min(3).max(5),
  dealbreakers: z.array(z.string()),
})
export type FitRubric = z.infer<typeof FitRubric>

export const Criteria = z.object({ filters: ObjectiveFilters, rubric: FitRubric })
export type Criteria = z.infer<typeof Criteria>

/* ─────────────── scoring ─────────────── */

export const Verdict = z.enum(['strong', 'possible', 'weak'])
export type Verdict = z.infer<typeof Verdict>

export const Evidence = z.object({
  field: CitableField.describe('Which profile field this is drawn from.'),
  value: z.string().describe('The literal value from that field. Must appear in the profile.'),
  why: z.string().describe('Why this specific detail matters for this rubric. One short clause.'),
})
export type Evidence = z.infer<typeof Evidence>

export const ScoredProfile = z.object({
  profile_id: z.string(),
  score: z.number().min(0).max(100),
  verdict: Verdict,
  rationale: z.string().describe('At most two sentences. Specific to this person.'),
  evidence: z.array(Evidence).min(1).max(4),
  concerns: z.array(z.string()).max(3),
})
export type ScoredProfile = z.infer<typeof ScoredProfile>

/** Scored profile after server-side verification of its evidence. */
export type VerifiedScore = ScoredProfile & {
  unverified_evidence: number
}

export const ScoreBatch = z.object({ scores: z.array(ScoredProfile) })
export type ScoreBatch = z.infer<typeof ScoreBatch>

/* ─────────────── extraction + refinement ─────────────── */

export const CriteriaExtraction = z.object({
  filters: ObjectiveFilters,
  rubric: FitRubric,
  interpretation: z.string().describe('One sentence: how you read the request. Plain, no hedging.'),
})
export type CriteriaExtraction = z.infer<typeof CriteriaExtraction>

export const CriteriaChange = z.object({
  target: z.enum(['filters', 'rubric']),
  path: z.string().describe('Dotted path, e.g. years_experience.min or criteria.payments_depth.weight'),
  from: z.string(),
  to: z.string(),
  reason: z.string().describe('Tie to what the recruiter actually said.'),
})
export type CriteriaChange = z.infer<typeof CriteriaChange>

export const CriteriaUpdate = z.object({
  filters: ObjectiveFilters,
  rubric: FitRubric,
  changes: z.array(CriteriaChange),
  reply: z.string().describe('What the recruiter reads. Two sentences max. Name the change and why.'),
})
export type CriteriaUpdate = z.infer<typeof CriteriaUpdate>

export const SessionSummary = z.object({
  summary: z.string().describe('Durable decisions and preferences only. No chatter.'),
})

/* ─────────────── relaxation ─────────────── */

export const Relaxation = z.object({
  rung: z.string(),
  /** Which filter field was loosened, so the UI can mark it. */
  field: z.string(),
  detail: z.string(),
})
export type Relaxation = z.infer<typeof Relaxation>
