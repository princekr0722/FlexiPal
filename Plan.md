# FlexiPal — Implementation Plan

Build plan for the Flexiple sourcing refinement loop. See [requirement.md](requirement.md) for the
assignment, [design.md](design.md) for the visual system lifted from flexiple.com.
Time box: **2.5h build + 30min README/Loom.** TypeScript end to end — no JavaScript.

---

## 1. Decisions (locked)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Stack | **Fastify + `@fastify/vite` + React + TS**, one process, one port | Single `npm run dev`, HMR in dev, static serve in prod. Satisfies "run with one or two commands" with no concurrently/CORS plumbing. |
| 2 | LLM | **Google Gemini 2.0 Flash**, `GEMINI_API_KEY` | Free tier + native `responseSchema` JSON mode, which makes "structured output, validated" nearly free. |
| 3 | Filtering | **Hard filter + auto-relax with disclosure** | Filters mean what they say; if `<5` results we relax the weakest constraint and *say so* in the UI. Never dead-ends, stays honest. |
| 4 | Layout | **Two-pane**: criteria rail left, results + chat right | Brief demands filters/rubric "always visible". Left rail makes that structural, not a scroll accident. |
| 4b | Visual system | **Flexiple's own tokens** — forest green `#082c1c` + lime `#cff07c` on warm cream, Fraunces headings / Inter body / JetBrains Mono for data. Light mode only. See [design.md](design.md) | Their real published Tailwind v4 tokens, not an approximation. Reviewers see their own product language. |
| 5 | Scoring | **Chunked batches of 8, parallel** | Partial-failure isolation (one bad chunk ≠ dead round) with bounded concurrency that won't trip the free-tier rate limit. Chunks stream into the UI as they land. |
| 6 | Refinement context | **Current criteria (always) + last 40 messages + rolling summary (≤15k chars) + verdict ledger** | Earlier corrections are never forgotten when round 3 contradicts round 1 — the exact failure mode being graded. |
| 7 | Editing | **Fully editable criteria panel** | Brief says "edit directly". Edits re-run the search immediately. |
| 8 | Transport | **SSE, structured progress events (not tokens)** | Every payload stays a whole validated JSON object. No half-parsed JSON in the UI. |
| 9 | Storage | **SQLite on disk** (messages + criteria versions + verdicts + summary). `profiles.json` stays a **separate read-only store behind a repository interface** | Conversation state gets a real substrate; the talent pool stays swappable for a real DB later. |
| 10 | Failure | **Validate → repair → retry w/ backoff → degrade**, plus injectable failure trigger | Required Loom moment becomes reproducible instead of hoping for a real 429 on camera. |

### Two flags, then moving on

- **Scope tension on #9.** The brief says *"no persistence across sessions."* We're persisting to disk
  anyway. The README must own this in one line: *session history is stored locally in SQLite so the
  refinement loop has a real state substrate and survives a server restart mid-demo; the talent pool
  is deliberately kept behind a `TalentPool` interface so `profiles.json` can be swapped for a real
  database.* Framed that way it reads as an architecture decision, not scope creep. Unframed, a
  reviewer checking scope discipline will read it as the latter.
- **Budget.** Decisions 5, 6, 8, 9 and the fully-editable panel are each real work. This is more than
  2.5h if everything is built to full polish. §7 defines the cut line — build in that order and stop
  where the clock stops.

---

## 2. Architecture

