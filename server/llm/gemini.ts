import { GoogleGenAI } from '@google/genai'
import type { Schema } from '@google/genai'
import { LlmError } from './errors.ts'

/**
 * A chain, not a single model. Free-tier Gemini returns 503 "high demand" on
 * popular models often enough that retrying the same one is frequently
 * pointless — measured on this key, most 3.x flash models were unavailable
 * while the lite variants answered fine. Attempt N uses MODELS[N-1], so a retry
 * is also a failover. Ordered fastest-acceptable first: the refinement loop is
 * interactive, and a 23s round makes it unusable.
 */
// Ordered by measured reliability, not by capability. On this key gemini-3.8-flash
// returned 503 on 2 of 6 probes at ~7s median, and gemini-3.5-flash answered in
// ~23s for a batch of 8 — neither makes a good interactive default. Override with
// GEMINI_MODEL (comma-separated) to use them: GEMINI_MODEL=gemini-3.8-flash,gemini-3.5-flash-lite
const DEFAULT_CHAIN = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash']

export const MODELS: string[] = process.env.GEMINI_MODEL
  ? process.env.GEMINI_MODEL.split(',').map((m) => m.trim()).filter(Boolean)
  : DEFAULT_CHAIN

/** The model to use on a given 1-based attempt; the last one repeats. */
export function modelForAttempt(attempt: number): string {
  return MODELS[Math.min(attempt - 1, MODELS.length - 1)]
}

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30_000)

let client: GoogleGenAI | null = null

export function hasApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new LlmError('no_key', 'GEMINI_API_KEY is not set', { recoverable: false })
  }
  client ??= new GoogleGenAI({ apiKey })
  return client
}

export interface RawRequest {
  system: string
  user: string
  schema: Schema
  temperature?: number
  model?: string
  /** Caller-side cancellation, combined with our own timeout. */
  signal?: AbortSignal
}

export interface RawResponse {
  text: string
  model: string
}

/** One Gemini call. No retries, no validation — those live in call.ts. */
export async function generateJson(req: RawRequest): Promise<RawResponse> {
  const ai = getClient()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const signal = req.signal
    ? AbortSignal.any([controller.signal, req.signal])
    : controller.signal

  const model = req.model ?? MODELS[0]

  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      config: {
        systemInstruction: req.system,
        responseMimeType: 'application/json',
        responseSchema: req.schema,
        temperature: req.temperature ?? 0.2,
        abortSignal: signal,
      },
    })

    const text = res.text
    if (!text || !text.trim()) {
      throw new LlmError('blocked', 'Gemini returned an empty candidate', {
        detail: res.promptFeedback ? JSON.stringify(res.promptFeedback) : undefined,
      })
    }
    return { text, model }
  } finally {
    clearTimeout(timer)
  }
}

export const modelName = MODELS.join(' → ')
