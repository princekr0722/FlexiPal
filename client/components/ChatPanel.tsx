import { useEffect, useRef, useState } from 'react'
import type { ChatEntry } from '../state/session.ts'
import { Button } from './primitives.tsx'

function InlineAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer font-medium text-primary underline underline-offset-2 transition hover:text-market-live"
    >
      {children}
    </button>
  )
}

export function ChatPanel({
  chat, onSend, busy, frozen, pendingVerdicts, round, onUnfreeze, onNew,
}: {
  chat: ChatEntry[]
  onSend: (text: string) => void
  busy: boolean
  frozen: boolean
  pendingVerdicts: number
  round: number
  onUnfreeze: () => void
  onNew: () => void
}) {
  const [value, setValue] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chat.length, busy])

  const send = () => {
    const text = value.trim()
    if (!text || busy || frozen) return
    onSend(text)
    setValue('')
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-surface-warm-border bg-surface-warm-muted">
      <header className="flex shrink-0 items-center justify-between border-b border-surface-warm-border px-4 py-3">
        <h3 className="font-heading text-body-md text-primary">Refine</h3>
        <span className="font-mono text-body-xs text-text-subtle">
          {frozen ? 'frozen' : round === 0 ? 'round 1' : `round ${round + 1}`}
        </span>
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
        <div ref={endRef} />
      </div>

      <div className="border-t border-surface-warm-border p-3">
        {frozen ? (
          <p className="py-1 text-center text-body-sm leading-relaxed text-text-subtle">
            This search is frozen. You can{' '}
            <InlineAction onClick={onUnfreeze}>unfreeze it</InlineAction>{' '}
            to keep refining, or start a{' '}
            <InlineAction onClick={onNew}>new chat</InlineAction>.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                placeholder="1 is too junior, 2 and 4 are right…"
                disabled={busy}
                className="min-h-[52px] flex-1 resize-none rounded-md border border-control-border bg-surface px-3 py-2 text-body-sm leading-snug text-text placeholder:text-text-subtle/70 hover:border-control-border-hover focus:border-primary focus:outline-none disabled:opacity-50"
              />
              <Button onClick={send} disabled={busy || value.trim().length === 0}>
                Refine
              </Button>
            </div>
            {pendingVerdicts > 0 && (
              <p className="mt-2 text-body-xs text-text-subtle">
                {pendingVerdicts} verdict{pendingVerdicts === 1 ? '' : 's'} marked — they go with your next message.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
