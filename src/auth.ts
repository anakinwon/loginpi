import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, profile, account }) {
      if (account?.provider === 'google' && profile?.sub) {
        try {
          const db = getSupabaseAdmin()

          // 1차: google_id(OAuth sub)로 조회
          const { data: byId } = await db
            .from('sys_user')
            .select('id')
            .eq('google_id', profile.sub as string)
            .maybeSingle()

          if (byId) {
            token.userId = byId.id
          } else {
            // 2차: google_email fallback
            // 조건: email_verified=true + google_id가 아직 NULL인 행에만 허용
            // google_id가 이미 다른 값으로 세팅된 행은 건드리지 않음 (계정 탈취 방지)
            const emailVerified = (profile as { email_verified?: boolean }).email_verified
            if (profile.email && emailVerified === true) {
              const { data: byEmail } = await db
                .from('sys_user')
                .select('id, google_id')
                .eq('google_email', profile.email as string)
                .is('google_id', null)  // google_id가 NULL인 행만 매칭
                .maybeSingle()

              if (byEmail) {
                token.userId = byEmail.id
                // google_id가 NULL이었던 행에 실제 sub 세팅 (1회성 데이터 복구)
                await db
                  .from('sys_user')
                  .update({ google_id: profile.sub as string })
                  .eq('id', byEmail.id)
                  .is('google_id', null)  // 경쟁 조건 방지: NULL 확인 후 업데이트
              } else {
                token.userId = null
              }
            } else {
              token.userId = null
            }
          }
        } catch {
          token.userId = null
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
          sub: token.sub,   // Google OAuth raw sub — link-complete에서 google_id로 사용
        },
      }
    },
  },
  pages: {
    signIn: '/',
  },
})
