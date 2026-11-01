// 사이트 연결(dbms.pi ↔ schema.pi, BUILD_CONTRACT §2) 순수 규칙 — 토큰 생성·해시, EXPLAIN 대상 판정(SELECT/WITH 1문장), 호스트 가림, 토큰별 분당 호출 상한
// 서버·단위 시험 공용(server-only 없음) · 시험 : pnpm test (test/link-rules.test.ts)
import { createHash, randomBytes } from 'node:crypto'
import { classify, maskSql } from '../modelpi/sql-split.ts'

export const TKN_RE = /^slk_[A-Za-z0-9_-]{43}$/
export const newToken = () => `slk_${randomBytes(32).toString('base64url')}`
export const tokenHash = (t: string) => createHash('sha256').update(t).digest('hex')
export const tokenPfx = (t: string) => t.slice(0, 8)
// Authorization 헤더 → 토큰 원문(형식이 다르면 null)
export function bearerOf(h: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(h ?? '')
  return m && TKN_RE.test(m[1]) ? m[1] : null
}

export const EXPLAIN_MAX = 20_000
// 쓰기·DDL·세션 변경 단어(문자열·주석 가린 뒤) — classify 가 못 보는 것까지 한 번 더(fail-closed, 같은 이름 칼럼은 따옴표 식별자로)
const DENY = /\b(INSERT|UPDATE|DELETE|MERGE|INTO|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|PREPARE|LOCK|VACUUM|ANALYZE|ANALYSE|REINDEX|CLUSTER|REFRESH|SET|RESET|LISTEN|NOTIFY|DISCARD|COMMIT|ROLLBACK|BEGIN|SAVEPOINT)\b/i
// EXPLAIN 대상 판정 — SELECT/WITH 1문장만(끝의 ; 하나는 허용), 아니면 null. 반환 = 끝 ; 를 뗀 원문
export function explainTarget(sql: string): string | null {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > EXPLAIN_MAX) return null
  const mask = maskSql(sql, 'PG')
  const semi = mask.indexOf(';')
  if (semi >= 0 && mask.slice(semi + 1).trim()) return null // 두 문장 이상
  const txt = (semi >= 0 ? sql.slice(0, semi) : sql).trim()
  const m = (semi >= 0 ? mask.slice(0, semi) : mask).trim()
  const w = (/^[\s(]*([A-Za-z]+)/.exec(m)?.[1] ?? '').toUpperCase()
  if (w !== 'SELECT' && w !== 'WITH') return null
  if (DENY.test(m)) return null
  const code = maskSql(txt, 'PG', true)
  return classify({ mask: maskSql(txt, 'PG'), code }, 'PG') === 'READ' ? txt : null
}

// 호스트 가림(목록 표시용) — db.abcd.supabase.co → db.***.supabase.co, IPv4 → 앞 1칸만
export function maskHost(h: string | null): string | null {
  if (!h) return null
  const a = h.split('.')
  if (/^\d+(\.\d+){3}$/.test(h)) return `${a[0]}.***`
  if (a.length >= 3) return `${a[0]}.***.${a.slice(-2).join('.')}`
  return `${h.slice(0, 2)}***`
}

// 토큰별 분당 호출 상한(고정 1분 창) — ponytail: 인스턴스 메모리 버킷(Vercel 인스턴스 간 공유 없음 → 실제 상한 = 60 × 인스턴스 수), 엄격해야 하면 DB·Redis 카운터
export const RATE_PER_MIN = 60
type Win = { w: number; n: number }
export function rateOk(m: Map<string, Win>, key: string, now = Date.now(), limit = RATE_PER_MIN): boolean {
  const b = m.get(key)
  if (!b || now - b.w >= 60_000) {
    if (m.size > 10_000) for (const [k, v] of m) if (now - v.w >= 60_000) m.delete(k)
    m.set(key, { w: now, n: 1 })
    return true
  }
  return ++b.n <= limit
}
