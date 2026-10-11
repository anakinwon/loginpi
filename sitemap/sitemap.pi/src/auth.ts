// sitemap.pi NextAuth(v5 beta.31) — 일반 브라우저 Google 로그인. cafe.pi src/auth.ts 승계(단순화, 마스터 지시 2026-10-11).
//  Google sub → sys_usr_auth_lnk 조회로 usr_id 를 정한다. 연동이 없는 Google 사용자는 계정을 만들지 않는다(userId=null)
//  → 클라이언트 게이트가 "Pi Browser 에서 연동 코드 발급 → 입력" 을 안내한다(sql/003, /api/auth/link-*).
//  Pi Browser 로그인은 @pi/auth(SDK → /api/auth/pi) 가 담당하고, 두 세션은 src/lib/auth.ts getSessionUser 가 통합한다.
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getSupabaseAdmin } from '@pi/db'

// Google 로그인 활성 조건 — 셋 다 있어야 auth() 호출(미설정 환경은 Pi 로그인만)
export const googleEnabled = () =>
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET &&
  !!process.env.AUTH_SECRET

// JWT 추가 필드(src/types/next-auth.d.ts 와 동일 — 보강이 적용되지 않는 경로용)
type LinkJwt = {
  sub?: string
  userId?: string | null
  googleSub?: string
}

async function findLinkedUserId(sub: string): Promise<string | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('sys_usr_auth_lnk')
      .select('usr_id')
      .eq('prvd_cd', 'GOOGLE')
      .eq('prvd_sub_txt', sub)
      .eq('del_yn', 'N')
      .maybeSingle<{ usr_id: string }>()
    return data?.usr_id ?? null
  } catch {
    return null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 프록시(Vercel) 뒤에서 auth() 가 X-Forwarded-Host 를 신뢰 — 미설정 시 운영에서 "헤더 O·본문 X" 증상(cafe.pi 교훈)
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      // next-auth/jwt 는 @auth/core/jwt 재수출이라 pnpm 격리 환경에서 모듈 보강이 안 먹는다 → 로컬 타입으로 좁힘
      const t = token as LinkJwt
      if (account?.provider === 'google' && profile?.sub) {
        t.googleSub = profile.sub
        t.userId = await findLinkedUserId(profile.sub)
      } else if (t.googleSub && (trigger === 'update' || !t.userId)) {
        // 연동 여부 재조회 — ① link-complete 뒤 클라이언트 update(data)(POST → trigger 'update')
        // ② 미연동 토큰은 세션 GET 때마다 자가 치유(연동되면 userId 가 박혀 이후 조회 없음). 실측 2026-10-11: 인자 없는 update() 는 GET 이라 ①만으론 반영 안 됨
        t.userId = await findLinkedUserId(t.googleSub)
      }
      return t
    },
    session({ session, token }) {
      const t = token as LinkJwt
      return {
        ...session,
        user: {
          ...session.user,
          id: t.userId ?? '', // '' = Google 로그인은 됐지만 Pi 계정 미연동
          sub: t.googleSub ?? t.sub,
        },
      }
    },
  },
  pages: { signIn: '/' },
})
