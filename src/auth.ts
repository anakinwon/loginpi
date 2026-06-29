import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordActivity } from '@/lib/activity-log'
import { isReadOnlyDb } from '@/lib/db-env'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, profile, account, trigger }) {
      // link-complete 후 클라이언트가 updateSession()을 호출하면 hasPiAccount를 재확인
      if (trigger === 'update' && token.userId) {
        try {
          const db = getSupabaseAdmin()
          const { data } = await db
            .from('sys_user')
            .select('pi_uid')
            .eq('id', token.userId as string)
            .eq('del_yn', 'N')
            .maybeSingle()
          token.hasPiAccount = !!(data as { pi_uid: string | null } | null)
            ?.pi_uid
        } catch {
          // 갱신 실패 시 기존 값 유지
        }
        return token
      }

      if (account?.provider === 'google' && profile?.sub) {
        try {
          const db = getSupabaseAdmin()
          const sub = profile.sub as string
          const email = (profile.email as string | undefined) ?? undefined
          const emailVerified =
            (profile as { email_verified?: boolean }).email_verified === true

          // 본인 계정 식별:
          //  1) 검증된 이메일로 매칭 — Pi 연동 원본(pi_uid 보유) 우선, 없으면 최古 행.
          //     google_id가 과거 오염(UUID 등)·NULL·중복이어도 이메일 소유자(email_verified)로 본인 확정.
          //  2) 실패 시 google_id(sub)로 폴백.
          // ⚠️ 과거 버그: google_id에 sub가 아닌 UUID가 저장되면 1차(sub) 매칭 실패→빈 새 계정 생성→
          //    카페 등 데이터가 사라져 보임. 아래 이메일 우선 매칭 + sub 자가치유로 해소.
          let matched: {
            id: string
            google_id: string | null
            pi_uid: string | null
          } | null = null

          if (email && emailVerified) {
            const { data: candidates } = await db
              .from('sys_user')
              .select('id, google_id, pi_uid, reg_dtm')
              .eq('google_email', email)
              .eq('del_yn', 'N')
              .order('reg_dtm', { ascending: true })
            const list = (candidates ?? []) as {
              id: string
              google_id: string | null
              pi_uid: string | null
            }[]
            // 🔒 계정 탈취 방어: 이미 "유효한 다른 Google sub"가 박힌 행은 타인 계정일 수
            //   있으므로 후보에서 제외한다. 정상 sub는 순수 숫자 문자열이고, 레거시 오염값은
            //   UUID(하이픈 포함)라 유효 sub일 수 없다.
            //   허용(claimable) = google_id가 NULL | 현재 sub와 동일 | 비-숫자(오염, 치유 대상).
            //   → 타인의 유효 sub는 절대 덮어쓰지 않으면서 오염 UUID만 자가 치유.
            const claimable = list.filter(
              (c) =>
                c.google_id === null ||
                c.google_id === sub ||
                !/^\d+$/.test(c.google_id),
            )
            matched = claimable.find((c) => c.pi_uid) ?? claimable[0] ?? null
          }

          if (!matched) {
            const { data: byId } = await db
              .from('sys_user')
              .select('id, google_id, pi_uid')
              .eq('google_id', sub)
              .eq('del_yn', 'N')
              .maybeSingle()
            matched =
              (byId as {
                id: string
                google_id: string | null
                pi_uid: string | null
              } | null) ?? null
          }

          if (matched) {
            token.userId = matched.id
            token.hasPiAccount = !!matched.pi_uid
            recordActivity(matched.id, 'LOGIN')
            // 실제 sub로 google_id 정정(오염·NULL 자가 치유) + last_login 갱신
            // 읽기전용 모드(운영DB 프리뷰)에선 비필수 쓰기 스킵 — 세션은 이미 userId 설정됨
            if (!isReadOnlyDb()) {
              const upd: Record<string, unknown> = {
                last_login_dtm: new Date().toISOString(),
              }
              if (matched.google_id !== sub) upd.google_id = sub
              await db.from('sys_user').update(upd).eq('id', matched.id)
            }
          } else {
            // Pi 연동 없이 Google만으로 로그인한 신규 사용자 — 계정 생성 금지
            // link 페이지에서 Pi 계정 연동 완료 전까지 접근 불가
            token.userId = null
            token.hasPiAccount = false
          }
        } catch {
          token.userId = null
          token.hasPiAccount = false
        }
      }
      return token
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: (token.userId as string) ?? token.sub ?? '',
          sub: token.sub, // Google OAuth raw sub — link-complete에서 google_id로 사용
        },
      }
    },
  },
  pages: {
    signIn: '/',
  },
})
