import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { convertFiatToPi } from '@/lib/fx-rates'
import { LOCALE_CURRENCY } from '@/lib/locale-currency'

// GET /api/store/price-quote?ccy=KRW&amt=10000 — 자국통화 → Pi 환산 견적 (판매자 등록 보조)
//   인증 필요(판매자 전용 도구) — Pi 가치평가 데이터의 공개 노출 표면 최소화.
//   응답은 등록시점 스냅샷 1회용. 상시 폴링 금지(레드라인).

// 지원 통화 — locale-currency 단일 소스에서 유도(중복 정의 방지)
const SUPPORTED_CCY = new Set<string>([...Object.values(LOCALE_CURRENCY), 'USD'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const ccy = (sp.get('ccy') ?? '').toUpperCase()
  const amt = Number(sp.get('amt'))

  if (!SUPPORTED_CCY.has(ccy))
    return NextResponse.json({ error: '지원하지 않는 통화입니다' }, { status: 400 })
  if (!Number.isFinite(amt) || amt <= 0)
    return NextResponse.json({ error: '금액이 올바르지 않습니다' }, { status: 400 })

  const quote = await convertFiatToPi(ccy, amt)
  if (!quote)
    return NextResponse.json(
      { error: '환율을 가져오지 못했습니다. Pi로 직접 입력해 주세요.' },
      { status: 503 },
    )

  return NextResponse.json(quote)
}
