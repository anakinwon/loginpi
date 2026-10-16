// 감사 이력 변경 전후 비교 — 바뀐 항목만 추출(시스템 컬럼·버전은 제외), 화면 표시용
const SKIP = new Set(['regr_id', 'reg_dtm', 'modr_id', 'mod_dtm', 'ver_no'])

export interface DiffRow {
  key: string
  before: unknown
  after: unknown
}

export function auditDiff(bfr: Record<string, unknown> | null, aftr: Record<string, unknown> | null): DiffRow[] {
  const b = bfr ?? {}
  const a = aftr ?? {}
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !SKIP.has(k))
  return keys
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ key: k, before: b[k] ?? null, after: a[k] ?? null }))
}
