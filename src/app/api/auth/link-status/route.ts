import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { PiSessionUser } from '@/types/pi-session'

type PiUserDTO = { uid: string; username?: string }

export interface LinkStatusResponse {
  linked: boolean
  piUsername: string | null
  googleEmail: string | null
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  // 경로 1: Google 세션 기반 조회
  const googleSession = await auth()
  if (googleSession?.user) {
    const googleSub = googleSession.user.sub ?? googleSession.user.id
    if (googleSub) {
      const { data } = await supabase
        .from('users')
        .select('pi_uid, pi_username, google_id, google_email')
        .eq('google_id', googleSub)
        .maybeSingle()

      if (data) {
        return NextResponse.json<LinkStatusResponse>({
          linked: !!data.pi_uid,
          piUsername: data.pi_username ?? null,
          googleEmail: data.google_email ?? null,
        })
      }
    }
  }

  // 경로 2: pi_session 쿠키 기반 조회
  const piCookie = request.cookies.get('pi_session')?.value
  if (piCookie) {
    const secret = process.env.PI_SESSION_SECRET
    if (secret) {
      const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
      if (piUser?.uid) {
        const { data } = await supabase
          .from('users')
          .select('pi_uid, pi_username, google_id, google_email')
          .eq('pi_uid', piUser.uid)
          .maybeSingle()

        if (data) {
          return NextResponse.json<LinkStatusResponse>({
            linked: !!data.google_id,
            piUsername: data.pi_username ?? null,
            googleEmail: data.google_email ?? null,
          })
        }
      }
    }
  }

  // 경로 3: X-Pi-Token 헤더 → Pi Network API 직접 검증
  // Pi Browser WebView에서 쿠키 저장 실패 시 폴백
  const piToken = request.headers.get('X-Pi-Token')
  if (piToken) {
    try {
      const piRes = await fetch('https://api.minepi.com/v2/me', {
        headers: { Authorization: `Bearer ${piToken}` },
      })
      if (piRes.ok) {
        const piUser = (await piRes.json()) as PiUserDTO
        if (piUser?.uid) {
          const { data } = await supabase
            .from('users')
            .select('pi_uid, pi_username, google_id, google_email')
            .eq('pi_uid', piUser.uid)
            .maybeSingle()

          if (data) {
            return NextResponse.json<LinkStatusResponse>({
              linked: !!data.google_id,
              piUsername: data.pi_username ?? null,
              googleEmail: data.google_email ?? null,
            })
          }
        }
      }
    } catch {
      // Pi Network API 오류 시 무시하고 미연동으로 처리
    }
  }

  return NextResponse.json<LinkStatusResponse>({
    linked: false,
    piUsername: null,
    googleEmail: null,
  })
}
