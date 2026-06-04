import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'
import type { PiSessionUser } from '@/types/pi-session'

// 개발 환경 전용 mock 로그인 — 프로덕션에서는 404 반환
// 일반 브라우저에서 Pi.authenticate()가 resolve되지 않는 문제 우회용
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: '개발 환경에서만 사용 가능합니다' }, { status: 404 })
  }

  const secret = process.env.PI_SESSION_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const mockUser: PiSessionUser = {
    userId: 'dev_admin_supabase_id_000000000000000',
    uid: 'dev_admin_uid_000000000000000000000000000000',
    displayName: 'admin',
    username: 'admin',
    // 명백히 가짜임을 알 수 있는 Stellar 형식 주소 (G + 55자)
    walletAddress: 'GDEVADMIN2222222222222222222222222222222222222222222222222',
    scopesGranted: ['username', 'wallet_address'],
    tokenValidUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  // 실제 인증과 동일한 HMAC-SHA256 서명 적용 (verifyPayload 호환)
  const payload = Buffer.from(JSON.stringify(mockUser)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  const signed = `${payload}.${sig}`

  const response = NextResponse.json({ success: true, user: mockUser })
  response.cookies.set('pi_session', signed, {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60,
    path: '/',
  })

  return response
}
