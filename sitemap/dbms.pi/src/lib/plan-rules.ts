// dbms.pi 요금제 순수 규칙(sql/035, 계획 floating-hopping-curry) — 요금제 등급·기능 권한표·업그레이드 일할계산·원화→Pi 환산·묶음 할인·지난 결제 판정.
//  화면·서버 공용(node 모듈 없음 — 견적 서명은 plan-quote.ts). 시험 : node --test src/lib/plan-rules.test.mjs
//  원칙 : 원화는 표시·환산 기준일 뿐, 결제·검증은 Pi 금액만(memory krw-display-only-pay-pi)

export const PLANS = ['FREE', 'D1', 'D2', 'D3'] as const
export type PlanCd = (typeof PLANS)[number]
export type PaidPlan = Exclude<PlanCd, 'FREE'>
export const PAID_PLANS = ['D1', 'D2', 'D3'] as const
export const isPaidPlan = (v: unknown): v is PaidPlan => typeof v === 'string' && (PAID_PLANS as readonly string[]).includes(v)
export const planRank = (p: PlanCd) => PLANS.indexOf(p)

export const DBM_PLAN = 'DBM_PLAN' // pi_pymnt.pymnt_tp_cd = metadata.type
export const QUOTE_TTL_MS = 10 * 60 * 1000 // 견적 유효 10분
export const BNDL_RATE = 0.2 // schema.pi 묶음 할인(같은 분류체계 P4 기간 안)
export const SLACK_MS = 10 * 60 * 1000 // 업그레이드 금액 창 — 견적 ~ 승인 사이 날짜 경계(schema.pi approve 와 같음)

// 기능 권한표(계획 '요금제별 기능' 표) — 기능별 최소 요금제. 라우트는 requireLink(req, linkId, perm) 로 검사
export const PERM_MIN = {
  ANY: 'FREE', // 연결·접속 목록·요금제 화면·저장 계획 목록
  MON: 'FREE', // 모니터링 보드·규칙·추이
  PERF: 'FREE', // 성능 관측·원인 진단(FREE 수동 수집 하루 clct_day_cnt 회)
  SQL_EXPLAIN: 'FREE', // SQL 튜닝 : 실행계획 보기
  SQL_TUNE: 'D2', // SQL 튜닝 : 계획 저장·비교·AI 튜닝 권고(월 ai_mon_cnt 회)
  DRIFT_VIEW: 'D1', // GAP분석 조회
  DRIFT_RUN: 'D2', // GAP분석 실행
  LEARN: 'D1', // 학습 심화(연결 기반 형 매핑) — 기초 학습은 연결 없이 무료
  LAKE: 'D3', // 이행·파이프라인·분석(레이크)
  OPS: 'D3', // 운영 안전(파라미터·계정 권한·백업·복제)
} as const satisfies Record<string, PlanCd>
export type Perm = keyof typeof PERM_MIN
export const allows = (plan: PlanCd, perm: Perm) => planRank(plan) >= planRank(PERM_MIN[perm])
// 다음 등급(한도 초과 안내용) — 최상위면 null
export const nextPlan = (p: PlanCd): PaidPlan | null => (PLANS[planRank(p) + 1] as PaidPlan | undefined) ?? null

// 현재 요금제 — 기간 안(시작 ≤ 지금 < 종료) 행 중 가장 높은 요금제, 같으면 늦게 끝나는 기간. 없으면 FREE(sql/035 설계)
export type PlanTerm = { plan_cd: string; prd_cd: 'M' | 'Y' | null; strt_dtm: string; end_dtm: string; grnt_rsn_cd: string }
export type Cur = { plan: PlanCd; end: string | null; grace: boolean }
export function pickCur(terms: PlanTerm[], now: number): Cur {
  let best: Cur = { plan: 'FREE', end: null, grace: false }
  for (const t of terms) {
    if (!isPaidPlan(t.plan_cd) || Date.parse(t.strt_dtm) > now || Date.parse(t.end_dtm) <= now) continue
    const r = planRank(t.plan_cd) - planRank(best.plan)
    if (r > 0 || (r === 0 && t.end_dtm > (best.end ?? ''))) best = { plan: t.plan_cd, end: t.end_dtm, grace: t.grnt_rsn_cd === 'GRACE' }
  }
  return best
}
// 구독 중 = 결제한 요금제 사용 중(무료·체험 아님) — 이때는 업그레이드와 현재 요금제 선결제만(schema.pi 규칙)
export const subscribed = (c: Cur) => c.plan !== 'FREE' && !c.grace

