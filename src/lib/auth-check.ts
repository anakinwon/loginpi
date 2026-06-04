import 'server-only'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { verifyPayload } from './pi-session-crypto'
import { getUserById } from './users'
import type { PiSessionUser } from '@/types/pi-session'
import type { UserRow } from './users'

// Pi 세션과 Google 세션을 모두 확인해 Supabase users row 반환
// 두 인증 방식의 단일 진입점
export async function getSessionUser(): Promise<UserRow | null> {
  const secret = process.env.PI_SESSION_SECRET

  // 1. Pi 세션 쿠키 확인
  if (secret) {
    const cookieStore = await cookies()
    const piCookie = cookieStore.get('pi_session')?.value
    if (piCookie) {
      const piSession = verifyPayload<PiSessionUser>(piCookie, secret)
      if (piSession?.userId) {
        const user = await getUserById(piSession.userId)
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
