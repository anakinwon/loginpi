import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { verifyPayload } from '@/lib/pi-session-crypto'
import { upsertPiUser } from '@/lib/users'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { PiSessionUser } from '@/types/pi-session'

function getSecret() {
  const s = process.env.PI_SESSION_SECRET
  if (!s) throw new Error('PI_SESSION_SECRET 미설정')
  return s
}

// crypto.randomInt: Node.js 내장 CSPRNG — Math.random()과 달리 예측 불가
function randomSixDigit(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export async function POST(request: NextRequest) {
  let secret: string
  try { secret = getSecret() } catch {
    return NextResponse.json({ error: 'PI_SESSION_SECRET 미설정' }, { status: 500 })
  }

  // Pi Browser 세션만 허용 (단방향: Pi → Google)
  const piCookie = request.cookies.get('pi_session')?.value
  if (!piCookie) {
    return NextResponse.json(
      { error: 'Pi Browser에서 Pi 계정으로 로그인해주세요' },
      { status: 401 }
    )
  }

  const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
  if (!piUser?.uid) {
    return NextResponse.json({ error: 'Pi 세션이 유효하지 않습니다' }, { status: 401 })
  }

  let userId = piUser.userId
  if (!userId) {
    try {
      const dbUser = await upsertPiUser({
        uid: piUser.uid,
        username: piUser.username,
        walletAddress: piUser.walletAddress,
      })
      userId = dbUser.id
    } catch (e) {
      console.error('[link-start] Pi upsert 실패:', e)
      return NextResponse.json(
        { error: 'Pi 계정 DB 등록 실패. Pi로 다시 로그인해주세요.' },
        { status: 500 }
      )
    }
  }

  // 6자리 코드 생성 — 충돌 시 최대 3회 재시도
  const supabase = getSupabaseAdmin()
  let code = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    code = randomSixDigit()
    const { error } = await supabase.from('link_codes').insert({
      code,
      pi_user_id: userId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (!error) break
    if (attempt === 2) {
      return NextResponse.json({ error: '코드 생성 실패. 다시 시도해주세요.' }, { status: 500 })
    }
  }

  return NextResponse.json({ code })
}
