import type { SessionState } from '../state/session.ts'
import { rankedProfiles } from '../state/session.ts'
import { Chip } from './primitives.tsx'
import { csvFilename, downloadCsv, shortlistToCsv } from '../lib/csv.ts'

/** Long shortlists stop being shortlists; the rest are still in the export. */
const MAX_LISTED = 50

/** The end state: what was decided, and who came out of it. */
export function FrozenSummary({
  state, onUnfreeze, onOpenProfile,
}: {
  state: SessionState
  onUnfreeze: () => void
  onOpenProfile: (id: string) => void
}) {
  const all = rankedProfiles(state).filter((r) => state.verdicts[r.profile.id] !== 'reject')
  const ranked = all.slice(0, MAX_LISTED)
  const hidden = all.length - ranked.length
  const accepted = all.filter((r) => state.verdicts[r.profile.id] === 'match').length

  return (
    <div className="rounded-card border border-market-accent-border bg-surface shadow-warm-lg">
      <div className="rounded-t-card border-b border-market-accent-border bg-accent px-5 py-3">
        <h2 className="font-heading text-body-xl text-text-on-accent">Search frozen</h2>
        <p className="mt-0.5 text-body-sm text-text-on-accent/75">
          {all.length} on the shortlist
          {accepted > 0 && ` · ${accepted} you marked as a match`}
          {state.round > 0 && ` · ${state.round} refinement round${state.round === 1 ? '' : 's'}`}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() =>
              downloadCsv(csvFilename(state.query), shortlistToCsv(all, state.verdicts))
            }
            className="cursor-pointer rounded-pill bg-primary px-3.5 py-1.5 text-body-xs font-medium text-white transition-all duration-150 hover:bg-primary-hover active:scale-95"
          >
            ↓ Download CSV
            <span className="ml-1.5 font-mono opacity-70">{all.length} rows</span>
          </button>
          <button
            onClick={onUnfreeze}
            className="cursor-pointer rounded-pill border border-text-on-accent/25 px-3.5 py-1.5 text-body-xs font-medium text-text-on-accent transition-all duration-150 hover:bg-text-on-accent/10 active:scale-95"
          >
            Unfreeze and keep refining
          </button>
        </div>
      </div>

      <div className="space-y-2 p-5">
        {ranked.map(({ profile, score }, i) => (
          <div
            key={profile.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenProfile(profile.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpenProfile(profile.id) }}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-market-talent-hairline bg-market-talent-surface px-3 py-2.5 transition hover:border-market-accent-border hover:bg-market-hover"
          >
            <span className="w-5 shrink-0 font-mono text-body-xs text-text-subtle">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium text-body-sm text-text">{profile.name}</span>
                {state.verdicts[profile.id] === 'match' && (
                  <span className="shrink-0 text-body-xs text-market-live">✓ marked</span>
                )}
              </div>
              <p className="truncate font-mono text-body-xs text-text-subtle">
                {profile.current_title} · {profile.years_experience}y · {profile.location} · {profile.current_company}
              </p>
            </div>
            {score && (
              <span className="shrink-0 font-heading text-body-xl tabular-nums text-primary">{score.score}</span>
            )}
          </div>
        ))}

        {hidden > 0 && (
          <p className="pt-1 text-body-sm text-text-subtle">
            {hidden} more {hidden === 1 ? 'candidate is' : 'candidates are'} below the top {MAX_LISTED} and
            not listed here. All {all.length} are in the CSV.
          </p>
        )}

        {state.relaxations.length > 0 && (
          <div className="mt-4 rounded-md border border-surface-warm-border bg-surface-warm-card p-3">
            <p className="mb-1.5 text-body-xs font-medium text-market-withheld">
              These filters were loosened to fill the list
            </p>
            <ul className="space-y-1">
              {state.relaxations.map((r, i) => (
                <li key={`${r.rung}${i}`} className="text-body-xs leading-snug text-text-muted">{r.detail}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-surface-warm-hairline pt-4">
          <span className="mr-1 text-body-xs text-text-subtle">Frozen filters:</span>
          {state.filters?.required_skills.map((s) => <Chip key={s} tone="match">{s}</Chip>)}
          {state.filters?.locations.map((l) => <Chip key={l} tone="match">{l}</Chip>)}
          {state.filters?.company_types.map((c) => <Chip key={c} tone="match">{c}</Chip>)}
        </div>
      </div>
    </div>
  )
}