```
┌──────────────────────── one Fastify process, one port ────────────────────────┐
│                                                                                │
│  React SPA (@fastify/vite)          Fastify API                                │
│  ┌──────────────────────┐          ┌──────────────────────────────────────┐   │
│  │ CriteriaRail         │◄── SSE ──│ POST /api/search    (round 0)        │   │
│  │  filters (editable)  │          │ POST /api/refine    (round n)        │   │
│  │  rubric (editable)   │          │ PATCH /api/criteria (manual edit)    │   │
│  │  [Freeze]            │          │ POST /api/freeze                     │   │
│  ├──────────────────────┤          │ GET  /api/session/:id (rehydrate)    │   │
│  │ ResultsGrid          │          └───────────────┬──────────────────────┘   │
│  │  ProfileCard × 5     │                          │                          │
│  │   evidence chips     │              ┌───────────▼───────────┐              │
│  │   ✓ / ✗              │              │  orchestrator          │              │
│  ├──────────────────────┤              │  extract → filter →    │              │
│  │ ChatComposer         │              │  score → explain       │              │
│  └──────────────────────┘              └──┬──────────┬──────────┘              │
│                                           │          │                         │
│                              ┌────────────▼──┐   ┌───▼──────────────┐         │
│                              │ llm/           │   │ TalentPool       │         │
│                              │  gemini client │   │  (interface)     │         │
│                              │  zod schemas   │   │   ▼              │         │
│                              │  repair+retry  │   │  JsonTalentPool  │         │
│                              └────────────────┘   │  → profiles.json │         │
│                                     │             └──────────────────┘         │
│                              ┌──────▼──────────┐                               │
│                              │ SQLite          │  messages · criteria_versions │
│                              │ (better-sqlite3)│  verdicts · summary           │
│                              └─────────────────┘                               │
└────────────────────────────────────────────────────────────────────────────────┘
```

### File tree

```
FlexiPal/
├── prompts/                        # committed, human-readable, loaded at boot
│   ├── extract-criteria.md         # free text → filters + rubric
│   ├── score-profiles.md           # rubric + 8 profiles → scores + evidence
│   ├── refine-criteria.md          # feedback ledger → criteria diff + reply
│   ├── summarize-session.md        # older messages → ≤15k rolling summary
│   └── repair.md                   # schema errors → corrected JSON
├── server/
│   ├── index.ts                    # Fastify bootstrap + @fastify/vite
│   ├── routes/{search,refine,criteria,freeze,session}.ts
│   ├── sse.ts                      # typed event emitter over reply.raw
│   ├── orchestrator.ts             # the loop: extract → filter → score
│   ├── llm/
│   │   ├── gemini.ts               # client, responseSchema, timeout
│   │   ├── call.ts                 # validate → repair → retry → degrade
│   │   └── prompts.ts              # loader + interpolation
│   ├── talent/
│   │   ├── TalentPool.ts           # interface (swap point for a real DB)
│   │   ├── JsonTalentPool.ts       # profiles.json impl
│   │   └── filter.ts               # hard filter + relaxation ladder
│   ├── db/{schema.sql,index.ts,session.ts}
│   └── context.ts                  # last-40 + summary + verdict ledger
├── shared/schemas.ts               # zod: single source of truth, both sides
├── client/
│   ├── App.tsx
│   ├── hooks/useSearchStream.ts    # SSE consumer → reducer
│   ├── state/session.ts
│   └── components/
│       ├── SearchScreen.tsx  CriteriaRail.tsx  FilterEditor.tsx
│       ├── RubricEditor.tsx  ResultsGrid.tsx   ProfileCard.tsx
│       ├── ChatPanel.tsx     ChangeLog.tsx     FrozenSummary.tsx
│       └── states/{Thinking,Empty,Error,Degraded}.tsx
├── profiles.json                   # untouched, read-only
├── .env.example                    # GEMINI_API_KEY=
└── README.md
```

---

## 3. Data contracts (`shared/schemas.ts`, zod)

