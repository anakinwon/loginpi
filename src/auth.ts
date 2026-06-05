import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { upsertGoogleUser } from '@/lib/users'

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
      // Google OAuth 최초 로그인 시 Supabase upsert → userId 저장
      if (account?.provider === 'google' && profile?.sub) {
        try {
          const dbUser = await upsertGoogleUser({
            id: profile.sub as string,
            email: (profile.email ?? '') as string,
            name: (profile.name ?? null) as string | null,
            image: ((profile as Record<string, unknown>).picture ?? null) as string | null,
          })
          token.userId = dbUser.id  // Supabase users.id
        } catch {
          // DB 오류 시 Google sub을 fallback으로 사용
          token.userId = token.sub
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
          sub: token.sub,   // Google OAuth raw sub — link-complete에서 upsert 재시도에 사용
        },
      }
    },
  },
  pages: {
    signIn: '/',
  },
})
