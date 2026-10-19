// 요금제 업그레이드 일할계산(2026-10-19 마스터 지시, 화면·서버 공용 순수 함수) — 상위 요금제를 결제 시각부터 새 주기(1개월·1년)로 시작, 현재 요금제 미사용분을 차감
//  비용 = 상위 가격[새 주기] − 현재 가격 × (기준 일수 − 사용 일수) ÷ 기준 일수, 0.01 Pi 단위 올림(최소 0.01)
//   · 새 주기 = 현재와 같은 주기 또는 년(월 → 상위 요금제 연 구독도 미사용분 할인, 마스터 지시 2026-10-19). 년 → 월은 불가
//   · 같은 요금제 월 → 연도 업그레이드(예 개발자 월 → 개발자 연, 마스터 지시 2026-10-19)
//   · 기준 일수·현재 가격 = 현재 기간 행의 주기(월 30·년 365)
//   · 사용 일수 = 경과 일수 + 1(결제한 날 = 1일 고정), 기준 일수 상한
//   예) 개발자(10 Pi/월) 오늘 결제 → 표준담당자(20 Pi/월) = 20 − 10 × 29/30 = 10.34 Pi
//  기준 기간 = 지금 쓰는 기간 중 가장 늦게 시작한 행(같은 요금제 월 → 연 업그레이드 뒤 겹쳐 남은 이전 월 기간은 이미 차감됨)
//  선결제(아직 시작 안 한 미래 기간)도 함께 업그레이드(마스터 지시 2026-10-19) — 기간마다 상위 가격 − 현재 가격(그 기간 주기, 사용 0일)을 더함
//   예) 개발자 월 오늘 결제 + 선결제 1개월·1년 → 표준담당자 월 = 10.34 + (20 − 10) + (200 − 100) = 120.34 Pi
//   반영(sql/055) = 선결제 기간을 상위 요금제로 바꿔 새 주기 종료일 뒤로 이어 붙임
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
  prepaid: number // 선결제 기간 차액 합(Pi)
  terms: number // 함께 업그레이드할 선결제 기간 수
  used: number // 사용 일수(결제한 날 포함)
  prd: 'M' | 'Y' // 새 주기
}

// price 키 = 요금제코드 + 주기(예 'P1M'). 업그레이드할 수 없으면 null
export function upgradeFee(terms: UpgTerm[], price: Record<string, number>, from: string, to: string, now: number, prd?: 'M' | 'Y'): UpgQuote | null {
  const live = terms.filter((t) => (t.grnt_rsn_cd === 'PAY' || t.grnt_rsn_cd === 'UPG') && Date.parse(t.end_dtm) > now)
  const future = live.filter((x) => Date.parse(x.strt_dtm) > now) // 선결제 기간(PAY — sql/055 가 옮기는 행과 같음, UPG 는 승인 시각 시작이라 미래 없음)
  const t = live.filter((x) => !future.includes(x)).sort((a, b) => Date.parse(b.strt_dtm) - Date.parse(a.strt_dtm))[0]
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
  let prepaid = 0
  for (const f of future) {
    const d = price[to + f.prd_cd] - price[from + f.prd_cd]
    if (!(d >= 0)) return null // 요금표 없음
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
