import 'server-only'
import { cookies, headers } from 'next/headers'
import { auth } from '@/auth'
import { verifyPayload } from './pi-session-crypto'
import { verifyPitTicket } from './pit-ticket'
import {
  getUserById,
  getUserByPiUid,
  getUserByGoogleId,
  getUserByGoogleEmail,
  touchLastLogin,
} from './users'
import type { PiSessionUser } from '@/types/pi-session'
import type { UserRow } from './users'

// Pi 세션과 Google 세션을 모두 확인해 Supabase users row 반환
// 두 인증 방식의 단일 진입점
export async function getSessionUser(): Promise<UserRow | null> {
  const secret = process.env.PI_SESSION_SECRET
  const headerStore = await headers()

  // 1. Pi 세션 토큰 확인 — 쿠키(일반 브라우저) 우선, 없으면 X-Pi-Token 헤더(Pi Browser).
  //    Pi Browser WebView는 Set-Cookie를 저장하지 않으므로, 클라이언트가 localStorage에
  //    보관한 토큰을 X-Pi-Token 헤더로 전달하는 방식으로 인증한다(쿠키 비의존 fallback).
  if (secret) {
    const cookieStore = await cookies()
    let piToken = cookieStore.get('pi_session')?.value
    if (!piToken) {
      piToken = headerStore.get('x-pi-token') ?? undefined
    }
    if (piToken) {
      const piSession = verifyPayload<PiSessionUser>(piToken, secret)
      // 헤더 토큰은 쿠키와 달리 maxAge 자동 만료가 없으므로 tokenValidUntil 명시 검증
      const notExpired =
        !!piSession &&
        (!piSession.tokenValidUntil ||
          new Date(piSession.tokenValidUntil) > new Date())
      if (piSession?.userId && notExpired) {
        const user = await getUserById(piSession.userId)
        if (user) {
          touchLastLogin(user.id) // Pi Browser 토큰 재사용 접속도 기록 (5분 스로틀)
          return user
        }
      } else if (piSession?.uid && notExpired) {
        // 구버전 쿠키(userId='') 또는 DB 오류 시 pi_uid로 폴백 조회
        const user = await getUserByPiUid(piSession.uid)
        if (user) {
          touchLastLogin(user.id)
          return user
        }
      }
    }
  }

  // 1b. x-pit-ticket 헤더 확인 — Pi Browser admin 페이지 내비게이션용 단기 ticket.
  //     미들웨어가 _pit URL 파라미터를 이 헤더로 변환한다. ticket은 60초 만료 HMAC 서명값으로
  //     실제 세션 토큰이 URL에 노출되지 않도록 간접 자격증명 역할을 한다.
  const pitTicket = headerStore.get('x-pit-ticket')
  if (pitTicket) {
    const userId = verifyPitTicket(pitTicket)
    if (userId) {
      const user = await getUserById(userId)
      if (user) {
        touchLastLogin(user.id)
        return user
      }
    }
  }

  // 2. Google(NextAuth) 세션 확인 — stale JWT 대비 3단 폴백으로 사용자 복원.
  //    JWT의 userId(UUID)는 운영 DB 재적재 시 orphan이 될 수 있는 가변 키다.
  //    → userId(UUID) → google_id(sub) → google_email(불변 키) 순으로 조회해
  //    id가 바뀌어도 재로그인 없이 세션을 복원한다.
  const googleSession = await auth()
  if (googleSession?.user?.id) {
    let user = await getUserById(googleSession.user.id)
    // fallback①: userId가 orphan/Google sub(비-UUID)일 때 google_id로 조회
    if (!user && googleSession.user.sub) {
      user = await getUserByGoogleId(googleSession.user.sub)
    }
    // fallback②: 그래도 없으면 불변 키인 google_email로 조회
    //   (DB 재적재로 id·google_id가 모두 어긋난 경우의 최종 안전망)
    if (!user && googleSession.user.email) {
      user = await getUserByGoogleEmail(googleSession.user.email)
    }
    if (user) {
      if (!user.pi_uid) return null // Pi 미연동 계정 — 1인 1계정 원칙 차단
      touchLastLogin(user.id) // 일반 브라우저 세션 유지 접속도 기록 (5분 스로틀)
      return user
    }
  }

  return null
}

export function isAdmin(user: UserRow | null): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MASTER'
}

// 최상위(super user) 게이트 — 배포 승격·요금제 전환·DB 스위치 등 초고위험 작업 전용.
// ⭐2026-07-16 마스터 확정: ADMIN이 최상위 super user다. 운영 DB에 MASTER role 행이
//   존재하지 않아 종전 role==='MASTER' 단독 체크는 전원 차단(사문화)이었음.
//   'MASTER' 값은 dev 세션(/api/auth/dev)·향후 계층 분리 호환으로 계속 허용.
//   초고위험 게이트는 반드시 이 함수를 쓸 것(개별 role 문자열 비교 금지).
export function isMaster(user: UserRow | null): user is UserRow {
  return user?.role === 'ADMIN' || user?.role === 'MASTER'
}
