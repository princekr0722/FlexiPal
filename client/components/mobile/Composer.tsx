import { useState } from 'react'

/**
 * The bottom bar on small screens: expand-chat on the left, a single-line
 * field, and a send button that becomes the progress indicator rather than
 * sitting beside one — on a phone there is no room for both.
 */
export function Composer({
  busy, frozen, unread, pendingVerdicts, onSend, onExpand, onUnfreeze, onNew,
}: {
  busy: boolean
  frozen: boolean
  unread: number
  pendingVerdicts: number
  onSend: (text: string) => void
  onExpand: () => void
  onUnfreeze: () => void
  onNew: () => void
}) {
  const [value, setValue] = useState('')
  const canSend = value.trim().length > 0 && !busy && !frozen

  const send = () => {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }

  return (
    <div className="shrink-0 border-t border-surface-warm-border bg-surface-warm-card px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {frozen && (
        <p className="pb-2 text-center text-body-xs leading-snug text-text-subtle">
          Frozen.{' '}
          <button
            onClick={onUnfreeze}
            className="cursor-pointer font-medium text-primary underline underline-offset-2"
          >
            Unfreeze
          </button>{' '}
          to keep refining, or start a{' '}
          <button
            onClick={onNew}
            className="cursor-pointer font-medium text-primary underline underline-offset-2"
          >
            new chat
          </button>.
        </p>
      )}

      {pendingVerdicts > 0 && !frozen && (
        <p className="pb-1.5 text-body-xs text-text-subtle">
          {pendingVerdicts} marked — {pendingVerdicts === 1 ? 'it goes' : 'they go'} with your next message.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onExpand}
          aria-label="Open the conversation"
          className="relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-md border border-control-border bg-surface text-body-lg leading-none text-text-muted transition hover:border-control-border-hover hover:text-primary"
        >
          ⌃
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-pill bg-accent font-mono text-[10px] text-text-on-accent">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          disabled={busy || frozen}
          placeholder={frozen ? 'This search is frozen' : '1 is too junior, 2 and 4 are right…'}
          className="h-9 min-w-0 flex-1 rounded-md border border-control-border bg-surface px-3 text-body-sm text-text placeholder:text-text-subtle/70 focus:border-primary focus:outline-none disabled:opacity-50"
        />

        <SendButton busy={busy} enabled={canSend} onClick={send} />
      </div>
    </div>
  )
}

function SendButton({ busy, enabled, onClick }: { busy: boolean; enabled: boolean; onClick: () => void }) {
  if (busy) {
    return (
      <span
        role="status"
        aria-label="Working"
        className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-warm-sunken"
      >
        <span className="size-4 animate-spin rounded-pill border-2 border-market-band border-t-transparent" />
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={!enabled}
      aria-label="Send"
      className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md bg-accent text-body-lg leading-none text-text-on-accent transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
    >
      ↑
    </button>
  )
}
