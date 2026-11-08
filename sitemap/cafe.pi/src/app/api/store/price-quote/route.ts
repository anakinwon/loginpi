import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { convertFiatToPi } from '@/lib/fx-rates'
import { apiError } from '@/lib/api-errors'

// GET /api/store/price-quote?ccy=KRW&amt=10000 — 자국통화 → Pi 환산 견적 (판매자 등록 보조)
//   인증 필요(판매자 전용 도구) — Pi 가치평가 데이터의 공개 노출 표면 최소화.
//   응답은 등록시점 스냅샷 1회용. 상시 폴링 금지(레드라인).
//   지원 통화는 라이브 환율 맵(convertFiatToPi 내부 rates)이 판정 — 헤더 콤보 전체 통화 대응.

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  const sp = req.nextUrl.searchParams
  const ccy = (sp.get('ccy') ?? '').toUpperCase()
  const amt = Number(sp.get('amt'))

  if (!/^[A-Z]{3}$/.test(ccy)) return apiError('STORE_INVALID_CCY', 400)
  if (!Number.isFinite(amt) || amt <= 0)
    return apiError('STORE_INVALID_AMOUNT', 400)

  // 환율 맵에 없는 통화·시세 조회 실패는 convertFiatToPi가 null 반환 → 503
  const quote = await convertFiatToPi(ccy, amt)
  if (!quote) return apiError('STORE_FX_UNAVAILABLE', 503)

  return NextResponse.json(quote)
}
