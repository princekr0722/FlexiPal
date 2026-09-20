import { openDb } from '../server/db/index.ts'
import { SessionStore, MESSAGE_WINDOW } from '../server/db/session.ts'
import { EMPTY_FILTERS } from '../shared/schemas.ts'

const store = new SessionStore(openDb(':memory:'))
let pass = 0, fail = 0
const check = (l: string, c: boolean, e = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${e ? ' — ' + e : ''}`); c ? pass++ : fail++ }

const s = store.create('RDS devs, 4-7y, Bangalore')
check('session created active at round 0', s.status === 'active' && s.round === 0)

const rubric = { role_summary: 'r', criteria: [{ id: 'c1', label: 'l', description: 'd', weight: 5, signals_of_strength: [], signals_of_weakness: [] }], dealbreakers: [] }
store.saveCriteria(s.id, 0, { filters: EMPTY_FILTERS, rubric }, 'extracted')
const v1 = { ...EMPTY_FILTERS, required_skills: ['AWS RDS'] }
store.saveCriteria(s.id, 1, { filters: v1, rubric }, 'refined', [{ target: 'filters', path: 'required_skills', from: '[]', to: 'AWS RDS', reason: 'asked' }])
check('currentCriteria returns the LATEST version', store.currentCriteria(s.id)?.filters.required_skills[0] === 'AWS RDS')
check('history keeps every version', store.criteriaHistory(s.id).length === 2)

store.addVerdict(s.id, 1, 'p01', 'reject', 'chat', 'too junior')
store.addVerdict(s.id, 1, 'p04', 'match', 'button')
store.addVerdict(s.id, 2, 'p07', 'reject', 'chat', 'wrong domain')
const vs = store.verdicts(s.id)
check('verdict ledger accumulates across rounds', vs.length === 3 && vs[0].note === 'too junior')

// message window
for (let i = 1; i <= 55; i++) store.addMessage(s.id, 1, i % 2 ? 'recruiter' : 'assistant', `msg ${i}`)
check('total messages stored', store.messageCount(s.id) === 55, `${store.messageCount(s.id)}`)
const win = store.recentMessages(s.id)
check(`window capped at ${MESSAGE_WINDOW}`, win.length === MESSAGE_WINDOW, `${win.length}`)
check('window is oldest-first', win[0].content === 'msg 16' && win.at(-1)!.content === 'msg 55', `${win[0].content} … ${win.at(-1)!.content}`)

const toSum = store.messagesToSummarize(s.id, 0)
check('aged-out messages identified', toSum.length === 15 && toSum[0].content === 'msg 1' && toSum.at(-1)!.content === 'msg 15', `${toSum.length} msgs`)

store.saveSummary(s.id, 'Recruiter rejected agency backgrounds.', toSum.at(-1)!.id)
check('summary round-trips', store.summary(s.id)?.text.startsWith('Recruiter rejected'))
check('no double-summarising already-covered messages', store.messagesToSummarize(s.id, store.summary(s.id)!.covers_through_msg_id).length === 0)

store.saveSummary(s.id, 'x'.repeat(20000), 999)
check('summary capped at 15k chars', store.summary(s.id)!.text.length === 15000, `${store.summary(s.id)!.text.length}`)

const r = store.bumpRound(s.id)
store.freeze(s.id)
const f = store.get(s.id)!
check('round bumps and freeze sticks', r === 1 && f.status === 'frozen' && f.frozen_at !== null)

// short session must not summarise anything
const s2 = store.create('q2')
for (let i = 0; i < 10; i++) store.addMessage(s2.id, 0, 'recruiter', `m${i}`)
check('short session summarises nothing', store.messagesToSummarize(s2.id, 0).length === 0)
check('sessions are isolated', store.recentMessages(s2.id).length === 10 && store.verdicts(s2.id).length === 0)

console.log(`\n${fail === 0 ? '✓ ALL PASS' : '✗ FAILURES'}  ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
