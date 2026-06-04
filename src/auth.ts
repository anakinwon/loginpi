import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, profile }) {
      // Google 프로필에서 Google ID를 토큰에 저장
      if (profile?.sub) {
        token.googleId = profile.sub as string
      }
      return token
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub ?? '',
        },
      }
    },
  },
  pages: {
    signIn: '/',   // 별도 로그인 페이지 없이 홈에서 처리
  },
})
