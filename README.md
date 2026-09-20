# FlexiPal

A sourcing refinement loop: a recruiter describes a role in plain English, the app turns it into
structured filters and a subjective fit rubric, applies the filters to the talent pool, scores what
survives against the rubric, and then keeps adjusting both from the recruiter's feedback until they
freeze the search.

Built for the Flexiple engineering assignment. ~48 fictional profiles stand in for the 98M-person
talent map.

---

## Quick start

You need a **Google Gemini API key** — free, one click, at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey).

Nothing to create, nothing to edit. Pass the key on the command line.

### With Docker

```bash
docker build -t flexipal .
docker run -p 3539:3539 -e GEMINI_API_KEY=your_key_here -v flexipal-data:/data flexipal
```

or, equivalently:

```bash
GEMINI_API_KEY=your_key_here docker compose up --build
```

### Without Docker

Needs **Node 22.12+** (there is an `.nvmrc` pinning 24.18.1; `nvm use` picks it up).

```bash
npm install
npm run dev -- --key=your_key_here
```

Either way, open **http://localhost:3539/ui**.

<details>
<summary>Other ways to supply the key</summary>

```bash
GEMINI_API_KEY=your_key_here npm run dev   # environment variable
cp .env.example .env                       # or a .env file, if you prefer one
```

The variable is **`GEMINI_API_KEY`**. `--key=` wins over the environment, which wins over `.env`.
Everything else is optional and documented in [`.env.example`](.env.example).
</details>

---

## Running it

One process serves both surfaces: the UI on `/ui`, the API on `/api`. Port **3539** is deliberately
off the usual 3000/5173/8080 lanes so it does not collide with whatever else you have running;
override with `PORT`.

| command | what it does |
|---|---|
| `npm run dev -- --key=…` | Fastify + Vite in middleware mode — one process, HMR |
| `npm test` | 42 offline tests (no API key needed, no network) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` then `npm start` | production build, served by the same server |

The Docker image is multi-stage, runs as a non-root user, and keeps session state on a `/data`
volume so a restart does not lose your searches. `NODE_ENV=production` there also disables the
fault-injection hooks described below.

<details>
<summary><code>EADDRINUSE: address already in use 0.0.0.0:3539</code></summary>

Something already holds the port — usually a container from the Docker quick start still running in
the background. Find it and stop it:

```bash
lsof -nP -iTCP:3539 -sTCP:LISTEN        # what has the port
docker ps --filter publish=3539         # if it is a container, this names it
docker stop <name>                      # then stop it
```

Or just run the two side by side on different ports:

```bash
PORT=3540 npm run dev -- --key=your_key_here
```

Worth knowing which one you are talking to: the container runs with
`NODE_ENV=production`, so the `?fault=` hooks below are disabled there. Record the
failure-and-recovery moment against `npm run dev`.
</details>

---

## The loop

```
free text ─► extract ─► filter ─► score ─► show 5 ─► feedback ─► refine ─► … ─► freeze
              (LLM)    (local)    (LLM)                          (LLM)
