// 개최자 요금제 순수 규칙(계획 2026-10-28) — 상수·Pi 금액 환산·견적 서명/검증·이용권 차감 순서·하트비트 경과초.
// 서버 전용 값(비밀키)은 인자로 받는다(server-only 없음 — 시험이 직접 읽음). 시험 : node --test src/lib/plan-rules.test.mjs
// 원칙 : 원화는 표시용(참고 환산)만, 결제·검증은 Pi 금액만(memory krw-display-only-pay-pi)
import { createHmac, timingSafeEqual } from 'node:crypto'

export const PLAN = {
  freeSec: 3600, // 무료 = 매달 1시간(이월 없음, AI 제외)
  hbMaxSec: 90, // 하트비트 1회 최대 계량(60초 간격 + 여유) — sql/015 fn_hb_smn_hst 와 같은 값
  quoteTtlMs: 10 * 60 * 1000, // 견적 유효 10분
} as const

export const PAY_PLANS = ['M', 'Y'] as const
export type PayPlan = (typeof PAY_PLANS)[number]
export const SMN_PLAN = 'SMN_PLAN' // pi_pymnt.pymnt_tp_cd = metadata.type
export const isPayPlan = (v: unknown): v is PayPlan => typeof v === 'string' && (PAY_PLANS as readonly string[]).includes(v)

// Pi 금액 = 원화 ÷ 시세, 0.01 Pi 단위 올림(받는 쪽이 모자라지 않게). 부동소수 오차(48.7300000001 → 48.74) 방지로 1e-9 빼고 올림
export function piAmount(krw: number, krwPerPi: number): string | null {
  if (!(krw > 0) || !(krwPerPi > 0) || !Number.isFinite(krw / krwPerPi)) return null
  return (Math.ceil((krw / krwPerPi) * 100 - 1e-9) / 100).toFixed(2)
}

// 결제 메모 — Pi 결제 호환을 위해 ASCII 만(™·é 금지, CLAUDE.md 브랜드 예외)
export const planMemo = (plan: PayPlan) => (plan === 'M' ? 'Seminar plan 30h (1 month)' : 'Seminar plan 400h (12 months)')

// 견적 q = base64url(JSON {u,p,a,e}) + '.' + base64url(HMAC-SHA256). 키 = 세션 비밀에서 'plan-quote:' 로 파생(세션 토큰과 용도 분리)
export type Quote = { u: string; p: PayPlan; a: string; e: number } // 사용자ID·요금제·Pi 금액·만료(ms)
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const quoteKey = (secret: string) => createHmac('sha256', secret).update('plan-quote:').digest()
const mac = (secret: string, body: string) => createHmac('sha256', quoteKey(secret)).update(body).digest()

export function signQuote(q: Quote, secret: string): string {
  const body = b64(JSON.stringify(q))
  return `${body}.${b64(mac(secret, body))}`
}

// 검증 — 서명·형식·만료. 실패 사유는 화면 문구용(QUOTE_EXPIRED 만 따로, 나머지는 위조·형식 = INVALID)
export function verifyQuote(
  token: unknown,
  secret: string,
  now = Date.now(),
): { ok: true; q: Quote } | { ok: false; why: 'INVALID' | 'EXPIRED' } {
  if (typeof token !== 'string' || token.length > 1000) return { ok: false, why: 'INVALID' }
  const [body, sig, extra] = token.split('.')
  if (!body || !sig || extra !== undefined) return { ok: false, why: 'INVALID' }
  const want = mac(secret, body)
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, why: 'INVALID' }
  let q: Quote
  try {
    q = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return { ok: false, why: 'INVALID' }
  }
  if (!q || typeof q.u !== 'string' || !isPayPlan(q.p) || typeof q.a !== 'string' || typeof q.e !== 'number')
    return { ok: false, why: 'INVALID' }
  return q.e > now ? { ok: true, q } : { ok: false, why: 'EXPIRED' }
}

// 하트비트 경과초 — 이전 하트비트부터 지금까지, 0~hbMaxSec 로 자름(오래 끊겼다 돌아와도 1회분만). sql/015 fn_hb_smn_hst 와 같은 규칙
export const hbElapsedSec = (prevMs: number, nowMs: number) =>
  Math.min(PLAN.hbMaxSec, Math.max(0, Math.floor((nowMs - prevMs) / 1000)))

// 이용권 차감 — 만료가 빠른 것부터(같으면 id 순). sql/015 fn_hb_smn_hst 와 같은 순서. 반환 = 이용권별 차감 초(0 제외)·못 뗀 초
export type Pass = { id: string; endMs: number; grntSec: number; useSec: number }
export function deductOrder(passes: Pass[], sec: number, nowMs: number) {
  const live = passes
    .filter((p) => p.endMs > nowMs && p.grntSec > p.useSec)
    .sort((a, b) => a.endMs - b.endMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const used: { id: string; sec: number }[] = []
  let left = Math.max(0, sec)
  for (const p of live) {
    if (left <= 0) break
    const take = Math.min(left, p.grntSec - p.useSec)
    used.push({ id: p.id, sec: take })
    left -= take
  }
  return { used, short: left }
}
