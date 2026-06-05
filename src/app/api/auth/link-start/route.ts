import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload, signPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'
import type { PiSessionUser } from '@/types/pi-session'

export interface LinkTokenPayload {
  userId: string
  provider: 'pi' | 'google'
  exp: number
}

function getSecret() {
  const s = process.env.PI_SESSION_SECRET
  if (!s) throw new Error('PI_SESSION_SECRET 미설정')
  return s
}

export async function POST(request: NextRequest) {
  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // ── Pi 세션 우선 처리 ──────────────────────────────────────────────
  const piCookie = request.cookies.get('pi_session')?.value
  if (piCookie) {
    const piUser = verifyPayload<PiSessionUser>(piCookie, secret)

    // uid 기준으로 확인 (userId는 Supabase upsert 실패 시 '' 일 수 있음)
    if (piUser?.uid) {
      let userId = piUser.userId

      // userId가 비어있으면(Supabase upsert 이전 실패) 재시도
      if (!userId) {
        try {
          const dbUser = await upsertPiUser({
            uid: piUser.uid,
            username: piUser.username,
            walletAddress: piUser.walletAddress,
          })
          userId = dbUser.id
        } catch (e) {
          console.error('[link-start] Pi upsert 재시도 실패:', e)
          return NextResponse.json(
            { error: 'Pi 계정 DB 등록에 실패했습니다. Pi로 다시 로그인해주세요.' },
            { status: 500 }
          )
        }
      }

      const payload: LinkTokenPayload = {
        userId,
        provider: 'pi',
        exp: Math.floor(Date.now() / 1000) + 600,
      }
      const token = signPayload(payload, secret)
      const url = `${appUrl}/link?t=${encodeURIComponent(token)}&p=pi`
      return NextResponse.json({ token, url, provider: 'pi' })
    }
  }

  // ── Google 세션 처리 ───────────────────────────────────────────────
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

  return NextResponse.json(
    { error: 'Pi 또는 Google 로그인이 필요합니다' },
    { status: 401 }
  )
}
