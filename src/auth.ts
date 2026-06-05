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
          // 이미 Pi 계정과 연동된 row가 있으면 그 UUID를 userId로 사용
          // 연동 전이면 null → session.user.id는 sub(Google OAuth raw ID) fallback
          const { data } = await getSupabaseAdmin()
            .from('users')
            .select('id')
            .eq('google_id', profile.sub as string)
            .maybeSingle()
          token.userId = data?.id ?? null
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
