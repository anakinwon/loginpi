import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth-check'
import { geocodeAddress } from '@/lib/google-maps'

// POST /api/location/geocode — 주소 → 좌표 (서버 프록시, TASK-134)
// 동의 불필요(PRD 섹션 6). 단, 유료 API 남용 방지를 위해 로그인 세션은 필수.
export async function POST(request: NextRequest) {
  const user = await getSessionUser()
  if (!user)
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문' }, { status: 400 })
  }

  const { address } = body as { address?: string }
  if (!address || address.trim().length < 2) {
    return NextResponse.json(
      { error: 'address는 2자 이상 필수입니다' },
      { status: 400 },
    )
  }

  try {
    const result = await geocodeAddress(address.trim())
    if (!result) {
      return NextResponse.json(
        { error: '해당 주소의 좌표를 찾을 수 없습니다' },
        { status: 404 },
      )
    }
    return NextResponse.json(result)
  } catch (err) {
    // API Key 미설정·미사용설정·결제 미연결 등은 서버 로그로만 남기고 클라이언트엔 일반화
    console.error('[geocode] 실패:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: '주소 변환 중 오류가 발생했습니다' },
      { status: 502 },
    )
  }
}
