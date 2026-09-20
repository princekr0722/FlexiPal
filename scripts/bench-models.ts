import { JsonTalentPool } from '../server/talent/JsonTalentPool.ts'
import { toGeminiSchema } from '../server/llm/schema.ts'
import { renderPrompt } from '../server/llm/prompts.ts'
import { CriteriaExtraction } from '../shared/schemas.ts'
import { GoogleGenAI } from '@google/genai'

const pool = new JsonTalentPool()
const v = pool.vocabulary()
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const schema = toGeminiSchema(CriteriaExtraction)
const QUERY = 'RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore'

const system = renderPrompt('extract-criteria', {})
const user = renderPrompt('extract-criteria-user', {
  query: QUERY, skills: v.skills.join(', '), skill_count: v.skills.length,
  locations: v.locations.join(', '), company_types: v.companyTypes.join(', '), pool_size: v.size,
})

for (const model of ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest']) {
  const t0 = Date.now()
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      config: { systemInstruction: system, responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    })
    const ms = Date.now() - t0
    const parsed = CriteriaExtraction.safeParse(JSON.parse(res.text!))
    if (!parsed.success) {
      console.log(`${model.padEnd(20)} ${String(ms).padStart(6)}ms  SCHEMA FAIL: ${parsed.error.issues[0].message}`)
      continue
    }
    const d = parsed.data
    const q = pool.query(d.filters)
    console.log(`${model.padEnd(20)} ${String(ms).padStart(6)}ms  OK`)
    console.log(`   req=${JSON.stringify(d.filters.required_skills)} yoe=${d.filters.years_experience.min}-${d.filters.years_experience.max} loc=${JSON.stringify(d.filters.locations)} co=${JSON.stringify(d.filters.company_types)}`)
    console.log(`   rubric: ${d.rubric.criteria.length} criteria [${d.rubric.criteria.map(c=>c.label+'/'+c.weight).join(', ')}]`)
    console.log(`   → ${q.strictCount} strict matches, ${q.profiles.length} final`)
    console.log(`   "${d.interpretation}"`)
  } catch (e) {
    console.log(`${model.padEnd(20)} ${String(Date.now()-t0).padStart(6)}ms  ERROR: ${(e as Error).message.slice(0,140)}`)
  }
  console.log()
}
