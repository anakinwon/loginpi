import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { upsertGoogleUser, linkGoogleToPiUser } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'
import type { LinkTokenPayload } from '../link-start/route'

function getSecret() {
  const s = process.env.PI_SESSION_SECRET
  if (!s) throw new Error('PI_SESSION_SECRET 미설정')
  return s
}

// POST /api/auth/link-complete
// Body: { token: string }
// — provider=pi 토큰 (Pi→Google 방향): Google 세션으로 Google upsert 후 병합
// — provider=google 토큰 (Google→Pi 방향): Pi 세션 쿠키로 Pi userId 확인 후 병합
export async function POST(request: NextRequest) {
  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }
  const { token } = body as { token?: string }
  if (!token) {
    return NextResponse.json({ error: 'token이 필요합니다' }, { status: 400 })
  }

  // 링크 토큰 검증
  const payload = verifyPayload<LinkTokenPayload>(token, secret)
  if (!payload) {
    return NextResponse.json({ error: '유효하지 않은 연동 링크입니다' }, { status: 400 })
  }
  if (Date.now() / 1000 > payload.exp) {
    return NextResponse.json({ error: '연동 링크가 만료됐습니다 (10분 초과)' }, { status: 400 })
  }

  try {
    if (payload.provider === 'pi') {
      // ── Pi가 생성한 토큰: 지금 이 요청은 일반 브라우저(Google 세션 필요) ──
      const googleSession = await auth()
      if (!googleSession?.user) {
        return NextResponse.json({ error: 'Google 로그인이 필요합니다' }, { status: 401 })
      }

      // Google OAuth sub을 우선 사용 (session.user.id가 잘못된 경우 방어)
      // sub: Google OAuth raw sub, id: Supabase UUID or sub (upsert 실패 시)
      const googleSub = googleSession.user.sub ?? googleSession.user.id
      const googleEmail = googleSession.user.email

      if (!googleEmail) {
        return NextResponse.json({ error: 'Google 이메일 정보가 없습니다' }, { status: 400 })
      }

      // 항상 fresh upsert로 Supabase row 보장
      // (첫 로그인이거나 이전 upsert가 실패한 경우도 커버)
      const googleDbUser = await upsertGoogleUser({
        id: googleSub,
        email: googleEmail,
        name: googleSession.user.name ?? null,
        image: googleSession.user.image ?? null,
      })

      await linkGoogleToPiUser(payload.userId, googleDbUser.id)

    } else {
      // ── Google이 생성한 토큰: 지금 이 요청은 Pi Browser(Pi 세션 필요) ──
      const piCookie = request.cookies.get('pi_session')?.value
      const piUser = piCookie ? verifyPayload<PiSessionUser>(piCookie, secret) : null
      if (!piUser?.userId) {
        return NextResponse.json({ error: 'Pi 로그인이 필요합니다' }, { status: 401 })
      }
      await linkGoogleToPiUser(piUser.userId, payload.userId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '계정 연동 실패'
    console.error('[link-complete]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
