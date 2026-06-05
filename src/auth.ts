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
            .from('users')
            .select('id')
            .eq('google_id', profile.sub as string)
            .maybeSingle()

          if (byId) {
            token.userId = byId.id
          } else if (profile.email) {
            // 2차: google_email fallback (google_id가 sub과 불일치하는 경우 대응)
            const { data: byEmail } = await db
              .from('users')
              .select('id')
              .eq('google_email', profile.email as string)
              .maybeSingle()

            if (byEmail) {
              token.userId = byEmail.id
              // google_id를 실제 OAuth sub으로 자동 보정
              await db
                .from('users')
                .update({ google_id: profile.sub as string })
                .eq('id', byEmail.id)
            } else {
              token.userId = null
            }
          } else {
            token.userId = null
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
