// 요금제 업그레이드 일할계산(2026-10-19 마스터 지시, 화면·서버 공용 순수 함수) — 상위 요금제를 결제 시각부터 새 주기(1개월·1년)로 시작, 현재 요금제 미사용분을 차감
//  비용 = 상위 가격[새 주기] − 현재 가격 × (기준 일수 − 사용 일수) ÷ 기준 일수, 0.01 Pi 단위 올림(최소 0.01)
//   · 새 주기 = 현재와 같은 주기 또는 년(월 → 상위 요금제 연 구독도 미사용분 할인, 마스터 지시 2026-10-19). 년 → 월은 불가
//   · 같은 요금제 월 → 연도 업그레이드(예 개발자 월 → 개발자 연, 마스터 지시 2026-10-19)
//   · 기준 일수·현재 가격 = 현재 기간 행의 주기(월 30·년 365)
//   · 사용 일수 = 경과 일수 + 1(결제한 날 = 1일 고정), 기준 일수 상한
//   예) 개발자(10 Pi/월) 오늘 결제 → 표준담당자(20 Pi/월) = 20 − 10 × 29/30 = 10.34 Pi
//  기준 기간 = 지금 쓰는 기간 중 가장 늦게 시작한 행(같은 요금제 월 → 연 업그레이드 뒤 겹쳐 남은 이전 월 기간은 이미 차감됨)
//  미리 연장한 미래 기간이 있으면 불가(ponytail: 연장분 차감·이월은 필요해지면)
export const DAY_MS = 86_400_000
export const BASE_DAYS = { M: 30, Y: 365 } as const

export interface UpgTerm {
  prd_cd: 'M' | 'Y'
  strt_dtm: string
  end_dtm: string
  grnt_rsn_cd: string // PAY | UPG (GRACE 는 결제 금액이 없어 제외)
}
export interface UpgQuote {
  amount: number // 결제할 Pi
  credit: number // 차감한 현재 요금제 미사용분(Pi, 표시용 내림)
  used: number // 사용 일수(결제한 날 포함)
  prd: 'M' | 'Y' // 새 주기
}

// price 키 = 요금제코드 + 주기(예 'P1M'). 업그레이드할 수 없으면 null
export function upgradeFee(terms: UpgTerm[], price: Record<string, number>, from: string, to: string, now: number, prd?: 'M' | 'Y'): UpgQuote | null {
  const live = terms.filter((t) => (t.grnt_rsn_cd === 'PAY' || t.grnt_rsn_cd === 'UPG') && Date.parse(t.end_dtm) > now)
  if (live.some((x) => Date.parse(x.strt_dtm) > now)) return null // 미래 연장 기간 있음
  const t = [...live].sort((a, b) => Date.parse(b.strt_dtm) - Date.parse(a.strt_dtm))[0]
  if (!t) return null
  const strt = Date.parse(t.strt_dtm)
  const np = prd ?? t.prd_cd
  if (t.prd_cd === 'Y' && np === 'M') return null // 년 → 월 불가
  if (!(to > from || (to === from && t.prd_cd === 'M' && np === 'Y'))) return null // 상위 요금제 또는 같은 요금제 월 → 연만
  const pFrom = price[from + t.prd_cd]
  const pTo = price[to + np]
  if (!(pFrom > 0) || !(pTo > pFrom)) return null // 요금표 없음
  const base = BASE_DAYS[t.prd_cd]
  const used = Math.min(base, Math.floor((now - strt) / DAY_MS) + 1)
  const credit = (pFrom * (base - used)) / base
  return {
    amount: Math.max(0.01, Math.ceil((pTo - credit) * 100 - 1e-9) / 100),
    credit: Math.floor(credit * 100 + 1e-9) / 100,
    used,
    prd: np,
  }
}
