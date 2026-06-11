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
  // google_id 형식 불일치(UUID vs OAuth sub)를 대비해 google_email로도 fallback
  const googleSession = await auth()
  if (googleSession?.user) {
    const googleSub = googleSession.user.sub ?? googleSession.user.id
    const googleEmail = googleSession.user.email

    let row: {
      pi_uid: string | null
      pi_username: string | null
      google_id: string | null
      google_email: string | null
    } | null = null

    // 1-A: google_id로 조회
    if (googleSub) {
      const { data } = await supabase
        .from('sys_user')
        .select('pi_uid, pi_username, google_id, google_email')
        .eq('google_id', googleSub)
        .maybeSingle()
      row = data
    }

    // 1-B: google_id 조회 실패 시 google_email로 fallback
    if (!row && googleEmail) {
      const { data } = await supabase
        .from('sys_user')
        .select('pi_uid, pi_username, google_id, google_email')
        .eq('google_email', googleEmail)
        .maybeSingle()
      row = data
    }

    if (row) {
      return NextResponse.json<LinkStatusResponse>({
        linked: !!row.pi_uid,
        piUsername: row.pi_username ?? null,
        googleEmail: row.google_email ?? null,
      })
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
          .from('sys_user')
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
            .from('sys_user')
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
