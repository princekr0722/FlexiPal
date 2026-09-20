import { useEffect, useMemo, useState } from 'react'
import { useSearchStream } from './hooks/useSearchStream.ts'
import { rankedProfiles } from './state/session.ts'
import { SearchScreen } from './components/SearchScreen.tsx'
import { CriteriaRail } from './components/CriteriaRail.tsx'
import { CriteriaEditor } from './components/CriteriaEditor.tsx'
import { ProfileCard } from './components/ProfileCard.tsx'
import { ChatPanel } from './components/ChatPanel.tsx'
import { Funnel } from './components/Funnel.tsx'
import { FrozenSummary } from './components/FrozenSummary.tsx'
import { EmptyState, ErrorState, WarningStack } from './components/states/EmptyError.tsx'
import { Pager } from './components/Pager.tsx'
import { ScoringBar, SkeletonCards } from './components/states/Loading.tsx'
import { ProfileModal } from './components/ProfileModal.tsx'
import { useUrlState } from './hooks/useUrlState.ts'
import { useMediaQuery, DESKTOP_QUERY } from './hooks/useMediaQuery.ts'
import { CriteriaAccordion } from './components/mobile/CriteriaAccordion.tsx'
import { Composer } from './components/mobile/Composer.tsx'
import { ChatSheet } from './components/mobile/ChatSheet.tsx'
import { Logo } from './components/Logo.tsx'
import { LogoMark } from './components/LogoMark.tsx'
import { SessionsSidebar } from './components/SessionsSidebar.tsx'

