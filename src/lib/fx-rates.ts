import 'server-only'

// 환율 변환 (서버 전용) — 자국통화 ↔ Pi 환산.
//
// ⚠️ Pi 시장가(CoinGecko) 참조 = Pi 가치평가 데이터. 이 라이브러리는 '등록시점 1회 환산'에만 쓰고,
//    결과(자국통화 표시)는 NEXT_PUBLIC_FEATURE_PI_PRICE 플래그로만 노출한다(등재 레드라인 준수).
//    상시 실시간 재환산(틱커) 용도로 사용 금지 — 가치평가 상시노출이 됨.
//
// 환산 경로: 자국통화 ──(ccy/USD)──▶ USD ──(USD/Pi)──▶ Pi
//   - getPiUsdPrice():  1 Pi = ? USD   (CoinGecko pi-network)
//   - getUsdFxRates():  1 USD = ? ccy  (open.er-api.com)

const PI_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=usd'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'

// 1 Pi당 USD 시세. 실패 시 null.
export async function getPiUsdPrice(): Promise<number | null> {
  try {
    const res = await fetch(PI_PRICE_URL, { next: { revalidate: 300 } })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, { usd?: number }>
    const usd = data['pi-network']?.usd
    return typeof usd === 'number' && usd > 0 ? usd : null
  } catch {
    return null
  }
}

// 1 USD당 각 통화 환율 맵(ccy/USD). 실패 시 빈 객체.
export async function getUsdFxRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch(FX_URL, { next: { revalidate: 900 } })
    if (!res.ok) return {}
    const data = (await res.json()) as { rates?: Record<string, number> }
    return data.rates ?? {}
  } catch {
    return {}
  }
}

export interface FiatPiQuote {
  ccy_cd: string // 통화코드(ISO 4217)
  ccy_amt: number // 입력 자국통화 금액
  price_pi: number // 환산된 Pi 가격(소수 7자리)
  pi_per_ccy: number // 1 자국통화당 Pi (참고)
  snap_dtm: string // 환율 스냅샷 ISO 일시
}

const round7 = (n: number) => Math.round(n * 1e7) / 1e7

// 자국통화 금액 → Pi 환산 (등록시점 1회). 환율 조회 실패·미지원 통화 시 null → 호출자는 Pi 직접입력으로 폴백.
export async function convertFiatToPi(
  ccyCd: string,
  ccyAmt: number,
): Promise<FiatPiQuote | null> {
  if (!(ccyAmt > 0)) return null
  const [piUsd, rates] = await Promise.all([getPiUsdPrice(), getUsdFxRates()])
  if (!piUsd) return null
  // ccy/USD 환율 — USD 기준이므로 USD는 1
  const ccyPerUsd = ccyCd === 'USD' ? 1 : rates[ccyCd]
  if (!ccyPerUsd || ccyPerUsd <= 0) return null

  const usd = ccyAmt / ccyPerUsd // 자국통화 → USD
  const pricePi = round7(usd / piUsd) // USD → Pi
  if (!(pricePi > 0)) return null

  return {
    ccy_cd: ccyCd,
    ccy_amt: ccyAmt,
    price_pi: pricePi,
    pi_per_ccy: round7(pricePi / ccyAmt),
    snap_dtm: new Date().toISOString(),
  }
}
