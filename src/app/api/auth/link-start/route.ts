import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload, signPayload } from '@/lib/pi-session-crypto'
import type { PiSessionUser } from '@/types/pi-session'

// 링크 토큰 페이로드 (10분 TTL, stateless)
export interface LinkTokenPayload {
  userId: string       // Supabase users.id
  provider: 'pi' | 'google'  // 토큰 발급자
  exp: number          // Unix timestamp (초)
}

function getSecret() {
  const s = process.env.PI_SESSION_SECRET
  if (!s) throw new Error('PI_SESSION_SECRET 미설정')
  return s
}

// POST /api/auth/link-start
// — Pi Browser에서: Pi 세션 → provider=pi 토큰 생성
// — 일반 브라우저에서: Google 세션 → provider=google 토큰 생성
export async function POST(request: NextRequest) {
  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // Pi 세션 확인
  const piCookie = request.cookies.get('pi_session')?.value
  if (piCookie) {
    const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
    if (piUser?.userId) {
      const payload: LinkTokenPayload = {
        userId: piUser.userId,
        provider: 'pi',
        exp: Math.floor(Date.now() / 1000) + 600,
      }
      const token = signPayload(payload, secret)
      const url = `${appUrl}/link?t=${encodeURIComponent(token)}&p=pi`
      return NextResponse.json({ token, url, provider: 'pi' })
    }
  }

  // Google 세션 확인
  const googleSession = await auth()
  if (googleSession?.user?.id) {
    const payload: LinkTokenPayload = {
      userId: googleSession.user.id,
      provider: 'google',
      exp: Math.floor(Date.now() / 1000) + 600,
    }
    const token = signPayload(payload, secret)
    const url = `${appUrl}/link?t=${encodeURIComponent(token)}&p=google`
    return NextResponse.json({ token, url, provider: 'google' })
  }

  return NextResponse.json({ error: 'Pi 또는 Google 로그인이 필요합니다' }, { status: 401 })
}
