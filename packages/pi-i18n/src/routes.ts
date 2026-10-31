// @pi/i18n/routes — 언어 콤보·시세칩이 부르는 API 3종의 GET 처리기(loginpi 같은 경로·같은 응답).
// 앱 route.ts 는 처리기를 다시 내보내고 revalidate 값만 직접 적는다(Next 세그먼트 설정은 재수출 불가) — 표준 8절 3단계
//  · /api/i18n/countries : loginpi 는 DB(i18n_locale 활성 + i18n_cntry_mst) 조회 → 여기선 그 스냅숏(src/data, pi-i18n snapshot) — revalidate 600
//  · /api/exchange-rates : open.er-api.com 1 USD 기준 환율 — revalidate 900
//  · /api/pi-price       : CoinGecko pi-network USD — revalidate 300
// loginpi 와 다른 점 = 외부 호출 타임아웃 2초(루트 CLAUDE.md R-P4). 실패 응답은 loginpi 와 같다({rates:{},updated:null} / {usd:null})
import countries from './data/countries.json' with { type: 'json' }
import locales from './data/locales.json' with { type: 'json' }

const TIMEOUT_MS = 2000

export function countriesGET(): Response {
  return Response.json({ locales, countries })
}

export async function exchangeRatesGET(): Promise<Response> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit)
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const data = (await res.json()) as {
      rates: Record<string, number>
      time_last_update_utc?: string
    }
    return Response.json({ rates: data.rates, updated: data.time_last_update_utc })
  } catch {
    // 실패 시 빈 rates 반환 → UI에서 '—' 표시로 degradation
    return Response.json({ rates: {}, updated: null })
  }
}

export async function piPriceGET(): Promise<Response> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=usd', {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit)
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const data = (await res.json()) as Record<string, { usd?: number }>
    return Response.json({ usd: data['pi-network']?.usd ?? null })
  } catch {
    // 시세 조회 실패 시 null 반환 → UI에서 미표시로 degradation
    return Response.json({ usd: null })
  }
}
