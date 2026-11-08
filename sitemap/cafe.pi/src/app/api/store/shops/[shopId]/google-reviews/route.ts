import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getPlaceReviews } from '@/lib/google-maps'
import { apiError } from '@/lib/api-errors'

// GET /api/store/shops/[shopId]/google-reviews — 구글 평점·리뷰(최대 5개) 조회
// 공개 데이터(게스트 포함) — 매장의 place_id로 구글 Places API를 서버 프록시 조회.
// 리뷰는 구글 약관상 DB 저장 금지 → 라이브 조회 + CDN 단기 캐시(s-maxage)로만 운용.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shopId: string }> },
) {
  const { shopId } = await params
  // 뷰어 언어 — 리뷰 자동번역·상대시간 표기용 (locale의 언어 부분만, 예: 'ko', 'en')
  const lang =
    req.nextUrl.searchParams
      .get('lang')
      ?.slice(0, 3)
      .replace(/[^a-z]/gi, '') || 'ko'

  const { data: shop } = await getSupabaseAdmin()
    .from('mps_shop')
    .select('place_id')
    .eq('shop_id', shopId)
    .eq('del_yn', 'N')
    .maybeSingle()

  if (!shop) return apiError('STORE_SHOP_NOT_FOUND', 404)

  // place_id 미연결 매장(수동 등록 등) — 에러 아님, 표시할 구글 정보가 없을 뿐
  if (!shop.place_id) {
    return NextResponse.json({ available: false })
  }

  try {
    const reviews = await getPlaceReviews(shop.place_id, lang)
    if (!reviews) return NextResponse.json({ available: false })

    return NextResponse.json(
      { available: true, ...reviews },
      {
        // 공개 집계 — CDN 1시간 캐시 + 12시간 stale 허용 (구글 호출 비용 절감)
        headers: {
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=43200',
        },
      },
    )
  } catch (e) {
    console.error('[google-reviews] 조회 실패:', e)
    // 구글 API 장애·키 미설정 시에도 매장 화면은 정상 — 카드만 조용히 숨김
    return NextResponse.json({ available: false })
  }
}
