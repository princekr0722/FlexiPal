import { useEffect } from 'react'
import type { ChatEntry } from '../../state/session.ts'

/** The full conversation, as a sheet over the results. */
export function ChatSheet({
  chat, busy, round, frozen, onClose,
}: {
  chat: ChatEntry[]
  busy: boolean
  round: number
  frozen: boolean
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-primary/25 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-auto h-[75vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-full flex-col rounded-t-card border-t border-surface-warm-border bg-surface-warm-muted">
          <header className="flex shrink-0 items-center justify-between border-b border-surface-warm-border px-4 py-3">
            <h3 className="font-heading text-body-md text-primary">Conversation</h3>
            <div className="flex items-center gap-3">
              <span className="font-mono text-body-xs text-text-subtle">
                {frozen ? 'frozen' : `round ${round + 1}`}
              </span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="cursor-pointer rounded-md px-2 py-0.5 text-body-lg leading-none text-text-subtle transition hover:bg-surface-muted hover:text-text"
              >
                ×
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {chat.map((entry, i) => (
              <div key={i} className={entry.role === 'recruiter' ? 'flex justify-end' : ''}>
                <div
                  className={
                    entry.role === 'recruiter'
                      ? 'max-w-[85%] rounded-lg bg-primary px-3.5 py-2.5 text-body-sm leading-snug text-white'
                      : 'max-w-[92%] rounded-lg border border-surface-warm-hairline bg-surface px-3.5 py-2.5 text-body-sm leading-snug text-text'
                  }
                >
                  {entry.text}
                  {entry.changes && entry.changes.length > 0 && (
                    <ul className="mt-2.5 space-y-1 rounded-md bg-surface-warm-sunken p-2">
                      {entry.changes.map((c, j) => (
                        <li key={j} className="font-mono text-body-xs leading-snug text-text-muted">
                          <span className="text-text-subtle">{c.path}</span>{' '}
                          <span className="text-danger/70 line-through">{c.from}</span>
                          {' → '}
                          <span className="text-market-live">{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-body-sm text-text-subtle">
                <span className="size-1.5 animate-pulse rounded-pill bg-accent" />
                Working through it…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