```ts
ObjectiveFilters {
  required_skills:    string[]            // AND — all must be present
  preferred_skills:   string[]            // never excludes; feeds ranking
  years_experience:   { min: number|null, max: number|null }
  locations:          string[]            // OR; [] = anywhere
  company_types:      ("startup"|"scaleup"|"enterprise"|"agency")[]  // current OR past
  title_keywords:     string[]            // OR, substring on current_title
  exclude:            { skills: string[], company_types: string[] }
}

FitRubric {
  role_summary: string
  criteria: [{ id, label, description, weight: 1..5,
               signals_of_strength: string[], signals_of_weakness: string[] }]
  dealbreakers: string[]
}

ScoredProfile {
  profile_id: string
  score: 0..100
  verdict: "strong" | "possible" | "weak"
  rationale: string                        // ≤ 2 sentences, specific
  evidence: [{ field, value, why }]        // ← validated against the real profile
  concerns: string[]
}

CriteriaUpdate {                           // refinement round output
  filters: ObjectiveFilters
  rubric:  FitRubric
  changes: [{ target: "filters"|"rubric", path, from, to, reason }]
  reply:   string                          // what the recruiter reads in chat
}
```

**Evidence enforcement** — the brief's "must cite actual fields" becomes a hard check, not a prompt
hope: after validation, every `evidence[].field` must be a real key on that profile and
`evidence[].value` must actually appear in that profile's data. Fabricated evidence is dropped and
the card degrades to showing only verified chips. This is cheap to build and a strong reviewer moment.

---

## 4. The relaxation ladder (decision #3)

Applied in order, one rung at a time, stopping as soon as `≥5` profiles match. Every rung taken is
reported to the UI and rendered as a disclosure line above the results:

1. Drop `title_keywords`
2. Widen `years_experience` by ±1, then ±2
3. Widen `company_types` to adjacent tiers (`startup` → `+scaleup`)
4. Add `Remote - India` to `locations`, then drop the location constraint
5. Demote the weakest `required_skills` entry to `preferred_skills` (rarest in the pool first)

`exclude` and `dealbreakers` are **never** relaxed. If the ladder bottoms out, the designed empty
state names the constraint that eliminated everyone and offers one-click loosen.

> UI: *"Widened 4–7y → 3–8y to surface 5 candidates."*

---

## 5. SSE event protocol (decision #8)

```
stage        { name: "extracting"|"filtering"|"scoring"|"refining", status: "start"|"done" }
criteria     { filters, rubric, changes[] }          // rail re-renders
filtered     { matched: number, relaxations: [] }    // disclosure line
scored_chunk { profiles: ScoredProfile[] }           // cards fill in per batch of 8
message      { role: "assistant", text }             // "what I changed and why"
warning      { code: "rate_limit"|"degraded"|"repaired", message }
done         { round: number }
error        { code, message, recoverable: boolean }
```

Client holds a reducer keyed on event type. `scored_chunk` is additive, so the grid populates
progressively as the parallel batches return — the chunked scoring decision pays for itself visually.

---

## 6. SQLite schema (decision #9)

```sql
sessions          (id, created_at, original_query, status)      -- active | frozen
messages          (id, session_id, round, role, content, created_at)
criteria_versions (id, session_id, round, filters_json, rubric_json, changes_json, created_at)
verdicts          (id, session_id, round, profile_id, verdict, source)  -- chat | button
summaries         (session_id, text, covers_through_message_id, updated_at)
```

**Context assembly per refinement round** (`server/context.ts`):

1. Current filters + rubric — **always**, verbatim
2. Rolling summary of everything older than the 40-message window, capped at **15k chars**
3. Last 40 messages
4. Full verdict ledger, compacted: `p01 ✗ too junior (r1) · p04 ✓ (r1) · p07 ✗ wrong domain (r2)`

The summary is regenerated (via `summarize-session.md`) whenever >10 messages have aged out since it
was last written — not on every round. It carries **decisions**, not chatter: rejected directions,
recruiter preferences stated once, constraints that must not be re-litigated.

`criteria_versions` doubles as the undo trail and as the "what changed this round" source for the UI.

---

## 7. Build order and cut line

Build strictly top-down. Everything above the cut line is the shippable product.