// 업그레이드 일할계산 — schema.pi src/lib/upgrade.ts 공식 그대로(가격 단위 무관 — 여기서는 원화).
//  비용 = 상위 가격[새 주기] − 현재 가격 × (기준 − 사용 일수) ÷ 기준 + 선결제 기간마다 (상위 − 현재), 기준 월 30·년 365, 결제한 날 = 1일. 년 → 월 불가
export const DAY_MS = 86_400_000
export const BASE_DAYS = { M: 30, Y: 365 } as const
export type UpgQuote = { amount: number; credit: number; prepaid: number; terms: number; used: number; prd: 'M' | 'Y' }
export function upgradeFee(terms: PlanTerm[], price: Record<string, number>, from: string, to: string, now: number, prd?: 'M' | 'Y'): UpgQuote | null {
  const live = terms.filter((t) => (t.grnt_rsn_cd === 'PAY' || t.grnt_rsn_cd === 'UPG') && t.prd_cd && Date.parse(t.end_dtm) > now)
  const future = live.filter((x) => Date.parse(x.strt_dtm) > now)
  const t = live.filter((x) => !future.includes(x)).sort((a, b) => Date.parse(b.strt_dtm) - Date.parse(a.strt_dtm))[0]
  if (!t?.prd_cd) return null
  const np = prd ?? t.prd_cd
  if (t.prd_cd === 'Y' && np === 'M') return null
  if (!(to > from || (to === from && t.prd_cd === 'M' && np === 'Y'))) return null
  const pFrom = price[from + t.prd_cd]
  const pTo = price[to + np]
  if (!(pFrom > 0) || !(pTo > pFrom)) return null
  const base = BASE_DAYS[t.prd_cd]
  const used = Math.min(base, Math.floor((now - Date.parse(t.strt_dtm)) / DAY_MS) + 1)
  const credit = (pFrom * (base - used)) / base
  let prepaid = 0
  for (const f of future) {
    const d = price[to + f.prd_cd] - price[from + f.prd_cd]
    if (!(d >= 0)) return null
    prepaid += d
  }
  return {
    amount: Math.max(0.01, Math.ceil((pTo - credit + prepaid) * 100 - 1e-9) / 100),
    credit: Math.floor(credit * 100 + 1e-9) / 100,
    prepaid,
    terms: future.length,
    used,
    prd: np,
  }
}

// 원화 결제 기준가 — 원 단위 올림, 묶음 할인 20%(원 단위 올림). 0 이하 = null
export const krwDue = (krw: number, bndl: boolean): number | null => {
  const k = Math.ceil((bndl ? krw * (1 - BNDL_RATE) : krw) - 1e-9)
  return k > 0 ? k : null
}

// Pi 금액 = 원화 ÷ 시세, 0.01 Pi 올림(seminar.pi plan-rules 와 같은 규칙)
export function piAmount(krw: number, krwPerPi: number): string | null {
  if (!(krw > 0) || !(krwPerPi > 0) || !Number.isFinite(krw / krwPerPi)) return null
  return (Math.ceil((krw / krwPerPi) * 100 - 1e-9) / 100).toFixed(2)
}

// 결제 metadata — 서명 견적 q 가 나머지 칸을 묶는다(원장에는 Pi 가 돌려준 metadata 원문이 저장되므로, 서명과 대조해야 DB 함수가 읽는 값을 믿을 수 있다)
export type PlanMeta = {
  type: typeof DBM_PLAN
  lnk_id: string
  plan_cd: PaidPlan
  prd_cd: 'M' | 'Y' | 'U' // U = 업그레이드(일할계산)
  from_plan: PlanCd // 결제 시점 현재 요금제
  prd: 'M' | 'Y' | null // 업그레이드 새 주기(U 만)
  pre: number // 업그레이드에 함께 올릴 선결제 기간 수(U 만, sql/035 가 이만큼만)
  bndl: boolean // schema.pi 묶음 할인 적용
  q: string
}
export const metaKey = (m: Omit<PlanMeta, 'type' | 'q'>) =>
  JSON.stringify([m.lnk_id, m.plan_cd, m.prd_cd, m.from_plan, m.prd, m.pre, m.bndl])

