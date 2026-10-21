// 배포 후 실시간 확인 — GET ?route= : 그 경로의 최근 AI 수정 배포 이후 실측(요청·오류·느림, 배포 전 기준선, 배포 후 오류 상세)과 판정(전역 관리자)
//  화면이 몇 초마다 다시 부름(DB 2쿼리, AI 호출 없음). 배포 기록이 없으면 deploy=null
import { NextResponse } from 'next/server'
import { apiError, currentUser, dbError } from '@/lib/api'
import { normRoute } from '@/lib/mon'
import { isGlobalAdmin } from '@/lib/mon-srv'
import { verifyData } from '@/lib/mon-verify'

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const route = new URL(req.url).searchParams.get('route') ?? ''
  if (!route || route.length > 200 || normRoute(route) !== route) return apiError('INVALID_INPUT', 400)
  try {
    if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
    return NextResponse.json({ ok: true, data: await verifyData(route) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
