import type { SessionState } from '../state/session.ts'
import type { StageName } from '../../shared/events.ts'

const LABELS: Record<StageName, string> = {
  extracting: 'Reading your requirement',
  refining: 'Working out what to change',
  filtering: 'Filtering the pool',
  scoring: 'Scoring against the rubric',
  summarizing: 'Noting what was decided',
}

/** A refinement round starts at "refining"; a first search starts at "extracting". */
function stepsFor(refining: boolean): StageName[] {
  return refining
    ? ['refining', 'filtering', 'scoring']
    : ['extracting', 'filtering', 'scoring']
}

/**
 * Flexiple's homepage draws its sourcing funnel as
 * 100M+ → 2,000 → 400 → 25 → 4-5. This is that funnel, running live on the
 * real numbers for this search, driven by the SSE stage events.
 */
export function Funnel({ state }: { state: SessionState }) {
  const status = (n: StageName) => state.stages.find((s) => s.name === n)?.status
  const refining = state.round > 0 || state.stages.some((s) => s.name === 'refining')
  const steps = stepsFor(refining)

  const counts: Record<StageName, string | null> = {
    extracting: state.filters ? 'done' : null,
    refining: state.filters ? 'done' : null,
    filtering: state.matchedCount ? `${state.matchedCount}` : null,
    scoring: state.scoredChunks.total
      ? `${Object.keys(state.scores).length}`
      : null,
    summarizing: null,
  }

  return (
    <div className="mx-auto max-w-lg py-12">
      <div className="mb-8 flex items-center justify-center gap-2 font-mono text-body-sm">
        <FunnelNum value={String(state.poolSize)} label="in pool" active />
        <Arrow />
        <FunnelNum
          value={state.matchedCount ? String(state.matchedCount) : '—'}
          label="match filters"
          active={Boolean(state.matchedCount)}
        />
        <Arrow />
        <FunnelNum
          value={Object.keys(state.scores).length ? String(Object.keys(state.scores).length) : '—'}
          label="scored"
          active={Object.keys(state.scores).length > 0}
        />
        <Arrow />
        <FunnelNum value="5" label="shortlist" active={state.phase === 'results'} />
      </div>

      <ol className="space-y-3">
        {steps.map((name) => {
          const st = status(name)
          return (
            <li key={name} className="flex items-center gap-3">
              <Dot status={st} />
              <span className={`text-body-sm ${st ? 'text-text' : 'text-text-subtle'}`}>
                {LABELS[name]}
                {name === 'scoring' && state.scoredChunks.total > 0 && (
                  <span className="ml-2 font-mono text-body-xs text-text-subtle">
                    batch {state.scoredChunks.done}/{state.scoredChunks.total}
                  </span>
                )}
              </span>
              {counts[name] && st === 'done' && (
                <span className="ml-auto font-mono text-body-xs text-market-live">
                  {counts[name]}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function FunnelNum({ value, label, active }: { value: string; label: string; active: boolean }) {
  return (
    <div className="text-center">
      <div
        className={`font-heading text-2xl tabular-nums transition-colors ${active ? 'text-primary' : 'text-text-subtle/40'}`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-body-xs tracking-[0.02em] text-text-subtle">{label}</div>
    </div>
  )
}

const Arrow = () => <span className="pb-4 text-text-subtle/40">→</span>

function Dot({ status }: { status?: 'start' | 'done' }) {
  if (status === 'done') {
    return <span className="grid size-5 place-items-center rounded-pill bg-market-active text-body-xs text-market-live">✓</span>
  }
  if (status === 'start') {
    return <span className="size-5 animate-pulse rounded-pill bg-accent" />
  }
  return <span className="size-5 rounded-pill border border-control-border-dashed border-dashed" />
}
