import type { Profile, VerifiedScore } from '../../shared/schemas.ts'
import { Chip } from './primitives.tsx'

const VERDICT_STYLE = {
  strong: 'bg-market-active text-market-live',
  possible: 'bg-pastel-yellow text-text-muted',
  weak: 'bg-surface-muted text-text-subtle',
} as const

export function ProfileCard({
  profile, score, verdict, onVerdict, onOpen, rank, pending = false,
}: {
  profile: Profile
  score?: VerifiedScore
  verdict?: 'match' | 'reject'
  onVerdict: (v: 'match' | 'reject') => void
  onOpen: () => void
  rank: number
  /** Scoring is still in flight for this profile. Distinct from "came back unscored". */
  pending?: boolean
}) {
  const selected = verdict === 'match'
  const rejected = verdict === 'reject'

  return (
    <article
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${profile.name}'s full profile`}
      className={[
        'cursor-pointer rounded-card border p-4 transition-all duration-200 ease-emphasized',
        selected
          ? 'border-market-accent-border bg-market-selected shadow-warm-md'
          : rejected
            ? 'border-surface-border bg-surface-warm-sunken opacity-55'
            : 'border-market-talent-hairline bg-market-talent-surface shadow-warm-sm hover:shadow-warm-md hover:bg-market-hover',
      ].join(' ')}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-body-xs text-text-subtle">{rank}</span>
            <h3 className="truncate font-heading text-body-lg text-primary">{profile.name}</h3>
          </div>
          <p className="mt-0.5 truncate text-body-sm text-text-muted">
            {profile.current_title} · {profile.current_company}
          </p>
          <p className="mt-0.5 font-mono text-body-xs text-text-subtle">
            {profile.years_experience}y · {profile.location} · {profile.current_company_type}
          </p>
        </div>

        {score ? (
          <div className="shrink-0 text-right">
            <div className="font-heading text-3xl leading-none tabular-nums text-primary">{score.score}</div>
            <div className={`mt-1 rounded-pill px-2 py-0.5 text-body-xs ${VERDICT_STYLE[score.verdict]}`}>
              {score.verdict}
            </div>
          </div>
        ) : pending ? (
          <div className="shrink-0 text-right">
            <div className="h-7 w-11 animate-pulse rounded-md bg-surface-warm-sunken" />
            <div className="mt-1.5 h-4 w-14 animate-pulse rounded-pill bg-surface-warm-sunken" />
          </div>
        ) : (
          <div className="shrink-0 text-right">
            <div className="font-mono text-body-xs text-market-withheld">unscored</div>
          </div>
        )}
      </header>

      {score && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-band bg-market-track">
            <div
              className="h-full rounded-band bg-market-band transition-[width] duration-500 ease-emphasized"
              style={{ width: `${score.score}%` }}
            />
          </div>
          <p className="mt-3 text-body-sm leading-snug text-text">{score.rationale}</p>

          {score.evidence.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {score.evidence.map((e, i) => (
                <li key={i}>
                  <Chip tone="match">
                    <span className="text-text-subtle">{e.field}</span>
                    <span className="text-primary">{e.value}</span>
                  </Chip>
                </li>
              ))}
            </ul>
          )}

          {score.concerns.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {score.concerns.map((c, i) => (
                <li key={i}><Chip tone="concern" mono={false}>{c}</Chip></li>
              ))}
            </ul>
          )}

          {score.unverified_evidence > 0 && (
            <p className="mt-2 text-body-xs text-market-withheld">
              {score.unverified_evidence} claim{score.unverified_evidence === 1 ? '' : 's'} discarded — did not match this profile.
            </p>
          )}
        </>
      )}

      {!score && pending && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-band bg-market-track">
            <div className="h-full w-1/3 animate-pulse rounded-band bg-market-band/50" />
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-surface-warm-sunken" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-surface-warm-sunken" />
          </div>
          <div className="mt-3 flex gap-1.5">
            <div className="h-6 w-24 animate-pulse rounded-chip bg-surface-warm-sunken" />
            <div className="h-6 w-20 animate-pulse rounded-chip bg-surface-warm-sunken" />
          </div>
        </>
      )}

      {!score && !pending && (
        <>
          <p className="mt-3 text-body-sm leading-snug text-text-muted">{profile.summary}</p>
          <p className="mt-2 text-body-xs text-market-withheld">
            Shown from the profile itself — the model could not score this one.
          </p>
        </>
      )}

      {/* Verdicts must not open the modal. */}
      <footer
        onClick={(e) => e.stopPropagation()}
        className="mt-4 flex items-center gap-2 border-t border-market-talent-hairline pt-3"
      >
        <VerdictButton active={selected} tone="match" disabled={pending} onClick={() => onVerdict('match')}>
          ✓ Match
        </VerdictButton>
        <VerdictButton active={rejected} tone="reject" disabled={pending} onClick={() => onVerdict('reject')}>
          ✗ Not this
        </VerdictButton>
        <span className="ml-auto font-mono text-body-xs text-text-subtle">{profile.id}</span>
        <button
          onClick={onOpen}
          className="cursor-pointer text-body-xs text-text-subtle underline-offset-4 transition hover:text-primary hover:underline"
        >
          Full profile
        </button>
      </footer>
    </article>
  )
}

function VerdictButton({
  children, active, tone, onClick, disabled,
}: {
  children: React.ReactNode
  active: boolean
  tone: 'match' | 'reject'
  onClick: () => void
  disabled?: boolean
}) {
  const on = tone === 'match'
    ? 'bg-primary text-white'
    : 'bg-danger text-white'
  const off = 'bg-surface border border-control-border text-text-muted hover:border-control-border-hover'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer rounded-pill px-3 py-1 text-body-xs font-medium transition-all duration-150 hover:shadow-warm-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${active ? on : off}`}
    >
      {children}
    </button>
  )
}
