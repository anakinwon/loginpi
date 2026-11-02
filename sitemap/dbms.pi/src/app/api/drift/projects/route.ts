// 정합 대조 대상 프로젝트 목록 — GET /api/drift/projects?link=. schema.pi 연결의 /projects 그대로(이름·대상 DBMS만)
import { NextResponse } from 'next/server'
import { withGuard } from '@pi/guard'
import { apiError, dbRoute } from '@/lib/api'
import { linkErrorResponse, linkGet, requireLink } from '@/lib/link/client'

type Project = { prjId: string; prjNm: string; trgtDbmsCd: string | null }

export const GET = withGuard(
  dbRoute(async (req) => {
    const linkId = req.nextUrl.searchParams.get('link') ?? ''
    if (!linkId) return apiError('INVALID_INPUT', 400)
    const ctx = await requireLink(req, linkId, 'DRIFT_VIEW')
    if (ctx instanceof Response) return ctx as NextResponse
    try {
      const projects = await linkGet<Project[]>(ctx.linkId, '/projects')
      return NextResponse.json({ projects })
    } catch (e) {
      return linkErrorResponse(e)
    }
  }),
)
