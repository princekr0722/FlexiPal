import { useEffect, useRef } from 'react'
import type { Profile, VerifiedScore } from '../../shared/schemas.ts'
import { Chip } from './primitives.tsx'

const VERDICT_STYLE = {
  strong: 'bg-market-active text-market-live',
  possible: 'bg-pastel-yellow text-text-muted',
  weak: 'bg-surface-muted text-text-subtle',
} as const

/** The whole record, including everything the cards leave out. */
export function ProfileModal({
  profile, score, verdict, onVerdict, onClose,
}: {
  profile: Profile
  score?: VerifiedScore
  verdict?: 'match' | 'reject'
  onVerdict: (v: 'match' | 'reject') => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const totalPast = profile.past_companies.reduce((n, c) => n + c.years, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/25 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      {/* Header and actions stay put; only the record scrolls. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${profile.name} — full profile`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[min(90vh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-market-accent-border bg-surface shadow-warm-lg focus:outline-none"
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-surface-warm-hairline bg-surface p-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-2xl leading-tight text-primary">{profile.name}</h2>
            <p className="mt-1 text-body-md text-text-muted">
              {profile.current_title} · {profile.current_company}
            </p>
            <p className="mt-1 font-mono text-body-xs text-text-subtle">
              {profile.id} · {profile.years_experience}y experience · {profile.location} · {profile.current_company_type}
            </p>
          </div>
          {score && (
            <div className="shrink-0 text-right">
              <div className="font-heading text-5xl leading-none tabular-nums text-primary">{score.score}</div>
              <div className={`mt-1.5 rounded-pill px-2 py-0.5 text-body-xs ${VERDICT_STYLE[score.verdict]}`}>
                {score.verdict}
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-body-lg leading-none text-text-subtle transition hover:bg-surface-muted hover:text-text"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {score && (
            <Section title="Why this score">
              <p className="text-body-md leading-relaxed text-text">{score.rationale}</p>

              {score.evidence.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {score.evidence.map((e, i) => (
                    <li key={i} className="rounded-md border border-market-accent-border bg-market-active px-3 py-2">
                      <div className="font-mono text-body-xs text-text-subtle">{e.field}</div>
                      <div className="mt-0.5 font-mono text-body-sm text-primary">{e.value}</div>
                      <div className="mt-1 text-body-sm leading-snug text-text-muted">{e.why}</div>
                    </li>
                  ))}
                </ul>
              )}

              {score.concerns.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-body-xs tracking-[0.02em] text-text-subtle">Concerns</p>
                  <div className="flex flex-wrap gap-1.5">
                    {score.concerns.map((c, i) => <Chip key={i} tone="concern" mono={false}>{c}</Chip>)}
                  </div>
                </div>
              )}

              {score.unverified_evidence > 0 && (
                <p className="mt-3 text-body-xs text-market-withheld">
                  {score.unverified_evidence} further claim{score.unverified_evidence === 1 ? ' was' : 's were'} discarded
                  because {score.unverified_evidence === 1 ? 'it did' : 'they did'} not match this profile's data.
                </p>
              )}
            </Section>
          )}

          <Section title="Summary">
            <p className="text-body-md leading-relaxed text-text-muted">{profile.summary}</p>
          </Section>

          <Section title={`Skills (${profile.skills.length})`}>
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((s) => <Chip key={s} tone="match">{s}</Chip>)}
            </div>
          </Section>

          <Section title={`Career${totalPast ? ` · ${totalPast}y before this role` : ''}`}>
            <ol className="space-y-2">
              <li className="rounded-md border border-market-accent-border bg-market-active px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-body-sm font-medium text-text">{profile.current_title}</span>
                  <span className="font-mono text-body-xs text-market-live">current</span>
                </div>
                <div className="mt-0.5 font-mono text-body-xs text-text-subtle">
                  {profile.current_company} · {profile.current_company_type}
                </div>
              </li>
              {profile.past_companies.map((c, i) => (
                <li key={i} className="rounded-md border border-surface-warm-hairline bg-surface-warm-muted px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body-sm text-text">{c.title}</span>
                    <span className="font-mono text-body-xs text-text-subtle">{c.years}y</span>
                  </div>
                  <div className="mt-0.5 font-mono text-body-xs text-text-subtle">
                    {c.company} · {c.company_type}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Education">
            <p className="text-body-sm text-text-muted">{profile.education}</p>
          </Section>
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-surface-warm-hairline bg-surface-warm-muted p-4">
          <button
            onClick={() => onVerdict('match')}
            className={`cursor-pointer rounded-pill px-4 py-1.5 text-body-sm font-medium transition-all duration-150 active:scale-95 ${
              verdict === 'match'
                ? 'bg-primary text-white'
                : 'border border-control-border bg-surface text-text-muted hover:border-control-border-hover'
            }`}
          >
            ✓ Match
          </button>
          <button
            onClick={() => onVerdict('reject')}
            className={`cursor-pointer rounded-pill px-4 py-1.5 text-body-sm font-medium transition-all duration-150 active:scale-95 ${
              verdict === 'reject'
                ? 'bg-danger text-white'
                : 'border border-control-border bg-surface text-text-muted hover:border-control-border-hover'
            }`}
          >
            ✗ Not this
          </button>
          <span className="ml-auto text-body-xs text-text-subtle">Esc to close</span>
        </footer>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-body-xs tracking-[0.02em] text-text-subtle">{title}</h3>
      {children}
    </section>
  )
}
