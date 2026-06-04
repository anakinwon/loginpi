import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { linkGoogleToPiUser } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'

// POST /api/auth/link
// Pi 세션(쿠키) + Google 세션(NextAuth)이 동시에 활성화된 상태에서 호출
// → Pi users row에 Google 필드를 병합하고 독립 Google row 삭제
export async function POST(request: NextRequest) {
  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  // 1. Pi 세션 검증
  const piCookie = request.cookies.get('pi_session')?.value
  if (!piCookie) {
    return NextResponse.json({ error: 'Pi 로그인이 필요합니다' }, { status: 401 })
  }
  const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
  if (!piUser?.userId) {
    return NextResponse.json({ error: '유효하지 않은 Pi 세션입니다' }, { status: 401 })
  }

  // 2. Google 세션 검증
  const googleSession = await auth()
  if (!googleSession?.user?.id) {
    return NextResponse.json({ error: 'Google 로그인이 필요합니다' }, { status: 401 })
  }

  // 3. 이미 연동된 경우 (같은 userId)
  if (piUser.userId === googleSession.user.id) {
    return NextResponse.json({ success: true, message: '이미 연동된 계정입니다' })
  }

  // 4. 계정 병합: Pi row ← Google 필드, Google row 삭제
  try {
    await linkGoogleToPiUser(piUser.userId, googleSession.user.id)
    return NextResponse.json({ success: true, message: '계정이 성공적으로 연동됐습니다' })
  } catch (err) {
    const message = err instanceof Error ? err.message : '계정 연동 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
