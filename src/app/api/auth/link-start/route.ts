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

function randomSixDigit(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

// Pi Network API로 accessToken 직접 검증 → userId 반환
// WebView 쿠키 저장 실패 시 폴백 경로
async function verifyPiTokenAndGetUserId(
  accessToken: string,
): Promise<string | null> {
  try {
    const piRes = await fetch('https://api.minepi.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!piRes.ok) return null

    const piUser = (await piRes.json()) as PiUserDTO
    if (!piUser?.uid) return null

    const dbUser = await upsertPiUser({
      uid: piUser.uid,
      username: piUser.username ?? null,
      walletAddress: null,
    })
    return dbUser.id
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  let secret: string
  try {
    secret = getSecret()
  } catch {
    return NextResponse.json(
      { error: 'PI_SESSION_SECRET 미설정' },
      { status: 500 },
    )
  }

  // ── 경로 1: pi_session 쿠키 검증 ──────────────────────────────
  const piCookie = request.cookies.get('pi_session')?.value
  let userId: string | null = null

  if (piCookie) {
    const piUser = verifyPayload<PiSessionUser>(piCookie, secret)
    if (piUser?.uid) {
      userId = piUser.userId || null
      // userId가 쿠키에 없으면 DB에서 조회
      if (!userId) {
        try {
          const dbUser = await upsertPiUser({
            uid: piUser.uid,
            username: piUser.username,
            walletAddress: piUser.walletAddress,
          })
          userId = dbUser.id
        } catch {
          userId = null
        }
      }
    }
  }

  // ── 경로 2: X-Pi-Token 헤더로 Pi Network API 직접 검증 ────────
  // Pi Browser WebView에서 쿠키 저장이 실패하는 경우 폴백
  if (!userId) {
    const piTokenHeader = request.headers.get('X-Pi-Token')
    if (piTokenHeader) {
      userId = await verifyPiTokenAndGetUserId(piTokenHeader)
    }
  }

  if (!userId) {
    return NextResponse.json(
      {
        error:
          'Pi 로그인이 필요합니다. 페이지를 새로고침 후 다시 시도해주세요.',
      },
      { status: 401 },
    )
  }

  // 6자리 코드 생성 — 충돌 시 최대 3회 재시도
  const supabase = getSupabaseAdmin()
  let code = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    code = randomSixDigit()
    const { error } = await supabase.from('auth_link_cd').insert({
      code,
      pi_user_id: userId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (!error) break
    if (attempt === 2) {
      return NextResponse.json(
        { error: '코드 생성 실패. 다시 시도해주세요.' },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ code })
}
