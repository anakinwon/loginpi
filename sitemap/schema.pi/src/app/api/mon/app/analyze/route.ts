// 애플리케이션 모니터링 AI 원인 분석 — POST {route, min, mdl_id?} : 한 API 경로의 오류·느림 원인과 해결 방안(전역 관리자, 저장·자동 수정 없음)
//  모델 = mdl_id(설정 > AI 분석 모델에 등록한 모델) 또는 기본 모델, 응답에 사용 모델·요금제·계정·소요·토큰을 함께 돌려줌(자료 신뢰성 표시)
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError, parseBody } from '@/lib/api'
import { normRoute } from '@/lib/mon'
import { analyzeRoute } from '@/lib/mon-ai'
import { isGlobalAdmin } from '@/lib/mon-srv'

export const maxDuration = 120

const body = z.object({ route: z.string().max(200), min: z.number().int().min(5).max(1440), mdl_id: z.string().uuid().optional() })

export async function POST(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const b = await parseBody(req, body)
  if (b instanceof NextResponse) return b
  // 화면이 보낸 경로도 같은 정규화를 통과해야 함(경로 문자만 — 소스 파일 탐색에 쓰임)
  if (normRoute(b.route) !== b.route) return apiError('INVALID_INPUT', 400)
  try {
    if (!(await isGlobalAdmin(user.usr_id))) return apiError('MON_ADMIN_ONLY', 403)
    const r = await analyzeRoute(b.route, b.min, b.mdl_id)
    if (r === 'OFF') return apiError('MON_AI_OFF', 503)
    if (r === 'GONE') return apiError('MON_AI_MDL_GONE', 409)
    if (!r) return apiError('MON_AI_FAIL', 502)
    return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
