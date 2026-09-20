import { toGeminiSchema } from '../server/llm/schema.ts'
import { CriteriaExtraction, ScoreBatch, CriteriaUpdate } from '../shared/schemas.ts'

const ex = toGeminiSchema(CriteriaExtraction)
const yoe = (ex.properties as any).filters.properties.years_experience
console.log('nullable collapse (years_experience.min):', JSON.stringify(yoe.properties.min))
console.log('  → no anyOf:', !('anyOf' in yoe.properties.min), '| nullable:', yoe.properties.min.nullable === true)

const enumNode = (ex.properties as any).filters.properties.company_types.items
console.log('enum:', JSON.stringify(enumNode))

const sb = toGeminiSchema(ScoreBatch)
const evid = (sb.properties as any).scores.items.properties.evidence
console.log('evidence items/min/max:', evid.minItems, evid.maxItems, '| field enum len:',
  evid.items.properties.field.enum.length)

const upd = toGeminiSchema(CriteriaUpdate)
console.log('CriteriaUpdate top keys ordered:', (upd as any).propertyOrdering)

// exhaustive scan: nothing unconvertible should survive anywhere
const bad: string[] = []
const banned = ['$schema', 'additionalProperties', '$ref', '$defs', 'allOf', 'oneOf', 'exclusiveMinimum', 'const']
function walk(n: any, path: string) {
  if (!n || typeof n !== 'object') return
  for (const k of Object.keys(n)) {
    if (banned.includes(k)) bad.push(`${path}.${k}`)
    if (k === 'anyOf') bad.push(`${path}.anyOf(uncollapsed)`)
    walk(n[k], `${path}.${k}`)
  }
}
for (const [name, s] of [['CriteriaExtraction', ex], ['ScoreBatch', sb], ['CriteriaUpdate', upd]] as const) walk(s, name)
console.log('\nbanned keywords remaining:', bad.length === 0 ? 'NONE ✓' : bad)
