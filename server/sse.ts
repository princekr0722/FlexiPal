import type { FastifyReply } from 'fastify'
import type { SseEvent } from '../shared/events.ts'
import { SSE_RETRY_MS } from '../shared/events.ts'

export interface SseChannel {
  send(event: SseEvent): void
  close(): void
  readonly open: boolean
  /** Aborted when the client goes away, so in-flight LLM work can stop. */
  readonly signal: AbortSignal
}

/**
 * Minimal SSE over Fastify's raw stream. Named events would force the client to
 * register a listener per type; everything goes down the default `message`
 * channel with a `type` discriminator instead, so the client is one reducer.
 */
export function openSse(reply: FastifyReply): SseChannel {
  const res = reply.raw
  let open = true
  const aborter = new AbortController()

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx and friends will otherwise sit on the stream until it completes.
    'X-Accel-Buffering': 'no',
  })
  res.write(`retry: ${SSE_RETRY_MS}\n\n`)

  // A recruiter who closes the tab mid-search should stop the work, not leak it:
  // scoring a dozen profiles nobody will read still costs rate limit and money.
  const onClose = () => {
    open = false
    aborter.abort()
  }
  res.on('close', onClose)
  res.on('error', onClose)

  return {
    get open() { return open },
    signal: aborter.signal,
    send(event: SseEvent) {
      if (!open) return
      res.write(`data: ${JSON.stringify(event)}\n\n`)
    },
    close() {
      if (!open) return
      open = false
      res.end()
    },
  }
}
