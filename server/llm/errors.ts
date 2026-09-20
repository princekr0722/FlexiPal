export type LlmErrorCode =
  | 'no_key'        // server misconfigured
  | 'rate_limit'    // 429 / RESOURCE_EXHAUSTED
  | 'timeout'       // exceeded our own deadline
  | 'unavailable'   // 5xx, network
  | 'schema'        // valid JSON, wrong shape — survived the repair attempt
  | 'malformed'     // not JSON at all
  | 'blocked'       // safety filter / empty candidate

export class LlmError extends Error {
  readonly code: LlmErrorCode
  readonly recoverable: boolean
  readonly attempts: number
  readonly detail?: string

  constructor(code: LlmErrorCode, message: string, opts: { recoverable?: boolean; attempts?: number; detail?: string } = {}) {
    super(message)
    this.name = 'LlmError'
    this.code = code
    this.recoverable = opts.recoverable ?? true
    this.attempts = opts.attempts ?? 1
    this.detail = opts.detail
  }
}

/** Maps whatever the SDK threw onto our own vocabulary. */
export function classify(err: unknown): { code: LlmErrorCode; retryable: boolean; retryAfterMs?: number } {
  const anyErr = err as { status?: number; code?: number | string; message?: string; name?: string }
  const status = Number(anyErr?.status ?? anyErr?.code)
  const msg = String(anyErr?.message ?? '')

  if (anyErr?.name === 'AbortError' || /abort|timed? ?out|deadline/i.test(msg)) {
    return { code: 'timeout', retryable: true }
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) {
    // Gemini returns a retryDelay hint on quota errors; honour it when present.
    const hinted = /"?retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/i.exec(msg)
    return { code: 'rate_limit', retryable: true, retryAfterMs: hinted ? Number(hinted[1]) * 1000 : undefined }
  }
  if (status === 401 || status === 403 || /API key|PERMISSION_DENIED|UNAUTHENTICATED/i.test(msg)) {
    return { code: 'no_key', retryable: false }
  }
  if (status >= 500 || /UNAVAILABLE|INTERNAL|fetch failed|ECONNRESET|ENOTFOUND/i.test(msg)) {
    return { code: 'unavailable', retryable: true }
  }
  return { code: 'unavailable', retryable: status !== 400 }
}

export function userFacing(code: LlmErrorCode): string {
  switch (code) {
    case 'no_key':      return 'The server has no valid Gemini API key. Set GEMINI_API_KEY and restart.'
    case 'rate_limit':  return 'Rate limited by Gemini. Waiting, then trying again.'
    case 'timeout':     return 'Gemini took too long to answer.'
    case 'unavailable': return 'Gemini is unreachable right now.'
    case 'schema':      return 'Gemini returned the wrong shape twice. Nothing was changed.'
    case 'malformed':   return 'Gemini returned something that was not valid JSON.'
    case 'blocked':     return 'Gemini declined to answer that.'
  }
}
