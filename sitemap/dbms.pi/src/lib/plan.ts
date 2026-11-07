// dbms.pi 요금제 서버 공용(sql/035) — 연결 현재 요금제·한도(요청당 1번, React cache), 요금표(60초 캐시), AI 튜닝 월·수동 수집 하루 사용 횟수, Pi 원화 시세(2초·5분 캐시).
//  기능 권한 검사는 link/client.ts requireLink(req, linkId, perm) 가 이 curPlan 으로 한다. 원화는 표시·환산 기준일 뿐(결제·검증은 Pi 금액)
import 'server-only'
import { cache } from 'react'
import { db } from './api'
import { pickCur, type Cur, type PlanCd, type PlanTerm } from './plan-rules'
import { AUTO_ACTOR } from './perf/auto'

export type FeeRow = {
  plan_cd: PlanCd
  prd_cd: 'M' | 'Y'
  krw_amt: number
  use_mon_cnt: number
  ai_mon_cnt: number
  keep_day_cnt: number
  clct_day_cnt: number | null
  use_yn: string
}
// 한도 — 같은 요금제면 M·Y 같은 값(sql/035). 요금표 행이 비면 FREE 기본값(sql/035 시드와 같음) — 테이블 자체가 없으면(035 미적용) throw → 503, 배포는 035 적용 뒤에만
export type Limits = { aiMon: number; keepDays: number; clctDay: number | null }
export type CurPlan = Cur & Limits
const FREE_LIMITS: Limits = { aiMon: 0, keepDays: 7, clctDay: 3 }

const FEE_TTL_MS = 60_000
let fees: { at: number; rows: FeeRow[] } | null = null
// 판매 중지(use_yn N) 행도 돌려준다 — 이미 결제한 연결의 한도는 유지, 화면·견적은 use_yn = Y 만
export async function feeRows(): Promise<FeeRow[]> {
  if (fees && Date.now() - fees.at < FEE_TTL_MS) return fees.rows
  const { data, error } = await db()
    .from('dbm_fee_plan')
    .select('plan_cd, prd_cd, krw_amt, use_mon_cnt, ai_mon_cnt, keep_day_cnt, clct_day_cnt, use_yn')
    .eq('del_yn', 'N')
    .order('sort_seq')
  if (error) throw error
  const rows = (data ?? []).map((r) => ({ ...r, krw_amt: Number(r.krw_amt) }) as FeeRow)
  fees = { at: Date.now(), rows }
  return rows
}
export const limitsOf = (rows: FeeRow[], plan: PlanCd): Limits => {
  const f = rows.find((r) => r.plan_cd === plan)
  return f ? { aiMon: f.ai_mon_cnt, keepDays: f.keep_day_cnt, clctDay: f.clct_day_cnt } : FREE_LIMITS
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// 연결 기간 행(지금 이후 끝나는 것) — 현재 요금제 판정·업그레이드 견적 공용
export const planTerms = cache(async (linkId: string): Promise<PlanTerm[]> => {
  if (!UUID.test(linkId)) return []
  const { data, error } = await db()
    .from('dbm_lnk_plan')
    .select('plan_cd, prd_cd, strt_dtm, end_dtm, grnt_rsn_cd')
    .eq('lnk_id', linkId)
    .eq('del_yn', 'N')
    .gt('end_dtm', new Date().toISOString())
  if (error) throw error
  return (data ?? []) as PlanTerm[]
})

// 현재 요금제 + 한도 — 요청 안 여러 번 불러도 1번(R-P2). 기간 조회와 요금표는 병렬(R-P1)
export const curPlan = cache(async (linkId: string): Promise<CurPlan> => {
  const [terms, rows] = await Promise.all([planTerms(linkId), feeRows()])
  const cur = pickCur(terms, Date.now())
  return { ...cur, ...limitsOf(rows, cur.plan) }
})

const utcDay = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
}
const utcMonth = () => {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
}

// 오늘(UTC) 수동 성능 수집 횟수 — 삭제 행 포함(지워서 다시 늘리기 방지), 자동 수집(regr_id SYSTEM, sql/021) 제외. 존재 수만(head)
export async function clctUsedToday(linkId: string): Promise<number> {
  if (!UUID.test(linkId)) return 0
  const { count, error } = await db()
    .from('dbm_prf_clct')
    .select('clct_id', { count: 'exact', head: true })
    .eq('lnk_id', linkId)
    .neq('regr_id', AUTO_ACTOR)
    .gte('reg_dtm', utcDay())
  if (error) throw error
  return count ?? 0
}

// 이번 달(UTC) AI 튜닝 권고 횟수 — engn_cd AI, 삭제 행 포함
export async function aiUsedMonth(linkId: string): Promise<number> {
  if (!UUID.test(linkId)) return 0
  const { count, error } = await db()
    .from('dbm_sql_tun')
    .select('tun_id', { count: 'exact', head: true })
    .eq('lnk_id', linkId)
    .eq('engn_cd', 'AI')
    .gte('reg_dtm', utcMonth())
  if (error) throw error
  return count ?? 0
}

// 1 Pi 의 원화·달러 시세 — 외부 호출 2초 + 성공값 5분 캐시(R-P4, seminar.pi plan.ts piRates 와 같은 규칙). 실패 = null(추정 금지 → 견적 503)
const PRICE_TTL_MS = 5 * 60 * 1000
export type PiRates = { krw: number; usd: number | null }
let price: (PiRates & { at: number }) | null = null
export async function piRates(): Promise<PiRates | null> {
  const now = Date.now()
  if (price && now - price.at < PRICE_TTL_MS) return price
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=krw,usd', {
    cache: 'no-store',
    signal: AbortSignal.timeout(2_000),
  }).catch(() => null)
  const j = r?.ok ? ((await r.json().catch(() => null)) as { 'pi-network'?: { krw?: unknown; usd?: unknown } } | null) : null
  const krw = Number(j?.['pi-network']?.krw)
  const usd = Number(j?.['pi-network']?.usd)
  if (!(krw > 0) || !Number.isFinite(krw)) {
    console.error('[plan] Pi 시세 조회 실패', r?.status ?? 'network')
    return null
  }
  price = { krw, usd: usd > 0 && Number.isFinite(usd) ? usd : null, at: now }
  return price
}
