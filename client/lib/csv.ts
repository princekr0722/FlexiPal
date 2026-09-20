import type { Profile, VerifiedScore } from '../../shared/schemas.ts'

const COLUMNS = [
  'rank', 'id', 'name', 'current_title', 'current_company', 'company_type',
  'years_experience', 'location', 'education', 'skills',
  'score', 'verdict', 'rationale', 'evidence', 'concerns', 'recruiter_mark',
] as const

/**
 * Escapes one field. The leading-quote guard matters: these files get opened in
 * Excel, and a value starting with =, +, - or @ is treated as a formula there.
 */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function shortlistToCsv(
  rows: Array<{ profile: Profile; score?: VerifiedScore }>,
  verdicts: Record<string, 'match' | 'reject'>,
): string {
  const lines = [COLUMNS.join(',')]

  rows.forEach(({ profile, score }, i) => {
    lines.push([
      i + 1,
      profile.id,
      profile.name,
      profile.current_title,
      profile.current_company,
      profile.current_company_type,
      profile.years_experience,
      profile.location,
      profile.education,
      profile.skills.join('; '),
      score?.score ?? '',
      score?.verdict ?? 'unscored',
      score?.rationale ?? '',
      score ? score.evidence.map((e) => `${e.field}: ${e.value}`).join('; ') : '',
      score ? score.concerns.join('; ') : '',
      verdicts[profile.id] ?? '',
    ].map(cell).join(','))
  })

  // BOM so Excel reads the accented names as UTF-8 rather than mojibake.
  return `﻿${lines.join('\r\n')}\r\n`
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function csvFilename(query: string): string {
  const slug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  const date = new Date().toISOString().slice(0, 10)
  return `flexipal-${slug || 'shortlist'}-${date}.csv`
}
