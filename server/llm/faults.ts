import { LlmError } from './errors.ts'

/**
 * Dev-only fault injection. The assignment asks the walkthrough to show a
 * failure being handled; waiting to genuinely get rate-limited on camera is a
 * bad plan, so every failure path can be triggered on demand with
 * `?fault=rate_limit` on a search/refine request. Disabled in production.
 */
export type FaultKind = 'rate_limit' | 'timeout' | 'unavailable' | 'malformed' | 'schema' | 'empty'

export const FAULT_KINDS: FaultKind[] = ['rate_limit', 'timeout', 'unavailable', 'malformed', 'schema', 'empty']

export function faultsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export function parseFault(value: unknown): FaultKind | undefined {
  if (!faultsEnabled() || typeof value !== 'string') return undefined
  return (FAULT_KINDS as string[]).includes(value) ? (value as FaultKind) : undefined
}

/**
 * Applied per attempt. `once: true` faults fire on the first attempt only, so
 * the retry visibly succeeds — which is the moment worth filming.
 */
export function injectBeforeCall(fault: FaultKind | undefined, attempt: number): void {
  if (!fault) return
  switch (fault) {
    case 'rate_limit':
      if (attempt === 1) throw new LlmError('rate_limit', 'Injected 429 (dev fault)', { detail: '"retryDelay":"2s"' })
      return
    case 'timeout':
      if (attempt === 1) throw new LlmError('timeout', 'Injected timeout (dev fault)')
      return
    case 'unavailable':
      if (attempt === 1) throw new LlmError('unavailable', 'Injected 503 (dev fault)')
      return
    default:
      return
  }
}

/** Corrupts the model's reply so the repair path runs for real. */
export function injectOnResponse(fault: FaultKind | undefined, attempt: number, text: string): string {
  if (!fault || attempt > 1) return text
  switch (fault) {
    case 'malformed': return '```json\n{ "filters": { oops this is not json'
    case 'schema':    return JSON.stringify({ filters: 'should-be-an-object', rubric: null })
    case 'empty':     return ''
    default:          return text
  }
}