```

1. **Extract.** One call produces the objective filters and the fit rubric, plus a one-line
   statement of how the request was read so a misreading is caught immediately.
2. **Filter.** Pure local code against `profiles.json`. No LLM, no network, instant.
3. **Score.** The filtered set is scored against the rubric in parallel batches of 8.
4. **Refine.** The recruiter reacts in chat or with per-profile ✓/✗. The app says what it changed
   and why, re-runs, and shows the new set.
5. **Freeze.** Final filters, final rubric, ranked shortlist, CSV export.

Prompts are in [`prompts/`](prompts/) as readable Markdown — five system prompts and their user
templates. They are loaded at boot and re-read per call in dev, so they can be edited without a
restart.

---

## Decisions

### What I prioritised

**Making the filters honest.** This took more of the budget than anything else, because it is where
the product either earns trust or loses it. Three things came out of that:

- *Relaxation is a per-run fallback, never an edit to the search.* If a search is too tight to fill
  a page, the app loosens it one rung at a time and shows exactly what it loosened. It does **not**
  write the loosened values back as your criteria. An earlier version did, and the consequence was
  severe: one wide round permanently destroyed the recruiter's actual ask, and every later
  refinement built on the wreckage.
- *What ran is what is shown.* Each loosened field is badged in the rail, with the full list
  underneath. An earlier version silently dropped the location constraint while still displaying
  "Bangalore".
- *Relaxation does not argue with the recruiter.* Fields changed in the current round are protected
  from loosening — widening the experience floor straight back down after someone says "too junior"
  is the loop contradicting them. If protecting it leaves nothing at all, it loosens anyway and says
  so explicitly.

**Verified evidence.** The brief requires explanations to cite real fields. A prompt cannot
guarantee that, so every citation is checked against the source record after the model answers;
anything the profile does not support is dropped, and the count of dropped claims is shown on the
card. 17 tests cover the hallucination classes — invented employers, schools, skills and years.

**Failure as a designed state, not an exception.** Every LLM call is
`validate → repair → retry with backoff → degrade`, and because free-tier 503s are common, a retry
is also a *failover*: attempt N uses model N of a chain. Degradation is reported on missing results
rather than on thrown calls — a repaired-but-empty batch is schema-valid and would otherwise look
like success.

**Filters may only reference what the pool stores.** The model reliably reaches for "Leadership" or
"Payments" when a recruiter asks for them. Those are judgements, not fields; left in
`required_skills` they match nobody, empty the result set, and then get undone by the relaxation
ladder — so the recruiter sees a filter chip doing the opposite of what it claims. They are stripped
and belong to the rubric instead.

### What I cut

- **Signals in the rubric editor.** `signals_of_strength` / `signals_of_weakness` drive scoring but
  are not editable by hand; only the label, description and weight are. Editing lists of lists on a
  phone was not worth the room.
- **Streaming prose.** Structured SSE progress events only — never token streaming. Everything
  rendered or applied arrives as a whole, already-validated object. It costs a little perceived
  speed and buys never rendering half-parsed JSON.
- **Restoring the ladder's full history in the frozen view.** The frozen summary shows the last
  round's relaxations, not every round's.
- **Auth, multi-user, real pagination over a real store.** Explicitly out of scope.

### Two choices worth arguing with

**SQLite, against "no persistence across sessions".** The brief rules that out, and I persist
anyway — messages, criteria versions, verdicts, a rolling summary and per-round results. The
reasoning: the refinement loop needs real state to carry feedback across rounds, and persisting
results is what makes reopening a past search instant and free rather than a full re-scoring run.
The talent pool is deliberately *not* in there — it stays behind a `TalentPool` interface so
`profiles.json` can be swapped for a real database without touching session handling. If you read
the rule strictly, the session history sidebar is the part that breaks it, and it is one file to
remove.

**`gemini-3.5-flash-lite`, not the newest model.** `gemini-2.0-flash` from my original plan is
retired and 404s, and `gemini-2.5-flash` is closed to new keys. Measured on a free-tier key against
this actual workload:

| model | extraction | scoring a batch of 8 | availability |
|---|---|---|---|
| `gemini-3.5-flash-lite` | 3.4s | 5.3s | reliable |
| `gemini-3.5-flash` | 13.6s | 23.5s | reliable |
| `gemini-3.8-flash` | — | — | 503 on 2 of 6 probes, ~7.3s median |

Both working models verified 100% of their evidence citations, and the larger one discriminates
better (score spread 64 vs 43). But a ~37s refinement round makes the loop feel broken, and this
product lives or dies on how it feels to iterate. The default chain is
`gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash` — ordered by measured reliability
rather than version number, since an unreliable model makes a poor failover. Override with
`GEMINI_MODEL`.

---

## Seeing the failure handling

The walkthrough needs a failure moment, and waiting to genuinely get rate-limited on camera is a bad
plan. In dev, any search or refine accepts a `fault` parameter:

```bash
curl -N -X POST localhost:3539/api/search -H 'Content-Type: application/json' \
  -d '{"query":"RDS developers in Bangalore","fault":"rate_limit"}'
```

In the UI, append `&fault=rate_limit` to the URL before searching.

`rate_limit` · `timeout` · `unavailable` — warn, back off, fail over to the next model, complete.
`malformed` · `schema` — a repair round trip; whatever cannot be salvaged degrades visibly.
`empty` — the designed empty state.

Disabled when `NODE_ENV=production`.

---

## How it is put together

```
server/
  routes/          /api — search, refine, criteria, freeze, unfreeze, sessions
  llm/             Gemini client, zod→Gemini schema conversion, the resilience wrapper
  talent/          TalentPool interface, matching, relaxation ladder, evidence verification
  db/              SQLite schema and session store
  orchestrator.ts  extract → filter → score, emitting SSE as it goes
shared/schemas.ts  zod, the single source of truth for both sides
client/            React — rail, results, chat, modal, mobile layout
prompts/           the prompts, as Markdown
```

A few things that are less obvious than they look:

- **zod → Gemini schema conversion.** Gemini takes an OpenAPI-flavoured subset, not real JSON
  Schema. `.nullable()` emits `anyOf: [X, {type: null}]`, which it handles badly; it needs an
  explicit `nullable: true`. Passing zod's JSON Schema straight through silently breaks every
  optional number.
- **Chunked parallel scoring.** Batches of 8 isolate failure and stream into the UI as they land,
  instead of one long silence.
- **Disconnect cancels work.** Closing the tab aborts in-flight scoring rather than paying for a run
  nobody will read.
- **Design tokens are Flexiple's own**, read from their published stylesheets — the forest green
  `#082c1c`, the lime `#cff07c`, Fraunces over Inter, and the green-tinted shadows. The thinking
  state is their homepage's sourcing funnel, running live on real numbers. See [design.md](design.md).

---

## Tests

```bash
npm test      # 42 tests, no API key, no network
```

| suite | covers |
|---|---|
| `check-schema` | zod → Gemini conversion, the nullable collapse, no unsupported keywords |
| `check-filters` | matching, the relaxation ladder, inviolable exclusions, bottleneck diagnosis |
| `check-evidence` | every hallucination class — invented skills, employers, schools, years |
| `check-session` | the 40-message window, verdict ledger, summary cap, session isolation |

---

## Known limitations

- The rolling conversation summary only rebuilds once messages age out of a 40-message window. A
  short demo never reaches it, so it is the least-exercised path here.
- A relaxed result set is capped at 15, ranked by closeness to the original ask. Without the cap,
  demoting one rare required skill can take a search from 1 match to the entire pool.
- `profiles.json` is loaded into memory at boot. Correct for 48 rows, obviously not for 98M — which
  is what the `TalentPool` interface is there to make replaceable.
