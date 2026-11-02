// 표준 도메인 — GET /api/sql-lab/domains?link= → schema.pi GET /domains(승인완료 표준도메인). 안티패턴 점검(lint.ts)의 칼럼 타입 대조 입력
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, dbRoute } from '@/lib/api'
import { linkGet } from '@/lib/link/client'
import type { Domain } from '@/lib/sql-lab/lint'
import { linkFail, resolveLink } from '@/lib/sql-lab/server'

export const GET = withGuard(
  dbRoute(async (req) => {
    const linkId = req.nextUrl.searchParams.get('link')
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const link = await resolveLink(req, linkId, 'SQL_EXPLAIN')
    if (link instanceof NextResponse) return link
    try {
      const domains = await linkGet<Domain[]>(linkId, '/domains')
      // 표준 도메인은 자주 바뀌지 않음 — 브라우저 5분 캐시(R-P2 : 점검 버튼마다 재조회 방지)
      return NextResponse.json(
        { domains: domains.map(({ domNm, lgcTpCd }) => ({ domNm, lgcTpCd })) },
        { headers: { 'Cache-Control': 'private, max-age=300' } },
      )
    } catch (e) {
      return linkFail(e)
    }
  }),
)
