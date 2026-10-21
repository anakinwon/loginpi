// schema.pi NextAuth(v5 beta.31) — 일반 브라우저 Google 로그인. sitemap.pi src/auth.ts 승계(마스터 지시 2026-10-16).
//  Google sub → sys_usr_auth_lnk 조회로 usr_id 를 정한다. 연동이 없는 Google 사용자는 계정을 만들지 않는다(userId=null)
//  → 클라이언트 게이트가 "Pi Browser 에서 연동 코드 발급 → 입력" 을 안내한다(sql/020, /api/auth/link-*).
//  Pi Browser 로그인은 @pi/auth(SDK → /api/auth/pi) 가 담당하고, 두 세션은 src/lib/auth.ts getAppUser 가 통합한다.
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/lib/db'

// Google 로그인 활성 조건 — 셋 다 있어야 auth() 호출(미설정 환경은 Pi 로그인만)
export const googleEnabled = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET && !!process.env.AUTH_SECRET

// JWT 추가 필드(src/types/next-auth.d.ts 와 동일 — 보강이 적용되지 않는 경로용)
type LinkJwt = {
  sub?: string
  // 문자열 = 연동 / null = 미연동 확정 / undefined = DB 오류로 아직 판정 못 함(JSON 직렬화에서 키가 빠져 그대로 복원됨)
  userId?: string | null
  googleSub?: string
}

// 반환 : usr_id = 연동 있음 / null = 연동 없음(확정) / undefined = DB 오류(판정 불가 — 호출자는 이전 값 유지)
async function queryLinkedUserId(sub: string): Promise<string | null | undefined> {
  try {
    const { data, error } = await db()
      .from('sys_usr_auth_lnk')
      .select('usr_id')
      .eq('prvd_cd', 'GOOGLE')
      .eq('prvd_sub_txt', sub)
      .eq('del_yn', 'N')
      .maybeSingle<{ usr_id: string }>()
    if (error) {
      console.error('[auth] findLinkedUserId', error.message)
      return undefined
    }
    return data?.usr_id ?? null
  } catch (e) {
    console.error('[auth] findLinkedUserId', e instanceof Error ? e.message : e)
    return undefined
  }
}

// 연동 조회 제한 시간 — 넘기면 undefined(판정 불가)로 처리해 세션 응답이 DB 지연에 묶이지 않게 한다
const LINK_TIMEOUT_MS = 800

async function findLinkedUserId(sub: string): Promise<string | null | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      console.error('[auth] findLinkedUserId timeout', LINK_TIMEOUT_MS)
      resolve(undefined)
    }, LINK_TIMEOUT_MS)
  })
  try {
    return await Promise.race([queryLinkedUserId(sub), timeout])
  } catch (e) {
    console.error('[auth] findLinkedUserId', e instanceof Error ? e.message : e)
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // 프록시(Vercel) 뒤에서 auth() 가 X-Forwarded-Host 를 신뢰 — 미설정 시 운영에서 "헤더 O·본문 X" 증상(cafe.pi 교훈)
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, profile }) {
      const t = token as LinkJwt
      if (account?.provider === 'google' && profile?.sub) {
        t.googleSub = profile.sub
        // 최초 로그인 — DB 오류(undefined)를 null(미연동)로 합치지 않는다(linkUnknown 으로 '일시 오류' 안내)
        t.userId = await findLinkedUserId(profile.sub)
      } else if (t.googleSub) {
        // 세션 조회마다 연동 재확인(쿼리 1건) — 연동·해제·사용자 삭제가 즉시 반영. DB 오류면 덮어쓰지 않는다
        const linked = await findLinkedUserId(t.googleSub)
        if (linked !== undefined) t.userId = linked
      }
      return t
    },
    session({ session, token }) {
      const t = token as LinkJwt
      return {
        ...session,
        user: {
          ...session.user,
          id: t.userId ?? '', // '' = Google 로그인은 됐지만 Pi 계정 미연동(또는 판정 불가 — linkUnknown 으로 구분)
          sub: t.googleSub ?? t.sub,
          linkUnknown: t.userId === undefined,
        },
      }
    },
  },
  pages: { signIn: '/' },
})
