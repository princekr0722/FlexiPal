import type { SessionState } from '../../state/session.ts'

/**
 * A persistent strip above the results while a round is in flight. The funnel
 * only covers the gap before any cards exist; once cards are on screen the
 * recruiter still needs to know work is ongoing and what is left.
 */
export function ScoringBar({ state }: { state: SessionState }) {
  const { done, total } = state.scoredChunks
  const scored = Object.keys(state.scores).length
  const expected = state.profiles.length

  const label = total === 0
    ? 'Working out which profiles match…'
    : `Scoring ${expected} ${expected === 1 ? 'candidate' : 'candidates'} · batch ${done} of ${total}`

  const pct = total === 0 ? 8 : Math.max(8, Math.round((scored / Math.max(1, expected)) * 100))

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 rounded-md border border-surface-warm-border bg-surface-warm-card px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        <span className="size-1.5 animate-pulse rounded-pill bg-accent" />
        <span className="text-body-sm text-text">{label}</span>
        {total > 0 && (
          <span className="ml-auto font-mono text-body-xs text-text-subtle">
            {scored}/{expected}
          </span>
        )}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-band bg-market-track">
        <div
          className="h-full rounded-band bg-market-band transition-[width] duration-500 ease-emphasized"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Placeholder cards for the moment we know a count but no profiles have arrived. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-card border border-market-talent-hairline bg-market-talent-surface p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-surface-warm-sunken" />
              <div className="h-3 w-56 animate-pulse rounded bg-surface-warm-sunken" />
              <div className="h-3 w-32 animate-pulse rounded bg-surface-warm-sunken" />
            </div>
            <div className="h-8 w-12 animate-pulse rounded-md bg-surface-warm-sunken" />
          </div>
          <div className="mt-3 h-1.5 animate-pulse rounded-band bg-surface-warm-sunken" />
          <div className="mt-3 space-y-1.5">
            <div className="h-3 w-full animate-pulse rounded bg-surface-warm-sunken" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-warm-sunken" />
          </div>
        </div>
      ))}
    </div>
  )
}
