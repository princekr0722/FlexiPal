import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { Profile, type ObjectiveFilters } from '../../shared/schemas.ts'
import type { PoolVocabulary, QueryResult, TalentPool } from './TalentPool.ts'
import { closeness, matches, preferredHits, rejectReason, type RejectReason } from './match.ts'
import { relaxUntil } from './relax.ts'

const repoRoot = resolve(dirname(dirname(dirname(fileURLToPath(import.meta.url)))))
const DEFAULT_MIN_RESULTS = 5
/**
 * Ceiling on a relaxed result set. Three pages of five is plenty to judge from,
 * and it stops one over-shooting rung turning a tight search into the whole
 * pool — which also costs two LLM scoring batches instead of six.
 */
const MAX_RELAXED_RESULTS = 15

/** The assignment's profiles.json, validated once at boot. */
export class JsonTalentPool implements TalentPool {
  private readonly profiles: Profile[]
  private readonly index: Map<string, Profile>
  private readonly vocab: PoolVocabulary

  constructor(path = resolve(repoRoot, 'profiles.json')) {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const parsed = z.array(Profile).safeParse(raw)
    if (!parsed.success) {
      throw new Error(`profiles.json failed validation: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    }
    this.profiles = parsed.data
    this.index = new Map(this.profiles.map((p) => [p.id, p]))

    const skills = new Set<string>()
    const locations = new Set<string>()
    const companyTypes = new Set<string>()
    for (const p of this.profiles) {
      p.skills.forEach((s) => skills.add(s))
      locations.add(p.location)
      companyTypes.add(p.current_company_type)
      p.past_companies.forEach((c) => companyTypes.add(c.company_type))
    }
    this.vocab = {
      skills: [...skills].sort(),
      locations: [...locations].sort(),
      companyTypes: [...companyTypes].sort(),
      size: this.profiles.length,
    }
  }

  all(): Profile[] {
    return this.profiles
  }

  byIds(ids: string[]): Profile[] {
    return ids.map((id) => this.index.get(id)).filter((p): p is Profile => Boolean(p))
  }

  vocabulary(): PoolVocabulary {
    return this.vocab
  }

  query(
    filters: ObjectiveFilters,
    opts: { minResults?: number; protect?: ReadonlySet<keyof ObjectiveFilters> } = {},
  ): QueryResult {
    const minResults = opts.minResults ?? DEFAULT_MIN_RESULTS
    const strict = this.profiles.filter((p) => matches(p, filters))

    const { filters: effective, profiles, relaxations } =
      strict.length >= minResults
        ? { filters, profiles: strict, relaxations: [] }
        : relaxUntil(filters, this.profiles, minResults, opts.protect)

    let ordered: Profile[]
    if (relaxations.length > 0) {
      // Keep the people closest to the original ask, not an arbitrary 47.
      ordered = [...profiles]
        .sort((a, b) => closeness(b, filters) - closeness(a, filters))
        .slice(0, Math.max(minResults, MAX_RELAXED_RESULTS))
    } else {
      // Preferred skills order the list before the LLM ever sees it, so a
      // scoring failure still leaves something sensibly ranked.
      ordered = [...profiles].sort(
        (a, b) => preferredHits(b, effective) - preferredHits(a, effective),
      )
    }

    return { profiles: ordered, relaxations, effectiveFilters: effective, strictCount: strict.length }
  }

  /** Which single constraint eliminated the most people. Powers the empty state. */
  bottleneck(filters: ObjectiveFilters): { reason: RejectReason; count: number } | null {
    const tally = new Map<RejectReason, number>()
    for (const p of this.profiles) {
      const r = rejectReason(p, filters)
      if (r) tally.set(r, (tally.get(r) ?? 0) + 1)
    }
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    return top ? { reason: top[0], count: top[1] } : null
  }
}
