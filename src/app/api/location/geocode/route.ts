import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { geocodeAddress } from '@/lib/google-maps'
import { apiError } from '@/lib/api-errors'

// POST /api/location/geocode — 주소 → 좌표 (서버 프록시, TASK-134)
// 동의 불필요(PRD 섹션 6). 단, 유료 API 남용 방지를 위해 로그인 세션은 필수.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { address } = body as { address?: string }
  if (!address || address.trim().length < 2) {
    return apiError('LOC_ADDRESS_REQUIRED', 400)
  }

  try {
    const result = await geocodeAddress(address.trim())
    if (!result) {
      return apiError('LOC_GEOCODE_NOT_FOUND', 404)
    }
    return NextResponse.json(result)
  } catch (err) {
    // API Key 미설정·미사용설정·결제 미연결 등은 서버 로그로만 남기고 클라이언트엔 일반화
    console.error('[geocode] 실패:', err instanceof Error ? err.message : err)
    return apiError('LOC_GEOCODE_FAILED', 502)
  }
}
