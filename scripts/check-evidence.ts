import { JsonTalentPool } from '../server/talent/JsonTalentPool.ts'
import { verifyEvidence } from '../server/talent/evidence.ts'
import type { Evidence } from '../shared/schemas.ts'

const pool = new JsonTalentPool()
const p = pool.byIds(['p01'])[0]
console.log(`subject: ${p.name} · ${p.years_experience}y · ${p.location} · ${p.current_company} (${p.current_company_type})`)
console.log(`  skills: ${p.skills.join(', ')}`)
console.log(`  past:   ${p.past_companies.map(c => `${c.company}/${c.title}`).join(', ')}\n`)

const cases: Array<[Evidence, boolean, string]> = [
  [{ field: 'skills', value: 'AWS RDS', why: 'x' }, true,  'real skill, exact'],
  [{ field: 'skills', value: 'RDS', why: 'x' }, true,  'real skill, partial'],
  [{ field: 'skills', value: 'Kubernetes', why: 'x' }, false, 'HALLUCINATED skill'],
  [{ field: 'years_experience', value: '4 years', why: 'x' }, true,  'correct years'],
  [{ field: 'years_experience', value: '9 years', why: 'x' }, false, 'WRONG years'],
  [{ field: 'location', value: 'Bangalore', why: 'x' }, true,  'correct location'],
  [{ field: 'location', value: 'Berlin', why: 'x' }, false, 'WRONG location'],
  [{ field: 'current_company', value: 'NimbusPay', why: 'x' }, true,  'real employer'],
  [{ field: 'current_company', value: 'Google', why: 'x' }, false, 'HALLUCINATED employer'],
  [{ field: 'past_companies', value: 'Freshworks', why: 'x' }, true,  'real past company'],
  [{ field: 'past_companies', value: 'Stripe', why: 'x' }, false, 'HALLUCINATED past company'],
  [{ field: 'current_company_type', value: 'startup', why: 'x' }, true,  'correct type'],
  [{ field: 'current_company_type', value: 'enterprise', why: 'x' }, false, 'WRONG type'],
  [{ field: 'education', value: 'IISc', why: 'x' }, true,  'real education substring'],
  [{ field: 'education', value: 'IIT Bombay', why: 'x' }, false, 'HALLUCINATED education'],
  [{ field: 'summary', value: 'payments', why: 'x' }, false, 'plausible but NOT in summary'],
]

let pass = 0, fail = 0
for (const [ev, expected, label] of cases) {
  const { kept } = verifyEvidence(p, [ev])
  const got = kept.length === 1
  const ok = got === expected
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${got ? 'kept   ' : 'dropped'}  ${ev.field}="${ev.value}"  (${label})`)
}

const mixed = verifyEvidence(p, [cases[0][0], cases[2][0], cases[5][0], cases[8][0]])
console.log(`\n  mixed batch → kept ${mixed.kept.length}, dropped ${mixed.dropped.length}`)
const mixedOk = mixed.kept.length === 2 && mixed.dropped.length === 2
mixedOk ? pass++ : fail++
console.log(`  ${mixedOk ? 'PASS' : 'FAIL'}  partial verification keeps the good, drops the invented`)

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'}  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