// 결제 메모 — ASCII 만(™·한글 금지, Pi 결제 호환)
export const planMemo = (m: Pick<PlanMeta, 'plan_cd' | 'prd_cd' | 'from_plan' | 'prd'>) =>
  m.prd_cd === 'U'
    ? `dbms.pi plan ${m.from_plan} to ${m.plan_cd} upgrade (${m.prd === 'Y' ? 'yearly' : 'monthly'})`
    : `dbms.pi plan ${m.plan_cd} ${m.prd_cd === 'Y' ? 'yearly' : 'monthly'}`

// metadata 형태 검증(서명 대조 전) — 맞을 때만
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parsePlanMeta(v: unknown): PlanMeta | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  if (m.type !== DBM_PLAN || typeof m.lnk_id !== 'string' || !UUID.test(m.lnk_id) || !isPaidPlan(m.plan_cd)) return null
  if (!(PLANS as readonly unknown[]).includes(m.from_plan) || typeof m.bndl !== 'boolean' || typeof m.q !== 'string') return null
  if (m.prd_cd === 'M' || m.prd_cd === 'Y') {
    if (m.prd !== null || m.pre !== 0) return null
  } else if (m.prd_cd === 'U') {
    if ((m.prd !== 'M' && m.prd !== 'Y') || !Number.isInteger(m.pre) || (m.pre as number) < 0 || (m.pre as number) > 100) return null
  } else return null
  return m as PlanMeta
}

// 이전 APPROVED 결제의 Pi 조회 결과 → 새 결제를 막을지(seminar.pi stalePayState 승계, memory pi-u2a-cancel-forbidden)
//  gone = Pi 에서 취소·만료(404) → 원장 CANCELED, abandoned = 서명 없이 3분 지남 → 막지 않음(원장 APPROVED 유지), pending = 막음(판정 불가 포함)
export const SIGN_WAIT_MS = 3 * 60 * 1000
export const STALE_LOOKUP_MAX = 3
export type PiLookup =
  | { ok: true; payment: { status: { cancelled: boolean; user_cancelled: boolean }; transaction?: { txid?: string } | null; created_at?: string } }
  | { ok: false; status: number }
export const stalePayState = (r: PiLookup, now = Date.now()): 'gone' | 'abandoned' | 'pending' =>
  r.ok
    ? r.payment.status.cancelled || r.payment.status.user_cancelled
      ? 'gone'
      : !r.payment.transaction?.txid && now - (Date.parse(r.payment.created_at ?? '') || now) > SIGN_WAIT_MS
        ? 'abandoned'
        : 'pending'
    : r.status === 404
      ? 'gone'
      : 'pending'

// schema.pi 묶음 할인 판정 — 'area_plan' 조회 1행(P4·기간 안·체험 아님)
export type AreaPlanRow = { plan_cd?: unknown; end_dtm?: unknown; grnt_rsn_cd?: unknown }
export const bundleOk = (r: AreaPlanRow | null, now = Date.now()) =>
  !!r && r.plan_cd === 'P4' && typeof r.end_dtm === 'string' && Date.parse(r.end_dtm) > now && r.grnt_rsn_cd !== 'GRACE'

// @pi/payments PayFail.code → 앱 apiError 코드(seminar.pi 매핑 승계). 검증기 고유 코드(PAY_*·PLAN_*·QUOTE_EXPIRED)는 그대로
const PAY_CODES: Record<string, string> = {
  SERVER_CONFIG: 'SERVER_CONFIG',
  PI_API_FAILED: 'PAY_PI_FAILED',
  NOT_PAYER: 'PAY_MISMATCH',
  META_INVALID: 'PAY_MISMATCH',
  TXID_MISMATCH: 'PAY_MISMATCH',
  NOT_FOUND: 'PAY_MISMATCH',
  AMOUNT_MISMATCH: 'PAY_AMOUNT_MISMATCH',
  PAYMENT_CANCELLED: 'PAY_CANCELLED',
  ALREADY_PAID: 'PAY_ALREADY_PAID',
  INVALID_STATE: 'PAY_INVALID_STATE',
  PI_CANCEL_REFUSED: 'PAY_PI_CANCEL_REFUSED',
  DB_FAILED: 'DB_UNAVAILABLE',
}
export const payErrorCode = (code: string) =>
  /^(PAY_|PLAN_)/.test(code) || code === 'QUOTE_EXPIRED' ? code : (PAY_CODES[code] ?? 'INTERNAL')
