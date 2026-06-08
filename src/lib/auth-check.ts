import 'server-only'
import { cookies, headers } from 'next/headers'
import { auth } from '@/auth'
import { verifyPayload } from './pi-session-crypto'
import { getUserById, getUserByPiUid } from './users'
import type { PiSessionUser } from '@/types/pi-session'
import type { UserRow } from './users'

// Pi 세션과 Google 세션을 모두 확인해 Supabase users row 반환
// 두 인증 방식의 단일 진입점
export async function getSessionUser(): Promise<UserRow | null> {
  const secret = process.env.PI_SESSION_SECRET

  // 1. Pi 세션 토큰 확인 — 쿠키(일반 브라우저) 우선, 없으면 X-Pi-Token 헤더(Pi Browser).
  //    Pi Browser WebView는 Set-Cookie를 저장하지 않으므로, 클라이언트가 localStorage에
  //    보관한 토큰을 X-Pi-Token 헤더로 전달하는 방식으로 인증한다(쿠키 비의존 fallback).
  if (secret) {
    const cookieStore = await cookies()
    let piToken = cookieStore.get('pi_session')?.value
    if (!piToken) {
      const headerStore = await headers()
      piToken = headerStore.get('x-pi-token') ?? undefined
    }
    if (piToken) {
      const piSession = verifyPayload<PiSessionUser>(piToken, secret)
      // 헤더 토큰은 쿠키와 달리 maxAge 자동 만료가 없으므로 tokenValidUntil 명시 검증
      const notExpired =
        !!piSession &&
        (!piSession.tokenValidUntil || new Date(piSession.tokenValidUntil) > new Date())
      if (piSession?.userId && notExpired) {
        const user = await getUserById(piSession.userId)
        if (user) return user
      } else if (piSession?.uid && notExpired) {
        // 구버전 쿠키(userId='') 또는 DB 오류 시 pi_uid로 폴백 조회
        const user = await getUserByPiUid(piSession.uid)
        if (user) return user
      }
    }
  }

  // 2. Google(NextAuth) 세션 확인
  const googleSession = await auth()
  if (googleSession?.user?.id) {
    const user = await getUserById(googleSession.user.id)
    if (user) return user
  }

  return null
}

export function isAdmin(user: UserRow | null): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MASTER'
}
