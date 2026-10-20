// 서버 모니터링(2026-10-21) — GET ?min= : 분류체계의 로컬 에이전트 목록 + 호스트 지표 이력(에이전트 1.3.0 이상이 폴링 때 보고), 모니터링 보기 권한
import { NextResponse } from 'next/server'
import { dbError, requireAreaRole } from '@/lib/api'
import { srvView } from '@/lib/mon-srv'

type Ctx = { params: Promise<{ areaId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { areaId } = await params
  const auth = await requireAreaRole(areaId, 'MON_VIEW')
  if (auth instanceof NextResponse) return auth
  const min = Math.min(1440, Math.max(5, Number(new URL(req.url).searchParams.get('min')) || 60))
  try {
    return NextResponse.json({ ok: true, ...(await srvView(areaId, min)) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
