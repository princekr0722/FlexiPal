# FlexiPal — Design System

Derived from **flexiple.com** (Astro + Tailwind v4). Tokens below are lifted verbatim from their
published stylesheets, not eyeballed. This is the visual contract for the build in [Plan.md](Plan.md).

---

## 1. What their design actually is

Not a typical SaaS palette. Three things define it:

1. **Deep forest green + lime, on warm off-white.** The primary is `#082c1c` — nearly black, but
   green. The accent is `#cff07c`, a bright chartreuse. Backgrounds are warm cream (`#f7f4ec`), never
   cool grey. High contrast, but organic rather than corporate-blue.
2. **Serif headings.** `Fraunces` (a variable serif) for headings against `Inter` body copy. This is
   the single most recognisable thing about the site — it reads editorial and considered, not
   dashboard-y. Getting this right does most of the work of "looks like Flexiple".
3. **Green-tinted shadows.** Every shadow is `#082c1c` at low alpha, never black. Subtle, but it's
   why the warm surfaces feel cohesive instead of muddy.

**Light mode only.** Their site has no dark theme; we match that and skip dark-mode work entirely.

### The gift: they already drew our product

Their homepage has a candidate sourcing funnel:

```
100M+ profiles → 2,000 smart filtering → 400 AI screening → 25 expert review → 4-5 final selection
```

That is exactly our pipeline. Our SSE `stage` events map onto it one-to-one, so the **thinking state
becomes their own funnel, live** — 48 profiles → N after filters → N scored → top 5. Strongest single
borrow available, and it costs nothing extra because the events already exist.

They also ship a `--color-market-*` palette for their Talent Market pages — a talent-data context.
We use that family for anything profile-related, so our results grid inherits the colour language
they already use for exactly this domain.

---

## 2. Tokens

Drop straight into a Tailwind v4 `@theme` block.

### Colour — core

| Token | Value | Use in FlexiPal |
|---|---|---|
| `--color-primary` | `#082c1c` | Freeze button, headings, active nav, chat user bubble |
| `--color-primary-hover` | `#0a3a24` | Primary hover |
| `--color-secondary` | `#193e2e` | Secondary surfaces on dark |
| `--color-accent` | `#cff07c` | Primary CTA fill ("Search", "Freeze search"), score bars |
| `--color-text-on-accent` | `#082c1c` | Text on accent — **never white** |
| `--color-text-on-primary` | `#fff` | Text on primary |

### Colour — surfaces

| Token | Value | Use |
|---|---|---|
| `--color-surface` | `#fff` | Profile cards, editor inputs |
| `--color-surface-warm` | `#f7f4ec` | App background |
| `--color-surface-warm-card` | `#fbf9f3` | Criteria rail background |
| `--color-surface-warm-muted` | `#faf9f6` | Chat panel background |
| `--color-surface-warm-sunken` | `#eceae5` | Inset wells, skeleton fills |
| `--color-surface-muted` | `#f5f5f5` | Neutral chips |

### Colour — borders & text

| Token | Value | Use |
|---|---|---|
| `--color-surface-border` | `#e5e5e5` | Default card border |
| `--color-surface-warm-border` | `#e7e3d8` | Borders on warm surfaces |
| `--color-surface-warm-hairline` | `#f0ece0` | Section dividers |
| `--color-control-border` | `#d9ddd6` | Inputs, selects |
| `--color-control-border-hover` | `#a8b0a3` | Input hover |
| `--color-control-border-dashed` | `#b9bdb4` | Empty-slot / add-criterion dashed border |
| `--color-text` | `#1a1a1a` | Body |
| `--color-text-muted` | `#4a4a4a` | Secondary |
| `--color-text-subtle` | `#686868` | Captions, metadata |

### Colour — talent market family (use for profiles)

| Token | Value | Use in FlexiPal |
|---|---|---|
| `--color-market-talent-surface` | `#f8faf3` | Profile card background |
| `--color-market-talent-hairline` | `#e7ecdd` | Profile card border |
| `--color-market-hover` | `#f4f8e6` | Card hover |
| `--color-market-active` | `#eaf3d8` | Matched evidence chip |
| `--color-market-selected` | `#eaf7d0` | Card marked ✓ match |
| `--color-market-accent-border` | `#cfe39a` | Border on selected/matched |
| `--color-market-live` | `#2e7d32` | "strong" verdict, live status dot |
| `--color-market-band` | `#94c4a3` | Score bar fill |
| `--color-market-track` | `#f2f1ec` | Score bar track |
| `--color-market-withheld` | `#9a7b1f` | Relaxed / degraded notices |

### Colour — semantic & pastel

| Token | Value | Use |
|---|---|---|
| `--color-success` | `#22c55e` | ✓ match |
| `--color-danger` | `#dc2626` | ✗ reject, hard errors |
| `--color-gold` | `#ffd449` | Rate-limit / retry warning |
| `--color-terracotta` | `#ac502a` | Degraded-mode text |
| `--color-terracotta-surface` | `#f9ece3` | Degraded banner fill |
| `--color-terracotta-border` | `#ecd0bf` | Degraded banner border |
| `--color-pastel-yellow` | `#fff2d5` | "possible" verdict chip |
| `--color-pastel-red` | `#ffe4e4` | Concern / dealbreaker chip |
| `--color-pastel-blue` | `#e1ebff` | Neutral info |

### Type

