// 메인 대시보드 API — GET ?area= : 내 분류체계 목록 + 선택 분류체계(요청값 → 마지막 선택 → 첫 번째)의 권한별 할 일·현황·최근 변경(src/lib/home.ts)
// 선택한 분류체계는 마지막 선택으로 기록(sys_user.lst_area_id). 개인화 응답이라 CDN 캐시 없음
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError, currentUser, dbError } from '@/lib/api'
import { loadHome } from '@/lib/home'

export async function GET(req: Request) {
  const user = await currentUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)
  const want = new URL(req.url).searchParams.get('area')
  if (want && !z.string().uuid().safeParse(want).success) return apiError('INVALID_INPUT', 400)
  try {
    return NextResponse.json({ ok: true, ...(await loadHome(user, want)) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return dbError(e as { code?: string; message?: string })
  }
}
