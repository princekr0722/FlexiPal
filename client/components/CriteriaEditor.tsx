import { useState } from 'react'
import type { FitRubric, ObjectiveFilters } from '../../shared/schemas.ts'
import { Button, Chip } from './primitives.tsx'

// Mirrors the zod bounds on FitRubric.criteria — the server rejects anything else.
const MIN_CRITERIA = 3
const MAX_CRITERIA = 5

/**
 * Direct editing of both halves of the criteria, as the brief requires. Edits
 * are applied exactly as written — the relaxation ladder is switched off for a
 * hand edit, because a recruiter typing a constraint means it.
 */
export function CriteriaEditor({
  filters, rubric, onApply, onCancel,
}: {
  filters: ObjectiveFilters
  rubric: FitRubric
  onApply: (f: ObjectiveFilters, r: FitRubric) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ObjectiveFilters>(() => structuredClone(filters))
  const [rubricDraft, setRubricDraft] = useState<FitRubric>(() => structuredClone(rubric))

  const set = <K extends keyof ObjectiveFilters>(k: K, v: ObjectiveFilters[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const patchCriterion = (i: number, patch: Partial<FitRubric['criteria'][number]>) =>
    setRubricDraft((r) => {
      const next = structuredClone(r)
      next.criteria[i] = { ...next.criteria[i], ...patch }
      return next
    })

  const addCriterion = () =>
    setRubricDraft((r) =>
      r.criteria.length >= MAX_CRITERIA
        ? r
        : {
            ...r,
            criteria: [
              ...r.criteria,
              {
                id: `custom_${Date.now().toString(36)}`,
                label: '',
                description: '',
                weight: 3,
                signals_of_strength: [],
                signals_of_weakness: [],
              },
            ],
          },
    )

  const removeCriterion = (i: number) =>
    setRubricDraft((r) =>
      r.criteria.length <= MIN_CRITERIA
        ? r
        : { ...r, criteria: r.criteria.filter((_, j) => j !== i) },
    )

  // A criterion with no label cannot be judged against, and the server rejects
  // the whole edit rather than silently keeping an empty one.
  const invalid = rubricDraft.criteria.some((c) => c.label.trim() === '')

  return (
    <div className="space-y-4 rounded-lg border border-market-accent-border bg-surface-warm-card p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-heading text-body-md text-primary">Edit criteria</h3>
        <span className="text-body-xs text-text-subtle">Applied exactly as written</span>
      </header>

      <SectionHeading>Filters</SectionHeading>

      <ListField
        label="Required skills"
        values={draft.required_skills}
        onChange={(v) => set('required_skills', v)}
        placeholder="Add a skill…"
      />
      <ListField
        label="Preferred skills"
        values={draft.preferred_skills}
        onChange={(v) => set('preferred_skills', v)}
        placeholder="Add a nice-to-have…"
      />

      <div>
        <label className="mb-1.5 block text-body-xs tracking-[0.02em] text-text-subtle">Experience (years)</label>
        <div className="flex items-center gap-2">
          <NumberBox
            value={draft.years_experience.min}
            onChange={(n) => set('years_experience', { ...draft.years_experience, min: n })}
            placeholder="min"
          />
          <span className="text-text-subtle">to</span>
          <NumberBox
            value={draft.years_experience.max}
            onChange={(n) => set('years_experience', { ...draft.years_experience, max: n })}
            placeholder="max"
          />
        </div>
      </div>

      <ListField
        label="Locations"
        values={draft.locations}
        onChange={(v) => set('locations', v)}
        placeholder="Add a location…"
      />

      <div>
        <label className="mb-1.5 block text-body-xs tracking-[0.02em] text-text-subtle">Company type</label>
        <div className="flex flex-wrap gap-1.5">
          {(['startup', 'scaleup', 'enterprise', 'agency'] as const).map((t) => {
            const on = draft.company_types.includes(t)
            return (
              <button
                key={t}
                onClick={() =>
                  set('company_types', on ? draft.company_types.filter((x) => x !== t) : [...draft.company_types, t])
                }
                className={`cursor-pointer rounded-chip border px-2.5 py-1 font-mono text-body-xs transition-all duration-150 active:scale-95 ${
                  on
                    ? 'border-market-accent-border bg-market-active text-primary'
                    : 'border-control-border bg-surface text-text-subtle hover:border-control-border-hover'
                }`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </div>

      <SectionHeading>Fit rubric</SectionHeading>

      <div>
        <label className="mb-1.5 block text-body-xs tracking-[0.02em] text-text-subtle">Role summary</label>
        <textarea
          rows={2}
          value={rubricDraft.role_summary}
          onChange={(e) => setRubricDraft({ ...rubricDraft, role_summary: e.target.value })}
          className="w-full resize-none rounded-md border border-control-border bg-surface px-2.5 py-2 text-body-sm leading-snug text-text focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-body-xs tracking-[0.02em] text-text-subtle">
            Rubric criteria ({rubricDraft.criteria.length}/{MAX_CRITERIA})
          </label>
          <button
            onClick={addCriterion}
            disabled={rubricDraft.criteria.length >= MAX_CRITERIA}
            className="cursor-pointer text-body-xs text-text-subtle underline-offset-4 transition hover:text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline"
          >
            + Add criterion
          </button>
        </div>

        <ul className="space-y-2">
          {rubricDraft.criteria.map((c, i) => (
            <li key={c.id} className="rounded-md border border-surface-warm-hairline bg-surface p-2.5">
              <div className="flex items-start gap-2">
                <input
                  value={c.label}
                  placeholder="What you are judging"
                  onChange={(e) => patchCriterion(i, { label: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent text-body-sm font-medium text-text placeholder:font-normal placeholder:text-text-subtle/70 focus:outline-none"
                />
                <button
                  onClick={() => removeCriterion(i)}
                  disabled={rubricDraft.criteria.length <= MIN_CRITERIA}
                  title={
                    rubricDraft.criteria.length <= MIN_CRITERIA
                      ? `A rubric needs at least ${MIN_CRITERIA} criteria`
                      : 'Remove this criterion'
                  }
                  className="shrink-0 cursor-pointer leading-none text-text-subtle transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:text-text-subtle"
                >
                  ×
                </button>
              </div>

              <textarea
                rows={2}
                value={c.description}
                placeholder="What good looks like here"
                onChange={(e) => patchCriterion(i, { description: e.target.value })}
                className="mt-1.5 w-full resize-none rounded-sm bg-transparent text-body-xs leading-snug text-text-muted placeholder:text-text-subtle/70 focus:outline-none"
              />

              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={c.weight}
                  onChange={(e) => patchCriterion(i, { weight: Number(e.target.value) })}
                  className="h-1 flex-1 cursor-pointer accent-primary"
                />
                <span className="w-8 text-right font-mono text-body-xs text-text-subtle">w{c.weight}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <ListField
        label="Dealbreakers"
        values={rubricDraft.dealbreakers}
        onChange={(v) => setRubricDraft({ ...rubricDraft, dealbreakers: v })}
        placeholder="Add something disqualifying…"
      />

      <div className="flex gap-2 border-t border-surface-warm-hairline pt-3">
        <Button onClick={() => onApply(draft, rubricDraft)} disabled={invalid}>
          Apply and re-run
        </Button>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
        {invalid && (
          <span className="self-center text-body-xs text-danger">Every criterion needs a name.</span>
        )}
      </div>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-surface-warm-hairline pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <span className="font-heading text-body-sm text-primary">{children}</span>
      <span className="h-px flex-1 bg-surface-warm-hairline" />
    </div>
  )
}

function ListField({
  label, values, onChange, placeholder,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setInput('')
  }
  return (
    <div>
      <label className="mb-1.5 block text-body-xs tracking-[0.02em] text-text-subtle">{label}</label>
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Chip key={v} tone="match" onRemove={() => onChange(values.filter((x) => x !== v))}>{v}</Chip>
        ))}
        {values.length === 0 && <span className="text-body-xs italic text-text-subtle">none</span>}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={placeholder}
        className="w-full rounded-md border border-control-border-dashed border-dashed bg-transparent px-2.5 py-1.5 font-mono text-body-xs text-text placeholder:text-text-subtle/70 focus:border-solid focus:border-primary focus:outline-none"
      />
    </div>
  )
}

function NumberBox({
  value, onChange, placeholder,
}: { value: number | null; onChange: (n: number | null) => void; placeholder: string }) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="w-20 rounded-md border border-control-border bg-surface px-2 py-1.5 font-mono text-body-sm text-text focus:border-primary focus:outline-none"
    />
  )
}
