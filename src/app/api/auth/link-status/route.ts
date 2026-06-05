import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { PiSessionUser } from '@/types/pi-session'

export interface LinkStatusResponse {
  linked: boolean
  piUsername: string | null
  googleEmail: string | null
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()

  // Google 세션 기반 조회
  const googleSession = await auth()
  if (googleSession?.user) {
    const googleSub = googleSession.user.sub ?? googleSession.user.id
    if (googleSub) {
      const { data } = await supabase
        .from('users')
        .select('pi_uid, pi_username, google_id, google_email')
        .eq('google_id', googleSub)
        .single()

      if (data) {
        return NextResponse.json<LinkStatusResponse>({
          linked: !!data.pi_uid,
          piUsername: data.pi_username ?? null,
          googleEmail: data.google_email ?? null,
        })
      }
    }
  }

  // Pi 세션 기반 조회
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
          .single()

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

  return NextResponse.json<LinkStatusResponse>({ linked: false, piUsername: null, googleEmail: null })
}