```
--font-heading: "Fraunces Variable", serif          ← headings, scores, section titles
--font-body:    "Inter Variable", system-ui, sans-serif
--font-mono:    "JetBrains Mono", "Fira Code", monospace   ← filter values, diffs, IDs
```

Scale: `--text-body-xs .75 · sm .875 · md 1 · lg 1.125 · xl 1.25rem` (body),
`--text-2xl 1.5 · 3xl 1.875 · 5xl 3 · 6xl 3.75 · 7xl 4.5rem` (display).
Weights 300/400/500/600/700. Leading `tight 1.25 · snug 1.375 · normal 1.5 · relaxed 1.625`.
Caption tracking `.02em`.

Install via `@fontsource-variable/{fraunces,inter,jetbrains-mono}` — self-hosted, no CDN, works offline.

### Radius

```
--radius-xs 5px · sm 6px · md 10px · band 12px · chip 14px · lg 16px
--radius-card 20px · xl 24px · 3xl 1.5rem · 2xl 32px · pill 9999px
```

Map: profile card `--radius-card` · skill/evidence chip `--radius-chip` · buttons `--radius-pill` ·
inputs `--radius-md` · score bar `--radius-band` · rail panels `--radius-lg`.

### Elevation & motion

```
--shadow-warm-sm:   0 1px 3px   #082c1c2e
--shadow-warm-md:   0 4px 16px  #082c1c17
--shadow-warm-lg:   0 16px 40px #082c1c29
--shadow-focus-ring: 0 0 0 3px  #082c1c26
--ease-emphasized:  cubic-bezier(.22, 1, .36, 1)
--default-transition-duration: .15s
```

Cards rest at `warm-sm`, hover to `warm-md`. `--ease-emphasized` for cards entering as scored chunks
land — it's their signature easing and makes the streaming feel intentional.

---

## 3. Voice

From their copy: *"Your offshore India team, built in weeks, not months."* · *"Everyone's hiring in
India. But only a few are doing it without the chaos."* · CTA: *"Build your dream team."*

Direct, confident, plain-spoken. Contrast framing. No exclamation marks, no "AI-powered", no hedging.
Sentence case everywhere, not Title Case.

**Applied to our states:**

| State | Write | Not |
|---|---|---|
| Empty input | "What are you hiring for?" | "Enter your search query" |
| Thinking | "Reading your requirement" → "Filtering 48 profiles" → "Scoring 12 candidates" | "Loading…" |
| Relaxed | "Widened 4–7y to 3–8y to surface 5 candidates." | "Filters were adjusted" |
| Empty result | "No one in the pool has all four required skills. Loosen one?" | "No results found" |
| Rate limit | "Rate limited. Retrying in 2s." | "An error occurred" |
| Degraded | "Scored 8 of 12 — the rest are shown unscored." | "Partial failure" |
| Refined | "Raised minimum experience 4 → 6, because you said p01 was too junior." | "Filters updated" |

Every one of these names a number or a reason. That's the house style.

---

## 4. Component mapping

| Component | Surface | Border | Radius | Notes |
|---|---|---|---|---|
| App shell | `surface-warm` | — | — | Warm cream, full bleed |
| Criteria rail | `surface-warm-card` | `warm-border` | `lg` | Sticky, always visible |
| Filter chip | `market-active` | `market-accent-border` | `chip` | Mono value, × to remove |
| Rubric criterion | `surface` | `warm-hairline` | `md` | Weight as 1–5 dots |
| Add criterion | transparent | `control-border-dashed` | `md` | Dashed |
| Profile card | `market-talent-surface` | `market-talent-hairline` | `card` | `warm-sm` → `warm-md` on hover |
| Card, marked ✓ | `market-selected` | `market-accent-border` | `card` | |
| Score | — | — | — | Fraunces, `text-3xl`, bar `market-band` on `market-track` |
| Evidence chip | `market-active` | `market-accent-border` | `chip` | Mono field name + value |
| Concern chip | `pastel-red` | — | `chip` | |
| Verdict: strong | `market-active` / `market-live` text | | `pill` | |
| Verdict: possible | `pastel-yellow` | — | `pill` | |
| Primary CTA | `accent` | — | `pill` | Text `text-on-accent`, **never white** |
| Freeze button | `primary` | — | `pill` | Text white, hover `market-primary-hover` |
| Chat: recruiter | `primary` | — | `lg` | White text |
| Chat: assistant | `surface` | `warm-hairline` | `lg` | |
| Change log | `surface-warm-sunken` | — | `md` | Mono, `from → to` with reason |
| Relaxation notice | `surface-warm-card` | `warm-border` | `md` | Icon in `market-withheld` |
| Degraded banner | `terracotta-surface` | `terracotta-border` | `md` | Text `terracotta` |
| Frozen summary | `surface` | `market-accent-border` | `card` | `warm-lg`, accent top rule |

---

## 5. Build notes

- Tailwind v4: single `@theme` block in `client/styles.css`, no `tailwind.config.js`.
- **Contrast check:** `#cff07c` accent is bright — it only ever carries `#082c1c` text. Never white
  on accent, never accent as body text.
- Mono is load-bearing, not decoration: filter values, `from → to` diffs, profile IDs and evidence
  field names all use JetBrains Mono. It's how a recruiter tells structured data from prose at a glance.
- Fraunces on scores and headings is the highest-leverage detail. If time is short, ship Fraunces +
  the core palette and skip everything in §4 below the fold.
