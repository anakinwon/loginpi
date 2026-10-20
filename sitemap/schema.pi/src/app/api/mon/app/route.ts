// 애플리케이션 모니터링(2026-10-21) — POST : 브라우저가 모은 API 응답 표본(로그인 사용자, 최대 500건)을 분 × 경로로 누적 / GET ?min= : 조회(전역 관리자)
// 표본은 서버가 다시 정규화·묶음(클라이언트 묶음 신뢰 안 함), 끝난 시각은 지금 ±10분만 받음
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { bucketize, normRoute, type Sample } from '@/lib/mon'
import { addApp, appView, isGlobalAdmin } from '@/lib/mon-srv'

const body = z.object({ s: z.array(z.object({ r: z.string().max(2000), t: z.number(), ms: z.number(), st: z.number().int().min(0).max(999) })).max(500) })

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const now = Date.now()
  const ss: Sample[] = []
  for (const x of b.s) {
    const route = normRoute(x.r)
    if (route && Math.abs(x.t - now) < 600_000 && x.ms >= 0) ss.push({ route, t: x.t, ms: x.ms, status: x.st })
  }
  try {
    await addApp(bucketize(ss))
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const min = Math.min(1440, Math.max(5, Number(new URL(req.url).searchParams.get('min')) || 60))
  try {
    if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
    return NextResponse.json({ ok: true, rows: await appView(min) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
