import { useState } from 'react'
import type { FitRubric, ObjectiveFilters, Relaxation } from '../../../shared/schemas.ts'

/**
 * Criteria collapse to a single summary line on a phone. The brief wants them
 * always visible; on a 390px screen "visible" has to mean legible at a glance
 * and one tap from the detail, or the candidates have no room left.
 */
export function CriteriaAccordion({
  filters, rubric, relaxations, busy, frozen, onEdit, onFreeze, leading, children,
}: {
  filters: ObjectiveFilters | null
  rubric: FitRubric | null
  relaxations: Relaxation[]
  busy: boolean
  frozen: boolean
  onEdit: () => void
  onFreeze: () => void
  /** Rendered as its own card to the left of the summary — the history trigger. */
  leading?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  const summary = filters ? summarise(filters) : 'Working out your filters…'

  return (
    <section className="shrink-0 border-b border-surface-warm-border bg-surface-warm-card">
      <div className="flex items-stretch">
        {leading}
        <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-body-xs tracking-[0.02em] text-text-subtle">Filters &amp; rubric</span>
            {relaxations.length > 0 && (
              <span className="rounded-pill bg-surface-warm-sunken px-1.5 py-0.5 text-body-xs text-market-withheld">
                loosened
              </span>
            )}
          </div>
          <p className="truncate font-mono text-body-xs text-text">{summary}</p>
        </div>
        <span className={`shrink-0 text-text-subtle transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
        </button>
      </div>

      {open && (
        <div className="max-h-[55vh] overflow-y-auto border-t border-surface-warm-hairline px-3 py-3">
          {children}
          {!frozen && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onEdit}
                disabled={busy}
                className="flex-1 cursor-pointer rounded-pill border border-control-border bg-surface px-3 py-1.5 text-body-xs font-medium text-text transition hover:border-control-border-hover disabled:opacity-40"
              >
                Edit criteria
              </button>
              <button
                onClick={onFreeze}
                disabled={busy}
                className="flex-1 cursor-pointer rounded-pill bg-primary px-3 py-1.5 text-body-xs font-medium text-white transition hover:bg-primary-hover disabled:opacity-40"
              >
                Freeze
              </button>
            </div>
          )}
        </div>
      )}
      {!rubric && null}
    </section>
  )
}

function summarise(f: ObjectiveFilters): string {
  const bits: string[] = []
  if (f.required_skills.length) bits.push(f.required_skills.join(' + '))
  const { min, max } = f.years_experience
  if (min !== null && max !== null) bits.push(`${min}–${max}y`)
  else if (min !== null) bits.push(`${min}y+`)
  else if (max !== null) bits.push(`≤${max}y`)
  if (f.locations.length) bits.push(f.locations.join('/'))
  if (f.company_types.length) bits.push(f.company_types.join('/'))
  return bits.length ? bits.join(' · ') : 'no filters — the whole pool'
}
