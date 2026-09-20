import { JsonTalentPool } from '../server/talent/JsonTalentPool.ts'
import { toGeminiSchema } from '../server/llm/schema.ts'
import { renderPrompt } from '../server/llm/prompts.ts'
import { ScoreBatch, EMPTY_FILTERS } from '../shared/schemas.ts'
import { verifyScore } from '../server/talent/evidence.ts'
import { GoogleGenAI } from '@google/genai'

const pool = new JsonTalentPool()
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const schema = toGeminiSchema(ScoreBatch)

const rubric = {
  role_summary: 'A backend engineer who can own an RDS-backed payments system at a startup.',
  criteria: [
    { id: 'rds', label: 'Depth in AWS RDS', description: 'Hands-on with RDS/Postgres at production scale.', weight: 5, signals_of_strength: ['RDS in skills', 'database-heavy summary'], signals_of_weakness: ['no database skills'] },
    { id: 'startup', label: 'Startup environment fit', description: 'Has thrived at early-stage companies.', weight: 4, signals_of_strength: ['startup current or past'], signals_of_weakness: ['only enterprise'] },
    { id: 'payments', label: 'Payments exposure', description: 'Has built payments or fintech infrastructure.', weight: 3, signals_of_strength: ['payments in summary'], signals_of_weakness: [] },
  ],
  dealbreakers: [],
}

const batch = pool.query({ ...EMPTY_FILTERS, required_skills: ['AWS RDS'], locations: ['Bangalore'] }).profiles.slice(0, 8)
const forPrompt = (p: any) => ({ id: p.id, current_title: p.current_title, years_experience: p.years_experience, location: p.location, current_company: p.current_company, current_company_type: p.current_company_type, skills: p.skills, past_companies: p.past_companies, education: p.education, summary: p.summary })

for (const model of ['gemini-3.5-flash-lite', 'gemini-3.5-flash']) {
  const t0 = Date.now()
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: renderPrompt('score-profiles-user', { rubric: JSON.stringify(rubric, null, 2), count: batch.length, profiles: JSON.stringify(batch.map(forPrompt), null, 2) }) }] }],
      config: { systemInstruction: renderPrompt('score-profiles', {}), responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
    })
    const ms = Date.now() - t0
    const parsed = ScoreBatch.safeParse(JSON.parse(res.text!))
    if (!parsed.success) { console.log(`${model}  ${ms}ms  SCHEMA FAIL ${parsed.error.issues[0].message}`); continue }
    const byId = new Map(batch.map(p => [p.id, p]))
    const verified = parsed.data.scores.filter(s => byId.has(s.profile_id)).map(s => verifyScore(byId.get(s.profile_id)!, s))
    const spread = Math.max(...verified.map(s=>s.score)) - Math.min(...verified.map(s=>s.score))
    const badEv = verified.reduce((n,s)=>n+s.unverified_evidence,0)
    const totalEv = verified.reduce((n,s)=>n+s.evidence.length,0)+badEv
    console.log(`\n══ ${model}  ${ms}ms  ${verified.length}/${batch.length} scored · spread ${spread} · evidence ${totalEv-badEv}/${totalEv} verified`)
    verified.sort((a,b)=>b.score-a.score).slice(0,3).forEach(s => {
      const p = byId.get(s.profile_id)!
      console.log(`  ${s.score} ${s.verdict.padEnd(8)} ${p.name}`)
      console.log(`     "${s.rationale}"`)
      console.log(`     evidence: ${s.evidence.map(e=>`${e.field}="${e.value}"`).join(' · ')}${s.unverified_evidence?`  [${s.unverified_evidence} DISCARDED]`:''}`)
      if (s.concerns.length) console.log(`     concerns: ${s.concerns.join(' · ')}`)
    })
  } catch (e) { console.log(`${model}  ${Date.now()-t0}ms  ERROR ${(e as Error).message.slice(0,120)}`) }
}
