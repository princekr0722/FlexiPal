import type { FitRubric, ObjectiveFilters } from '../../shared/schemas.ts'
import type { Relaxation } from '../../shared/schemas.ts'
import { Button, Chip, Panel } from './primitives.tsx'

/**
 * The brief requires the filters and rubric to be visible at all times, so they
 * get a permanent rail rather than a panel that can be scrolled away.
 */
export function CriteriaRail({
  filters, rubric, relaxations, onFreeze, onEdit, frozen, busy, showActions = true,
}: {
  filters: ObjectiveFilters | null
  rubric: FitRubric | null
  relaxations: Relaxation[]
  onFreeze: () => void
  onEdit: () => void
  frozen: boolean
  busy: boolean
  /** The mobile accordion supplies its own Edit/Freeze row. */
  showActions?: boolean
}) {
  if (!filters || !rubric) {
    return (
      <aside className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <Panel title="Filters">
            <p className="text-body-sm text-text-subtle">Appear once you describe the role.</p>
          </Panel>
        </div>
      </aside>
    )
  }

  // Fields the ladder had to loosen for this run. The chips still show what the
  // recruiter asked for — marking them is what keeps that honest.
  const loosened = new Set(relaxations.map((r) => r.field))

  const { min, max } = filters.years_experience
  const yoe = min !== null && max !== null ? `${min}–${max}y` : min !== null ? `${min}y+` : max !== null ? `up to ${max}y` : null

  return (
    // Scroll the criteria, keep Freeze reachable without scrolling to find it.
    <aside className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <Panel
        title="Filters"
        action={
          showActions && !frozen && (
            <button
              onClick={onEdit}
              disabled={busy}
              className="cursor-pointer text-body-xs text-text-subtle underline-offset-4 hover:text-primary hover:underline disabled:opacity-40"
            >
              Edit
            </button>
          )
        }
      >
        <dl className="space-y-3">
          <Row label="Required skills" loosened={loosened.has('required_skills')}>
            {filters.required_skills.length
              ? filters.required_skills.map((s) => <Chip key={s} tone="match">{s}</Chip>)
              : <Empty>none — nobody is excluded on skills</Empty>}
          </Row>
          {filters.preferred_skills.length > 0 && (
            <Row label="Preferred">
              {filters.preferred_skills.map((s) => <Chip key={s}>{s}</Chip>)}
            </Row>
          )}
          <Row label="Experience" loosened={loosened.has('years_experience')}>
            {yoe ? <Chip tone="match">{yoe}</Chip> : <Empty>any</Empty>}
          </Row>
          <Row label="Location" loosened={loosened.has('locations')}>
            {filters.locations.length
              ? filters.locations.map((l) => <Chip key={l} tone="match">{l}</Chip>)
              : <Empty>anywhere</Empty>}
          </Row>
          <Row label="Company type" loosened={loosened.has('company_types')}>
            {filters.company_types.length
              ? filters.company_types.map((c) => <Chip key={c} tone="match">{c}</Chip>)
              : <Empty>any</Empty>}
          </Row>
          {filters.title_keywords.length > 0 && (
            <Row label="Title contains" loosened={loosened.has('title_keywords')}>
              {filters.title_keywords.map((t) => <Chip key={t}>{t}</Chip>)}
            </Row>
          )}
          {(filters.exclude.skills.length > 0 || filters.exclude.company_types.length > 0) && (
            <Row label="Excluded">
              {[...filters.exclude.skills, ...filters.exclude.company_types].map((x) => (
                <Chip key={x} tone="concern">{x}</Chip>
              ))}
            </Row>
          )}
        </dl>

        {relaxations.length > 0 && (
          <div className="mt-4 rounded-md border border-surface-warm-border bg-surface-warm-sunken p-2.5">
            <p className="mb-1 text-body-xs font-medium text-market-withheld">
              Loosened for this run to find enough people
            </p>
            <ul className="space-y-1">
              {relaxations.map((r, i) => (
                <li key={`${r.rung}${i}`} className="text-body-xs leading-snug text-text-muted">{r.detail}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-body-xs italic leading-snug text-text-subtle">
              Your filters above are unchanged — refinements build on those, not on these.
            </p>
          </div>
        )}
      </Panel>

      <Panel
        title="Fit rubric"
        action={
          showActions && !frozen && (
            <button
              onClick={onEdit}
              disabled={busy}
              className="cursor-pointer text-body-xs text-text-subtle underline-offset-4 hover:text-primary hover:underline disabled:opacity-40"
            >
              Edit
            </button>
          )
        }
      >
        <p className="mb-3 text-body-sm italic leading-snug text-text-muted">{rubric.role_summary}</p>
        <ul className="space-y-2.5">
          {rubric.criteria.map((c) => (
            <li key={c.id} className="rounded-md border border-surface-warm-hairline bg-surface p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-body-sm font-medium text-text">{c.label}</span>
                <Weight n={c.weight} />
              </div>
              <p className="mt-1 text-body-xs leading-snug text-text-subtle">{c.description}</p>
            </li>
          ))}
        </ul>
        {rubric.dealbreakers.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-body-xs font-medium text-text-muted">Dealbreakers</p>
            <div className="flex flex-wrap gap-1.5">
              {rubric.dealbreakers.map((d) => <Chip key={d} tone="concern" mono={false}>{d}</Chip>)}
            </div>
          </div>
        )}
      </Panel>

      </div>

      {showActions && !frozen && (
        <div className="shrink-0 border-t border-surface-warm-border bg-surface-warm pt-3">
          <Button variant="freeze" onClick={onFreeze} disabled={busy}>
            Freeze this search
          </Button>
        </div>
      )}
    </aside>
  )
}

function Row({
  label, children, loosened = false,
}: { label: string; children: React.ReactNode; loosened?: boolean }) {
  return (
    <div>
      <dt className="mb-1.5 flex items-center gap-1.5 text-body-xs tracking-[0.02em] text-text-subtle">
        {label}
        {loosened && (
          <span
            title="Too few people matched this, so it was loosened for this run only"
            className="rounded-pill bg-surface-warm-sunken px-1.5 py-0.5 text-body-xs text-market-withheld"
          >
            loosened
          </span>
        )}
      </dt>
      <dd className="flex flex-wrap gap-1.5">{children}</dd>
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <span className="text-body-xs italic text-text-subtle">{children}</span>
)

function Weight({ n }: { n: number }) {
  return (
    <span className="flex shrink-0 gap-0.5 pt-1" title={`Weight ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`size-1.5 rounded-pill ${i <= n ? 'bg-market-band' : 'bg-market-track'}`}
        />
      ))}
    </span>
  )
}
