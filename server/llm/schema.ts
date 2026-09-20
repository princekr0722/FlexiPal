import { Type } from '@google/genai'
import type { Schema } from '@google/genai'
import { z } from 'zod'

type JsonSchema = Record<string, unknown>

/**
 * Gemini accepts an OpenAPI-flavoured subset of JSON Schema, not the real thing.
 * The important divergence: it has no `anyOf`-with-null idiom, it wants an
 * explicit `nullable: true`. zod emits the former for `.nullable()`, so passing
 * zod's JSON Schema straight through silently breaks every optional number.
 * This converts one to the other, and drops keywords Gemini rejects.
 */
export function toGeminiSchema(schema: z.ZodType): Schema {
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'output',
    reused: 'inline',
  }) as JsonSchema
  return convert(json)
}

function convert(node: JsonSchema): Schema {
  // `.nullable()` → anyOf: [X, {type: 'null'}]. Collapse it.
  const anyOf = node.anyOf as JsonSchema[] | undefined
  if (Array.isArray(anyOf)) {
    const nonNull = anyOf.filter((b) => b.type !== 'null')
    const nullable = nonNull.length !== anyOf.length
    if (nonNull.length === 1) {
      const inner = convert({ ...nonNull[0], description: node.description ?? nonNull[0].description })
      return nullable ? { ...inner, nullable: true } : inner
    }
    return { anyOf: nonNull.map(convert), ...(nullable ? { nullable: true } : {}) } as Schema
  }

  // union type arrays: ['string','null']
  let rawType = node.type
  let nullable = false
  if (Array.isArray(rawType)) {
    const types = (rawType as string[]).filter((t) => t !== 'null')
    nullable = types.length !== rawType.length
    rawType = types[0]
  }

  const out: Schema = {}
  if (node.description) out.description = String(node.description)
  if (nullable) out.nullable = true

  if (node.enum) {
    out.type = Type.STRING
    out.enum = (node.enum as unknown[]).map(String)
    return out
  }

  switch (rawType) {
    case 'object': {
      out.type = Type.OBJECT
      const props = (node.properties ?? {}) as Record<string, JsonSchema>
      const keys = Object.keys(props)
      out.properties = Object.fromEntries(keys.map((k) => [k, convert(props[k])]))
      // Every field is required: a partial object is harder to repair than a
      // wrong one, and the model fills gaps more honestly when forced to.
      out.required = (node.required as string[] | undefined) ?? keys
      // Nudges the model to emit fields in declaration order, which keeps
      // reasoning-shaped fields (interpretation, reason) before their payload.
      out.propertyOrdering = keys
      return out
    }
    case 'array': {
      out.type = Type.ARRAY
      out.items = convert((node.items ?? {}) as JsonSchema)
      if (typeof node.minItems === 'number') out.minItems = String(node.minItems)
      if (typeof node.maxItems === 'number') out.maxItems = String(node.maxItems)
      return out
    }
    case 'integer':
      out.type = Type.INTEGER
      break
    case 'number':
      out.type = Type.NUMBER
      break
    case 'boolean':
      out.type = Type.BOOLEAN
      break
    default:
      out.type = Type.STRING
  }
  if (typeof node.minimum === 'number') out.minimum = node.minimum
  if (typeof node.maximum === 'number') out.maximum = node.maximum
  return out
}
