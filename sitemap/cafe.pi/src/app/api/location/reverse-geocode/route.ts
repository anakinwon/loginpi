import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { reverseGeocode } from '@/lib/google-maps'
import { apiError } from '@/lib/api-errors'

// POST /api/location/reverse-geocode — 좌표 → 주소 + 행정구역 (서버 프록시, TASK-134)
// GPS로 얻은 lat/lng를 사람이 읽는 주소·시군구·동으로 변환.
// 동의 불필요(PRD 섹션 6). 유료 API 남용 방지를 위해 로그인 세션 필수.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return apiError('AUTH_REQUIRED', 401)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('BAD_REQUEST_BODY', 400)
  }

  const { lat, lng } = body as { lat?: number; lng?: number }
  if (lat === undefined || lng === undefined) {
    return apiError('LOC_LATLNG_REQUIRED', 400)
  }

  // WGS84 좌표 범위 검증
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return apiError('LOC_INVALID_COORD', 400)
  }

  try {
    const result = await reverseGeocode(lat, lng)
    if (!result) {
      return apiError('LOC_REVERSE_NOT_FOUND', 404)
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error(
      '[reverse-geocode] 실패:',
      err instanceof Error ? err.message : err,
    )
    return apiError('LOC_REVERSE_FAILED', 502)
  }
}
