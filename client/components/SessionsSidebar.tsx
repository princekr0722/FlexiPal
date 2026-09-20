import { useCallback, useEffect, useState } from 'react'

export interface SessionSummaryRow {
  id: string
  query: string
  status: 'active' | 'frozen'
  round: number
  createdAt: number
  lastActivity: number
  resultCount: number
  messageCount: number
}

const COLLAPSE_KEY = 'flexipal:sidebar-collapsed'

/**
 * Past searches, so a recruiter can pick one back up. Results are replayed from
 * SQLite rather than recomputed, so reopening a search is instant and costs
 * nothing — which is the whole reason rounds are persisted.
 */
export function SessionsSidebar({
  activeId, onResume, onNew, refreshKey, overlay = false, open = false, onClose,
}: {
  activeId: string | null
  onResume: (id: string) => void
  onNew: () => void
  refreshKey: number
  /** Small screens: float over the page instead of taking a column. */
  overlay?: boolean
  /** Overlay mode is controlled by the parent, which owns the trigger button. */
  open?: boolean
  onClose?: () => void
}) {
  const [sessions, setSessions] = useState<SessionSummaryRow[]>([])
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (!res.ok) return
      const data = (await res.json()) as { sessions: SessionSummaryRow[] }
      setSessions(data.sessions)
    } catch {
      // The sidebar is a convenience; a failed load must not break the search.
    }
  }, [])

  useEffect(() => { void load() }, [load, refreshKey, activeId])

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* private mode */ }
      return next
    })
  }

  const dismiss = () => onClose?.()

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/session/${id}`, { method: 'DELETE' })
    if (id === activeId) onNew()
    void load()
  }

  // Overlay mode renders nothing until the parent opens it; the trigger lives
  // in the layout so it reads as part of the page, not floating over it.
  if (overlay && !open) return null

  if (!overlay && collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-3 overflow-hidden border-r border-surface-warm-border bg-surface-warm-card py-4">
        <button
          onClick={toggle}
          title="Show past searches"
          aria-label="Show past searches"
          className="grid size-8 cursor-pointer place-items-center rounded-md text-text-subtle transition hover:bg-market-hover hover:text-primary"
        >
          ☰
        </button>
        <span className="font-mono text-body-xs text-text-subtle/60">{sessions.length}</span>
      </aside>
    )
  }

  const panel = (
    <aside
      onClick={(e) => e.stopPropagation()}
      className={
        overlay
          ? 'flex h-full w-72 max-w-[85vw] flex-col overflow-hidden border-r border-surface-warm-border bg-surface-warm-card shadow-warm-lg'
          : 'flex h-full w-64 shrink-0 flex-col overflow-hidden border-r border-surface-warm-border bg-surface-warm-card'
      }
    >
      <header className="flex items-center justify-between px-3 py-3">
        <h2 className="font-heading text-body-sm text-primary">Past searches</h2>
        <button
          onClick={overlay ? dismiss : toggle}
          title="Hide"
          aria-label="Hide past searches"
          className="grid size-7 cursor-pointer place-items-center rounded-md text-text-subtle transition hover:bg-market-hover hover:text-primary"
        >
          {overlay ? '×' : '‹'}
        </button>
      </header>

      <div className="px-3 pb-2">
        <button
          onClick={() => { onNew(); dismiss() }}
          className="w-full cursor-pointer rounded-pill bg-accent px-3 py-1.5 text-body-xs font-medium text-text-on-accent transition-all duration-150 hover:brightness-95 active:scale-[0.98]"
        >
          + New search
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-body-xs leading-snug text-text-subtle">
            Nothing yet. Searches you run are kept here so you can come back to them.
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => {
              const active = s.id === activeId
              return (
                <li key={s.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { onResume(s.id); dismiss() }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { onResume(s.id); dismiss() } }}
                    className={`group cursor-pointer rounded-md border px-2.5 py-2 transition ${
                      active
                        ? 'border-market-accent-border bg-market-selected'
                        : 'border-transparent hover:border-surface-warm-border hover:bg-market-hover'
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <p className="line-clamp-2 flex-1 text-body-xs leading-snug text-text">{s.query}</p>
                      <button
                        onClick={(e) => void remove(s.id, e)}
                        title="Delete this search"
                        aria-label="Delete this search"
                        className="shrink-0 cursor-pointer text-body-xs text-text-subtle/0 transition group-hover:text-text-subtle hover:!text-danger"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-mono text-body-xs text-text-subtle">
                      {s.status === 'frozen' && <span className="text-market-live">frozen</span>}
                      {s.status === 'frozen' && <span>·</span>}
                      <span>{s.resultCount} found</span>
                      {s.round > 0 && <><span>·</span><span>{s.round} round{s.round === 1 ? '' : 's'}</span></>}
                      <span className="ml-auto">{ago(s.lastActivity)}</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )

  if (!overlay) return panel

  // Floats over the results rather than squeezing them.
  return (
    <div className="fixed inset-0 z-40 flex bg-primary/25 backdrop-blur-sm" onClick={dismiss}>
      {panel}
    </div>
  )
}

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
