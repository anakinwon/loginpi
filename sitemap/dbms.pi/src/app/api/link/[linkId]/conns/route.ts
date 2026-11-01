// 연결의 접속 목록 — GET /api/link/[linkId]/conns : schema.pi GET /api/link/v1/conns 대리(비밀번호·전체 호스트 없음)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { dbRoute } from '@/lib/api'
import { linkErrorResponse, linkGet, requireLink } from '@/lib/link/client'

type Ctx = { params: Promise<{ linkId: string }> }

export type LinkConn = {
  connId: string
  connNm: string
  dbmsCd: string
  execMthdCd: string
  dbNm: string | null
  hostMasked: string | null
  lstTestDtm: string | null
  agtLstSeenDtm: string | null
}

export const GET = withGuard(
  dbRoute(async (req, ctx) => {
    const { linkId } = await (ctx as Ctx).params
    const link = await requireLink(req, linkId)
    if (link instanceof Response) return link as NextResponse
    try {
      const items = await linkGet<LinkConn[]>(link.linkId, '/conns')
      return NextResponse.json({ items, areaNm: link.areaNm })
    } catch (e) {
      return linkErrorResponse(e)
    }
  }),
)
