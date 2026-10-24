// 애플리케이션 모니터링(2026-10-21) — POST : 브라우저가 모은 API 응답 표본(로그인 사용자, 최대 500건)을 분 × 경로로 누적 + 느림·오류는 화면 경로와 함께 개별 이력(sql/069, 최대 50건) / GET ?area=&min= : 조회(그 분류체계 MON_AI 권한 — 요금제1~ SQL 쓰기 역할, 2026-10-22, 합계 + 최신 이벤트 500건)
// 표본은 서버가 다시 정규화·묶음(클라이언트 묶음 신뢰 안 함), 끝난 시각은 지금 ±10분만 받음
// 운영 배포(VERCEL_ENV=production)에서만 저장 — 로컬 dev·미리보기도 같은 DB 를 써서 로컬 장애(dev 중 build 로 깨진 서버의 500 등)가
//  운영 오류로 섞여 AI 원인 분석이 엉뚱한 운영 코드를 고치던 문제(2026-10-22 /api/auth/session 500 = 로컬 dev 장애)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody, requireAreaRole } from '@/lib/api'
import { bucketize, evtCd, normPage, normRoute, type Sample } from '@/lib/mon'
import { addApp, addAppEvt, appEvtView, appView } from '@/lib/mon-srv'

const body = z.object({ s: z.array(z.object({ r: z.string().max(2000), t: z.number(), ms: z.number(), st: z.number().int().min(0).max(999), p: z.string().max(300).optional() })).max(500) })

export async function POST(req: Request) {
  if (process.env.VERCEL_ENV !== 'production') return new NextResponse(null, { status: 204 })
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  const now = Date.now()
  const ss: Sample[] = []
  for (const x of b.s) {
    const route = normRoute(x.r)
    if (route && Math.abs(x.t - now) < 600_000 && x.ms >= 0) ss.push({ route, t: x.t, ms: x.ms, status: x.st, page: x.p ? normPage(x.p) : null })
  }
  try {
    // 합계·개별 이력 저장은 서로 독립 — 동시 실행(R-P1, 2026-10-24 전수 점검). 개별 이력 실패는 내부에서 기록만
    await Promise.all([addApp(bucketize(ss)), addAppEvt(user.usr_id, ss.filter((s) => evtCd(s.ms, s.status)).slice(-50))])
    return new NextResponse(null, { status: 204 })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const min = Math.min(1440, Math.max(5, Number(sp.get('min')) || 60))
  const area = sp.get('area') ?? ''
  if (!z.string().uuid().safeParse(area).success) return apiError('INVALID_INPUT', 400)
  try {
    const auth = await requireAreaRole(area, 'MON_AI')
    if (auth instanceof NextResponse) return auth
    const [rows, evts] = await Promise.all([appView(min), appEvtView(min)])
    return NextResponse.json({ ok: true, rows, evts }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