export function App() {
  const { state, dispatch, search, refine, editCriteria, freeze, unfreeze, resume } = useSearchStream()
  const [editing, setEditing] = useState(false)
  // Bumped whenever a round completes so the history list picks up the change.
  const [historyKey, setHistoryKey] = useState(0)
  const [url, setUrl] = useUrlState()
  const page = url.page - 1
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [chatOpen, setChatOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [seenChat, setSeenChat] = useState(0)
  const busy = state.phase === 'running'
  const frozen = state.phase === 'frozen'
  const ranked = useMemo(() => rankedProfiles(state), [state])
  const pendingVerdicts = Object.keys(state.verdicts).length

  const setPage = (p: number) => setUrl({ page: p + 1 })

  // Every new round produces a new list; start it at the top.
  useEffect(() => {
    if (url.page !== 1) setUrl({ page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round, state.profiles])

  // Reopen whatever the URL points at: a shared link, or a reload mid-search.
  useEffect(() => {
    if (url.session && url.session !== state.sessionId) void resume(url.session)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.session])

  // Keep the session in the URL once a search creates one.
  useEffect(() => {
    if (state.sessionId && state.sessionId !== url.session) {
      setUrl({ session: state.sessionId, page: 1, profile: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessionId])

  // A finished round changes the session's result count and timestamp.
  useEffect(() => {
    if (state.phase === 'results' || state.phase === 'empty' || state.phase === 'frozen') {
      setHistoryKey((k) => k + 1)
    }
  }, [state.phase, state.round])

  /**
   * One way to start over. Clearing React state without clearing the URL left
   * ?session= pointing at the old search, so a reload silently resurrected it.
   */
  const startNew = () => {
    setEditing(false)
    setChatOpen(false)
    setDrawerOpen(false)
    setUrl({ session: null, page: 1, profile: null })
    dispatch({ kind: 'reset' })
  }

  const sidebar = (
    <SessionsSidebar
      overlay={!isDesktop}
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      activeId={state.sessionId}
      refreshKey={historyKey}
      onResume={(id) => { setEditing(false); setUrl({ session: id, page: 1, profile: null }) }}
      onNew={startNew}
    />
  )

  // Five per page matches the brief's "4-5 profiles at a time", and keeps the
  // list readable when a loose search returns forty-seven people.
  const PER_PAGE = 5
  const pages = Math.max(1, Math.ceil(ranked.length / PER_PAGE))
  const current = Math.min(page, pages - 1)
  const visible = ranked.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE)

  const openProfile = url.profile
    ? ranked.find((r) => r.profile.id === url.profile) ?? null
    : null

  const sendRefine = (text: string) => {
    setEditing(false)
    void refine(text)
  }

  const unread = Math.max(0, state.chat.length - seenChat)

  const historyButton = (
    <button
      onClick={() => setDrawerOpen(true)}
      aria-label="Past searches"
      className="grid w-12 shrink-0 cursor-pointer place-items-center border-r border-surface-warm-border text-text-muted transition hover:bg-market-hover hover:text-primary active:scale-95"
    >
      ☰
    </button>
  )

  if (state.phase === 'idle') {
    if (!isDesktop) {
      return (
        <div className="flex h-screen flex-col overflow-hidden bg-surface-warm">
          <div className="flex shrink-0 items-stretch border-b border-surface-warm-border bg-surface-warm-card">
            {historyButton}
            <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
              <LogoMark className="size-7 shrink-0" />
              <span className="text-body-xs tracking-[0.02em] text-text-subtle">New search</span>
            </div>
          </div>
          <main className="min-h-0 flex-1 overflow-y-auto">
            <SearchScreen onSubmit={(q) => void search(q)} busy={busy} />
          </main>
          {sidebar}
        </div>
      )
    }
    return (
      <div className="flex h-screen overflow-hidden bg-surface-warm">
        {sidebar}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <SearchScreen onSubmit={(q) => void search(q)} busy={busy} />
        </main>
      </div>
    )
  }

  if (!isDesktop) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-surface-warm">
        <Header query={state.query} onReset={startNew} />

        <CriteriaAccordion
          filters={state.filters}
          rubric={state.rubric}
          relaxations={state.relaxations}
          busy={busy}
          frozen={frozen}
          onEdit={() => setEditing(true)}
          onFreeze={() => void freeze()}
          leading={historyButton}
        >
          {editing && state.filters && state.rubric ? (
            <CriteriaEditor
              filters={state.filters}
              rubric={state.rubric}
              onCancel={() => setEditing(false)}
              onApply={(f, r) => { setEditing(false); void editCriteria(f, r) }}
            />
          ) : (
            <CriteriaRail
              filters={state.filters}
              rubric={state.rubric}
              relaxations={state.relaxations}
              frozen={frozen}
              busy={busy}
              showActions={false}
              onEdit={() => setEditing(true)}
              onFreeze={() => void freeze()}
            />
          )}
        </CriteriaAccordion>

        {/* Candidates keep the screen as soon as filtering has produced any. */}
        <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <WarningStack warnings={state.warnings} />

          {frozen && (
            <FrozenSummary
              state={state}
              onUnfreeze={() => void unfreeze()}
              onOpenProfile={(id) => setUrl({ profile: id }, { replace: false })}
            />
          )}

          {!frozen && busy && state.resultsStale && ranked.length === 0 && <Funnel state={state} />}

          {!frozen && state.phase === 'error' && !busy && state.error && (
            <ErrorState {...state.error} onRetry={() => void search(state.query)} />
          )}

          {!frozen && state.phase === 'empty' && !busy && (
            <EmptyState bottleneck={state.bottleneck} onLoosen={() => setEditing(true)} />
          )}

          {!frozen && ranked.length > 0 && (
            <>
              {busy && <ScoringBar state={state} />}
              <div className="mb-2.5 flex items-baseline justify-between">
                <h2 className="font-heading text-body-lg text-primary">
                  {ranked.length} candidate{ranked.length === 1 ? '' : 's'}
                </h2>
                <span className="font-mono text-body-xs text-text-subtle">
                  {current + 1}/{pages}
                </span>
              </div>
              <div className="space-y-3">
                {visible.map(({ profile, score }, i) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    score={score}
                    rank={current * PER_PAGE + i + 1}
                    pending={busy && !score}
                    verdict={state.verdicts[profile.id]}
                    onOpen={() => setUrl({ profile: profile.id }, { replace: false })}
                    onVerdict={(v) => dispatch({ kind: 'verdict', profileId: profile.id, verdict: v })}
                  />
                ))}
              </div>
              <Pager
                page={current}
                pages={pages}
                total={ranked.length}
                from={current * PER_PAGE + 1}
                to={Math.min(ranked.length, current * PER_PAGE + PER_PAGE)}
                onPage={setPage}
              />
            </>
          )}
        </section>

        <Composer
          busy={busy}
          frozen={frozen}
          unread={unread}
          pendingVerdicts={pendingVerdicts}
          onSend={sendRefine}
          onExpand={() => { setChatOpen(true); setSeenChat(state.chat.length) }}
          onUnfreeze={() => void unfreeze()}
          onNew={startNew}
        />

        {sidebar}

        {chatOpen && (
          <ChatSheet
            chat={state.chat}
            busy={busy}
            round={state.round}
            frozen={frozen}
            onClose={() => { setChatOpen(false); setSeenChat(state.chat.length) }}
          />
        )}

        {openProfile && (
          <ProfileModal
            profile={openProfile.profile}
            score={openProfile.score}
            verdict={state.verdicts[openProfile.profile.id]}
            onVerdict={(v) => dispatch({ kind: 'verdict', profileId: openProfile.profile.id, verdict: v })}
            onClose={() => setUrl({ profile: null })}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-warm">
      {sidebar}
      <main className="flex min-w-0 flex-1 flex-col">
      <Header query={state.query} onReset={startNew} />

      {/* Each column scrolls on its own so the criteria rail never scrolls away. */}
      <div className="mx-auto grid min-h-0 w-full max-w-[1400px] flex-1 gap-5 px-5 pt-6 pb-6 lg:grid-cols-[320px_1fr]">
        <div className="flex min-h-0 flex-col">
        {editing && state.filters && state.rubric ? (
          <div className="min-h-0 overflow-y-auto pr-1">
          <CriteriaEditor
            filters={state.filters}
            rubric={state.rubric}
            onCancel={() => setEditing(false)}
            onApply={(f, r) => { setEditing(false); void editCriteria(f, r) }}
          />
          </div>
        ) : (
          <CriteriaRail
            filters={state.filters}
            rubric={state.rubric}
            relaxations={state.relaxations}
            frozen={frozen}
            busy={busy}
            onEdit={() => setEditing(true)}
            onFreeze={() => void freeze()}
          />
        )}
        </div>

        <div className="grid min-h-0 gap-5 xl:grid-cols-[1fr_380px]">
          <section className="min-h-0 min-w-0 overflow-y-auto pr-1">
            <WarningStack warnings={state.warnings} />

            {frozen && (
              <FrozenSummary
                state={state}
                onUnfreeze={() => void unfreeze()}
                onOpenProfile={(id) => setUrl({ profile: id }, { replace: false })}
              />
            )}

            {/* Three distinct in-flight states, so the column is never ambiguous:
                the funnel while criteria are being worked out, skeletons once a
                count is known but cards have not arrived, and a progress strip
                above cards that are filling in. */}
            {!frozen && busy && state.resultsStale && <Funnel state={state} />}

            {!frozen && busy && !state.resultsStale && ranked.length === 0 && state.matchedCount > 0 && (
              <SkeletonCards count={Math.min(3, state.matchedCount)} />
            )}

            {!frozen && state.phase === 'error' && !busy && state.error && (
              <ErrorState {...state.error} onRetry={() => void search(state.query)} />
            )}

            {!frozen && state.phase === 'empty' && !busy && (
              <EmptyState bottleneck={state.bottleneck} onLoosen={() => setEditing(true)} />
            )}

            {!frozen && ranked.length > 0 && !state.resultsStale && (
              <>
                {/* Stays put while the list scrolls, so the count and the
                    "matched exactly" caveat never leave the screen. */}
                <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-baseline justify-between border-b border-surface-warm-border bg-surface-warm px-1 pb-2.5">
                  <h2 className="font-heading text-body-xl text-primary">
                    {ranked.length} candidate{ranked.length === 1 ? '' : 's'}
                  </h2>
                  <span className="font-mono text-body-xs text-text-subtle">
                    {state.strictCount > 0
                      ? `${state.strictCount} matched exactly`
                      : 'none matched exactly — see what was loosened'}
                  </span>
                </div>
                {busy && <ScoringBar state={state} />}
                <div className="space-y-3">
                  {visible.map(({ profile, score }, i) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      score={score}
                      rank={current * PER_PAGE + i + 1}
                      pending={busy && !score}
                      verdict={state.verdicts[profile.id]}
                      onOpen={() => setUrl({ profile: profile.id }, { replace: false })}
                      onVerdict={(v) => dispatch({ kind: 'verdict', profileId: profile.id, verdict: v })}
                    />
                  ))}
                </div>
                <Pager
                  page={current}
                  pages={pages}
                  total={ranked.length}
                  from={current * PER_PAGE + 1}
                  to={Math.min(ranked.length, current * PER_PAGE + PER_PAGE)}
                  onPage={setPage}
                />
              </>
            )}
          </section>

          <div className="min-h-0 min-w-0">
            <ChatPanel
              chat={state.chat}
              busy={busy}
              frozen={frozen}
              pendingVerdicts={pendingVerdicts}
              round={state.round}
              onSend={sendRefine}
              onUnfreeze={() => void unfreeze()}
              onNew={startNew}
            />
          </div>
        </div>
      </div>
      </main>

      {openProfile && (
        <ProfileModal
          profile={openProfile.profile}
          score={openProfile.score}
          verdict={state.verdicts[openProfile.profile.id]}
          onVerdict={(v) => dispatch({ kind: 'verdict', profileId: openProfile.profile.id, verdict: v })}
          onClose={() => setUrl({ profile: null })}
        />
      )}
    </div>
  )
}

function Header({ query, onReset }: { query?: string; onReset?: () => void }) {
  return (
    <header className="shrink-0 border-b border-surface-warm-border bg-surface-warm/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-5 py-3">
        <LogoMark className="size-7 shrink-0 lg:hidden" />
        <Logo className="hidden h-6 w-auto shrink-0 lg:block" />
        {query && (
          <p className="min-w-0 flex-1 truncate text-body-sm text-text-subtle" title={query}>
            {query}
          </p>
        )}
        {onReset && (
          <button onClick={onReset} className="shrink-0 cursor-pointer text-body-sm text-text-subtle underline-offset-4 hover:text-text hover:underline">
            New search
          </button>
        )}
      </div>
    </header>
  )
}
