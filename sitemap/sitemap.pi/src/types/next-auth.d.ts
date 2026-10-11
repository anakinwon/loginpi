// NextAuth 세션·JWT 타입 확장 — session.user.id = sys_user.usr_id(연동 전 ''), sub = Google raw sub
import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string // sys_user.usr_id — Pi 계정 연동 전에는 ''
      sub?: string // Google OAuth raw sub — link-complete 에서 prvd_sub_txt 로 사용
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string | null // sys_user.usr_id (연동 전 null)
    googleSub?: string // Google raw sub — update() 재조회용
  }
}

export {}