| Block | Work | Est. | Cumulative |
|---|---|---|---|
| **0** | Scaffold: Fastify + `@fastify/vite` + TS + Tailwind v4 `@theme` w/ design.md tokens, `@fontsource-variable/{fraunces,inter,jetbrains-mono}`, `npm run dev` boots | 25m | 0:25 |
| **1** | `shared/schemas.ts`, Gemini client, `call.ts` (validate→repair→retry), prompts loaded from `/prompts` | 25m | 0:45 |
| **2** | `TalentPool` + `JsonTalentPool` + hard filter + relaxation ladder (**pure functions, no LLM**) | 20m | 1:05 |
| **3** | `/api/search` SSE end-to-end: extract → filter → chunked scoring → events | 25m | 1:30 |
| **4** | UI: search screen, criteria rail (read-only first), results grid, thinking state | 30m | 2:00 |
| **5** | `/api/refine` + chat + verdict buttons + change log + SQLite writes | 25m | 2:25 |
| — | **── CUT LINE — a complete loop exists above this ──** | | |
| **6** | Freeze screen | 10m | 2:35 |
| **7** | Editable criteria panel (decision #7) | 20m | 2:55 |
| **8** | Rolling summary (decision #6, part 3) | 15m | 3:10 |
| **9** | Error/empty/degraded state polish + `?fail=` trigger | 15m | 3:25 |

**If the clock runs out:** blocks 6 and 9 are non-negotiable — a demo with no freeze state and no
designed error state fails two stated evaluation criteria. Block 8 (rolling summary) is the first
thing to cut: with 40 messages of window, a 3–4 round demo never ages a message out, so its absence
is invisible in the Loom. Degrade it to "last 40 messages only" and say so in the README's decisions
section. Block 7 is second to cut, degraded to editable filters with a read-only rubric.

---

## 8. Failure handling (decision #10)

```
LLM call
  ├─ timeout 20s ─────────────► retry (2×, jittered backoff 1s/3s) ─► warning: rate_limit
  ├─ HTTP 429 ────────────────► retry (2×, respect Retry-After)    ─► warning: rate_limit
  ├─ zod parse fails ─────────► one repair round trip (errors fed back) ─► warning: repaired
  └─ still failing ───────────► DEGRADE, never crash:
        · extract fails  → error state, query preserved, Retry button
        · scoring chunk  → that chunk's profiles shown filter-only, banner names them
        · refine fails   → criteria unchanged, chat says so plainly, nothing silently lost
```

Dev-only `?fail=schema|429|timeout|empty` query param forces each path so the Loom moment is
reproducible in one take. Gated behind `NODE_ENV !== 'production'`.

---

## 9. Designed states checklist

The brief weights the frontend as half the assignment and names the states explicitly:

- [ ] **First load** — single centred input, 2–3 example queries as clickable chips
- [ ] **Thinking** — staged, not a spinner: "Reading your requirement → Filtering 48 profiles → Scoring 12 candidates" driven by real SSE `stage` events, rendered as **Flexiple's own sourcing funnel** (their homepage shows `100M+ → 2,000 → 400 → 25 → 4-5`; ours runs it live at `48 → n → n → 5`)
- [ ] **Results** — 5 cards, score, verdict, ≤2-sentence rationale, evidence chips citing real fields
- [ ] **Relaxed** — disclosure line naming exactly what was widened and why
- [ ] **Empty** — names the eliminating constraint, one-click loosen
- [ ] **Error** — what failed, what was preserved, one clear action
- [ ] **Degraded** — partial results with an honest banner, not a silent gap
- [ ] **Refining** — change log: `min_years 4 → 6 · "you said p01 was too junior"`
- [ ] **Frozen** — final filters, final rubric, ranked shortlist, session read-only

---

## 10. Deliverables

- [ ] Repo runs with `npm install && npm run dev` after `GEMINI_API_KEY` is set
- [ ] `.env.example`; key read from env, never committed; `.gitignore` covers `.env` and `*.db`
- [ ] Prompts committed as readable `.md` under `/prompts`
- [ ] README: setup, `GEMINI_API_KEY`, and a decisions section — what was prioritised, what was cut,
      and the SQLite framing from §1
- [ ] Loom ≤15min: free text → freeze, ≥1 feedback-driven refinement, ≥1 failure/recovery
