import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './primitives.tsx'
import { Logo } from './Logo.tsx'
import { useVocabulary } from '../hooks/useVocabulary.ts'
import { detect, detectedCount } from '../lib/detect.ts'

const EXAMPLES = [
  'RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore',
  'Senior frontend engineers in Berlin or Amsterdam who have shipped design systems',
  'Data engineers with Spark and Airflow, 5+ years, ideally from scaleups',
]

export function SearchScreen({ onSubmit, busy }: { onSubmit: (q: string) => void; busy: boolean }) {
  const [value, setValue] = useState('')
  const vocab = useVocabulary()
  const typed = useTypewriter(EXAMPLES, value.length === 0 && !busy)
  const found = useMemo(() => detect(value, vocab), [value, vocab])
  const n = detectedCount(found)
  const canSubmit = value.trim().length >= 3 && !busy

  return (
    <div className="relative mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-16">
      {/* A slow, barely-there wash behind the headline. */}
      <div
        aria-hidden
        className="animate-drift pointer-events-none absolute -top-12 left-1/2 -z-10 size-[28rem] -translate-x-1/2 rounded-pill bg-accent/25 blur-3xl"
      />

      <div className="animate-rise">
        <Logo className="mb-7 h-9 w-auto" />
      </div>

      <h1 className="animate-rise font-heading text-5xl leading-tight text-primary" style={{ animationDelay: '60ms' }}>
        What are you hiring for?
      </h1>
      <p
        className="animate-rise mt-3 text-body-lg leading-relaxed text-text-muted"
        style={{ animationDelay: '120ms' }}
      >
        Describe the role the way you would say it out loud. We turn it into filters
        and a fit rubric, then refine both with you until the shortlist is right.
      </p>

      <form
        className="animate-rise mt-8"
        style={{ animationDelay: '180ms' }}
        onSubmit={(e) => {
          e.preventDefault()
          if (canSubmit) onSubmit(value.trim())
        }}
      >
        <div className="relative">
          <textarea
            autoFocus
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                e.preventDefault()
                onSubmit(value.trim())
              }
            }}
            className="w-full resize-none rounded-lg border border-control-border bg-surface p-4 text-body-md leading-relaxed text-text transition-colors hover:border-control-border-hover focus:border-primary focus:outline-none"
          />

          {/* The placeholder types itself, so the box shows what it accepts. */}
          {value.length === 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 p-4 text-body-md leading-relaxed text-text-subtle/70"
            >
              {typed}
              <span className="animate-caret">▍</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-mono text-body-xs text-text-subtle">
            {vocab
              ? `${vocab.size} profiles · ${vocab.skills.length} skills · ${vocab.locations.length} locations`
              : 'loading the talent pool…'}
          </span>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? 'Searching…' : 'Build my shortlist'}
          </Button>
        </div>

        {/* Instant, local recognition — proof the words mean something here. */}
        <div className="mt-3 min-h-[2rem]">
          {n > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-body-xs text-text-subtle">Recognised in the pool:</span>
              {found.skills.map((s, i) => <Detected key={s} delay={i}>{s}</Detected>)}
              {found.experience && <Detected delay={found.skills.length}>{found.experience}</Detected>}
              {found.locations.map((l, i) => (
                <Detected key={l} delay={found.skills.length + 1 + i}>{l}</Detected>
              ))}
              {found.companyTypes.map((c, i) => (
                <Detected key={c} delay={found.skills.length + found.locations.length + 1 + i}>{c}</Detected>
              ))}
            </div>
          )}
        </div>
      </form>

      <div className="animate-rise mt-8" style={{ animationDelay: '240ms' }}>
        <p className="mb-2.5 text-body-xs tracking-[0.02em] text-text-subtle">Or start from one of these</p>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex}
              onClick={() => setValue(ex)}
              style={{ animationDelay: `${280 + i * 60}ms` }}
              className="animate-rise block w-full cursor-pointer rounded-md border border-surface-warm-border bg-surface-warm-card px-3 py-2.5 text-left text-body-sm leading-snug text-text-muted transition hover:border-market-accent-border hover:bg-market-hover hover:text-text"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Detected({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span
      style={{ animationDelay: `${delay * 40}ms` }}
      className="animate-chip-in rounded-chip border border-market-accent-border bg-market-active px-2 py-0.5 font-mono text-body-xs text-primary"
    >
      {children}
    </span>
  )
}

/** Types an example out, holds it, deletes it, moves to the next. */
function useTypewriter(phrases: string[], active: boolean): string {
  const [text, setText] = useState('')
  const state = useRef({ phrase: 0, char: 0, deleting: false })

  useEffect(() => {
    if (!active) {
      setText('')
      state.current = { phrase: 0, char: 0, deleting: false }
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(phrases[0])
      return
    }

    let timer: number
    const tick = () => {
      const s = state.current
      const full = phrases[s.phrase]

      if (!s.deleting) {
        s.char++
        setText(full.slice(0, s.char))
        if (s.char >= full.length) {
          s.deleting = true
          timer = window.setTimeout(tick, 2200)
          return
        }
      } else {
        s.char -= 3
        if (s.char <= 0) {
          s.char = 0
          s.deleting = false
          s.phrase = (s.phrase + 1) % phrases.length
        }
        setText(full.slice(0, Math.max(0, s.char)))
      }
      timer = window.setTimeout(tick, s.deleting ? 18 : 28)
    }

    timer = window.setTimeout(tick, 400)
    return () => window.clearTimeout(timer)
  }, [active, phrases])

  return text
}
