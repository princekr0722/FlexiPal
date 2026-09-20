import { useCallback, useReducer, useRef } from 'react'
import type { SseEvent } from '../../shared/events.ts'
import {
  reducer, initialState, type Action, type SessionState, type ResumePayload,
} from '../state/session.ts'
import type { FitRubric, ObjectiveFilters } from '../../shared/schemas.ts'

/**
 * Reads an SSE stream delivered over POST. EventSource is GET-only and the
 * search query belongs in a body, so this parses the wire format directly:
 * blank-line-delimited frames, one JSON payload per `data:` line.
 */
async function consume(
  res: Response,
  onEvent: (e: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!res.body) throw new Error('No response stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Frames are separated by a blank line; a partial frame stays in the buffer.
    let split: number
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as SseEvent)
        } catch {
          // A frame we cannot parse is dropped rather than killing the stream.
        }
      }
    }
  }
}

export interface StreamApi {
  state: SessionState
  dispatch: (a: Action) => void
  search: (query: string, fault?: string) => Promise<void>
  refine: (message: string, fault?: string) => Promise<void>
  editCriteria: (filters: ObjectiveFilters, rubric: FitRubric) => Promise<void>
  freeze: () => Promise<void>
  unfreeze: () => Promise<void>
  resume: (id: string) => Promise<void>
  cancel: () => void
}

export function useSearchStream(): StreamApi {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef<AbortController | null>(null)
  // Callbacks read the latest state without being rebuilt on every event.
  const stateRef = useRef(state)
  stateRef.current = state

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const post = useCallback(async (path: string, body: unknown, onStart: () => void) => {
    cancel()
    const controller = new AbortController()
    abortRef.current = controller
    onStart()

    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: `Request failed (${res.status})` }))
        dispatch({
          kind: 'event',
          event: { type: 'error', code: String(res.status), message: detail.error ?? 'Request failed.', recoverable: true },
        })
        return
      }

      await consume(res, (e) => dispatch({ kind: 'event', event: e }), controller.signal)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      dispatch({
        kind: 'event',
        event: {
          type: 'error',
          code: 'network',
          message: 'Lost the connection to the server. Your criteria are still here — try again.',
          recoverable: true,
        },
      })
    } finally {
      abortRef.current = null
    }
  }, [cancel])

  const search = useCallback(
    (query: string, fault?: string) =>
      post('/api/search', { query, fault }, () => dispatch({ kind: 'submit', query })),
    [post],
  )

  const refine = useCallback(
    (message: string, fault?: string) => {
      const { sessionId, verdicts, profiles } = stateRef.current
      if (!sessionId) return Promise.resolve()
      return post(
        '/api/refine',
        {
          sessionId,
          message,
          // Button verdicts ride along with the message so the model sees the
          // same evidence the recruiter had in front of them.
          verdicts: Object.entries(verdicts).map(([profileId, verdict]) => ({ profileId, verdict })),
          shownIds: profiles.map((p) => p.id),
          fault,
        },
        () => dispatch({ kind: 'refine', text: message }),
      )
    },
    [post],
  )

  const editCriteria = useCallback(
    (filters: ObjectiveFilters, rubric: FitRubric) => {
      const { sessionId } = stateRef.current
      if (!sessionId) return Promise.resolve()
      return post('/api/criteria', { sessionId, filters, rubric }, () =>
        dispatch({ kind: 'refine', text: 'Edited the criteria directly.' }),
      )
    },
    [post],
  )

  const freeze = useCallback(async () => {
    const { sessionId } = stateRef.current
    if (!sessionId) return
    const res = await fetch('/api/freeze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    if (res.ok) dispatch({ kind: 'freeze' })
  }, [])

  const unfreeze = useCallback(async () => {
    const { sessionId } = stateRef.current
    if (!sessionId) return
    const res = await fetch('/api/unfreeze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
    if (res.ok) dispatch({ kind: 'unfreeze' })
  }, [])

  const resume = useCallback(async (id: string) => {
    cancel()
    const res = await fetch(`/api/session/${id}`)
    if (!res.ok) return
    dispatch({ kind: 'resume', payload: (await res.json()) as ResumePayload })
  }, [cancel])

  return { state, dispatch, search, refine, editCriteria, freeze, unfreeze, resume, cancel }
}
