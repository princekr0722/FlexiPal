import type { ReactNode } from 'react'

export function Chip({
  children, tone = 'neutral', mono = true, onRemove,
}: {
  children: ReactNode
  tone?: 'neutral' | 'match' | 'concern' | 'warn'
  mono?: boolean
  onRemove?: () => void
}) {
  const tones = {
    neutral: 'bg-surface-muted border-surface-border text-text-muted',
    match: 'bg-market-active border-market-accent-border text-primary',
    concern: 'bg-pastel-red border-transparent text-text',
    warn: 'bg-pastel-yellow border-transparent text-text',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-body-xs ${mono ? 'font-mono' : ''} ${tones[tone]}`}>
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove"
          className="ml-0.5 cursor-pointer leading-none text-text-subtle transition hover:text-danger"
        >
          ×
        </button>
      )}
    </span>
  )
}

export function Button({
  children, onClick, variant = 'primary', disabled, type = 'button', title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'freeze' | 'ghost' | 'quiet'
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  const variants = {
    // Accent only ever carries dark text — never white. See design.md.
    primary: 'bg-accent text-text-on-accent hover:brightness-95 shadow-warm-sm hover:shadow-warm-md',
    freeze: 'bg-primary text-white hover:bg-primary-hover shadow-warm-sm hover:shadow-warm-md',
    ghost: 'bg-surface border border-control-border text-text hover:border-control-border-hover',
    quiet: 'text-text-subtle hover:text-text underline-offset-4 hover:underline',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`cursor-pointer rounded-pill px-4 py-2 text-body-sm font-medium transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${variants[variant]}`}
    >
      {children}
    </button>
  )
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-surface-warm-border bg-surface-warm-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-body-md text-primary">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}

export function Notice({
  tone, children,
}: { tone: 'relaxed' | 'degraded' | 'error'; children: ReactNode }) {
  const tones = {
    relaxed: 'bg-surface-warm-card border-surface-warm-border text-market-withheld',
    degraded: 'bg-terracotta-surface border-terracotta-border text-terracotta',
    error: 'bg-pastel-red border-transparent text-danger',
  }
  return (
    <div className={`rounded-md border px-3 py-2 text-body-sm ${tones[tone]}`}>{children}</div>
  )
}
