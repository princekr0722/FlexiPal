import { JsonTalentPool } from '../server/talent/JsonTalentPool.ts'
import { EMPTY_FILTERS, type ObjectiveFilters } from '../shared/schemas.ts'

const pool = new JsonTalentPool()
const v = pool.vocabulary()
console.log(`pool: ${v.size} profiles · ${v.skills.length} distinct skills · ${v.locations.length} locations\n`)

const f = (o: Partial<ObjectiveFilters>): ObjectiveFilters => ({ ...structuredClone(EMPTY_FILTERS), ...o })
let pass = 0, fail = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`)
  cond ? pass++ : fail++
}

// ── the assignment's own example query ──────────────────────────────
console.log('1. "RDS developers, 4-7 years, worked at startups, Bangalore"')
const r1 = pool.query(f({
  required_skills: ['AWS RDS'],
  years_experience: { min: 4, max: 7 },
  locations: ['Bangalore'],
  company_types: ['startup'],
}))
console.log(`   strict=${r1.strictCount} final=${r1.profiles.length} relaxations=${r1.relaxations.length}`)
r1.profiles.slice(0, 6).forEach(p => console.log(`     ${p.id} ${p.name} · ${p.years_experience}y · ${p.location} · ${p.current_company_type} · [${p.skills.join(', ')}]`))
check('every result actually has an RDS skill', r1.profiles.every(p => p.skills.some(s => /rds/i.test(s))))
check('every result inside relaxed yoe band', r1.profiles.every(p => p.years_experience >= 2 && p.years_experience <= 9))

// ── forgiving skill spelling: "RDS" must find "AWS RDS" ─────────────
console.log('\n2. Loose spelling — recruiter types "RDS", pool says "AWS RDS"')
const loose = pool.query(f({ required_skills: ['RDS'] }))
const exact = pool.query(f({ required_skills: ['AWS RDS'] }))
check('"RDS" matches same set as "AWS RDS"', loose.profiles.length === exact.profiles.length, `${loose.profiles.length} vs ${exact.profiles.length}`)
const nodeLoose = pool.query(f({ required_skills: ['nodejs'] }))
check('"nodejs" matches "Node.js"', nodeLoose.profiles.length > 0, `${nodeLoose.profiles.length} found`)

// ── impossible search must relax, not dead-end ──────────────────────
console.log('\n3. Deliberately impossible search')
const r3 = pool.query(f({
  required_skills: ['AWS RDS', 'Kubernetes', 'Rust'],
  years_experience: { min: 9, max: 10 },
  locations: ['Amsterdam'],
  company_types: ['agency'],
  title_keywords: ['Principal'],
}))
console.log(`   strict=${r3.strictCount} final=${r3.profiles.length}`)
r3.relaxations.forEach(x => console.log(`     ↳ [${x.rung}] ${x.detail}`))
check('strict really was empty', r3.strictCount === 0)
check('relaxed to at least 5', r3.profiles.length >= 5, `got ${r3.profiles.length}`)
check('reported every rung it took', r3.relaxations.length > 0)

// ── exclusions must never be relaxed away ──────────────────────────
console.log('\n4. Exclusions are inviolable')
const r4 = pool.query(f({
  required_skills: ['AWS RDS', 'Kubernetes', 'Rust', 'Scala'],
  years_experience: { min: 12, max: 13 },
  exclude: { skills: ['Java'], company_types: ['agency'] },
}))
console.log(`   strict=${r4.strictCount} final=${r4.profiles.length} after ${r4.relaxations.length} rungs`)
check('no excluded skill leaked in', !r4.profiles.some(p => p.skills.some(s => /^java$/i.test(s))))
check('no excluded company type leaked in', !r4.profiles.some(p => p.current_company_type === 'agency'))

// ── bottleneck diagnosis for the empty state ───────────────────────
console.log('\n5. Bottleneck diagnosis')
const b = pool.bottleneck(f({ required_skills: ['Rust', 'Scala', 'Haskell'], locations: ['Berlin'] }))
console.log(`   dominant reason: ${b?.reason} (${b?.count}/48 eliminated)`)
check('bottleneck identified', b !== null)

// ── no filters = whole pool ────────────────────────────────────────
console.log('\n6. Empty filters')
const r6 = pool.query(f({}))
check('returns entire pool untouched', r6.profiles.length === 48 && r6.relaxations.length === 0, `${r6.profiles.length}`)

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'}  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
