import type { z } from 'zod'
import type { Schema } from '@google/genai'
import { generateJson, modelForAttempt, MODELS } from './gemini.ts'
import { toGeminiSchema } from './schema.ts'
import { LlmError, classify } from './errors.ts'
import { injectBeforeCall, injectOnResponse, type FaultKind } from './faults.ts'
import { renderPrompt } from './prompts.ts'

export interface Warning {
  code: 'rate_limit' | 'retrying' | 'repaired'
  message: string
}

export interface CallOptions<T> {
  /** Short name used in logs and warnings, e.g. "extract-criteria". */
  name: string
  schema: z.ZodType<T>
  system: string
  user: string
  temperature?: number
  maxAttempts?: number
  fault?: FaultKind
  signal?: AbortSignal
  onWarning?: (w: Warning) => void
}

export interface CallResult<T> {
  data: T
  attempts: number
  repaired: boolean
}

const BASE_BACKOFF_MS = 800
const schemaCache = new WeakMap<z.ZodType, Schema>()

function geminiSchemaFor<T>(schema: z.ZodType<T>): Schema {
  let cached = schemaCache.get(schema)
  if (!cached) {
    cached = toGeminiSchema(schema)
    schemaCache.set(schema, cached)
  }
  return cached
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Strips ``` fences, which Gemini still emits occasionally despite JSON mode. */
function stripFences(text: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text)
  return (fenced ? fenced[1] : text).trim()
}

/**
 * One structured LLM call, made trustworthy:
 *   parse → validate → (repair once) → retry with backoff → give up loudly.
 * Returns validated data or throws LlmError. Callers decide how to degrade.
 */
export async function callStructured<T>(opts: CallOptions<T>): Promise<CallResult<T>> {
  const maxAttempts = opts.maxAttempts ?? 3
  const responseSchema = geminiSchemaFor(opts.schema)
  let repaired = false
  let lastError: LlmError | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Nothing is worth starting, or retrying, once the recruiter has gone.
    if (opts.signal?.aborted) {
      throw new LlmError('timeout', `${opts.name}: cancelled`, { recoverable: false, attempts: attempt })
    }
    try {
      injectBeforeCall(opts.fault, attempt)

      const raw = await generateJson({
        system: opts.system,
        user: opts.user,
        schema: responseSchema,
        temperature: opts.temperature,
        model: modelForAttempt(attempt),
        signal: opts.signal,
      })

      const text = injectOnResponse(opts.fault, attempt, raw.text)
      const parsed = tryParseAndValidate(opts.schema, text)
      if (parsed.ok) return { data: parsed.value, attempts: attempt, repaired }

      // Shape was wrong but the model is reachable. Hand the errors back once —
      // cheaper and far more likely to work than blindly regenerating.
      opts.onWarning?.({
        code: 'repaired',
        message: `${opts.name}: response failed validation, asking the model to correct it`,
      })
      const fixed = await attemptRepair(opts, responseSchema, text, parsed.problem)
      if (fixed.ok) {
        repaired = true
        return { data: fixed.value, attempts: attempt, repaired }
      }

      lastError = new LlmError(parsed.kind, `${opts.name}: ${parsed.problem}`, {
        attempts: attempt,
        detail: text.slice(0, 500),
      })
      // A repair failure is not worth a third full attempt at the same prompt.
      break
    } catch (err) {
      const asLlm = err instanceof LlmError ? err : undefined
      const { code, retryable, retryAfterMs } = asLlm
        ? { code: asLlm.code, retryable: asLlm.recoverable, retryAfterMs: hintedDelay(asLlm.detail) }
        : classify(err)

      lastError = new LlmError(code, asLlm?.message ?? String((err as Error)?.message ?? err), {
        attempts: attempt,
        recoverable: retryable,
      })

      if (!retryable || attempt === maxAttempts || opts.signal?.aborted) break

      const waitMs = retryAfterMs ?? BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 250
      const nextModel = modelForAttempt(attempt + 1)
      const switching = nextModel !== modelForAttempt(attempt) && MODELS.length > 1
      opts.onWarning?.({
        code: code === 'rate_limit' ? 'rate_limit' : 'retrying',
        message:
          (code === 'rate_limit'
            ? `Rate limited. Retrying in ${(waitMs / 1000).toFixed(1)}s`
            : `Gemini was ${code}. Retrying in ${(waitMs / 1000).toFixed(1)}s`) +
          (switching ? ` on ${nextModel}.` : '.'),
      })
      await sleep(waitMs)
    }
  }

  throw lastError ?? new LlmError('unavailable', `${opts.name}: exhausted retries`)
}

function hintedDelay(detail?: string): number | undefined {
  if (!detail) return undefined
  const m = /"?retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/i.exec(detail)
  return m ? Number(m[1]) * 1000 : undefined
}

type ParseOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; kind: 'malformed' | 'schema'; problem: string }

function tryParseAndValidate<T>(schema: z.ZodType<T>, text: string): ParseOutcome<T> {
  const cleaned = stripFences(text)
  if (!cleaned) return { ok: false, kind: 'malformed', problem: 'empty response' }

  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch (e) {
    return { ok: false, kind: 'malformed', problem: `not valid JSON: ${(e as Error).message}` }
  }

  const result = schema.safeParse(json)
  if (result.success) return { ok: true, value: result.data }

  const problem = result.error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ')
  return { ok: false, kind: 'schema', problem }
}

async function attemptRepair<T>(
  opts: CallOptions<T>,
  responseSchema: Schema,
  badOutput: string,
  problem: string,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    const raw = await generateJson({
      system: renderPrompt('repair', {}),
      user: renderPrompt('repair-user', {
        original_task: opts.user.slice(0, 2000),
        bad_output: badOutput.slice(0, 2000),
        problem,
      }),
      schema: responseSchema,
      temperature: 0,
      model: MODELS[0],
      signal: opts.signal,
    })
    const parsed = tryParseAndValidate(opts.schema, raw.text)
    return parsed.ok ? { ok: true, value: parsed.value } : { ok: false }
  } catch {
    return { ok: false }
  }
}
