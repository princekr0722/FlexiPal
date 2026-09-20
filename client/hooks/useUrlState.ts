import { useCallback, useEffect, useState } from 'react'

export interface UrlState {
  session: string | null
  page: number
  profile: string | null
}

function read(): UrlState {
  const q = new URLSearchParams(window.location.search)
  const page = Number(q.get('page') ?? '1')
  return {
    session: q.get('session'),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    profile: q.get('profile'),
  }
}

function write(next: UrlState, replace: boolean) {
  const q = new URLSearchParams()
  if (next.session) q.set('session', next.session)
  if (next.page > 1) q.set('page', String(next.page))
  if (next.profile) q.set('profile', next.profile)

  const url = `${window.location.pathname}${q.toString() ? `?${q}` : ''}`
  if (url === window.location.pathname + window.location.search) return
  // Opening a profile is a navigation — Back should close it. Changing page or
  // session is not worth a history entry each time.
  history[replace ? 'replaceState' : 'pushState']({}, '', url)
}

/**
 * Keeps which search, which page and which profile is open in the URL, with no
 * router dependency. A recruiter can bookmark or share a shortlist, reload
 * without losing their place, and use Back to dismiss a profile.
 */
export function useUrlState() {
  const [state, setState] = useState<UrlState>(read)

  useEffect(() => {
    const onPop = () => setState(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const update = useCallback((patch: Partial<UrlState>, opts: { replace?: boolean } = {}) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      write(next, opts.replace ?? true)
      return next
    })
  }, [])

  return [state, update] as const
}
