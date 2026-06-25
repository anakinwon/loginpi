import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordActivity } from '@/lib/activity-log'

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
      // ── 세션 갱신 (link-complete 후 hasPiAccount 동기화) ──────────────
      if (trigger === 'update' && token.userId) {
        try {
          const db = getSupabaseAdmin()
          const { data } = await db
            .from('sys_user')
            .select('pi_uid')
            .eq('id', token.userId as string)
            .eq('del_yn', 'N')
            .maybeSingle()
          token.hasPiAccount = !!(data as { pi_uid: string | null } | null)?.pi_uid
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
          let matched: { id: string; google_id: string | null; pi_uid: string | null } | null = null

          if (email && emailVerified) {
            const { data: candidates } = await db
              .from('sys_user')
              .select('id, google_id, pi_uid, reg_dtm')
              .eq('google_email', email)
              .eq('del_yn', 'N') // 활성 계정만 — 비활성(del_yn='Y') 고아 행 제외
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
              .eq('del_yn', 'N') // 활성 계정만
              .maybeSingle()
            matched = (byId as { id: string; google_id: string | null; pi_uid: string | null } | null) ?? null
          }

          if (matched) {
            token.userId = matched.id
            token.hasPiAccount = !!matched.pi_uid
            recordActivity(matched.id, 'LOGIN')
            // 실제 sub로 google_id 정정(오염·NULL 자가 치유) + last_login 갱신
            const upd: Record<string, unknown> = {
              last_login_dtm: new Date().toISOString(),
            }
            if (matched.google_id !== sub) upd.google_id = sub
            await db.from('sys_user').update(upd).eq('id', matched.id)
          } else {
            // 기존 계정 없는 신규 Google 사용자:
            // ⭐ 1인 1계정 원칙 — Pi 계정 연동 전까지 DB 행 생성하지 않음.
            //    token.sub(Google OAuth sub)는 JWT에 유지되므로 link-complete에서 사용 가능.
            //    hasPiAccount=false → getSessionUser()가 null 반환 → Pi 연동 유도.
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
