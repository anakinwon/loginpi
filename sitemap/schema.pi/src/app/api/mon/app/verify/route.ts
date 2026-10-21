// 배포 후 실시간 확인 — GET ?area=&route= : 그 경로의 최근 AI 수정 배포 이후 실측(요청·오류·느림, 배포 전 기준선, 배포 후 오류 상세)과 판정(그 분류체계 MON_AI, 2026-10-22)
//  화면이 몇 초마다 다시 부름(DB 2쿼리, AI 호출 없음). 배포 기록이 없으면 deploy=null
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, dbError, requireAreaRole } from '@/lib/api'
import { normRoute } from '@/lib/mon'
import { verifyData } from '@/lib/mon-verify'

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const route = sp.get('route') ?? ''
  const area = sp.get('area') ?? ''
  if (!route || route.length > 200 || normRoute(route) !== route || !z.string().uuid().safeParse(area).success) return apiError('INVALID_INPUT', 400)
  try {
    const auth = await requireAreaRole(area, 'MON_AI')
    if (auth instanceof NextResponse) return auth
    return NextResponse.json({ ok: true, data: await verifyData(route) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
