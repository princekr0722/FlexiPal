import type { SessionStore, MessageRow, VerdictRow } from './db/session.ts'
import type { Profile } from '../shared/schemas.ts'

/**
 * Assembles what the model sees on a refinement round. The current criteria are
 * always sent verbatim; everything else is history, compacted so that round 8
 * costs about what round 2 did while still remembering round 1's decisions.
 */
export interface RefineContext {
  filters: string
  rubric: string
  summary: string
  verdicts: string
  messages: string
  shown: string
}

export function buildRefineContext(
  store: SessionStore,
  sessionId: string,
  shownProfiles: Profile[],
): Omit<RefineContext, 'filters' | 'rubric'> {
  const summary = store.summary(sessionId)?.text
  const verdicts = store.verdicts(sessionId)
  const messages = store.recentMessages(sessionId)

  return {
    summary: summary?.trim()
      ? summary
      : 'Nothing yet — this is still early in the session.',
    verdicts: formatVerdicts(verdicts),
    messages: formatMessages(messages),
    shown: formatShown(shownProfiles),
  }
}

/**
 * The ledger is compacted to one line per profile rather than sent as rows.
 * A recruiter's rejection reason from round 1 must still be legible at round 8,
 * and prose survives truncation better than JSON.
 */
function formatVerdicts(verdicts: VerdictRow[]): string {
  if (verdicts.length === 0) return 'No explicit verdicts yet.'
  // Later verdicts on the same profile supersede earlier ones.
  const latest = new Map<string, VerdictRow>()
  for (const v of verdicts) latest.set(v.profile_id, v)
  return [...latest.values()]
    .map((v) => {
      const mark = v.verdict === 'match' ? 'accepted' : 'rejected'
      const why = v.note ? ` — "${v.note}"` : ''
      return `${v.profile_id} ${mark} in round ${v.round}${why}`
    })
    .join('\n')
}

function formatMessages(messages: MessageRow[]): string {
  if (messages.length === 0) return '(nothing yet)'
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'recruiter' ? 'Recruiter' : 'You'}: ${m.content}`)
    .join('\n')
}

/** Only what the recruiter can actually see on screen, so "1" and "2" resolve. */
function formatShown(profiles: Profile[]): string {
  if (profiles.length === 0) return '(nothing on screen)'
  return profiles
    .map((p, i) =>
      `${i + 1}. ${p.id} — ${p.name}, ${p.current_title} at ${p.current_company} (${p.current_company_type}), ` +
      `${p.years_experience}y, ${p.location}. Skills: ${p.skills.join(', ')}.`,
    )
    .join('\n')
}
