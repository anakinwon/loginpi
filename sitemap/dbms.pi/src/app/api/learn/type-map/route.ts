// DBMS 비교 사전 실제 타입 매핑 — GET /api/learn/type-map?link= → schema.pi GET /dbms-profiles(std_tp_map). 연결은 선택 사항(없으면 화면이 정적 표만)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, dbRoute } from '@/lib/api'
import { linkErrorResponse, linkGet, requireLink } from '@/lib/link/client'

type Profiles = {
  dbms: { dbmsCd: string; dbmsNm: string }[]
  typeMap: { dbmsCd: string; lgcTpCd: string; phyTpNm: string; lenUseYn: string }[]
}

export const GET = withGuard(
  dbRoute(async (req) => {
    const linkId = req.nextUrl.searchParams.get('link')
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const link = await requireLink(req, linkId)
    if (link instanceof Response) return link as NextResponse
    try {
      const p = await linkGet<Profiles>(linkId, '/dbms-profiles')
      // 표준 프로필은 자주 바뀌지 않음 — 브라우저 10분 캐시(R-P2)
      return NextResponse.json(
        { dbms: p.dbms, typeMap: p.typeMap },
        { headers: { 'Cache-Control': 'private, max-age=600' } },
      )
    } catch (e) {
      return linkErrorResponse(e)
    }
  }),
)
